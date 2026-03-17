import { Injectable } from '@nestjs/common';
import type { SchedulingResultJson } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchedulingDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Overview ──────────────────────────────────────────────────────────────
  // Summary stats for the scheduling dashboard tile

  async overview(tenantId: string, academicYearId: string) {
    const [
      totalClasses,
      configuredClasses,
      scheduledClasses,
      latestRun,
      activeRunCount,
    ] = await Promise.all([
      // Total active academic classes
      this.prisma.class.count({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          status: 'active',
          subject: { subject_type: 'academic' },
        },
      }),

      // Classes with scheduling requirements
      this.prisma.classSchedulingRequirement.count({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          class_entity: { status: 'active', subject: { subject_type: 'academic' } },
        },
      }),

      // Classes that have at least one auto_generated schedule entry
      this.prisma.schedule.groupBy({
        by: ['class_id'],
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          source: 'auto_generated',
          OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
        },
      }),

      // Most recent completed / applied run
      this.prisma.schedulingRun.findFirst({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          status: { in: ['completed', 'applied'] },
        },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          status: true,
          mode: true,
          entries_generated: true,
          entries_pinned: true,
          entries_unassigned: true,
          hard_constraint_violations: true,
          soft_preference_score: true,
          soft_preference_max: true,
          solver_duration_ms: true,
          created_at: true,
          applied_at: true,
        },
      }),

      // Active (queued/running) run count
      this.prisma.schedulingRun.count({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          status: { in: ['queued', 'running'] },
        },
      }),
    ]);

    const pinnedCount = await this.prisma.schedule.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        is_pinned: true,
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
      },
    });

    return {
      total_classes: totalClasses,
      configured_classes: configuredClasses,
      scheduled_classes: scheduledClasses.length,
      pinned_entries: pinnedCount,
      active_run: activeRunCount > 0,
      latest_run: latestRun
        ? {
            ...latestRun,
            soft_preference_score: latestRun.soft_preference_score !== null
              ? Number(latestRun.soft_preference_score)
              : null,
            soft_preference_max: latestRun.soft_preference_max !== null
              ? Number(latestRun.soft_preference_max)
              : null,
            created_at: latestRun.created_at.toISOString(),
            applied_at: latestRun.applied_at?.toISOString() ?? null,
          }
        : null,
    };
  }

  // ─── Workload ──────────────────────────────────────────────────────────────
  // Per-teacher period distribution

  async workload(tenantId: string, academicYearId: string) {
    // Get all schedule entries (auto_generated + manual) for workload
    const allSchedules = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        teacher_staff_id: { not: null },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
      },
      select: {
        teacher_staff_id: true,
        teacher: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    // Aggregate by teacher
    const teacherPeriodMap = new Map<
      string,
      { name: string; total_periods: number }
    >();

    for (const s of allSchedules) {
      if (!s.teacher_staff_id || !s.teacher) continue;
      const existing = teacherPeriodMap.get(s.teacher_staff_id);
      if (existing) {
        existing.total_periods++;
      } else {
        teacherPeriodMap.set(s.teacher_staff_id, {
          name: `${s.teacher.user.first_name} ${s.teacher.user.last_name}`.trim(),
          total_periods: 1,
        });
      }
    }

    // Get teacher availability (max periods per week derived from availability windows)
    const availabilities = await this.prisma.staffAvailability.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        staff_profile_id: { in: [...teacherPeriodMap.keys()] },
      },
      select: { staff_profile_id: true, weekday: true },
    });

    const teacherAvailDays = new Map<string, Set<number>>();
    for (const a of availabilities) {
      const days = teacherAvailDays.get(a.staff_profile_id) ?? new Set<number>();
      days.add(a.weekday);
      teacherAvailDays.set(a.staff_profile_id, days);
    }

    // Get period counts per academic year for max context
    const totalTeachingPeriods = await this.prisma.schedulePeriodTemplate.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        schedule_period_type: 'teaching',
      },
    });

    const result = [...teacherPeriodMap.entries()].map(([staffId, data]) => ({
      staff_id: staffId,
      name: data.name,
      total_periods: data.total_periods,
      max_periods: totalTeachingPeriods,
      utilisation_pct:
        totalTeachingPeriods > 0
          ? Math.round((data.total_periods / totalTeachingPeriods) * 100)
          : 0,
    }));

    // Sort by utilisation descending
    result.sort((a, b) => b.total_periods - a.total_periods);

    return { data: result, total_periods_per_week: totalTeachingPeriods };
  }

  // ─── Unassigned ────────────────────────────────────────────────────────────
  // Classes not yet scheduled (missing auto_generated entries)

  async unassigned(tenantId: string, academicYearId: string) {
    // Get all active academic classes with requirements
    const allConfiguredClasses = await this.prisma.classSchedulingRequirement.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        class_entity: { status: 'active', subject: { subject_type: 'academic' } },
      },
      select: {
        class_id: true,
        periods_per_week: true,
        class_entity: {
          select: {
            id: true,
            name: true,
            subject: { select: { name: true } },
            year_group: { select: { name: true } },
          },
        },
      },
    });

    // Get currently scheduled classes (with count of auto_generated effective entries)
    const scheduledGroups = await this.prisma.schedule.groupBy({
      by: ['class_id'],
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
      },
      _count: { class_id: true },
    });

    const scheduledMap = new Map<string, number>();
    for (const group of scheduledGroups) {
      scheduledMap.set(group.class_id, group._count.class_id);
    }

    // Check the most recent run's unassigned list
    const latestCompletedRun = await this.prisma.schedulingRun.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: { in: ['completed', 'applied'] },
      },
      orderBy: { created_at: 'desc' },
      select: { result_json: true },
    });

    const unassignedFromRun = new Map<string, string>();
    if (latestCompletedRun?.result_json) {
      const resultJson = latestCompletedRun.result_json as unknown as SchedulingResultJson;
      if (Array.isArray(resultJson.unassigned)) {
        for (const u of resultJson.unassigned) {
          unassignedFromRun.set(u.class_id, u.reason);
        }
      }
    }

    const unassignedClasses = allConfiguredClasses
      .filter((c) => {
        const scheduled = scheduledMap.get(c.class_id) ?? 0;
        return scheduled < c.periods_per_week;
      })
      .map((c) => ({
        class_id: c.class_id,
        class_name: c.class_entity.name,
        subject_name: c.class_entity.subject?.name ?? null,
        year_group_name: c.class_entity.year_group?.name ?? null,
        periods_required: c.periods_per_week,
        periods_scheduled: scheduledMap.get(c.class_id) ?? 0,
        periods_missing:
          c.periods_per_week - (scheduledMap.get(c.class_id) ?? 0),
        reason: unassignedFromRun.get(c.class_id) ?? null,
      }));

    return {
      data: unassignedClasses,
      count: unassignedClasses.length,
      total_classes: allConfiguredClasses.length,
    };
  }

  // ─── Helper: resolve staff profile for a user ─────────────────────────────

  async getStaffProfileId(tenantId: string, userId: string): Promise<string | null> {
    const staffProfile = await this.prisma.staffProfile.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: { id: true },
    });
    return staffProfile?.id ?? null;
  }

  // ─── Preferences ──────────────────────────────────────────────────────────
  // Staff preference satisfaction from the latest run

  async preferences(
    tenantId: string,
    academicYearId: string,
    staffProfileId?: string,
  ) {
    const latestRun = await this.prisma.schedulingRun.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: { in: ['completed', 'applied'] },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        status: true,
        soft_preference_score: true,
        soft_preference_max: true,
        result_json: true,
        created_at: true,
      },
    });

    if (!latestRun) {
      return {
        run_id: null,
        overall_satisfaction_pct: null,
        staff_satisfaction: [],
        message: 'No completed runs found for this academic year',
      };
    }

    const resultJson = latestRun.result_json as unknown as SchedulingResultJson | null;
    if (!resultJson || !Array.isArray(resultJson.entries)) {
      return {
        run_id: latestRun.id,
        overall_satisfaction_pct: null,
        staff_satisfaction: [],
        message: 'Run has no result data',
      };
    }

    // Aggregate preference satisfaction per staff member
    const staffSatisfaction = new Map<
      string,
      { satisfied: number; total: number; total_weight: number; satisfied_weight: number }
    >();

    for (const entry of resultJson.entries) {
      if (!entry.teacher_staff_id) continue;
      if (staffProfileId && entry.teacher_staff_id !== staffProfileId) continue;

      for (const pref of entry.preference_satisfaction) {
        const existing = staffSatisfaction.get(entry.teacher_staff_id) ?? {
          satisfied: 0,
          total: 0,
          total_weight: 0,
          satisfied_weight: 0,
        };

        existing.total++;
        existing.total_weight += pref.weight;
        if (pref.satisfied) {
          existing.satisfied++;
          existing.satisfied_weight += pref.weight;
        }

        staffSatisfaction.set(entry.teacher_staff_id, existing);
      }
    }

    // Load staff names
    const staffIds = [...staffSatisfaction.keys()];
    const staffProfiles =
      staffIds.length > 0
        ? await this.prisma.staffProfile.findMany({
            where: { id: { in: staffIds }, tenant_id: tenantId },
            select: {
              id: true,
              user: { select: { first_name: true, last_name: true } },
            },
          })
        : [];

    const staffNameMap = new Map(
      staffProfiles.map((sp) => [
        sp.id,
        `${sp.user.first_name} ${sp.user.last_name}`.trim(),
      ]),
    );

    const staffSatisfactionList = [...staffSatisfaction.entries()].map(
      ([staffId, stats]) => ({
        staff_id: staffId,
        name: staffNameMap.get(staffId) ?? staffId,
        preferences_total: stats.total,
        preferences_satisfied: stats.satisfied,
        satisfaction_pct:
          stats.total > 0
            ? Math.round((stats.satisfied / stats.total) * 100)
            : null,
        weighted_satisfaction_pct:
          stats.total_weight > 0
            ? Math.round((stats.satisfied_weight / stats.total_weight) * 100)
            : null,
      }),
    );

    // Sort by weighted satisfaction ascending (worst first)
    staffSatisfactionList.sort(
      (a, b) => (a.weighted_satisfaction_pct ?? 0) - (b.weighted_satisfaction_pct ?? 0),
    );

    const overallScore =
      latestRun.soft_preference_score !== null && latestRun.soft_preference_max !== null
        ? Number(latestRun.soft_preference_max) > 0
          ? Math.round(
              (Number(latestRun.soft_preference_score) /
                Number(latestRun.soft_preference_max)) *
                100,
            )
          : null
        : null;

    return {
      run_id: latestRun.id,
      run_status: latestRun.status,
      run_created_at: latestRun.created_at.toISOString(),
      overall_satisfaction_pct: overallScore,
      staff_satisfaction: staffSatisfactionList,
    };
  }
}
