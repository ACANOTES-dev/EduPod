import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type {
  CreateReferralDto,
  ReferralFilters,
  UpdateReferralDto,
} from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { ReferralRecommendationService } from './referral-recommendation.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ReferralRow {
  id: string;
  tenant_id: string;
  case_id: string | null;
  student_id: string;
  referral_type: string;
  referral_body_name: string | null;
  status: string;
  reason: string | null;
  submitted_at: Date | null;
  submitted_by_user_id: string | null;
  acknowledged_at: Date | null;
  assessment_scheduled_date: Date | null;
  assessment_completed_at: Date | null;
  pre_populated_data: Prisma.JsonValue | null;
  manual_additions: Prisma.JsonValue | null;
  external_reference: string | null;
  report_received_at: Date | null;
  report_summary: string | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReferralWithDetails extends ReferralRow {
  recommendations: Array<{
    id: string;
    recommendation: string;
    assigned_to_user_id: string | null;
    review_date: Date | null;
    status: string;
    status_note: string | null;
    created_at: Date;
  }>;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  case: {
    id: string;
    case_number: string;
    status: string;
  } | null;
}

export interface WaitlistFilters {
  page?: number;
  pageSize?: number;
  referral_type?: string;
}

export interface WaitlistItem extends ReferralRow {
  wait_days: number;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

// ─── State Machine ──────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['acknowledged', 'withdrawn'],
  acknowledged: ['assessment_scheduled', 'withdrawn'],
  assessment_scheduled: ['assessment_complete', 'withdrawn'],
  assessment_complete: ['report_received', 'withdrawn'],
  report_received: ['recommendations_implemented', 'withdrawn'],
};

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'recommendations_implemented',
  'withdrawn',
]);

const WAITLIST_STATUSES: ReadonlySet<string> = new Set([
  'submitted',
  'acknowledged',
  'assessment_scheduled',
]);

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
    private readonly recommendationService: ReferralRecommendationService,
  ) {}

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateReferralDto): Promise<ReferralRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const referral = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const createData: Record<string, unknown> = {
        tenant_id: tenantId,
        student_id: dto.student_id,
        case_id: dto.case_id ?? null,
        referral_type: dto.referral_type,
        referral_body_name: dto.referral_body_name ?? null,
        status: 'draft',
        created_by_user_id: userId,
      };

      if (dto.pre_populated_data !== undefined) {
        createData.pre_populated_data = dto.pre_populated_data;
      }
      if (dto.manual_additions !== undefined) {
        createData.manual_additions = dto.manual_additions;
      }

      return db.pastoralReferral.create({ data: createData } as Parameters<
        typeof db.pastoralReferral.create
      >[0]);
    })) as ReferralRow;

    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'referral_created',
      entity_type: 'referral',
      entity_id: referral.id,
      student_id: referral.student_id,
      actor_user_id: userId,
      tier: 1,
      payload: {
        referral_id: referral.id,
        student_id: referral.student_id,
        referral_type: referral.referral_type,
      },
      ip_address: null,
    });

    return referral;
  }

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    filters: ReferralFilters,
  ): Promise<{ data: ReferralRow[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };

    if (filters.student_id) {
      where.student_id = filters.student_id;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.referral_type) {
      where.referral_type = filters.referral_type;
    }
    if (filters.date_from || filters.date_to) {
      const createdAt: Record<string, unknown> = {};
      if (filters.date_from) {
        createdAt.gte = new Date(filters.date_from);
      }
      if (filters.date_to) {
        createdAt.lte = new Date(filters.date_to);
      }
      where.created_at = createdAt;
    }

    const orderBy: Record<string, string> = {};
    orderBy[filters.sort ?? 'created_at'] = filters.order ?? 'desc';

    const [data, total] = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const items = await db.pastoralReferral.findMany({
        where,
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
        orderBy,
        skip,
        take: pageSize,
      });

      const count = await db.pastoralReferral.count({ where });

      return [items, count];
    })) as [ReferralRow[], number];

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── GET ────────────────────────────────────────────────────────────────────

  async get(tenantId: string, referralId: string): Promise<ReferralWithDetails> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const referral = await db.pastoralReferral.findFirst({
        where: { id: referralId, tenant_id: tenantId },
        include: {
          recommendations: {
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              recommendation: true,
              assigned_to_user_id: true,
              review_date: true,
              status: true,
              status_note: true,
              created_at: true,
            },
          },
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
          case: {
            select: { id: true, case_number: true, status: true },
          },
        },
      });

      if (!referral) {
        throw new NotFoundException({
          code: 'REFERRAL_NOT_FOUND',
          message: `Referral "${referralId}" not found`,
        });
      }

      return referral;
    })) as ReferralWithDetails;

    return result;
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, referralId: string, dto: UpdateReferralDto): Promise<ReferralRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralReferral.findFirst({
        where: { id: referralId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'REFERRAL_NOT_FOUND',
          message: `Referral "${referralId}" not found`,
        });
      }

      if (existing.status !== 'draft') {
        throw new BadRequestException({
          code: 'REFERRAL_NOT_EDITABLE',
          message: `Referral can only be updated in draft status, current status: "${existing.status as string}"`,
        });
      }

      const updateData: Record<string, unknown> = {};

      if (dto.referral_body_name !== undefined) {
        updateData.referral_body_name = dto.referral_body_name;
      }
      if (dto.external_reference !== undefined) {
        updateData.external_reference = dto.external_reference;
      }
      if (dto.report_summary !== undefined) {
        updateData.report_summary = dto.report_summary;
      }
      if (dto.pre_populated_data !== undefined) {
        updateData.pre_populated_data = dto.pre_populated_data as Prisma.InputJsonValue;
      }
      if (dto.manual_additions !== undefined) {
        updateData.manual_additions = dto.manual_additions as Prisma.InputJsonValue;
      }

      return db.pastoralReferral.update({
        where: { id: referralId },
        data: updateData,
      });
    })) as ReferralRow;

    return updated;
  }

  // ─── SUBMIT ─────────────────────────────────────────────────────────────────

  async submit(tenantId: string, userId: string, referralId: string): Promise<ReferralRow> {
    return this.transition(tenantId, userId, referralId, 'submitted', {
      submitted_at: new Date(),
      submitted_by_user_id: userId,
    });
  }

  // ─── ACKNOWLEDGE ────────────────────────────────────────────────────────────

  async acknowledge(tenantId: string, userId: string, referralId: string): Promise<ReferralRow> {
    return this.transition(tenantId, userId, referralId, 'acknowledged', {
      acknowledged_at: new Date(),
    });
  }

  // ─── SCHEDULE ASSESSMENT ────────────────────────────────────────────────────

  async scheduleAssessment(
    tenantId: string,
    userId: string,
    referralId: string,
    dto: { assessment_scheduled_date: string },
  ): Promise<ReferralRow> {
    return this.transition(tenantId, userId, referralId, 'assessment_scheduled', {
      assessment_scheduled_date: new Date(dto.assessment_scheduled_date),
    });
  }

  // ─── COMPLETE ASSESSMENT ────────────────────────────────────────────────────

  async completeAssessment(
    tenantId: string,
    userId: string,
    referralId: string,
  ): Promise<ReferralRow> {
    return this.transition(tenantId, userId, referralId, 'assessment_complete', {
      assessment_completed_at: new Date(),
    });
  }

  // ─── RECEIVE REPORT ────────────────────────────────────────────────────────

  async receiveReport(
    tenantId: string,
    userId: string,
    referralId: string,
    dto: { report_summary: string },
  ): Promise<ReferralRow> {
    return this.transition(tenantId, userId, referralId, 'report_received', {
      report_received_at: new Date(),
      report_summary: dto.report_summary,
    });
  }

  // ─── MARK RECOMMENDATIONS IMPLEMENTED ──────────────────────────────────────

  async markRecommendationsImplemented(
    tenantId: string,
    userId: string,
    referralId: string,
  ): Promise<ReferralRow> {
    const allComplete = await this.recommendationService.allComplete(tenantId, referralId);

    if (!allComplete) {
      throw new BadRequestException({
        code: 'RECOMMENDATIONS_NOT_COMPLETE',
        message: 'All recommendations must be complete before marking as implemented',
      });
    }

    return this.transition(tenantId, userId, referralId, 'recommendations_implemented', {});
  }

  // ─── WITHDRAW ──────────────────────────────────────────────────────────────

  async withdraw(
    tenantId: string,
    userId: string,
    referralId: string,
    dto: { reason: string },
  ): Promise<ReferralRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralReferral.findFirst({
        where: { id: referralId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'REFERRAL_NOT_FOUND',
          message: `Referral "${referralId}" not found`,
        });
      }

      const currentStatus = existing.status as string;

      if (TERMINAL_STATUSES.has(currentStatus)) {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot withdraw referral from terminal status "${currentStatus}"`,
        });
      }

      const withdrawData: Record<string, unknown> = {
        status: 'withdrawn',
        reason: dto.reason,
      };

      return db.pastoralReferral.update({
        where: { id: referralId },
        data: withdrawData,
      } as Parameters<typeof db.pastoralReferral.update>[0]);
    })) as ReferralRow;

    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'referral_withdrawn',
      entity_type: 'referral',
      entity_id: referralId,
      student_id: updated.student_id,
      actor_user_id: userId,
      tier: 1,
      payload: {
        referral_id: referralId,
        reason: dto.reason,
      },
      ip_address: null,
    });

    return updated;
  }

  // ─── GET WAITLIST ──────────────────────────────────────────────────────────

  async getWaitlist(
    tenantId: string,
    filters: WaitlistFilters,
  ): Promise<{ data: WaitlistItem[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { in: Array.from(WAITLIST_STATUSES) },
    };

    if (filters.referral_type) {
      where.referral_type = filters.referral_type;
    }

    const [rawData, total] = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const items = await db.pastoralReferral.findMany({
        where,
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
        orderBy: { submitted_at: 'asc' },
        skip,
        take: pageSize,
      });

      const count = await db.pastoralReferral.count({ where });

      return [items, count];
    })) as [
      Array<
        ReferralRow & { student: { id: string; first_name: string; last_name: string } | null }
      >,
      number,
    ];

    const now = new Date();
    const data: WaitlistItem[] = rawData.map((item) => {
      const submittedAt = item.submitted_at ? new Date(item.submitted_at) : now;
      const diffMs = now.getTime() - submittedAt.getTime();
      const waitDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      return {
        ...item,
        wait_days: waitDays,
      };
    });

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── PRIVATE: TRANSITION ──────────────────────────────────────────────────

  private async transition(
    tenantId: string,
    userId: string,
    referralId: string,
    targetStatus: string,
    additionalData: Record<string, unknown>,
  ): Promise<ReferralRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralReferral.findFirst({
        where: { id: referralId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'REFERRAL_NOT_FOUND',
          message: `Referral "${referralId}" not found`,
        });
      }

      this.validateTransition(existing.status as string, targetStatus);

      const updateData: Record<string, unknown> = {
        status: targetStatus,
        ...additionalData,
      };

      return db.pastoralReferral.update({
        where: { id: referralId },
        data: updateData,
      } as Parameters<typeof db.pastoralReferral.update>[0]);
    })) as ReferralRow;

    const eventType = this.statusToEventType(targetStatus);

    void this.eventService.write({
      tenant_id: tenantId,
      event_type: eventType,
      entity_type: 'referral',
      entity_id: referralId,
      student_id: updated.student_id,
      actor_user_id: userId,
      tier: 1,
      payload: {
        referral_id: referralId,
        new_status: targetStatus,
        ...additionalData,
      },
      ip_address: null,
    });

    return updated;
  }

  // ─── PRIVATE: VALIDATE TRANSITION ──────────────────────────────────────────

  private validateTransition(current: string, target: string): void {
    const allowed = VALID_TRANSITIONS[current];

    if (!allowed || !allowed.includes(target)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${current}" to "${target}"`,
      });
    }
  }

  // ─── PRIVATE: STATUS TO EVENT TYPE ─────────────────────────────────────────

  private statusToEventType(status: string): string {
    const map: Record<string, string> = {
      submitted: 'referral_submitted',
      acknowledged: 'referral_acknowledged',
      assessment_scheduled: 'referral_assessment_scheduled',
      assessment_complete: 'referral_assessment_complete',
      report_received: 'referral_report_received',
      recommendations_implemented: 'referral_recommendations_implemented',
      withdrawn: 'referral_withdrawn',
    };

    return map[status] ?? `referral_${status}`;
  }
}
