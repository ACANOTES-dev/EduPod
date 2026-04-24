import { BadRequestException, Injectable } from '@nestjs/common';

import type { ReportSubjectKey } from '@school/shared/reports';

import { QUERY_ENGINE_ERROR_CODES } from '../query-engine/query-engine.types';

import { SUBJECT_ADAPTERS } from './fields';
import type { SubjectAdapter } from './subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from './types';

/**
 * The curated catalogue of report subjects and fields exposed to the
 * custom builder UI and consumed by the query engine.
 *
 * Two responsibilities:
 *
 *   1. **Permission scoping.** Given a user's permission set, strip
 *      `permission`-gated fields from every subject's tree. The UI uses
 *      this to render the field picker; the query engine uses it to
 *      validate references — any field id the user cannot see is a 400
 *      when submitted in a query.
 *
 *   2. **Adapter lookup.** The query engine needs the concrete
 *      `SubjectAdapter` (filter column map + Prisma delegate + resolvers)
 *      for a given key. The service's `getAdapter()` does that lookup.
 */
@Injectable()
export class ReportsSubjectRegistryService {
  // ─── Public surface for the UI ─────────────────────────────────────────────

  /** Return every subject, with fields scoped to the caller's permissions. */
  getAllSubjects(permissions: string[]): SubjectDescriptor[] {
    const owner = isOwnerLike(permissions);
    return Object.values(SUBJECT_ADAPTERS).map((adapter) =>
      scopeSubject(adapter.descriptor, permissions, owner),
    );
  }

  /** Return a single subject with fields scoped to the caller's permissions. */
  getSubject(key: ReportSubjectKey, permissions: string[]): SubjectDescriptor {
    const adapter = SUBJECT_ADAPTERS[key];
    if (!adapter) {
      throw new BadRequestException({
        code: QUERY_ENGINE_ERROR_CODES.INVALID_SUBJECT,
        message: `Unknown subject: ${String(key)}`,
      });
    }
    return scopeSubject(adapter.descriptor, permissions, isOwnerLike(permissions));
  }

  // ─── Internal — used by the query engine ──────────────────────────────────

  /**
   * Look up the adapter for a subject. Throws if the key is unknown.
   */
  getAdapter(key: ReportSubjectKey): SubjectAdapter {
    const adapter = SUBJECT_ADAPTERS[key];
    if (!adapter) {
      throw new BadRequestException({
        code: QUERY_ENGINE_ERROR_CODES.INVALID_SUBJECT,
        message: `Unknown subject: ${String(key)}`,
      });
    }
    return adapter;
  }

  /**
   * Scope a subject's field catalogue by caller permissions and return a
   * Map keyed by field id for O(1) lookup in the query engine compile
   * path. This is what the filter compiler and column validator rely on.
   */
  getScopedFieldMap(key: ReportSubjectKey, permissions: string[]): Map<string, FieldDescriptor> {
    const scoped = this.getSubject(key, permissions);
    const map = new Map<string, FieldDescriptor>();
    for (const f of scoped.fields) {
      map.set(f.id, f);
    }
    return map;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Owner-tier roles bypass permission checks entirely (school_owner,
 * school_principal, school_vice_principal — see PermissionCacheService).
 * Our permission array sidecar does not carry role membership; instead we
 * detect the caller's owner-ness from a sentinel inside the permission
 * set passed through by the guard layer.
 *
 * The sentinel value is `__owner__` — injected by the query-engine entry
 * point when the request's JWT membership passes `PermissionCacheService.
 * isOwner()`. Callers must not fabricate it; it's set by the guard.
 */
export const OWNER_SENTINEL_PERMISSION = '__owner__';

function isOwnerLike(permissions: string[]): boolean {
  return permissions.includes(OWNER_SENTINEL_PERMISSION);
}

function scopeSubject(
  descriptor: SubjectDescriptor,
  permissions: string[],
  owner: boolean,
): SubjectDescriptor {
  const permSet = new Set(permissions);
  const scopedFields = descriptor.fields.filter((field) => {
    if (!field.permission) return true;
    if (owner) return true;
    return permSet.has(field.permission);
  });
  return { ...descriptor, fields: scopedFields };
}
