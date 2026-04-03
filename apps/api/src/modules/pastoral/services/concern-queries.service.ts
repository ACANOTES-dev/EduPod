import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { type ListConcernsQuery, pastoralTenantSettingsSchema } from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type {
  ConcernCategory,
  ConcernListItemDto,
  ConcernRow,
  PaginationMeta,
} from './concern.service';

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Read-only query operations for pastoral concerns.
 * Extracted from ConcernService as part of CQRS-lite split (M-16).
 *
 * All methods are side-effect-free — no writes, no queue dispatches, no audit events.
 * Methods that have read-triggered side effects (e.g., getById with auto-acknowledge)
 * remain in ConcernService.
 */
@Injectable()
export class ConcernQueriesService {
  private readonly logger = new Logger(ConcernQueriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: ListConcernsQuery,
  ): Promise<{ data: ConcernListItemDto[]; meta: PaginationMeta }> {
    const hasCpAccess = await this.checkCpAccess(tenantId, userId);
    const callerMaxTier = this.resolveCallerTierAccess(permissions, hasCpAccess);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const skip = (query.page - 1) * query.pageSize;

    // Build where clause
    const where: Prisma.PastoralConcernWhereInput = {
      tenant_id: tenantId,
    };

    // Tier filtering: if caller cannot see tier 2, filter to tier 1 only
    // Tier 3 is already handled by RLS (only visible to DLP users)
    if (callerMaxTier < 2) {
      where.tier = 1;
    } else if (callerMaxTier < 3) {
      where.tier = { in: [1, 2] };
    }
    // If user-requested tier filter, apply it within allowed range
    if (query.tier !== undefined) {
      if (query.tier <= callerMaxTier) {
        where.tier = query.tier;
      } else {
        // Requested tier exceeds access — return empty
        return { data: [], meta: { page: query.page, pageSize: query.pageSize, total: 0 } };
      }
    }

    if (query.student_id) {
      where.OR = [
        { student_id: query.student_id },
        {
          involved_students: {
            some: {
              tenant_id: tenantId,
              student_id: query.student_id,
            },
          },
        },
      ];
    }
    if (query.category) where.category = query.category;
    if (query.severity) where.severity = query.severity;
    if (query.case_id) where.case_id = query.case_id;

    // Date range filtering
    if (query.from || query.to) {
      where.created_at = {};
      if (query.from) where.created_at.gte = new Date(query.from);
      if (query.to) where.created_at.lte = new Date(query.to);
    }

    // Build orderBy
    const orderBy: Prisma.PastoralConcernOrderByWithRelationInput = {};
    if (query.sort === 'occurred_at') orderBy.occurred_at = query.order;
    else if (query.sort === 'severity') orderBy.severity = query.order;
    else orderBy.created_at = query.order;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [concerns, total] = await Promise.all([
        db.pastoralConcern.findMany({
          where,
          include: {
            student: { select: { id: true, first_name: true, last_name: true } },
            logged_by: { select: { first_name: true, last_name: true } },
            involved_students: {
              include: {
                student: { select: { id: true, first_name: true, last_name: true } },
              },
              orderBy: { added_at: 'asc' },
            },
          },
          orderBy,
          skip,
          take: query.pageSize,
        }),
        db.pastoralConcern.count({ where }),
      ]);

      const data = (concerns as ConcernRow[]).map((c) => this.toConcernListItem(c, hasCpAccess));

      return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
    }) as Promise<{ data: ConcernListItemDto[]; meta: PaginationMeta }>;
  }

  // ─── GET CATEGORIES ─────────────────────────────────────────────────────────

  async getCategories(tenantId: string): Promise<{ data: ConcernCategory[] }> {
    const settings = await this.loadPastoralSettings(tenantId);

    const activeCategories = settings.concern_categories.filter((c) => c.active);

    return { data: activeCategories };
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  /**
   * Checks whether a user has an active (non-revoked) CP access grant.
   */
  private async checkCpAccess(tenantId: string, userId: string): Promise<boolean> {
    const grant = await this.prisma.cpAccessGrant.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        revoked_at: null,
      },
      select: { id: true },
    });

    return !!grant;
  }

  /**
   * Resolves the maximum tier level a caller can access.
   * - pastoral.view_tier1 only -> max tier 1
   * - pastoral.view_tier2 -> max tier 2
   * - CP access grant -> max tier 3 (handled by RLS, but useful for app-layer)
   */
  private resolveCallerTierAccess(permissions: string[], hasCpAccess: boolean): number {
    if (hasCpAccess) return 3;
    if (permissions.includes('pastoral.view_tier2')) return 2;
    if (permissions.includes('pastoral.view_tier1')) return 1;
    return 0;
  }

  /**
   * Loads and parses the pastoral section of tenant settings.
   * Uses the Zod schema to fill in defaults for any missing fields.
   */
  private async loadPastoralSettings(tenantId: string) {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};

    return pastoralTenantSettingsSchema.parse(pastoralRaw);
  }

  /**
   * Applies author masking to a concern DTO.
   * If author_masked is true and the viewer does NOT have DLP (CP access),
   * the author information is redacted.
   */
  private applyAuthorMasking(
    concern: ConcernRow,
    hasCpAccess: boolean,
  ): {
    author_name: string | null;
    logged_by_user_id: string | null;
    author_masked_for_viewer: boolean;
  } {
    if (!concern.author_masked) {
      const authorName = concern.logged_by
        ? `${concern.logged_by.first_name} ${concern.logged_by.last_name}`
        : null;
      return {
        author_name: authorName,
        logged_by_user_id: concern.logged_by_user_id,
        author_masked_for_viewer: false,
      };
    }

    // DLP users see everything
    if (hasCpAccess) {
      const authorName = concern.logged_by
        ? `${concern.logged_by.first_name} ${concern.logged_by.last_name}`
        : null;
      return {
        author_name: authorName,
        logged_by_user_id: concern.logged_by_user_id,
        author_masked_for_viewer: false,
      };
    }

    // Non-DLP viewers see masked author
    return {
      author_name: 'Author masked',
      logged_by_user_id: null,
      author_masked_for_viewer: true,
    };
  }

  private toConcernInvolvedStudents(concern: ConcernRow): ConcernListItemDto['students_involved'] {
    return (concern.involved_students ?? []).map((studentLink) => ({
      student_id: studentLink.student_id,
      student_name: studentLink.student
        ? `${studentLink.student.first_name} ${studentLink.student.last_name}`
        : 'Unknown',
      added_at: studentLink.added_at,
    }));
  }

  /**
   * Maps a raw concern row to a list item DTO with author masking applied.
   */
  private toConcernListItem(concern: ConcernRow, hasCpAccess: boolean): ConcernListItemDto {
    const masking = this.applyAuthorMasking(concern, hasCpAccess);
    const studentName = concern.student
      ? `${concern.student.first_name} ${concern.student.last_name}`
      : 'Unknown';

    return {
      id: concern.id,
      student_id: concern.student_id,
      student_name: studentName,
      category: concern.category,
      severity: concern.severity,
      tier: concern.tier,
      occurred_at: concern.occurred_at,
      created_at: concern.created_at,
      follow_up_needed: concern.follow_up_needed,
      case_id: concern.case_id,
      students_involved: this.toConcernInvolvedStudents(concern),
      author_name: masking.author_name,
      author_masked_for_viewer: masking.author_masked_for_viewer,
      logged_by_user_id: masking.logged_by_user_id,
    };
  }
}
