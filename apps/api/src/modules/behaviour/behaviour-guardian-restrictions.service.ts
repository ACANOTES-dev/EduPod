import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';

// ─── Interfaces ────────────────────────────────────────────────────────────

interface CreateRestrictionDto {
  student_id: string;
  parent_id: string;
  restriction_type: string;
  legal_basis?: string | null;
  reason: string;
  effective_from: string;
  effective_until?: string | null;
  review_date?: string | null;
  approved_by_id?: string | null;
}

interface ListRestrictionsQuery {
  page: number;
  pageSize: number;
  student_id?: string;
  parent_id?: string;
  status?: string;
}

interface UpdateRestrictionDto {
  legal_basis?: string | null;
  effective_until?: string | null;
  review_date?: string | null;
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourGuardianRestrictionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historyService: BehaviourHistoryService,
  ) {}

  // ─── Enum Mapping ─────────────────────────────────────────────────────

  /**
   * Map API-facing status strings to Prisma enum names.
   * API uses 'active'; Prisma uses 'active_restriction'.
   * API uses 'superseded'; Prisma uses 'superseded_restriction'.
   */
  private mapStatusToPrisma(status: string): $Enums.RestrictionStatus {
    switch (status) {
      case 'active':
        return 'active_restriction' as $Enums.RestrictionStatus;
      case 'superseded':
        return 'superseded_restriction' as $Enums.RestrictionStatus;
      default:
        return status as $Enums.RestrictionStatus;
    }
  }

  // ─── Create ───────────────────────────────────────────────────────────

  /**
   * Create a new guardian restriction. Optionally creates a review task
   * if the review_date is within 14 days.
   */
  async create(tenantId: string, userId: string, dto: CreateRestrictionDto) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        const restriction = await db.behaviourGuardianRestriction.create({
          data: {
            tenant_id: tenantId,
            student_id: dto.student_id,
            parent_id: dto.parent_id,
            restriction_type:
              dto.restriction_type as $Enums.RestrictionType,
            legal_basis: dto.legal_basis ?? null,
            reason: dto.reason,
            set_by_id: userId,
            effective_from: new Date(dto.effective_from),
            effective_until: dto.effective_until
              ? new Date(dto.effective_until)
              : null,
            review_date: dto.review_date
              ? new Date(dto.review_date)
              : null,
            status:
              'active_restriction' as $Enums.RestrictionStatus,
          },
        });

        // Record history
        await this.historyService.recordHistory(
          db,
          tenantId,
          'guardian_restriction',
          restriction.id,
          userId,
          'created',
          null,
          {
            status: 'active_restriction',
            restriction_type: dto.restriction_type,
            student_id: dto.student_id,
            parent_id: dto.parent_id,
          },
        );

        // Create review task if review_date is within 14 days
        if (dto.review_date) {
          const reviewDate = new Date(dto.review_date);
          const today = new Date();
          const daysUntilReview = Math.floor(
            (reviewDate.getTime() - today.getTime()) /
              (1000 * 60 * 60 * 24),
          );

          if (daysUntilReview <= 14) {
            const priority: $Enums.TaskPriority =
              daysUntilReview <= 3
                ? ('high' as $Enums.TaskPriority)
                : ('medium' as $Enums.TaskPriority);

            await db.behaviourTask.create({
              data: {
                tenant_id: tenantId,
                task_type:
                  'guardian_restriction_review' as $Enums.BehaviourTaskType,
                entity_type:
                  'guardian_restriction' as $Enums.BehaviourTaskEntityType,
                entity_id: restriction.id,
                title: `Review guardian restriction for student`,
                assigned_to_id: userId,
                created_by_id: userId,
                priority,
                status:
                  'pending' as $Enums.BehaviourTaskStatus,
                due_date: reviewDate,
              },
            });
          }
        }

        return restriction;
      },
      { timeout: 30000 },
    );
  }

  // ─── List ─────────────────────────────────────────────────────────────

  /**
   * List restrictions with filters and pagination.
   */
  async list(tenantId: string, query: ListRestrictionsQuery) {
    const where: Prisma.BehaviourGuardianRestrictionWhereInput = {
      tenant_id: tenantId,
    };

    if (query.student_id) {
      where.student_id = query.student_id;
    }
    if (query.parent_id) {
      where.parent_id = query.parent_id;
    }
    if (query.status) {
      where.status = this.mapStatusToPrisma(query.status);
    }

    const [data, total] = await Promise.all([
      this.prisma.behaviourGuardianRestriction.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
          parent: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              user: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.behaviourGuardianRestriction.count({ where }),
    ]);

    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Get Detail ───────────────────────────────────────────────────────

  /**
   * Get full restriction detail including history.
   */
  async getDetail(tenantId: string, id: string) {
    const restriction =
      await this.prisma.behaviourGuardianRestriction.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
          parent: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              user: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                },
              },
            },
          },
          set_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          approved_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          revoked_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      });

    if (!restriction) {
      throw new NotFoundException({
        code: 'RESTRICTION_NOT_FOUND',
        message: 'Guardian restriction not found',
      });
    }

    // Fetch history
    const history = await this.historyService.getHistory(
      tenantId,
      'guardian_restriction',
      id,
      1,
      50,
    );

    return { ...restriction, history: history.data };
  }

  // ─── Update ───────────────────────────────────────────────────────────

  /**
   * Update allowed fields on a restriction. Records history with previous values.
   */
  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateRestrictionDto,
  ) {
    const existing =
      await this.prisma.behaviourGuardianRestriction.findFirst({
        where: { id, tenant_id: tenantId },
      });

    if (!existing) {
      throw new NotFoundException({
        code: 'RESTRICTION_NOT_FOUND',
        message: 'Guardian restriction not found',
      });
    }

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updateData: Prisma.BehaviourGuardianRestrictionUpdateInput =
        {};
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};

      if (dto.legal_basis !== undefined) {
        previousValues.legal_basis = existing.legal_basis;
        newValues.legal_basis = dto.legal_basis;
        updateData.legal_basis = dto.legal_basis ?? undefined;
      }
      if (dto.effective_until !== undefined) {
        previousValues.effective_until = existing.effective_until;
        newValues.effective_until = dto.effective_until;
        updateData.effective_until = dto.effective_until
          ? new Date(dto.effective_until)
          : null;
      }
      if (dto.review_date !== undefined) {
        previousValues.review_date = existing.review_date;
        newValues.review_date = dto.review_date;
        updateData.review_date = dto.review_date
          ? new Date(dto.review_date)
          : null;
      }

      if (Object.keys(newValues).length === 0) {
        return existing;
      }

      const updated = await db.behaviourGuardianRestriction.update({
        where: { id },
        data: updateData,
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'guardian_restriction',
        id,
        userId,
        'updated',
        previousValues,
        newValues,
      );

      return updated;
    });
  }

  // ─── Revoke ───────────────────────────────────────────────────────────

  /**
   * Revoke a restriction with a reason.
   */
  async revoke(
    tenantId: string,
    id: string,
    userId: string,
    reason: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const restriction =
        await db.behaviourGuardianRestriction.findFirst({
          where: { id, tenant_id: tenantId },
        });

      if (!restriction) {
        throw new NotFoundException({
          code: 'RESTRICTION_NOT_FOUND',
          message: 'Guardian restriction not found',
        });
      }

      const updated = await db.behaviourGuardianRestriction.update({
        where: { id },
        data: {
          status: 'revoked' as $Enums.RestrictionStatus,
          revoked_at: new Date(),
          revoked_by_id: userId,
          revoke_reason: reason,
        },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'guardian_restriction',
        id,
        userId,
        'revoked',
        { status: restriction.status },
        { status: 'revoked', revoke_reason: reason },
        reason,
      );

      return updated;
    });
  }

  // ─── List Active ──────────────────────────────────────────────────────

  /**
   * List all currently effective active restrictions for a tenant.
   * Filters by status = active_restriction and effective date range.
   */
  async listActive(tenantId: string) {
    const today = new Date().toISOString().split('T')[0] as string;

    return this.prisma.behaviourGuardianRestriction.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active_restriction' as $Enums.RestrictionStatus,
        effective_from: { lte: new Date(today) },
        OR: [
          { effective_until: null },
          { effective_until: { gte: new Date(today) } },
        ],
      },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
        parent: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: { effective_from: 'desc' },
    });
  }

  // ─── Has Active Restriction ───────────────────────────────────────────

  /**
   * Check if any active restriction exists matching the given criteria.
   * Used by notification dispatch to decide whether to suppress messages.
   */
  async hasActiveRestriction(
    tx: PrismaService,
    tenantId: string,
    studentId: string,
    parentId: string,
    restrictionTypes: string[],
  ): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0] as string;

    const count = await tx.behaviourGuardianRestriction.count({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        parent_id: parentId,
        restriction_type: {
          in: restrictionTypes as $Enums.RestrictionType[],
        },
        status: 'active_restriction' as $Enums.RestrictionStatus,
        effective_from: { lte: new Date(today) },
        OR: [
          { effective_until: null },
          { effective_until: { gte: new Date(today) } },
        ],
      },
    });

    return count > 0;
  }

  // ─── Expire Ended Restrictions ────────────────────────────────────────

  /**
   * Find active restrictions that have passed their effective_until date
   * and mark them as expired. Called by the scheduled worker job.
   */
  async expireEndedRestrictions(
    tx: PrismaService,
    tenantId: string,
    today: string,
  ): Promise<number> {
    const expiredRestrictions =
      await tx.behaviourGuardianRestriction.findMany({
        where: {
          tenant_id: tenantId,
          status: 'active_restriction' as $Enums.RestrictionStatus,
          effective_until: { lt: new Date(today) },
        },
      });

    for (const restriction of expiredRestrictions) {
      await tx.behaviourGuardianRestriction.update({
        where: { id: restriction.id },
        data: {
          status: 'expired' as $Enums.RestrictionStatus,
        },
      });

      await this.historyService.recordHistory(
        tx,
        tenantId,
        'guardian_restriction',
        restriction.id,
        '00000000-0000-0000-0000-000000000000', // system user
        'expired',
        { status: 'active_restriction' },
        { status: 'expired' },
      );
    }

    return expiredRestrictions.length;
  }

  // ─── Create Review Reminders ──────────────────────────────────────────

  /**
   * Find active restrictions with review_date approaching (within 14 days)
   * and create review tasks if none already exist. Called by scheduled worker.
   */
  async createReviewReminders(
    tx: PrismaService,
    tenantId: string,
    today: string,
  ): Promise<number> {
    const todayDate = new Date(today);
    const futureDate = new Date(todayDate);
    futureDate.setDate(futureDate.getDate() + 14);

    const restrictionsNeedingReview =
      await tx.behaviourGuardianRestriction.findMany({
        where: {
          tenant_id: tenantId,
          status: 'active_restriction' as $Enums.RestrictionStatus,
          review_date: {
            gte: todayDate,
            lte: futureDate,
          },
        },
      });

    let tasksCreated = 0;

    for (const restriction of restrictionsNeedingReview) {
      // Check if an open task already exists for this restriction
      const existingTask = await tx.behaviourTask.findFirst({
        where: {
          tenant_id: tenantId,
          entity_type:
            'guardian_restriction' as $Enums.BehaviourTaskEntityType,
          entity_id: restriction.id,
          task_type:
            'guardian_restriction_review' as $Enums.BehaviourTaskType,
          status: {
            in: [
              'pending',
              'in_progress',
            ] as $Enums.BehaviourTaskStatus[],
          },
        },
      });

      if (existingTask) {
        continue;
      }

      // Calculate priority based on proximity to review_date
      const reviewDate = restriction.review_date as Date;
      const daysUntilReview = Math.floor(
        (reviewDate.getTime() - todayDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      const priority: $Enums.TaskPriority =
        daysUntilReview <= 3
          ? ('high' as $Enums.TaskPriority)
          : ('medium' as $Enums.TaskPriority);

      await tx.behaviourTask.create({
        data: {
          tenant_id: tenantId,
          task_type:
            'guardian_restriction_review' as $Enums.BehaviourTaskType,
          entity_type:
            'guardian_restriction' as $Enums.BehaviourTaskEntityType,
          entity_id: restriction.id,
          title: `Review guardian restriction`,
          assigned_to_id: restriction.set_by_id,
          created_by_id: '00000000-0000-0000-0000-000000000000', // system
          priority,
          status: 'pending' as $Enums.BehaviourTaskStatus,
          due_date: reviewDate,
        },
      });

      tasksCreated += 1;
    }

    return tasksCreated;
  }
}
