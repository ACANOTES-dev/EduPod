import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isValidGoalStatusTransition,
  type CreateSenGoalDto,
  type CreateSenGoalProgressDto,
  type CreateSenGoalStrategyDto,
  type ListSenGoalProgressQuery,
  type ListSenGoalsQuery,
  type SenGoalStatusTransitionDto,
  type UpdateSenGoalDto,
  type UpdateSenGoalStrategyDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { SenScopeService } from './sen-scope.service';

interface PaginationResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

@Injectable()
export class SenGoalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: SenScopeService,
  ) {}

  async create(tenantId: string, planId: string, dto: CreateSenGoalDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const plan = await db.senSupportPlan.findFirst({
        where: { id: planId, tenant_id: tenantId },
        select: { id: true, status: true },
      });

      if (!plan) {
        throw this.buildSupportPlanNotFound(planId);
      }

      if (!['draft', 'active'].includes(plan.status)) {
        throw new BadRequestException({
          code: 'SUPPORT_PLAN_NOT_EDITABLE',
          message: `Goals can only be added when the support plan is in "draft" or "active" status`,
        });
      }

      const orderResult = await db.senGoal.aggregate({
        where: {
          tenant_id: tenantId,
          support_plan_id: planId,
        },
        _max: { display_order: true },
      });

      const nextDisplayOrder = (orderResult._max.display_order ?? -1) + 1;

      return db.senGoal.create({
        data: {
          tenant_id: tenantId,
          support_plan_id: planId,
          title: dto.title,
          description: dto.description ?? null,
          target: dto.target,
          baseline: dto.baseline,
          current_level: dto.current_level ?? null,
          target_date: new Date(dto.target_date),
          status: 'not_started',
          display_order: nextDisplayOrder,
        },
      });
    });
  }

  async findAllByPlan(
    tenantId: string,
    userId: string,
    permissions: string[],
    planId: string,
    query: ListSenGoalsQuery,
  ) {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      return [];
    }

    const plan = await this.prisma.senSupportPlan.findFirst({
      where: {
        id: planId,
        tenant_id: tenantId,
        ...(scope.scope === 'class' && scope.studentIds
          ? {
              sen_profile: {
                student_id: { in: scope.studentIds },
              },
            }
          : {}),
      },
      select: { id: true },
    });

    if (!plan) {
      return [];
    }

    return this.prisma.senGoal.findMany({
      where: {
        tenant_id: tenantId,
        support_plan_id: planId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
    });
  }

  async update(tenantId: string, id: string, dto: UpdateSenGoalDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const goal = await db.senGoal.findFirst({
        where: { id, tenant_id: tenantId },
        select: { id: true },
      });

      if (!goal) {
        throw this.buildGoalNotFound(id);
      }

      return db.senGoal.update({
        where: { id },
        data: {
          title: dto.title ?? undefined,
          description: dto.description !== undefined ? dto.description : undefined,
          target: dto.target ?? undefined,
          baseline: dto.baseline ?? undefined,
          current_level: dto.current_level !== undefined ? dto.current_level : undefined,
          target_date: dto.target_date !== undefined ? new Date(dto.target_date) : undefined,
          display_order: dto.display_order ?? undefined,
        },
      });
    });
  }

  async transitionStatus(
    tenantId: string,
    id: string,
    dto: SenGoalStatusTransitionDto,
    userId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const goal = await db.senGoal.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!goal) {
        throw this.buildGoalNotFound(id);
      }

      if (!isValidGoalStatusTransition(goal.status, dto.status)) {
        throw new BadRequestException({
          code: 'INVALID_SEN_GOAL_STATUS_TRANSITION',
          message: `Cannot transition SEN goal from "${goal.status}" to "${dto.status}"`,
        });
      }

      const updatedGoal = await db.senGoal.update({
        where: { id },
        data: {
          status: dto.status,
          current_level: dto.current_level !== undefined ? dto.current_level : undefined,
        },
      });

      if (['partially_achieved', 'achieved', 'discontinued'].includes(dto.status) && dto.note) {
        await db.senGoalProgress.create({
          data: {
            tenant_id: tenantId,
            goal_id: id,
            note: dto.note,
            current_level: dto.current_level ?? null,
            recorded_by_user_id: userId,
          },
        });
      }

      return updatedGoal;
    });
  }

  async recordProgress(
    tenantId: string,
    goalId: string,
    dto: CreateSenGoalProgressDto,
    userId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const goal = await db.senGoal.findFirst({
        where: { id: goalId, tenant_id: tenantId },
        select: { id: true },
      });

      if (!goal) {
        throw this.buildGoalNotFound(goalId);
      }

      const progress = await db.senGoalProgress.create({
        data: {
          tenant_id: tenantId,
          goal_id: goalId,
          note: dto.note,
          current_level: dto.current_level ?? null,
          recorded_by_user_id: userId,
        },
      });

      if (dto.current_level !== undefined) {
        await db.senGoal.update({
          where: { id: goalId },
          data: {
            current_level: dto.current_level,
          },
        });
      }

      return progress;
    });
  }

  async findProgress(
    tenantId: string,
    userId: string,
    permissions: string[],
    goalId: string,
    query: ListSenGoalProgressQuery,
  ): Promise<
    PaginationResult<
      Prisma.SenGoalProgressGetPayload<{
        include: {
          recorded_by: {
            select: {
              id: true;
              first_name: true;
              last_name: true;
            };
          };
        };
      }>
    >
  > {
    await this.assertGoalAccessible(tenantId, userId, permissions, goalId);

    const [data, total] = await Promise.all([
      this.prisma.senGoalProgress.findMany({
        where: {
          tenant_id: tenantId,
          goal_id: goalId,
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          recorded_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      }),
      this.prisma.senGoalProgress.count({
        where: {
          tenant_id: tenantId,
          goal_id: goalId,
        },
      }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  async createStrategy(tenantId: string, goalId: string, dto: CreateSenGoalStrategyDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const goal = await db.senGoal.findFirst({
        where: { id: goalId, tenant_id: tenantId },
        select: { id: true },
      });

      if (!goal) {
        throw this.buildGoalNotFound(goalId);
      }

      return db.senGoalStrategy.create({
        data: {
          tenant_id: tenantId,
          goal_id: goalId,
          description: dto.description,
          responsible_user_id: dto.responsible_user_id ?? null,
          frequency: dto.frequency ?? null,
          is_active: true,
        },
      });
    });
  }

  async findStrategies(tenantId: string, userId: string, permissions: string[], goalId: string) {
    await this.assertGoalAccessible(tenantId, userId, permissions, goalId);

    return this.prisma.senGoalStrategy.findMany({
      where: {
        tenant_id: tenantId,
        goal_id: goalId,
        is_active: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async updateStrategy(tenantId: string, id: string, dto: UpdateSenGoalStrategyDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const strategy = await db.senGoalStrategy.findFirst({
        where: { id, tenant_id: tenantId },
        select: { id: true },
      });

      if (!strategy) {
        throw this.buildStrategyNotFound(id);
      }

      return db.senGoalStrategy.update({
        where: { id },
        data: {
          description: dto.description ?? undefined,
          responsible_user_id:
            dto.responsible_user_id !== undefined ? dto.responsible_user_id : undefined,
          frequency: dto.frequency !== undefined ? dto.frequency : undefined,
          is_active: dto.is_active ?? undefined,
        },
      });
    });
  }

  async deleteStrategy(tenantId: string, id: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const strategy = await db.senGoalStrategy.findFirst({
        where: { id, tenant_id: tenantId },
        select: { id: true },
      });

      if (!strategy) {
        throw this.buildStrategyNotFound(id);
      }

      await db.senGoalStrategy.update({
        where: { id },
        data: {
          is_active: false,
        },
      });
    });
  }

  private async assertGoalAccessible(
    tenantId: string,
    userId: string,
    permissions: string[],
    goalId: string,
  ) {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      throw this.buildGoalNotFound(goalId);
    }

    const goal = await this.prisma.senGoal.findFirst({
      where: {
        id: goalId,
        tenant_id: tenantId,
        ...(scope.scope === 'class' && scope.studentIds
          ? {
              support_plan: {
                sen_profile: {
                  student_id: { in: scope.studentIds },
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });

    if (!goal) {
      throw this.buildGoalNotFound(goalId);
    }

    return goal;
  }

  private buildGoalNotFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'SEN_GOAL_NOT_FOUND',
      message: `SEN goal with id "${id}" not found`,
    });
  }

  private buildStrategyNotFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'SEN_GOAL_STRATEGY_NOT_FOUND',
      message: `SEN goal strategy with id "${id}" not found`,
    });
  }

  private buildSupportPlanNotFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'SEN_SUPPORT_PLAN_NOT_FOUND',
      message: `SEN support plan with id "${id}" not found`,
    });
  }
}
