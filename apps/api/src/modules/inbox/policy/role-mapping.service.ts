import { Injectable, Logger } from '@nestjs/common';

import { PLATFORM_ROLE_TO_MESSAGING_ROLE } from '@school/shared/inbox';
import type { MessagingRole } from '@school/shared/inbox';

import { RbacReadFacade } from '../../rbac/rbac-read.facade';

/**
 * RoleMappingService — resolve a user's `MessagingRole` for the inbox policy
 * engine.
 *
 * The platform has many role keys (`school_principal`, `accounting`, `admin`,
 * `front_office`, etc.). The messaging matrix is expressed in exactly nine
 * canonical buckets: owner, principal, vice_principal, office, finance,
 * nurse, teacher, parent, student. This service is the sole mapper.
 *
 * Rules:
 *
 *   1. If a user has multiple active roles, the **most permissive** bucket
 *      wins. Priority order (high → low):
 *
 *        owner > principal > vice_principal
 *          > teacher
 *          > office > finance > nurse
 *          > parent
 *          > student
 *
 *      Rationale: staff that also happen to be parents of a student at the
 *      same school should still message as staff — the parent role is the
 *      more restrictive one. Admin tier always wins.
 *
 *   2. An unknown platform role key contributes nothing to the resolution
 *      (it falls through to the next mapped role). A user with *only*
 *      unknown keys returns `null`, which the policy engine treats as
 *      deny-all.
 *
 *   3. Results are cached **per request** via a `Map` keyed on userId. The
 *      inbox policy path resolves each user at most once per request.
 *
 * Cross-module reads go through `RbacReadFacade`, never directly via
 * Prisma — see `.claude/rules/architecture-policing.md`.
 */

// ─── Priority ordering ────────────────────────────────────────────────────────

const ROLE_PRIORITY: Record<MessagingRole, number> = {
  owner: 100,
  principal: 90,
  vice_principal: 80,
  teacher: 70,
  office: 60,
  finance: 50,
  nurse: 40,
  parent: 20,
  student: 10,
};

function priorityOf(role: MessagingRole): number {
  return ROLE_PRIORITY[role];
}

function mostPermissive(roles: MessagingRole[]): MessagingRole | null {
  if (roles.length === 0) return null;
  let best = roles[0] as MessagingRole;
  for (let i = 1; i < roles.length; i += 1) {
    const candidate = roles[i] as MessagingRole;
    if (priorityOf(candidate) > priorityOf(best)) {
      best = candidate;
    }
  }
  return best;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class RoleMappingService {
  private readonly logger = new Logger(RoleMappingService.name);

  constructor(private readonly rbacReadFacade: RbacReadFacade) {}

  /**
   * Resolve a single user's canonical messaging role. Returns `null` if the
   * user has no active membership at the tenant, or only unmapped role keys.
   * Callers treat `null` as deny-all.
   */
  async resolveMessagingRole(
    tenantId: string,
    userId: string,
    cache?: Map<string, MessagingRole | null>,
  ): Promise<MessagingRole | null> {
    if (cache?.has(userId)) {
      return cache.get(userId) ?? null;
    }

    const rows = await this.rbacReadFacade.findActiveMembershipRolesByUserIds(tenantId, [userId]);
    const row = rows.find((r) => r.user_id === userId);
    const resolved = row ? this.foldRoleKeys(row.role_keys) : null;
    cache?.set(userId, resolved);
    return resolved;
  }

  /**
   * Batch-resolve a set of users in a single query.
   *
   * Performance note: the inbox policy path calls this once per send with
   * every recipient in the audience. A teacher composing to "all parents in
   * my classes" can mean 60+ recipients; this method must be 1 round trip.
   */
  async resolveMessagingRolesBatch(
    tenantId: string,
    userIds: string[],
    cache?: Map<string, MessagingRole | null>,
  ): Promise<Map<string, MessagingRole | null>> {
    const result = new Map<string, MessagingRole | null>();
    if (userIds.length === 0) return result;

    // Satisfy anything already cached; only query for the rest.
    const missing: string[] = [];
    for (const id of userIds) {
      if (cache?.has(id)) {
        result.set(id, cache.get(id) ?? null);
      } else {
        missing.push(id);
      }
    }
    if (missing.length === 0) return result;

    const rows = await this.rbacReadFacade.findActiveMembershipRolesByUserIds(tenantId, missing);
    const byUser = new Map<string, string[]>();
    for (const row of rows) byUser.set(row.user_id, row.role_keys);

    for (const id of missing) {
      const keys = byUser.get(id);
      const resolved = keys ? this.foldRoleKeys(keys) : null;
      result.set(id, resolved);
      cache?.set(id, resolved);
    }
    return result;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private foldRoleKeys(roleKeys: string[]): MessagingRole | null {
    const mapped: MessagingRole[] = [];
    for (const key of roleKeys) {
      const bucket = PLATFORM_ROLE_TO_MESSAGING_ROLE[key];
      if (bucket) {
        mapped.push(bucket);
      } else {
        this.logger.debug(
          `Unmapped platform role "${key}" in role-mapping.service.ts — falling through.`,
        );
      }
    }
    return mostPermissive(mapped);
  }
}
