import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import {
  isValidInterventionTransition,
  type CompleteInterventionDto,
  type CreateInterventionDto,
  type CreateReviewDto,
  type InterventionStatusKey,
  type InterventionStatusTransitionDto,
  type ListInterventionsQuery,
  type OutcomeAnalyticsQuery,
  type UpdateInterventionDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { BehaviourHistoryService } from './behaviour-history.service';

@Injectable()
export class BehaviourInterventionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly historyService: BehaviourHistoryService,
  ) {}

  // ─── Enum Mapping Helpers ──────────────────────────────────────────────────

  /**
   * Map DTO status strings (API-facing) to Prisma enum names.
   * DTO uses 'active'/'completed'; Prisma uses 'active_intervention'/'completed_intervention'.
   */
  private mapStatusToPrisma(status: string): $Enums.InterventionStatus {
    switch (status) {
      case 'active':
        return 'active_intervention' as $Enums.InterventionStatus;
      case 'completed':
        return 'completed_intervention' as $Enums.InterventionStatus;
      default:
        return status as $Enums.InterventionStatus;
    }
  }

  /**
   * Map DTO type strings to Prisma enum names.
   * DTO uses 'other'; Prisma uses 'other_intervention'.
   */
  private mapTypeToPrisma(type: string): $Enums.InterventionType {
    return type === 'other'
      ? ('other_intervention' as $Enums.InterventionType)
      : (type as $Enums.InterventionType);
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateInterventionDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Generate intervention number
        const interventionNumber = await this.sequenceService.nextNumber(
          tenantId,
          'behaviour_intervention',
          tx,
          'IV',
        );

        // Calculate next_review_date from start_date + review_frequency_days
        const startDate = new Date(dto.start_date);
        const nextReviewDate = new Date(startDate);
        nextReviewDate.setDate(nextReviewDate.getDate() + (dto.review_frequency_days ?? 14));

        // Create the intervention
        const intervention = await db.behaviourIntervention.create({
          data: {
            tenant_id: tenantId,
            intervention_number: interventionNumber,
            student_id: dto.student_id,
            title: dto.title,
            type: this.mapTypeToPrisma(dto.type),
            status: 'planned' as $Enums.InterventionStatus,
            trigger_description: dto.trigger_description,
            goals: dto.goals as unknown as Prisma.InputJsonValue,
            strategies: dto.strategies as unknown as Prisma.InputJsonValue,
            assigned_to_id: dto.assigned_to_id,
            start_date: startDate,
            target_end_date: dto.target_end_date ? new Date(dto.target_end_date) : null,
            review_frequency_days: dto.review_frequency_days ?? 14,
            next_review_date: nextReviewDate,
            send_aware: dto.send_aware ?? false,
            send_notes: dto.send_notes ?? null,
          },
        });

        // Link incidents if provided
        if (dto.incident_ids && dto.incident_ids.length > 0) {
          for (const incidentId of dto.incident_ids) {
            await db.behaviourInterventionIncident.create({
              data: {
                tenant_id: tenantId,
                intervention_id: intervention.id,
                incident_id: incidentId,
              },
            });
          }
        }

        // Auto-create follow_up task
        await db.behaviourTask.create({
          data: {
            tenant_id: tenantId,
            task_type: 'follow_up' as $Enums.BehaviourTaskType,
            entity_type: 'intervention' as $Enums.BehaviourTaskEntityType,
            entity_id: intervention.id,
            title: `Follow up on intervention ${interventionNumber}`,
            assigned_to_id: dto.assigned_to_id,
            created_by_id: userId,
            priority: 'medium' as $Enums.TaskPriority,
            status: 'pending' as $Enums.BehaviourTaskStatus,
            due_date: startDate,
          },
        });

        // Record history
        await this.historyService.recordHistory(
          db,
          tenantId,
          'intervention',
          intervention.id,
          userId,
          'created',
          null,
          {
            status: 'planned',
            type: dto.type,
            student_id: dto.student_id,
          },
        );

        return intervention;
      },
      { timeout: 30000 },
    );
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async list(tenantId: string, query: ListInterventionsQuery, hasSensitivePermission: boolean) {
    const where: Prisma.BehaviourInterventionWhereInput = {
      tenant_id: tenantId,
    };

    if (query.status) {
      where.status = this.mapStatusToPrisma(query.status);
    }
    if (query.student_id) {
      where.student_id = query.student_id;
    }
    if (query.assigned_to_id) {
      where.assigned_to_id = query.assigned_to_id;
    }
    if (query.type) {
      where.type = this.mapTypeToPrisma(query.type);
    }

    const [data, total] = await Promise.all([
      this.prisma.behaviourIntervention.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
          assigned_to: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourIntervention.count({ where }),
    ]);

    // Strip send_notes if user lacks sensitive permission
    const projected = hasSensitivePermission
      ? data
      : data.map(({ send_notes: _stripped, ...rest }) => rest);

    return {
      data: projected,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Get Detail ────────────────────────────────────────────────────────────

  async getDetail(tenantId: string, id: string, hasSensitivePermission: boolean) {
    const intervention = await this.prisma.behaviourIntervention.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
        assigned_to: {
          select: { id: true, first_name: true, last_name: true },
        },
        reviews: {
          orderBy: { created_at: 'desc' },
          include: {
            reviewed_by: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
        },
        intervention_incidents: {
          include: {
            incident: {
              select: {
                id: true,
                incident_number: true,
                description: true,
                occurred_at: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!intervention) {
      throw new NotFoundException({
        code: 'INTERVENTION_NOT_FOUND',
        message: 'Intervention not found',
      });
    }

    // Load tasks for this intervention
    const tasks = await this.prisma.behaviourTask.findMany({
      where: {
        tenant_id: tenantId,
        entity_type: 'intervention' as $Enums.BehaviourTaskEntityType,
        entity_id: id,
      },
      orderBy: { due_date: 'asc' },
    });

    // Strip send_notes if user lacks sensitive permission
    if (!hasSensitivePermission) {
      return { ...intervention, send_notes: undefined, tasks };
    }

    return { ...intervention, tasks };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, userId: string, dto: UpdateInterventionDto) {
    const existing = await this.prisma.behaviourIntervention.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'INTERVENTION_NOT_FOUND',
        message: 'Intervention not found',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Build update data
      const updateData: Prisma.BehaviourInterventionUpdateInput = {};
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};

      if (dto.title !== undefined) {
        previousValues.title = existing.title;
        newValues.title = dto.title;
        updateData.title = dto.title;
      }
      if (dto.goals !== undefined) {
        previousValues.goals = existing.goals;
        newValues.goals = dto.goals;
        updateData.goals = dto.goals as unknown as Prisma.InputJsonValue;
      }
      if (dto.strategies !== undefined) {
        previousValues.strategies = existing.strategies;
        newValues.strategies = dto.strategies;
        updateData.strategies = dto.strategies as unknown as Prisma.InputJsonValue;
      }
      if (dto.target_end_date !== undefined) {
        previousValues.target_end_date = existing.target_end_date;
        newValues.target_end_date = dto.target_end_date;
        updateData.target_end_date = dto.target_end_date ? new Date(dto.target_end_date) : null;
      }
      if (dto.send_aware !== undefined) {
        previousValues.send_aware = existing.send_aware;
        newValues.send_aware = dto.send_aware;
        updateData.send_aware = dto.send_aware;
      }
      if (dto.send_notes !== undefined) {
        previousValues.send_notes = existing.send_notes;
        newValues.send_notes = dto.send_notes;
        updateData.send_notes = dto.send_notes;
      }

      // If review_frequency_days changed, recalculate next_review_date
      if (dto.review_frequency_days !== undefined) {
        previousValues.review_frequency_days = existing.review_frequency_days;
        newValues.review_frequency_days = dto.review_frequency_days;
        updateData.review_frequency_days = dto.review_frequency_days;

        // Find last review date (or fall back to start_date)
        const lastReview = await db.behaviourInterventionReview.findFirst({
          where: {
            tenant_id: tenantId,
            intervention_id: id,
          },
          orderBy: { review_date: 'desc' },
          select: { review_date: true },
        });

        const baseDate = lastReview ? lastReview.review_date : existing.start_date;
        const nextReviewDate = new Date(baseDate);
        nextReviewDate.setDate(nextReviewDate.getDate() + dto.review_frequency_days);
        updateData.next_review_date = nextReviewDate;
      }

      if (Object.keys(newValues).length === 0) {
        return existing;
      }

      const updated = await db.behaviourIntervention.update({
        where: { id },
        data: updateData,
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'intervention',
        id,
        userId,
        'updated',
        previousValues,
        newValues,
      );

      return updated;
    });
  }

  // ─── Status Transition ─────────────────────────────────────────────────────

  async transitionStatus(
    tenantId: string,
    id: string,
    userId: string,
    dto: InterventionStatusTransitionDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const intervention = await db.behaviourIntervention.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!intervention) {
        throw new NotFoundException({
          code: 'INTERVENTION_NOT_FOUND',
          message: 'Intervention not found',
        });
      }

      // Map DTO status to Prisma enum name for validation
      const targetPrismaStatus = this.mapStatusToPrisma(dto.status);
      const currentPrismaStatus = intervention.status as InterventionStatusKey;
      const targetKey = targetPrismaStatus as InterventionStatusKey;

      if (!isValidInterventionTransition(currentPrismaStatus, targetKey)) {
        throw new BadRequestException({
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from "${intervention.status}" to "${targetPrismaStatus}"`,
        });
      }

      const updateData: Prisma.BehaviourInterventionUpdateInput = {
        status: targetPrismaStatus,
      };

      // If activating, auto-create an intervention_review task
      if (targetPrismaStatus === 'active_intervention') {
        await db.behaviourTask.create({
          data: {
            tenant_id: tenantId,
            task_type: 'intervention_review' as $Enums.BehaviourTaskType,
            entity_type: 'intervention' as $Enums.BehaviourTaskEntityType,
            entity_id: id,
            title: `Review intervention ${intervention.intervention_number}`,
            assigned_to_id: intervention.assigned_to_id,
            created_by_id: userId,
            priority: 'medium' as $Enums.TaskPriority,
            status: 'pending' as $Enums.BehaviourTaskStatus,
            due_date: intervention.next_review_date ?? new Date(),
          },
        });
      }

      // If completing or abandoning, set actual_end_date and outcome
      if (targetPrismaStatus === 'completed_intervention' || targetPrismaStatus === 'abandoned') {
        updateData.actual_end_date = new Date();
        if (dto.outcome) {
          updateData.outcome = dto.outcome as $Enums.InterventionOutcome;
        }
        if (dto.outcome_notes) {
          updateData.outcome_notes = dto.outcome_notes;
        }
      }

      const updated = await db.behaviourIntervention.update({
        where: { id },
        data: updateData,
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'intervention',
        id,
        userId,
        'status_changed',
        { status: intervention.status },
        {
          status: targetPrismaStatus,
          ...(dto.outcome ? { outcome: dto.outcome } : {}),
        },
      );

      return updated;
    });
  }

  // ─── Create Review ─────────────────────────────────────────────────────────

  async createReview(
    tenantId: string,
    interventionId: string,
    userId: string,
    dto: CreateReviewDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const intervention = await db.behaviourIntervention.findFirst({
        where: { id: interventionId, tenant_id: tenantId },
      });
      if (!intervention) {
        throw new NotFoundException({
          code: 'INTERVENTION_NOT_FOUND',
          message: 'Intervention not found',
        });
      }

      // Only active or monitoring interventions can be reviewed
      if (intervention.status !== 'active_intervention' && intervention.status !== 'monitoring') {
        throw new BadRequestException({
          code: 'INTERVENTION_NOT_REVIEWABLE',
          message: `Cannot review an intervention with status "${intervention.status}"`,
        });
      }

      // Auto-populate behaviour points since last review
      const lastReview = await db.behaviourInterventionReview.findFirst({
        where: {
          tenant_id: tenantId,
          intervention_id: interventionId,
        },
        orderBy: { review_date: 'desc' },
        select: { review_date: true },
      });

      const sinceDate = lastReview ? lastReview.review_date : intervention.start_date;

      // SUM points for this student since the last review date
      const pointsResult = await db.behaviourIncidentParticipant.aggregate({
        where: {
          tenant_id: tenantId,
          student_id: intervention.student_id,
          created_at: { gte: sinceDate },
        },
        _sum: { points_awarded: true },
      });
      const behaviourPointsSinceLast = pointsResult._sum.points_awarded ?? 0;

      // Create review (append-only)
      const review = await db.behaviourInterventionReview.create({
        data: {
          tenant_id: tenantId,
          intervention_id: interventionId,
          reviewed_by_id: userId,
          review_date: new Date(dto.review_date),
          progress: dto.progress as $Enums.InterventionProgress,
          goal_updates: dto.goal_updates as unknown as Prisma.InputJsonValue,
          notes: dto.notes,
          next_review_date: dto.next_review_date ? new Date(dto.next_review_date) : null,
          behaviour_points_since_last: behaviourPointsSinceLast,
          attendance_rate_since_last: null, // Attendance module integration deferred
        },
      });

      // Update intervention next_review_date if provided
      const interventionUpdate: Prisma.BehaviourInterventionUpdateInput = {};
      if (dto.next_review_date) {
        interventionUpdate.next_review_date = new Date(dto.next_review_date);

        // Auto-create intervention_review task for next review
        await db.behaviourTask.create({
          data: {
            tenant_id: tenantId,
            task_type: 'intervention_review' as $Enums.BehaviourTaskType,
            entity_type: 'intervention' as $Enums.BehaviourTaskEntityType,
            entity_id: interventionId,
            title: `Review intervention ${intervention.intervention_number}`,
            assigned_to_id: intervention.assigned_to_id,
            created_by_id: userId,
            priority: 'medium' as $Enums.TaskPriority,
            status: 'pending' as $Enums.BehaviourTaskStatus,
            due_date: new Date(dto.next_review_date),
          },
        });
      }

      if (Object.keys(interventionUpdate).length > 0) {
        await db.behaviourIntervention.update({
          where: { id: interventionId },
          data: interventionUpdate,
        });
      }

      return review;
    });
  }

  // ─── Auto-Populate Data ────────────────────────────────────────────────────

  async getAutoPopulateData(tenantId: string, interventionId: string) {
    const intervention = await this.prisma.behaviourIntervention.findFirst({
      where: { id: interventionId, tenant_id: tenantId },
    });
    if (!intervention) {
      throw new NotFoundException({
        code: 'INTERVENTION_NOT_FOUND',
        message: 'Intervention not found',
      });
    }

    // Find last review date (or fall back to start_date)
    const lastReview = await this.prisma.behaviourInterventionReview.findFirst({
      where: {
        tenant_id: tenantId,
        intervention_id: interventionId,
      },
      orderBy: { review_date: 'desc' },
      select: { review_date: true },
    });

    const sinceDate = lastReview ? lastReview.review_date : intervention.start_date;

    // SUM points for this student since the last review date
    const pointsResult = await this.prisma.behaviourIncidentParticipant.aggregate({
      where: {
        tenant_id: tenantId,
        student_id: intervention.student_id,
        created_at: { gte: sinceDate },
      },
      _sum: { points_awarded: true },
    });

    return {
      behaviour_points_since_last: pointsResult._sum.points_awarded ?? 0,
      attendance_rate_since_last: null, // Attendance module integration deferred
    };
  }

  // ─── List Reviews ──────────────────────────────────────────────────────────

  async listReviews(tenantId: string, interventionId: string, page: number, pageSize: number) {
    const where: Prisma.BehaviourInterventionReviewWhereInput = {
      tenant_id: tenantId,
      intervention_id: interventionId,
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourInterventionReview.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          reviewed_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourInterventionReview.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Complete (shorthand) ──────────────────────────────────────────────────

  async complete(tenantId: string, id: string, userId: string, dto: CompleteInterventionDto) {
    return this.transitionStatus(tenantId, id, userId, {
      status: 'completed',
      outcome: dto.outcome,
      outcome_notes: dto.outcome_notes,
    });
  }

  // ─── List Overdue ──────────────────────────────────────────────────────────

  async listOverdue(tenantId: string, page: number, pageSize: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Prisma.BehaviourInterventionWhereInput = {
      tenant_id: tenantId,
      next_review_date: { lt: today },
      status: {
        in: ['active_intervention', 'monitoring'] as $Enums.InterventionStatus[],
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourIntervention.findMany({
        where,
        orderBy: { next_review_date: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
          assigned_to: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourIntervention.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── List My Interventions ─────────────────────────────────────────────────

  async listMy(tenantId: string, userId: string, page: number, pageSize: number) {
    const where: Prisma.BehaviourInterventionWhereInput = {
      tenant_id: tenantId,
      assigned_to_id: userId,
      status: {
        in: ['planned', 'active_intervention', 'monitoring'] as $Enums.InterventionStatus[],
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourIntervention.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourIntervention.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Outcome Analytics ─────────────────────────────────────────────────────

  async getOutcomeAnalytics(tenantId: string, query: OutcomeAnalyticsQuery) {
    const where: Prisma.BehaviourInterventionWhereInput = {
      tenant_id: tenantId,
      status: 'completed_intervention' as $Enums.InterventionStatus,
    };

    // Filter by academic year via linked student incidents if needed
    // For now, filter by student year group if provided
    if (query.year_group_id) {
      where.student = {
        year_group_id: query.year_group_id,
      };
    }

    const interventions = await this.prisma.behaviourIntervention.findMany({
      where,
      select: {
        type: true,
        outcome: true,
        send_aware: true,
      },
    });

    // Group by type, outcome, send_aware
    const analytics: Record<
      string,
      { type: string; outcome: string; send_aware: boolean; count: number }
    > = {};

    for (const intervention of interventions) {
      const outcomeStr = intervention.outcome ?? 'unknown';
      const key = `${intervention.type}:${outcomeStr}:${intervention.send_aware}`;
      if (!analytics[key]) {
        analytics[key] = {
          type: intervention.type,
          outcome: outcomeStr,
          send_aware: intervention.send_aware,
          count: 0,
        };
      }
      analytics[key].count += 1;
    }

    return Object.values(analytics);
  }
}
