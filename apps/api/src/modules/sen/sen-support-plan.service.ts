import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  isValidSupportPlanTransition,
  type CloneSupportPlanDto,
  type CreateSupportPlanDto,
  type ListSupportPlansQuery,
  type SupportPlanStatusTransitionDto,
  type UpdateSupportPlanDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { SenScopeService } from './sen-scope.service';

interface PaginationResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

type SupportPlanListItem = Prisma.SenSupportPlanGetPayload<{
  include: {
    created_by: {
      select: {
        id: true;
        first_name: true;
        last_name: true;
      };
    };
  };
}>;

type SupportPlanDetail = Prisma.SenSupportPlanGetPayload<{
  include: {
    created_by: {
      select: {
        id: true;
        first_name: true;
        last_name: true;
      };
    };
    reviewed_by: {
      select: {
        id: true;
        first_name: true;
        last_name: true;
      };
    };
    sen_profile: {
      select: {
        id: true;
        student_id: true;
      };
    };
    goals: {
      orderBy: {
        display_order: 'asc';
      };
      include: {
        strategies: {
          where: {
            is_active: true;
          };
          orderBy: {
            created_at: 'asc';
          };
          include: {
            responsible: {
              select: {
                id: true;
                first_name: true;
                last_name: true;
              };
            };
          };
        };
        progress_notes: {
          orderBy: {
            created_at: 'desc';
          };
          include: {
            recorded_by: {
              select: {
                id: true;
                first_name: true;
                last_name: true;
              };
            };
          };
        };
      };
    };
  };
}>;

@Injectable()
export class SenSupportPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly settingsService: SettingsService,
    private readonly scopeService: SenScopeService,
  ) {}

  async create(tenantId: string, profileId: string, dto: CreateSupportPlanDto, userId: string) {
    const senSettings = await this.settingsService.getModuleSettings(tenantId, 'sen');
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const profile = await db.senProfile.findFirst({
        where: { id: profileId, tenant_id: tenantId },
        select: { id: true },
      });

      if (!profile) {
        throw new NotFoundException({
          code: 'SEN_PROFILE_NOT_FOUND',
          message: `SEN profile with id "${profileId}" not found`,
        });
      }

      const planNumber = await this.sequenceService.nextNumber(
        tenantId,
        'sen_support_plan',
        tx,
        senSettings.plan_number_prefix ?? 'SSP',
      );

      return db.senSupportPlan.create({
        data: {
          tenant_id: tenantId,
          sen_profile_id: profileId,
          academic_year_id: dto.academic_year_id,
          academic_period_id: dto.academic_period_id ?? null,
          plan_number: planNumber,
          version: 1,
          status: 'draft',
          parent_input: dto.parent_input ?? null,
          student_voice: dto.student_voice ?? null,
          staff_notes: dto.staff_notes ?? null,
          created_by_user_id: userId,
        },
        include: {
          created_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      });
    });
  }

  async findAllByProfile(
    tenantId: string,
    userId: string,
    permissions: string[],
    profileId: string,
    query: ListSupportPlansQuery,
  ): Promise<PaginationResult<SupportPlanListItem>> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      return {
        data: [],
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
        },
      };
    }

    const where: Prisma.SenSupportPlanWhereInput = {
      tenant_id: tenantId,
      sen_profile_id: profileId,
    };

    if (scope.scope === 'class' && scope.studentIds) {
      where.sen_profile = {
        student_id: { in: scope.studentIds },
      };
    }

    if (query.academic_year_id) {
      where.academic_year_id = query.academic_year_id;
    }

    if (query.academic_period_id) {
      where.academic_period_id = query.academic_period_id;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.next_review_before) {
      where.next_review_date = {
        lte: new Date(query.next_review_before),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.senSupportPlan.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ version: 'desc' }, { created_at: 'desc' }],
        include: {
          created_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      }),
      this.prisma.senSupportPlan.count({ where }),
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

  async findOne(
    tenantId: string,
    userId: string,
    permissions: string[],
    id: string,
  ): Promise<SupportPlanDetail> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      throw this.buildSupportPlanNotFound(id);
    }

    const plan = await this.prisma.senSupportPlan.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        ...(scope.scope === 'class' && scope.studentIds
          ? {
              sen_profile: {
                student_id: { in: scope.studentIds },
              },
            }
          : {}),
      },
      include: {
        created_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        reviewed_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        sen_profile: {
          select: {
            id: true,
            student_id: true,
          },
        },
        goals: {
          orderBy: { display_order: 'asc' },
          include: {
            strategies: {
              where: { is_active: true },
              orderBy: { created_at: 'asc' },
              include: {
                responsible: {
                  select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
            progress_notes: {
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
            },
          },
        },
      },
    });

    if (!plan) {
      throw this.buildSupportPlanNotFound(id);
    }

    return plan;
  }

  async update(tenantId: string, id: string, dto: UpdateSupportPlanDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.senSupportPlan.findFirst({
        where: { id, tenant_id: tenantId },
        select: { id: true },
      });

      if (!existing) {
        throw this.buildSupportPlanNotFound(id);
      }

      return db.senSupportPlan.update({
        where: { id },
        data: {
          academic_period_id:
            dto.academic_period_id !== undefined ? dto.academic_period_id : undefined,
          review_date:
            dto.review_date !== undefined
              ? dto.review_date
                ? new Date(dto.review_date)
                : null
              : undefined,
          next_review_date:
            dto.next_review_date !== undefined
              ? dto.next_review_date
                ? new Date(dto.next_review_date)
                : null
              : undefined,
          review_notes: dto.review_notes !== undefined ? dto.review_notes : undefined,
          parent_input: dto.parent_input !== undefined ? dto.parent_input : undefined,
          student_voice: dto.student_voice !== undefined ? dto.student_voice : undefined,
          staff_notes: dto.staff_notes !== undefined ? dto.staff_notes : undefined,
        },
      });
    });
  }

  async transitionStatus(
    tenantId: string,
    id: string,
    dto: SupportPlanStatusTransitionDto,
    userId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const plan = await db.senSupportPlan.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!plan) {
        throw this.buildSupportPlanNotFound(id);
      }

      if (!isValidSupportPlanTransition(plan.status, dto.status)) {
        throw new BadRequestException({
          code: 'INVALID_SUPPORT_PLAN_STATUS_TRANSITION',
          message: `Cannot transition support plan from "${plan.status}" to "${dto.status}"`,
        });
      }

      const updateData: Prisma.SenSupportPlanUpdateInput = {
        status: dto.status,
      };

      if (dto.status === 'active') {
        const senSettings = await this.settingsService.getModuleSettings(tenantId, 'sen');
        updateData.next_review_date = this.addWeeks(
          new Date(),
          senSettings.default_review_cycle_weeks,
        );
        if (plan.status === 'under_review') {
          updateData.review_date = null;
          updateData.reviewed_by = { disconnect: true };
          updateData.review_notes = null;
        }
      }

      if (dto.status === 'under_review') {
        updateData.review_date = new Date();
        updateData.reviewed_by = { connect: { id: userId } };
        if (dto.review_notes) {
          updateData.review_notes = dto.review_notes;
        }
      }

      if (dto.status === 'closed') {
        updateData.reviewed_by = { connect: { id: userId } };
        if (dto.review_notes !== undefined) {
          updateData.review_notes = dto.review_notes;
        }
      }

      return db.senSupportPlan.update({
        where: { id },
        data: updateData,
      });
    });
  }

  async clone(tenantId: string, planId: string, dto: CloneSupportPlanDto, userId: string) {
    const senSettings = await this.settingsService.getModuleSettings(tenantId, 'sen');
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const sourcePlan = await db.senSupportPlan.findFirst({
        where: { id: planId, tenant_id: tenantId },
        include: {
          goals: {
            orderBy: { display_order: 'asc' },
            include: {
              strategies: {
                where: { is_active: true },
                orderBy: { created_at: 'asc' },
              },
            },
          },
        },
      });

      if (!sourcePlan) {
        throw this.buildSupportPlanNotFound(planId);
      }

      const planNumber = await this.sequenceService.nextNumber(
        tenantId,
        'sen_support_plan',
        tx,
        senSettings.plan_number_prefix ?? 'SSP',
      );

      const clonedPlan = await db.senSupportPlan.create({
        data: {
          tenant_id: tenantId,
          sen_profile_id: sourcePlan.sen_profile_id,
          academic_year_id: dto.academic_year_id,
          academic_period_id: dto.academic_period_id ?? null,
          plan_number: planNumber,
          version: sourcePlan.version + 1,
          parent_version_id: sourcePlan.id,
          status: 'draft',
          review_date: null,
          next_review_date: null,
          reviewed_by_user_id: null,
          review_notes: null,
          parent_input: sourcePlan.parent_input,
          student_voice: sourcePlan.student_voice,
          staff_notes: sourcePlan.staff_notes,
          created_by_user_id: userId,
        },
      });

      for (const goal of sourcePlan.goals) {
        const clonedGoal = await db.senGoal.create({
          data: {
            tenant_id: tenantId,
            support_plan_id: clonedPlan.id,
            title: goal.title,
            description: goal.description,
            target: goal.target,
            baseline: goal.baseline,
            current_level: null,
            target_date: goal.target_date,
            status: 'not_started',
            display_order: goal.display_order,
          },
        });

        for (const strategy of goal.strategies) {
          await db.senGoalStrategy.create({
            data: {
              tenant_id: tenantId,
              goal_id: clonedGoal.id,
              description: strategy.description,
              responsible_user_id: strategy.responsible_user_id,
              frequency: strategy.frequency,
              is_active: true,
            },
          });
        }
      }

      const detail = await db.senSupportPlan.findFirst({
        where: { id: clonedPlan.id, tenant_id: tenantId },
        include: {
          created_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
          reviewed_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
          sen_profile: {
            select: {
              id: true,
              student_id: true,
            },
          },
          goals: {
            orderBy: { display_order: 'asc' },
            include: {
              strategies: {
                where: { is_active: true },
                orderBy: { created_at: 'asc' },
                include: {
                  responsible: {
                    select: {
                      id: true,
                      first_name: true,
                      last_name: true,
                    },
                  },
                },
              },
              progress_notes: {
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
              },
            },
          },
        },
      });

      if (!detail) {
        throw this.buildSupportPlanNotFound(clonedPlan.id);
      }

      return detail;
    });
  }

  private addWeeks(date: Date, weeks: number): Date {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + weeks * 7);
    return nextDate;
  }

  private buildSupportPlanNotFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'SEN_SUPPORT_PLAN_NOT_FOUND',
      message: `SEN support plan with id "${id}" not found`,
    });
  }
}
