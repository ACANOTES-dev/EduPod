import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { ChildProtectionReadFacade } from '../../child-protection/child-protection-read.facade';

import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

/** The entity type discriminator for chronology entries. */
export type ChronologyEntityType =
  | 'concern'
  | 'case'
  | 'intervention'
  | 'referral'
  | 'parent_contact'
  | 'cp_record';

/** Actor information — either visible or masked. */
export type ChronologyActor =
  | { user_id: string; name: string; masked: false }
  | { masked: true; user_id: null; name: 'Author masked' };

/**
 * A single entry in the student pastoral chronology timeline.
 * Each entry is sourced from `pastoral_events` and enriched with
 * display-ready data depending on the entity type.
 */
export interface ChronologyEntry {
  id: string;
  event_type: string;
  entity_type: ChronologyEntityType;
  entity_id: string;
  timestamp: string; // ISO 8601
  tier: number;
  actor: ChronologyActor;
  summary: string;
  payload: Record<string, unknown>;
}

/** Pagination metadata. */
export interface ChronologyPaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

/** Filters accepted by `getChronology`. */
export interface ChronologyFilters {
  page: number;
  pageSize: number;
  from?: string; // ISO date string
  to?: string;   // ISO date string
  event_type?: string;
  entity_type?: ChronologyEntityType;
}

/** Raw pastoral event row shape returned by Prisma. */
interface PastoralEventRow {
  id: string;
  tenant_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  student_id: string | null;
  actor_user_id: string;
  tier: number;
  payload: Prisma.JsonValue;
  ip_address: string | null;
  created_at: Date;
  actor?: { first_name: string; last_name: string } | null;
}

// ─── Summary Generators ────────────────────────────────────────────────────

/**
 * Generates a human-readable one-line summary for a chronology entry
 * based on event_type and payload data.
 */
function generateSummary(
  eventType: string,
  entityType: string,
  payload: Record<string, unknown>,
): string {
  switch (eventType) {
    case 'concern_created':
      return `Concern logged — ${stringOrDefault(payload.category, 'unknown category')}, ${stringOrDefault(payload.severity, 'unknown severity')}`;

    case 'concern_tier_escalated':
      return `Concern escalated from tier ${numOrDefault(payload.old_tier, '?')} to tier ${numOrDefault(payload.new_tier, '?')}`;

    case 'concern_acknowledged':
      return 'Concern acknowledged';

    case 'concern_amended':
      return `Concern narrative amended (v${numOrDefault(payload.version_number, '?')})`;

    case 'concern_shared_with_parent':
      return `Concern shared with parent (${stringOrDefault(payload.share_level, 'unknown level')})`;

    case 'concern_accessed':
      return 'Concern record accessed';

    case 'case_created':
      return `Case opened — ${stringOrDefault(payload.case_number, 'unknown number')}`;

    case 'case_status_changed':
      return `Case status changed: ${stringOrDefault(payload.old_status, '?')} → ${stringOrDefault(payload.new_status, '?')}`;

    case 'case_ownership_transferred':
      return 'Case ownership transferred';

    case 'case_concern_linked':
      return 'Concern linked to case';

    case 'case_concern_unlinked':
      return 'Concern unlinked from case';

    case 'case_student_added':
      return 'Student added to case';

    case 'case_student_removed':
      return 'Student removed from case';

    case 'intervention_created':
      return `Intervention started — ${stringOrDefault(payload.intervention_type, 'unknown type')}`;

    case 'intervention_status_changed':
      return `Intervention status changed to ${stringOrDefault(payload.new_status, '?')}`;

    case 'intervention_progress_recorded':
      return 'Intervention progress note recorded';

    case 'referral_created':
      return `Referral created — ${stringOrDefault(payload.referral_type, 'unknown type')} to ${stringOrDefault(payload.referral_body_name, 'unknown body')}`;

    case 'referral_submitted':
      return `Referral submitted to ${stringOrDefault(payload.referral_body_name, 'unknown body')}`;

    case 'referral_status_changed':
      return `Referral status changed to ${stringOrDefault(payload.new_status, '?')}`;

    case 'parent_contact_logged':
      return `Parent contacted via ${stringOrDefault(payload.contact_method, 'unknown method')}`;

    case 'cp_record_created':
      return `CP record created — ${stringOrDefault(payload.record_type, 'unknown type')}`;

    case 'mandated_report_submitted':
      return `Mandated report submitted (ref: ${stringOrDefault(payload.mandated_report_ref, 'pending')})`;

    default:
      return `${eventType.replace(/_/g, ' ')} — ${entityType}`;
  }
}

/** Safely extract a string value from unknown payload data. */
function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Safely extract a numeric value from unknown payload data. */
function numOrDefault(value: unknown, fallback: string): string | number {
  return typeof value === 'number' ? value : fallback;
}

/**
 * Maps an event_type to its corresponding ChronologyEntityType.
 * Falls back to the entity_type field from the event record.
 */
function resolveEntityType(
  eventEntityType: string,
): ChronologyEntityType {
  const mapping: Record<string, ChronologyEntityType> = {
    concern: 'concern',
    case: 'case',
    intervention: 'intervention',
    referral: 'referral',
    parent_contact: 'parent_contact',
    cp_record: 'cp_record',
  };

  return mapping[eventEntityType] ?? 'concern';
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class StudentChronologyService {
  private readonly logger = new Logger(StudentChronologyService.name);

  constructor(private readonly prisma: PrismaService,
    private readonly childProtectionReadFacade: ChildProtectionReadFacade) {}

  /**
   * Returns the complete pastoral timeline for a student, merging events
   * from all pastoral sources into a single reverse-chronological view.
   *
   * For DLP users (those with an active CP access grant), tier 3 events
   * are included seamlessly. For non-DLP users, tier 3 events are excluded
   * at the query level — they are never fetched, not filtered post-query.
   *
   * Author masking is NOT applied here — the `AuthorMaskInterceptor`
   * handles that at the response level.
   */
  async getChronology(
    tenantId: string,
    userId: string,
    studentId: string,
    filters: ChronologyFilters,
  ): Promise<{ data: ChronologyEntry[]; meta: ChronologyPaginationMeta }> {
    // 1. Resolve whether the calling user has DLP (CP access) status
    const hasCpAccess = await this.checkCpAccess(tenantId, userId);

    // 2. Build the query
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const page = filters.page;
    const pageSize = filters.pageSize;
    const skip = (page - 1) * pageSize;

    // 3. Build the WHERE clause for pastoral_events
    const where: Prisma.PastoralEventWhereInput = {
      tenant_id: tenantId,
      student_id: studentId,
    };

    // Tier filtering: non-DLP users never see tier 3 events
    if (!hasCpAccess) {
      where.tier = { lt: 3 };
    }

    // Date range filter
    if (filters.from || filters.to) {
      where.created_at = {};
      if (filters.from) where.created_at.gte = new Date(filters.from);
      if (filters.to) where.created_at.lte = new Date(filters.to);
    }

    // Event type filter
    if (filters.event_type) {
      where.event_type = filters.event_type;
    }

    // Entity type filter
    if (filters.entity_type) {
      where.entity_type = filters.entity_type;
    }

    // 4. Execute within RLS transaction
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [events, total] = await Promise.all([
        db.pastoralEvent.findMany({
          where,
          include: {
            actor: { select: { first_name: true, last_name: true } },
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: pageSize,
        }),
        db.pastoralEvent.count({ where }),
      ]);

      const data = (events as PastoralEventRow[]).map((event) =>
        this.toChronologyEntry(event),
      );

      return {
        data,
        meta: { page, pageSize, total },
      };
    }) as Promise<{ data: ChronologyEntry[]; meta: ChronologyPaginationMeta }>;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Checks whether a user has an active (non-revoked) CP access grant.
   * This determines DLP status for tier 3 visibility.
   */
  private async checkCpAccess(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const grant = await this.childProtectionReadFacade.hasActiveCpAccess(tenantId, userId) ? { id: "active" } : null;

    return !!grant;
  }

  /**
   * Maps a raw pastoral event row to a ChronologyEntry with enriched
   * display data: resolved entity type, human-readable summary, and
   * actor information.
   */
  private toChronologyEntry(event: PastoralEventRow): ChronologyEntry {
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    const entityType = resolveEntityType(event.entity_type);
    const summary = generateSummary(event.event_type, event.entity_type, payload);

    // Build actor — author masking is handled by the interceptor,
    // but we still provide the raw actor data here
    const actor: ChronologyActor = event.actor
      ? {
          user_id: event.actor_user_id,
          name: `${event.actor.first_name} ${event.actor.last_name}`,
          masked: false as const,
        }
      : {
          user_id: event.actor_user_id,
          name: `User ${event.actor_user_id.slice(0, 8)}`,
          masked: false as const,
        };

    return {
      id: event.id,
      event_type: event.event_type,
      entity_type: entityType,
      entity_id: event.entity_id,
      timestamp: event.created_at.toISOString(),
      tier: event.tier,
      actor,
      summary,
      payload,
    };
  }
}
