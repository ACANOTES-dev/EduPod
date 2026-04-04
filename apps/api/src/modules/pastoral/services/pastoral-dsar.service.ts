import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { ChildProtectionReadFacade } from '../../child-protection/child-protection-read.facade';
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

interface CaseRecord {
  id: string;
  student_id: string;
  case_number: string;
  status: string;
  tier: number;
  opened_reason: string;
  created_at: Date;
}

interface InterventionRecord {
  id: string;
  student_id: string;
  intervention_type: string;
  continuum_level: number;
  status: string;
  outcome_notes: string | null;
  next_review_date: Date;
  created_at: Date;
  case?: {
    tier: number;
    case_number: string;
  } | null;
}

interface ReferralRecord {
  id: string;
  student_id: string;
  referral_type: string;
  status: string;
  reason: string | null;
  report_summary: string | null;
  created_at: Date;
  case?: {
    tier: number;
    case_number: string;
  } | null;
}

interface CheckinRecord {
  id: string;
  student_id: string;
  mood_score: number;
  freeform_text: string | null;
  flagged: boolean;
  flag_reason: string | null;
  checkin_date: Date;
  created_at: Date;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class PastoralDsarService {
  private readonly logger = new Logger(PastoralDsarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly childProtectionReadFacade: ChildProtectionReadFacade,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── 1. routeForReview ──────────────────────────────────────────────────

  async routeForReview(
    tenantId: string,
    complianceRequestId: string,
    studentId: string,
    reviewerUserId: string,
  ): Promise<{ reviewCount: number; tier3Count: number }> {
    const queryUserId =
      (await this.resolveDsarQueryUserId(tenantId, reviewerUserId)) ?? reviewerUserId;
    const canQueryTier3 = await this.checkCpAccess(tenantId, queryUserId);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: queryUserId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Fetch all concerns for the student
      const concerns = (await db.pastoralConcern.findMany({
        where: {
          tenant_id: tenantId,
          OR: [
            { student_id: studentId },
            {
              involved_students: {
                some: {
                  tenant_id: tenantId,
                  student_id: studentId,
                },
              },
            },
          ],
        },
      })) as ConcernRecord[];

      const cases = (await db.pastoralCase.findMany({
        where: {
          tenant_id: tenantId,
          OR: [
            { student_id: studentId },
            {
              case_students: {
                some: {
                  tenant_id: tenantId,
                  student_id: studentId,
                },
              },
            },
          ],
        },
      })) as CaseRecord[];

      const interventions = (await db.pastoralIntervention.findMany({
        where: { tenant_id: tenantId, student_id: studentId },
        include: {
          case: {
            select: {
              tier: true,
              case_number: true,
            },
          },
        },
      })) as InterventionRecord[];

      const referrals = (await db.pastoralReferral.findMany({
        where: { tenant_id: tenantId, student_id: studentId },
        include: {
          case: {
            select: {
              tier: true,
              case_number: true,
            },
          },
        },
      })) as ReferralRecord[];

      const checkins = (await db.studentCheckin.findMany({
        where: { tenant_id: tenantId, student_id: studentId },
      })) as CheckinRecord[];

      // Fetch CP records only when a CP-approved query context exists
      let cpRecords: CpRecordRow[] = [];
      if (canQueryTier3) {
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

      for (const pastoralCase of cases) {
        const created = await this.createReviewIfNotExists(
          db,
          tenantId,
          complianceRequestId,
          'case',
          pastoralCase.id,
          pastoralCase.tier,
          reviewerUserId,
        );
        if (created) {
          reviewCount++;
          if (pastoralCase.tier === 3) tier3Count++;
        }
      }

      for (const intervention of interventions) {
        const tier = intervention.case?.tier ?? 2;
        const created = await this.createReviewIfNotExists(
          db,
          tenantId,
          complianceRequestId,
          'intervention',
          intervention.id,
          tier,
          reviewerUserId,
        );
        if (created) {
          reviewCount++;
          if (tier === 3) tier3Count++;
        }
      }

      for (const referral of referrals) {
        const tier = referral.case?.tier ?? 2;
        const created = await this.createReviewIfNotExists(
          db,
          tenantId,
          complianceRequestId,
          'referral',
          referral.id,
          tier,
          reviewerUserId,
        );
        if (created) {
          reviewCount++;
          if (tier === 3) tier3Count++;
        }
      }

      for (const checkin of checkins) {
        const created = await this.createReviewIfNotExists(
          db,
          tenantId,
          complianceRequestId,
          'checkin',
          checkin.id,
          1,
          reviewerUserId,
        );
        if (created) {
          reviewCount++;
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
        throw new NotFoundException({
          code: 'DSAR_REVIEW_NOT_FOUND',
          message: `DSAR review with id "${reviewId}" not found`,
        });
      }

      // Tier 3 zero-discoverability: throw 404 (not 403) if no cp_access
      if (review.tier === 3 && !hasCpAccess) {
        throw new NotFoundException({
          code: 'DSAR_REVIEW_NOT_FOUND',
          message: `DSAR review with id "${reviewId}" not found`,
        });
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
        throw new NotFoundException({
          code: 'DSAR_REVIEW_NOT_FOUND',
          message: `DSAR review with id "${reviewId}" not found`,
        });
      }

      // Must still be pending
      if (review.decision !== null) {
        throw new BadRequestException({
          code: 'DSAR_REVIEW_ALREADY_DECIDED',
          message: 'This DSAR review has already been decided',
        });
      }

      // Tier 3 cp_access check
      if (review.tier === 3 && !hasCpAccess) {
        throw new NotFoundException({
          code: 'DSAR_REVIEW_NOT_FOUND',
          message: `DSAR review with id "${reviewId}" not found`,
        });
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

  async allReviewsComplete(tenantId: string, complianceRequestId: string): Promise<boolean> {
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
    const reviewsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const reviews = (await reviewsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralDsarReview.findMany({
        where: {
          tenant_id: tenantId,
          compliance_request_id: complianceRequestId,
          decision: { in: ['include', 'redact'] },
        },
      }) as Promise<DsarReviewRow[]>;
    })) as DsarReviewRow[];

    const results: DsarReviewedRecord[] = [];

    for (const review of reviews) {
      const recordData = await this.fetchReviewedRecordForDecision(tenantId, review);

      if (!recordData) continue;

      const entry: DsarReviewedRecord = {
        review_id: review.id,
        entity_type: review.entity_type,
        entity_id: review.entity_id,
        decision: review.decision as string,
        tier: review.tier,
        record_data: recordData,
      };

      if (review.decision === 'redact') {
        this.applyRedactions(entry.record_data, review.entity_type);
        entry.redaction_note = review.justification ?? undefined;
      }

      results.push(entry);
    }

    return results;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  /**
   * Checks whether a user has an active CP access grant.
   * Uses the direct Prisma client (not RLS-scoped) because cp_access_grants
   * is a platform-level security check.
   */
  private async checkCpAccess(tenantId: string, userId: string): Promise<boolean> {
    return this.childProtectionReadFacade.hasActiveCpAccess(tenantId, userId);
  }

  private async resolveDsarQueryUserId(
    tenantId: string,
    preferredUserId: string,
  ): Promise<string | null> {
    if (await this.checkCpAccess(tenantId, preferredUserId)) {
      return preferredUserId;
    }

    const fallbackUserId = await this.childProtectionReadFacade.findFallbackGrantUserId(tenantId);

    return fallbackUserId;
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
        throw new BadRequestException({
          code: 'DSAR_JUSTIFICATION_REQUIRED',
          message: 'Justification (redaction details) is required for redact decisions',
        });
      }
    }

    if (dto.decision === 'exclude') {
      if (!dto.legal_basis || dto.legal_basis.trim().length === 0) {
        throw new BadRequestException({
          code: 'DSAR_LEGAL_BASIS_REQUIRED',
          message: 'Legal basis is required for exclude decisions',
        });
      }
      if (!dto.justification || dto.justification.trim().length === 0) {
        throw new BadRequestException({
          code: 'DSAR_JUSTIFICATION_REQUIRED',
          message: 'Justification is required for exclude decisions',
        });
      }
      if (dto.legal_basis === 'other' && dto.justification.trim().length <= 20) {
        throw new BadRequestException({
          code: 'DSAR_JUSTIFICATION_TOO_SHORT',
          message: 'Justification must be more than 20 characters when legal basis is "other"',
        });
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

    if (entityType === 'case') {
      const pastoralCase = await db.pastoralCase.findFirst({
        where: { id: entityId, tenant_id: tenantId },
      });
      if (!pastoralCase) return null;
      const row = pastoralCase as unknown as CaseRecord;
      return {
        id: row.id,
        case_number: row.case_number,
        status: row.status,
        tier: row.tier,
        opened_reason: row.opened_reason,
        created_at: row.created_at,
      };
    }

    if (entityType === 'intervention') {
      const intervention = await db.pastoralIntervention.findFirst({
        where: { id: entityId, tenant_id: tenantId },
        include: {
          case: {
            select: {
              tier: true,
              case_number: true,
            },
          },
        },
      });
      if (!intervention) return null;
      const row = intervention as unknown as InterventionRecord;
      return {
        id: row.id,
        intervention_type: row.intervention_type,
        continuum_level: row.continuum_level,
        status: row.status,
        outcome_notes: row.outcome_notes,
        next_review_date: row.next_review_date,
        case_number: row.case?.case_number ?? null,
        tier: row.case?.tier ?? 2,
        created_at: row.created_at,
      };
    }

    if (entityType === 'referral') {
      const referral = await db.pastoralReferral.findFirst({
        where: { id: entityId, tenant_id: tenantId },
        include: {
          case: {
            select: {
              tier: true,
              case_number: true,
            },
          },
        },
      });
      if (!referral) return null;
      const row = referral as unknown as ReferralRecord;
      return {
        id: row.id,
        referral_type: row.referral_type,
        status: row.status,
        reason: row.reason,
        report_summary: row.report_summary,
        case_number: row.case?.case_number ?? null,
        tier: row.case?.tier ?? 2,
        created_at: row.created_at,
      };
    }

    if (entityType === 'checkin') {
      const checkin = await db.studentCheckin.findFirst({
        where: { id: entityId, tenant_id: tenantId },
      });
      if (!checkin) return null;
      const row = checkin as unknown as CheckinRecord;
      return {
        id: row.id,
        mood_score: row.mood_score,
        freeform_text: row.freeform_text,
        flagged: row.flagged,
        flag_reason: row.flag_reason,
        checkin_date: row.checkin_date,
        created_at: row.created_at,
      };
    }

    this.logger.warn(`Unknown entity type "${entityType}" in DSAR review for entity ${entityId}`);
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
      const preview = narrative.length > 100 ? narrative.slice(0, 100) + '...' : narrative;
      return `Concern (${row.category}, ${row.severity}): ${preview}`;
    }

    if (entityType === 'cp_record') {
      const cpRecord = await db.cpRecord.findFirst({
        where: { id: entityId, tenant_id: tenantId },
      });
      if (!cpRecord) return 'CP record not found';
      const row = cpRecord as unknown as CpRecordRow;
      const preview =
        row.narrative.length > 100 ? row.narrative.slice(0, 100) + '...' : row.narrative;
      return `CP Record (${row.record_type}): ${preview}`;
    }

    if (entityType === 'case') {
      const pastoralCase = await db.pastoralCase.findFirst({
        where: { id: entityId, tenant_id: tenantId },
      });
      if (!pastoralCase) return 'Case record not found';
      const row = pastoralCase as unknown as CaseRecord;
      const preview =
        row.opened_reason.length > 100
          ? row.opened_reason.slice(0, 100) + '...'
          : row.opened_reason;
      return `Case (${row.case_number}, tier ${row.tier}): ${preview}`;
    }

    if (entityType === 'intervention') {
      const intervention = await db.pastoralIntervention.findFirst({
        where: { id: entityId, tenant_id: tenantId },
        include: {
          case: {
            select: {
              case_number: true,
            },
          },
        },
      });
      if (!intervention) return 'Intervention record not found';
      const row = intervention as unknown as InterventionRecord;
      const summarySource = row.outcome_notes?.trim() || `Continuum level ${row.continuum_level}`;
      const preview =
        summarySource.length > 100 ? summarySource.slice(0, 100) + '...' : summarySource;
      return `Intervention (${row.intervention_type}${row.case?.case_number ? `, ${row.case.case_number}` : ''}): ${preview}`;
    }

    if (entityType === 'referral') {
      const referral = await db.pastoralReferral.findFirst({
        where: { id: entityId, tenant_id: tenantId },
        include: {
          case: {
            select: {
              case_number: true,
            },
          },
        },
      });
      if (!referral) return 'Referral record not found';
      const row = referral as unknown as ReferralRecord;
      const summarySource = row.report_summary?.trim() || row.reason?.trim() || row.status;
      const preview =
        summarySource.length > 100 ? summarySource.slice(0, 100) + '...' : summarySource;
      return `Referral (${row.referral_type}${row.case?.case_number ? `, ${row.case.case_number}` : ''}): ${preview}`;
    }

    if (entityType === 'checkin') {
      const checkin = await db.studentCheckin.findFirst({
        where: { id: entityId, tenant_id: tenantId },
      });
      if (!checkin) return 'Check-in record not found';
      const row = checkin as unknown as CheckinRecord;
      const summarySource =
        row.freeform_text?.trim() ||
        `Mood ${row.mood_score}${row.flagged ? `, flagged ${row.flag_reason ?? ''}` : ''}`;
      const preview =
        summarySource.length > 100 ? summarySource.slice(0, 100) + '...' : summarySource;
      return `Check-in (${row.checkin_date.toISOString().slice(0, 10)}): ${preview}`;
    }

    return 'Unknown record type';
  }

  private async fetchReviewedRecordForDecision(
    tenantId: string,
    review: DsarReviewRow,
  ): Promise<Record<string, unknown> | null> {
    if (review.tier === 3 && !review.reviewed_by_user_id) {
      this.logger.warn(
        `Skipping DSAR review ${review.id}: tier 3 record has no reviewer context for re-fetch`,
      );
      return null;
    }

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      ...(review.reviewed_by_user_id ? { user_id: review.reviewed_by_user_id } : {}),
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return this.fetchEntityRecord(db, review.entity_type, review.entity_id, tenantId);
    }) as Promise<Record<string, unknown> | null>;
  }

  private applyRedactions(record: Record<string, unknown>, entityType: string): void {
    for (const field of this.getRedactionFields(entityType)) {
      if (field in record && typeof record[field] === 'string') {
        record[field] = '[REDACTED]';
      }
    }
  }

  private getRedactionFields(entityType: string): string[] {
    switch (entityType) {
      case 'concern':
      case 'cp_record':
        return ['narrative'];
      case 'case':
        return ['opened_reason'];
      case 'intervention':
        return ['outcome_notes'];
      case 'referral':
        return ['reason', 'report_summary'];
      case 'checkin':
        return ['freeform_text'];
      default:
        return [];
    }
  }
}
