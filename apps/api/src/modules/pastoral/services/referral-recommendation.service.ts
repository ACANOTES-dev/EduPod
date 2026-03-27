import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type {
  CreateRecommendationDto,
  UpdateRecommendationDto,
} from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecommendationRow {
  id: string;
  tenant_id: string;
  referral_id: string;
  recommendation: string;
  assigned_to_user_id: string | null;
  review_date: Date | null;
  status: $Enums.PastoralReferralRecommendationStatus;
  status_note: string | null;
  created_at: Date;
  updated_at: Date;
  assigned_to?: { first_name: string; last_name: string } | null;
}

// ─── Status mapping (shared ↔ Prisma) ──────────────────────────────────────

const STATUS_TO_PRISMA: Record<
  string,
  $Enums.PastoralReferralRecommendationStatus
> = {
  pending: $Enums.PastoralReferralRecommendationStatus.rec_pending,
  in_progress: $Enums.PastoralReferralRecommendationStatus.rec_in_progress,
  implemented: $Enums.PastoralReferralRecommendationStatus.implemented,
  not_applicable: $Enums.PastoralReferralRecommendationStatus.not_applicable,
};

const PRISMA_TO_DISPLAY: Record<string, string> = {
  rec_pending: 'pending',
  rec_in_progress: 'in_progress',
  implemented: 'implemented',
  not_applicable: 'not_applicable',
};

function toDisplayStatus(
  prismaStatus: $Enums.PastoralReferralRecommendationStatus,
): string {
  return PRISMA_TO_DISPLAY[prismaStatus as string] ?? (prismaStatus as string);
}

function toPrismaStatus(
  status: string,
): $Enums.PastoralReferralRecommendationStatus {
  const mapped = STATUS_TO_PRISMA[status];
  if (!mapped) {
    throw new BadRequestException({
      code: 'INVALID_RECOMMENDATION_STATUS',
      message: `Invalid recommendation status: "${status}"`,
    });
  }
  return mapped;
}

// ─── State machine ──────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress', 'not_applicable'],
  in_progress: ['implemented', 'not_applicable'],
};

function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ReferralRecommendationService {
  private readonly logger = new Logger(ReferralRecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    referralId: string,
    dto: CreateRecommendationDto,
  ): Promise<RecommendationRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const recommendation = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate referral exists
      const referral = await db.pastoralReferral.findFirst({
        where: { id: referralId, tenant_id: tenantId },
        select: { id: true },
      });

      if (!referral) {
        throw new NotFoundException({
          code: 'REFERRAL_NOT_FOUND',
          message: `Referral "${referralId}" not found`,
        });
      }

      return db.pastoralReferralRecommendation.create({
        data: {
          tenant_id: tenantId,
          referral_id: referralId,
          recommendation: dto.recommendation,
          assigned_to_user_id: dto.assigned_to_user_id ?? null,
          review_date: dto.review_date ? new Date(dto.review_date) : null,
          status:
            $Enums.PastoralReferralRecommendationStatus.rec_pending,
        },
      });
    })) as RecommendationRow;

    // Fire-and-forget: emit recommendation_created audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'recommendation_created',
      entity_type: 'referral',
      entity_id: referralId,
      student_id: null,
      actor_user_id: userId,
      tier: 1,
      payload: {
        recommendation_id: recommendation.id,
        referral_id: referralId,
        assigned_to: dto.assigned_to_user_id ?? null,
      },
      ip_address: null,
    });

    return recommendation;
  }

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    referralId: string,
  ): Promise<RecommendationRow[]> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralReferralRecommendation.findMany({
        where: { tenant_id: tenantId, referral_id: referralId },
        orderBy: { created_at: 'asc' },
        include: {
          assigned_to: {
            select: { first_name: true, last_name: true },
          },
        },
      });
    })) as RecommendationRow[];
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    userId: string,
    recommendationId: string,
    dto: UpdateRecommendationDto,
  ): Promise<RecommendationRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    let statusChanged = false;
    let newDisplayStatus: string | undefined;

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralReferralRecommendation.findFirst({
        where: { id: recommendationId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'RECOMMENDATION_NOT_FOUND',
          message: `Recommendation "${recommendationId}" not found`,
        });
      }

      const updateData: Record<string, unknown> = {};

      // Handle status transition
      if (dto.status) {
        const currentDisplay = toDisplayStatus(existing.status);

        if (!isValidTransition(currentDisplay, dto.status)) {
          throw new BadRequestException({
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot transition from "${currentDisplay}" to "${dto.status}"`,
          });
        }

        // Require status_note when setting to not_applicable
        if (dto.status === 'not_applicable' && !dto.status_note) {
          throw new BadRequestException({
            code: 'STATUS_NOTE_REQUIRED',
            message:
              'status_note is required when setting status to "not_applicable"',
          });
        }

        updateData.status = toPrismaStatus(dto.status);
        statusChanged = true;
        newDisplayStatus = dto.status;
      }

      if (dto.status_note !== undefined) {
        updateData.status_note = dto.status_note;
      }

      if (dto.assigned_to_user_id !== undefined) {
        updateData.assigned_to_user_id = dto.assigned_to_user_id;
      }

      if (dto.review_date !== undefined) {
        updateData.review_date =
          dto.review_date !== null ? new Date(dto.review_date) : null;
      }

      return db.pastoralReferralRecommendation.update({
        where: { id: recommendationId },
        data: updateData,
      });
    })) as RecommendationRow;

    // Fire-and-forget: emit recommendation_status_changed audit event
    if (statusChanged) {
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'recommendation_status_changed',
        entity_type: 'referral',
        entity_id: recommendationId,
        student_id: null,
        actor_user_id: userId,
        tier: 1,
        payload: {
          recommendation_id: recommendationId,
          new_status: newDisplayStatus,
        },
        ip_address: null,
      });
    }

    return updated;
  }

  // ─── ALL COMPLETE ───────────────────────────────────────────────────────────

  async allComplete(
    tenantId: string,
    referralId: string,
  ): Promise<boolean> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incompleteCount = await db.pastoralReferralRecommendation.count({
        where: {
          tenant_id: tenantId,
          referral_id: referralId,
          status: {
            in: [
              $Enums.PastoralReferralRecommendationStatus.rec_pending,
              $Enums.PastoralReferralRecommendationStatus.rec_in_progress,
            ],
          },
        },
      });

      return incompleteCount === 0;
    })) as boolean;
  }
}
