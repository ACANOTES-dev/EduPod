import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  NcseReturnQuery,
  PlanComplianceQuery,
  ResourceUtilisationQuery,
  SenOverviewReportQuery,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { SenResourceService } from './sen-resource.service';
import { SenScopeService } from './sen-scope.service';

interface CountByCategory {
  category: string;
  count: number;
}

interface CountBySupportLevel {
  level: string;
  count: number;
}

interface CountByYearGroup {
  year_group_id: string;
  year_group_name: string;
  count: number;
}

interface PlanCompliancePlanSummary {
  plan_id: string;
  plan_number: string;
  sen_profile_id: string;
  next_review_date: Date | null;
  status: string;
  student: {
    id: string;
    name: string;
    year_group: {
      id: string;
      name: string;
    } | null;
  };
}

interface StaleGoalSummary {
  goal_id: string;
  title: string;
  status: string;
  last_progress_at: Date | null;
  support_plan: {
    id: string;
    plan_number: string;
    next_review_date: Date | null;
  };
  student: {
    id: string;
    name: string;
    year_group: {
      id: string;
      name: string;
    } | null;
  };
}

interface ScopeContext {
  scope: 'all' | 'class' | 'none';
  studentIds: string[];
}

interface PlanComplianceRecord {
  id: string;
  plan_number: string;
  next_review_date: Date | null;
  status: string;
  sen_profile: {
    id: string;
    student: {
      id: string;
      first_name: string;
      last_name: string;
      year_group: {
        id: string;
        name: string;
      } | null;
    };
  };
}

const planComplianceInclude = {
  sen_profile: {
    select: {
      id: true,
      student: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          year_group: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SenSupportPlanInclude;

function buildDisplayName(person: { first_name: string; last_name: string }): string {
  return `${person.first_name} ${person.last_name}`.trim();
}

function sortCounts<T extends { count: number }>(items: T[], label: (item: T) => string): T[] {
  return items.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return label(left).localeCompare(label(right));
  });
}

@Injectable()
export class SenReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: SenScopeService,
    private readonly senResourceService: SenResourceService,
  ) {}

  async getNcseReturn(tenantId: string, query: NcseReturnQuery) {
    const academicYear = query.academic_year_id
      ? await this.getAcademicYearOrThrow(tenantId, query.academic_year_id)
      : null;

    const [profiles, resourceHours, snaCount, accommodationCount] = await Promise.all([
      this.prisma.senProfile.findMany({
        where: { tenant_id: tenantId },
        select: {
          primary_category: true,
          support_level: true,
          student: {
            select: {
              gender: true,
              year_group: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.senResourceService.getUtilisation(tenantId, {
        academic_year_id: query.academic_year_id,
      }),
      this.prisma.senSnaAssignment.count({
        where: {
          tenant_id: tenantId,
          status: 'active',
        },
      }),
      this.prisma.senAccommodation.count({
        where: {
          tenant_id: tenantId,
          is_active: true,
        },
      }),
    ]);

    const byCategory = new Map<string, number>();
    const bySupportLevel = new Map<string, number>();
    const byYearGroup = new Map<string, CountByYearGroup>();
    const byGender = new Map<string, number>();

    for (const profile of profiles) {
      byCategory.set(profile.primary_category, (byCategory.get(profile.primary_category) ?? 0) + 1);
      bySupportLevel.set(
        profile.support_level,
        (bySupportLevel.get(profile.support_level) ?? 0) + 1,
      );

      const gender = profile.student?.gender?.toString() ?? 'unspecified';
      byGender.set(gender, (byGender.get(gender) ?? 0) + 1);

      const yearGroupId = profile.student?.year_group?.id ?? 'unassigned';
      const yearGroupName = profile.student?.year_group?.name ?? 'Unassigned';
      const existingYearGroup = byYearGroup.get(yearGroupId);

      if (existingYearGroup) {
        existingYearGroup.count += 1;
      } else {
        byYearGroup.set(yearGroupId, {
          year_group_id: yearGroupId,
          year_group_name: yearGroupName,
          count: 1,
        });
      }
    }

    const allocatedBySource = new Map(
      resourceHours.bySource.map((entry) => [entry.source, entry.total_allocated_hours]),
    );

    return {
      academic_year: academicYear?.name ?? 'All years',
      total_sen_students: profiles.length,
      by_category: sortCounts(
        [...byCategory.entries()].map(([category, count]) => ({ category, count })),
        (item) => item.category,
      ),
      by_support_level: sortCounts(
        [...bySupportLevel.entries()].map(([level, count]) => ({ level, count })),
        (item) => item.level,
      ),
      by_year_group: sortCounts([...byYearGroup.values()], (item) => item.year_group_name),
      by_gender: sortCounts(
        [...byGender.entries()].map(([gender, count]) => ({ gender, count })),
        (item) => item.gender,
      ),
      resource_hours: {
        seno_allocated: allocatedBySource.get('seno') ?? 0,
        school_allocated: allocatedBySource.get('school') ?? 0,
        total_assigned: resourceHours.totals.total_assigned_hours,
        total_used: resourceHours.totals.total_used_hours,
      },
      sna_count: snaCount,
      accommodation_count: accommodationCount,
    };
  }

  async getOverviewReport(
    tenantId: string,
    userId: string,
    permissions: string[],
    _query: SenOverviewReportQuery,
  ) {
    const scope = await this.getScopeContext(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      return {
        total_sen_students: 0,
        by_category: [] as CountByCategory[],
        by_support_level: [] as CountBySupportLevel[],
        by_year_group: [] as CountByYearGroup[],
      };
    }

    const profiles = await this.prisma.senProfile.findMany({
      where: {
        tenant_id: tenantId,
        ...(scope.scope === 'class'
          ? {
              student_id: { in: scope.studentIds },
            }
          : {}),
      },
      select: {
        primary_category: true,
        support_level: true,
        student: {
          select: {
            year_group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const byCategory = new Map<string, number>();
    const bySupportLevel = new Map<string, number>();
    const byYearGroup = new Map<string, CountByYearGroup>();

    for (const profile of profiles) {
      byCategory.set(profile.primary_category, (byCategory.get(profile.primary_category) ?? 0) + 1);
      bySupportLevel.set(
        profile.support_level,
        (bySupportLevel.get(profile.support_level) ?? 0) + 1,
      );

      const yearGroupId = profile.student?.year_group?.id ?? 'unassigned';
      const yearGroupName = profile.student?.year_group?.name ?? 'Unassigned';
      const existingYearGroup = byYearGroup.get(yearGroupId);

      if (existingYearGroup) {
        existingYearGroup.count += 1;
      } else {
        byYearGroup.set(yearGroupId, {
          year_group_id: yearGroupId,
          year_group_name: yearGroupName,
          count: 1,
        });
      }
    }

    return {
      total_sen_students: profiles.length,
      by_category: sortCounts(
        [...byCategory.entries()].map(([category, count]) => ({ category, count })),
        (item) => item.category,
      ),
      by_support_level: sortCounts(
        [...bySupportLevel.entries()].map(([level, count]) => ({ level, count })),
        (item) => item.level,
      ),
      by_year_group: sortCounts([...byYearGroup.values()], (item) => item.year_group_name),
    };
  }

  async getResourceUtilisation(tenantId: string, query: ResourceUtilisationQuery) {
    return this.senResourceService.getUtilisation(tenantId, query);
  }

  async getPlanCompliance(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: PlanComplianceQuery,
  ) {
    if (query.academic_year_id) {
      await this.getAcademicYearOrThrow(tenantId, query.academic_year_id);
    }

    const scope = await this.getScopeContext(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      return {
        due_within_days: query.due_within_days,
        stale_goal_weeks: query.stale_goal_weeks,
        due_for_review: [] as PlanCompliancePlanSummary[],
        overdue_plans: [] as PlanCompliancePlanSummary[],
        stale_goals: [] as StaleGoalSummary[],
      };
    }

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueDate = new Date(startOfToday);
    dueDate.setDate(dueDate.getDate() + query.due_within_days);

    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - query.stale_goal_weeks * 7);

    const planWhere = this.buildSupportPlanScopeWhere(tenantId, scope, query.academic_year_id);
    const goalWhere = this.buildGoalScopeWhere(tenantId, scope, query.academic_year_id);

    const [duePlans, overduePlans, goalCandidates] = await Promise.all([
      this.prisma.senSupportPlan.findMany({
        where: {
          ...planWhere,
          next_review_date: {
            gte: startOfToday,
            lte: dueDate,
          },
        },
        orderBy: [{ next_review_date: 'asc' }, { plan_number: 'asc' }],
        include: planComplianceInclude,
      }),
      query.overdue !== false
        ? this.prisma.senSupportPlan.findMany({
            where: {
              ...planWhere,
              status: 'active',
              next_review_date: {
                lt: startOfToday,
              },
            },
            orderBy: [{ next_review_date: 'asc' }, { plan_number: 'asc' }],
            include: planComplianceInclude,
          })
        : ([] as PlanComplianceRecord[]),
      this.prisma.senGoal.findMany({
        where: goalWhere,
        orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
        include: {
          progress_notes: {
            orderBy: {
              created_at: 'desc',
            },
            take: 1,
          },
          support_plan: {
            select: {
              id: true,
              plan_number: true,
              next_review_date: true,
              sen_profile: {
                select: {
                  student: {
                    select: {
                      id: true,
                      first_name: true,
                      last_name: true,
                      year_group: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      due_within_days: query.due_within_days,
      stale_goal_weeks: query.stale_goal_weeks,
      due_for_review: duePlans.map((plan) => this.mapPlanCompliancePlan(plan)),
      overdue_plans: overduePlans.map((plan) => this.mapPlanCompliancePlan(plan)),
      stale_goals: goalCandidates
        .filter((goal) => {
          const latestProgress = goal.progress_notes[0]?.created_at ?? null;
          return latestProgress === null || latestProgress < staleCutoff;
        })
        .map((goal) => ({
          goal_id: goal.id,
          title: goal.title,
          status: goal.status,
          last_progress_at: goal.progress_notes[0]?.created_at ?? null,
          support_plan: {
            id: goal.support_plan.id,
            plan_number: goal.support_plan.plan_number,
            next_review_date: goal.support_plan.next_review_date,
          },
          student: {
            id: goal.support_plan.sen_profile.student.id,
            name: buildDisplayName(goal.support_plan.sen_profile.student),
            year_group: goal.support_plan.sen_profile.student.year_group,
          },
        })),
    };
  }

  async getProfessionalInvolvementReport(tenantId: string) {
    const involvements = await this.prisma.senProfessionalInvolvement.findMany({
      where: {
        tenant_id: tenantId,
      },
      select: {
        professional_type: true,
        status: true,
      },
    });

    const byProfessionalType = new Map<string, number>();
    const byStatus = new Map<string, number>();
    const groupedCounts = new Map<
      string,
      { professional_type: string; status: string; count: number }
    >();

    for (const involvement of involvements) {
      byProfessionalType.set(
        involvement.professional_type,
        (byProfessionalType.get(involvement.professional_type) ?? 0) + 1,
      );
      byStatus.set(involvement.status, (byStatus.get(involvement.status) ?? 0) + 1);

      const groupedKey = `${involvement.professional_type}:${involvement.status}`;
      const existing = groupedCounts.get(groupedKey);

      if (existing) {
        existing.count += 1;
      } else {
        groupedCounts.set(groupedKey, {
          professional_type: involvement.professional_type,
          status: involvement.status,
          count: 1,
        });
      }
    }

    return {
      summary: {
        total_involvements: involvements.length,
        pending_referrals: involvements.filter((item) =>
          ['pending', 'scheduled'].includes(item.status),
        ).length,
        completed_assessments: involvements.filter((item) => item.status === 'completed').length,
        reports_received: involvements.filter((item) => item.status === 'report_received').length,
      },
      by_professional_type: sortCounts(
        [...byProfessionalType.entries()].map(([professional_type, count]) => ({
          professional_type,
          count,
        })),
        (item) => item.professional_type,
      ),
      by_status: sortCounts(
        [...byStatus.entries()].map(([status, count]) => ({ status, count })),
        (item) => item.status,
      ),
      grouped_counts: sortCounts(
        [...groupedCounts.values()],
        (item) => `${item.professional_type}:${item.status}`,
      ),
    };
  }

  private async getAcademicYearOrThrow(tenantId: string, academicYearId: string) {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: {
        id: academicYearId,
        tenant_id: tenantId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${academicYearId}" not found`,
      });
    }

    return academicYear;
  }

  private async getScopeContext(
    tenantId: string,
    userId: string,
    permissions: string[],
  ): Promise<ScopeContext> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    return {
      scope: scope.scope,
      studentIds: scope.studentIds ?? [],
    };
  }

  private buildSupportPlanScopeWhere(
    tenantId: string,
    scope: ScopeContext,
    academicYearId?: string,
  ): Prisma.SenSupportPlanWhereInput {
    return {
      tenant_id: tenantId,
      ...(academicYearId
        ? {
            academic_year_id: academicYearId,
          }
        : {}),
      ...(scope.scope === 'class'
        ? {
            sen_profile: {
              student_id: {
                in: scope.studentIds,
              },
            },
          }
        : {}),
    };
  }

  private buildGoalScopeWhere(
    tenantId: string,
    scope: ScopeContext,
    academicYearId?: string,
  ): Prisma.SenGoalWhereInput {
    return {
      tenant_id: tenantId,
      status: 'in_progress',
      support_plan: {
        tenant_id: tenantId,
        ...(academicYearId
          ? {
              academic_year_id: academicYearId,
            }
          : {}),
        ...(scope.scope === 'class'
          ? {
              sen_profile: {
                student_id: {
                  in: scope.studentIds,
                },
              },
            }
          : {}),
      },
    };
  }

  private mapPlanCompliancePlan(plan: PlanComplianceRecord): PlanCompliancePlanSummary {
    return {
      plan_id: plan.id,
      plan_number: plan.plan_number,
      sen_profile_id: plan.sen_profile.id,
      next_review_date: plan.next_review_date,
      status: plan.status,
      student: {
        id: plan.sen_profile.student.id,
        name: buildDisplayName(plan.sen_profile.student),
        year_group: plan.sen_profile.student.year_group,
      },
    };
  }
}
