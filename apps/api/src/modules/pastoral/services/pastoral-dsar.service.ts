import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DsarReviewRow {
  id: string;
  tenant_id: string;
  compliance_request_id: string;
  entity_type: string;
  entity_id: string;
  tier: number;
  decision: string | null;
  legal_basis: string | null;
  justification: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DsarReviewWithSummary extends DsarReviewRow {
  record_summary: string;
}

export interface DsarReviewedRecord {
  review_id: string;
  entity_type: string;
  entity_id: string;
  decision: string;
  tier: number;
  record_data: Record<string, unknown>;
  redaction_note?: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

interface ListReviewsFilters {
  compliance_request_id?: string;
  decision?: string;
  pending_only?: boolean;
  tier?: number;
  entity_type?: string;
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

interface SubmitDecisionDto {
  decision: 'include' | 'redact' | 'exclude';
  legal_basis?: string;
  justification?: string;
}

/** Minimal shape of a pastoral concern row for routing/review. */
interface ConcernRecord {
  id: string;
  tier: number;
  category: string;
  severity: string;
  student_id: string;
  created_at: Date;
  versions?: Array<{ narrative: string; version_number: number }>;
}

/** Minimal shape of a CP record row for routing/review. */
interface CpRecordRow {
  id: string;
  student_id: string;
  record_type: string;
  narrative: string;
  created_at: Date;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class PastoralDsarService {
  private readonly logger = new Logger(PastoralDsarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── 1. routeForReview ──────────────────────────────────────────────────

  async routeForReview(
    tenantId: string,
    complianceRequestId: string,
    studentId: string,
    reviewerUserId: string,
  ): Promise<{ reviewCount: number; tier3Count: number }> {
    const hasCpAccess = await this.checkCpAccess(tenantId, reviewerUserId);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: reviewerUserId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Fetch all concerns for the student
      const concerns = (await db.pastoralConcern.findMany({
        where: { tenant_id: tenantId, student_id: studentId },
      })) as ConcernRecord[];

      // Fetch CP records only if reviewer has cp_access
      let cpRecords: CpRecordRow[] = [];
      if (hasCpAccess) {
        cpRecords = (await db.cpRecord.findMany({
          where: { tenant_id: tenantId, student_id: studentId },
        })) as CpRecordRow[];
      }

      let reviewCount = 0;
      let tier3Count = 0;

      // Route concerns
      for (const concern of concerns) {
        const created = await this.createReviewIfNotExists(
          db,
          tenantId,
          complianceRequestId,
          'concern',
          concern.id,
          concern.tier,
          reviewerUserId,
        );
        if (created) {
          reviewCount++;
          if (concern.tier === 3) tier3Count++;
        }
      }

      // Route CP records (always tier 3)
      for (const cpRecord of cpRecords) {
        const created = await this.createReviewIfNotExists(
          db,
          tenantId,
          complianceRequestId,
          'cp_record',
          cpRecord.id,
          3,
          reviewerUserId,
        );
        if (created) {
          reviewCount++;
          tier3Count++;
        }
      }

      return { reviewCount, tier3Count };
    }) as Promise<{ reviewCount: number; tier3Count: number }>;
  }

  // ─── 2. listReviews ────────────────────────────────────────────────────

  async listReviews(
    tenantId: string,
    userId: string,
    filters: ListReviewsFilters,
  ): Promise<{ data: DsarReviewRow[]; meta: PaginationMeta }> {
    const hasCpAccess = await this.checkCpAccess(tenantId, userId);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where = this.buildReviewWhereClause(tenantId, filters, hasCpAccess);

      const orderField = filters.sort ?? 'created_at';
      const orderDir = filters.order ?? 'desc';

      const [data, total] = await Promise.all([
        db.pastoralDsarReview.findMany({
          where,
          orderBy: { [orderField]: orderDir },
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }) as Promise<DsarReviewRow[]>,
        db.pastoralDsarReview.count({ where }) as Promise<number>,
      ]);

      return {
        data,
        meta: { page: filters.page, pageSize: filters.pageSize, total },
      };
    }) as Promise<{ data: DsarReviewRow[]; meta: PaginationMeta }>;
  }

  // ─── 3. getReview ──────────────────────────────────────────────────────

  async getReview(
    tenantId: string,
    userId: string,
    reviewId: string,
  ): Promise<DsarReviewWithSummary> {
    const hasCpAccess = await this.checkCpAccess(tenantId, userId);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const review = (await db.pastoralDsarReview.findFirst({
        where: { id: reviewId, tenant_id: tenantId },
      })) as DsarReviewRow | null;

      if (!review) {
        throw new NotFoundException('Review not found');
      }

      // Tier 3 zero-discoverability: throw 404 (not 403) if no cp_access
      if (review.tier === 3 && !hasCpAccess) {
        throw new NotFoundException('Review not found');
      }

      const recordSummary = await this.getRecordSummary(
        db,
        review.entity_type,
        review.entity_id,
        tenantId,
      );

      return { ...review, record_summary: recordSummary };
    }) as Promise<DsarReviewWithSummary>;
  }

  // ─── 4. submitDecision ─────────────────────────────────────────────────

  async submitDecision(
    tenantId: string,
    userId: string,
    reviewId: string,
    dto: SubmitDecisionDto,
  ): Promise<DsarReviewRow> {
    const hasCpAccess = await this.checkCpAccess(tenantId, userId);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const review = (await db.pastoralDsarReview.findFirst({
        where: { id: reviewId, tenant_id: tenantId },
      })) as DsarReviewRow | null;

      if (!review) {
        throw new NotFoundException('Review not found');
      }

      // Must still be pending
      if (review.decision !== null) {
        throw new BadRequestException('Review has already been decided');
      }

      // Tier 3 cp_access check
      if (review.tier === 3 && !hasCpAccess) {
        throw new NotFoundException('Review not found');
      }

      // Validate decision-specific fields
      this.validateDecisionDto(dto);

      const updated = (await db.pastoralDsarReview.update({
        where: { id: reviewId },
        data: {
          decision: dto.decision,
          legal_basis: dto.legal_basis ?? null,
          justification: dto.justification ?? null,
          reviewed_by_user_id: userId,
          reviewed_at: new Date(),
        },
      })) as DsarReviewRow;

      // Fire audit event (non-blocking)
      await this.eventService.write({
        tenant_id: tenantId,
        event_type: 'dsar_review_completed',
        entity_type: 'dsar_review',
        entity_id: reviewId,
        student_id: null,
        actor_user_id: userId,
        tier: review.tier,
        payload: {
          dsar_review_id: reviewId,
          decision: dto.decision,
          legal_basis: dto.legal_basis,
        },
        ip_address: null,
      });

      return updated;
    }) as Promise<DsarReviewRow>;
  }

  // ─── 5. getReviewsByRequest ────────────────────────────────────────────

  async getReviewsByRequest(
    tenantId: string,
    userId: string,
    complianceRequestId: string,
  ): Promise<DsarReviewRow[]> {
    const hasCpAccess = await this.checkCpAccess(tenantId, userId);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
        compliance_request_id: complianceRequestId,
      };

      // Zero-discoverability: exclude tier 3 if no cp_access
      if (!hasCpAccess) {
        where.tier = { not: 3 };
      }

      return db.pastoralDsarReview.findMany({ where }) as Promise<DsarReviewRow[]>;
    }) as Promise<DsarReviewRow[]>;
  }

  // ─── 6. allReviewsComplete ─────────────────────────────────────────────

  async allReviewsComplete(
    tenantId: string,
    complianceRequestId: string,
  ): Promise<boolean> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const pendingCount = (await db.pastoralDsarReview.count({
        where: {
          tenant_id: tenantId,
          compliance_request_id: complianceRequestId,
          decision: null,
        },
      })) as number;

      return pendingCount === 0;
    }) as Promise<boolean>;
  }

  // ─── 7. getReviewedRecords ─────────────────────────────────────────────

  async getReviewedRecords(
    tenantId: string,
    complianceRequestId: string,
  ): Promise<DsarReviewedRecord[]> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const reviews = (await db.pastoralDsarReview.findMany({
        where: {
          tenant_id: tenantId,
          compliance_request_id: complianceRequestId,
          decision: { in: ['include', 'redact'] },
        },
      })) as DsarReviewRow[];

      const results: DsarReviewedRecord[] = [];

      for (const review of reviews) {
        const recordData = await this.fetchEntityRecord(
          db,
          review.entity_type,
          review.entity_id,
          tenantId,
        );

        if (!recordData) continue;

        const entry: DsarReviewedRecord = {
          review_id: review.id,
          entity_type: review.entity_type,
          entity_id: review.entity_id,
          decision: review.decision as string,
          tier: review.tier,
          record_data: recordData,
        };

        // Apply redaction: replace narrative with [REDACTED]
        if (review.decision === 'redact') {
          if ('narrative' in entry.record_data) {
            entry.record_data.narrative = '[REDACTED]';
          }
          entry.redaction_note = review.justification ?? undefined;
        }

        results.push(entry);
      }

      return results;
    }) as Promise<DsarReviewedRecord[]>;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  /**
   * Checks whether a user has an active CP access grant.
   * Uses the direct Prisma client (not RLS-scoped) because cp_access_grants
   * is a platform-level security check.
   */
  private async checkCpAccess(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const grant = await this.prisma.cpAccessGrant.findFirst({
      where: { tenant_id: tenantId, user_id: userId, revoked_at: null },
    });
    return !!grant;
  }

  /**
   * Creates a DSAR review row if one does not already exist for this
   * (tenant, compliance_request, entity_type, entity_id) combination.
   * Returns true if a new row was created, false if it already existed.
   */
  private async createReviewIfNotExists(
    db: PrismaService,
    tenantId: string,
    complianceRequestId: string,
    entityType: string,
    entityId: string,
    tier: number,
    reviewerUserId: string,
  ): Promise<boolean> {
    const existing = await db.pastoralDsarReview.findFirst({
      where: {
        tenant_id: tenantId,
        compliance_request_id: complianceRequestId,
        entity_type: entityType,
        entity_id: entityId,
      },
    });

    if (existing) return false;

    const created = (await db.pastoralDsarReview.create({
      data: {
        tenant_id: tenantId,
        compliance_request_id: complianceRequestId,
        entity_type: entityType,
        entity_id: entityId,
        tier,
      },
    })) as DsarReviewRow;

    // Fire routed event
    await this.eventService.write({
      tenant_id: tenantId,
      event_type: 'dsar_review_routed',
      entity_type: 'dsar_review',
      entity_id: created.id,
      student_id: null,
      actor_user_id: reviewerUserId,
      tier,
      payload: {
        dsar_review_id: created.id,
        compliance_request_id: complianceRequestId,
        entity_type: entityType,
        entity_id: entityId,
        tier,
      },
      ip_address: null,
    });

    return true;
  }

  /**
   * Validates decision-specific fields according to business rules.
   */
  private validateDecisionDto(dto: SubmitDecisionDto): void {
    if (dto.decision === 'redact') {
      if (!dto.justification || dto.justification.trim().length === 0) {
        throw new BadRequestException(
          'Justification (redaction details) is required for redact decisions',
        );
      }
    }

    if (dto.decision === 'exclude') {
      if (!dto.legal_basis || dto.legal_basis.trim().length === 0) {
        throw new BadRequestException(
          'Legal basis is required for exclude decisions',
        );
      }
      if (!dto.justification || dto.justification.trim().length === 0) {
        throw new BadRequestException(
          'Justification is required for exclude decisions',
        );
      }
      if (
        dto.legal_basis === 'other' &&
        dto.justification.trim().length <= 20
      ) {
        throw new BadRequestException(
          'Justification must be more than 20 characters when legal basis is "other"',
        );
      }
    }
  }

  /**
   * Builds a Prisma where clause for listing reviews with optional filters.
   */
  private buildReviewWhereClause(
    tenantId: string,
    filters: ListReviewsFilters,
    hasCpAccess: boolean,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = { tenant_id: tenantId };

    if (filters.compliance_request_id) {
      where.compliance_request_id = filters.compliance_request_id;
    }

    if (filters.pending_only) {
      where.decision = null;
    } else if (filters.decision) {
      where.decision = filters.decision;
    }

    if (filters.tier !== undefined) {
      where.tier = filters.tier;
    }

    if (filters.entity_type) {
      where.entity_type = filters.entity_type;
    }

    // Zero-discoverability: hide tier 3 if no cp_access
    if (!hasCpAccess) {
      where.tier = { not: 3 };
    }

    return where;
  }

  /**
   * Fetches the underlying record for a review and returns it as a plain object.
   */
  private async fetchEntityRecord(
    db: PrismaService,
    entityType: string,
    entityId: string,
    tenantId: string,
  ): Promise<Record<string, unknown> | null> {
    if (entityType === 'concern') {
      const concern = await db.pastoralConcern.findFirst({
        where: { id: entityId, tenant_id: tenantId },
        include: {
          versions: { orderBy: { version_number: 'desc' }, take: 1 },
        },
      });
      if (!concern) return null;
      const row = concern as unknown as ConcernRecord & {
        versions: Array<{ narrative: string; version_number: number }>;
      };
      return {
        id: row.id,
        category: row.category,
        severity: row.severity,
        tier: row.tier,
        narrative: row.versions[0]?.narrative ?? '',
        created_at: row.created_at,
      };
    }

    if (entityType === 'cp_record') {
      const cpRecord = await db.cpRecord.findFirst({
        where: { id: entityId, tenant_id: tenantId },
      });
      if (!cpRecord) return null;
      const row = cpRecord as unknown as CpRecordRow;
      return {
        id: row.id,
        record_type: row.record_type,
        narrative: row.narrative,
        created_at: row.created_at,
      };
    }

    this.logger.warn(
      `Unknown entity type "${entityType}" in DSAR review for entity ${entityId}`,
    );
    return null;
  }

  /**
   * Generates a human-readable summary of the underlying record for a review.
   * Used by getReview to provide context without exposing the full record.
   */
  private async getRecordSummary(
    db: PrismaService,
    entityType: string,
    entityId: string,
    tenantId: string,
  ): Promise<string> {
    if (entityType === 'concern') {
      const concern = await db.pastoralConcern.findFirst({
        where: { id: entityId, tenant_id: tenantId },
        include: {
          versions: { orderBy: { version_number: 'desc' }, take: 1 },
        },
      });
      if (!concern) return 'Concern record not found';
      const row = concern as unknown as ConcernRecord & {
        versions: Array<{ narrative: string; version_number: number }>;
      };
      const narrative = row.versions[0]?.narrative ?? '';
      const preview =
        narrative.length > 100 ? narrative.slice(0, 100) + '...' : narrative;
      return `Concern (${row.category}, ${row.severity}): ${preview}`;
    }

    if (entityType === 'cp_record') {
      const cpRecord = await db.cpRecord.findFirst({
        where: { id: entityId, tenant_id: tenantId },
      });
      if (!cpRecord) return 'CP record not found';
      const row = cpRecord as unknown as CpRecordRow;
      const preview =
        row.narrative.length > 100
          ? row.narrative.slice(0, 100) + '...'
          : row.narrative;
      return `CP Record (${row.record_type}): ${preview}`;
    }

    return 'Unknown record type';
  }
}
