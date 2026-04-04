import { Injectable } from '@nestjs/common';

import type { SchedulingResultJson } from '@school/shared';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchedulingReadFacade } from '../scheduling/scheduling-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { SchedulingRunsReadFacade } from './scheduling-runs-read.facade';

@Injectable()
export class SchedulingDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly roomsReadFacade: RoomsReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly schedulingReadFacade: SchedulingReadFacade,
    private readonly schedulingRunsReadFacade: SchedulingRunsReadFacade,
    private readonly staffAvailabilityReadFacade: StaffAvailabilityReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Overview ──────────────────────────────────────────────────────────────
  // Summary stats for the scheduling dashboard tile

  async overview(tenantId: string, academicYearId: string) {
    const [totalClasses, configuredClasses, scheduledClasses, latestRun, activeRunCount] =
      await Promise.all([
        // Total active academic classes
        this.classesReadFacade.countByAcademicYear(tenantId, academicYearId, {
          status: 'active',
          subjectType: 'academic',
        }),

        // Classes with scheduling requirements
        this.schedulingReadFacade.countClassRequirements(tenantId, academicYearId, {
          activeAcademicOnly: true,
        }),

        // Classes that have at least one auto_generated schedule entry
        this.schedulesReadFacade
          .findScheduledClassIds(tenantId, academicYearId, {
            source: 'auto_generated',
          })
          .then((ids) => ids.map((id) => ({ class_id: id }))),

        // Most recent completed / applied run
        this.schedulingRunsReadFacade.findLatestCompletedRun(tenantId, academicYearId),

        // Active (queued/running) run count
        this.schedulingRunsReadFacade.countActiveRuns(tenantId, academicYearId),
      ]);

    const _effectiveFilter = {
      OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
    };

    const [
      pinnedCount,
      totalTeachingSlots,
      totalActiveRooms,
      usedRoomSlots,
      teacherScheduleEntries,
    ] = await Promise.all([
      this.schedulesReadFacade.countPinnedEntries(tenantId, academicYearId),
      this.schedulingReadFacade.countTeachingPeriods(tenantId, academicYearId),
      this.roomsReadFacade.countActiveRooms(tenantId),
      this.schedulesReadFacade.countRoomAssignedEntries(tenantId, academicYearId),
      this.schedulesReadFacade.findTeacherScheduleEntries(tenantId, academicYearId),
    ]);

    // Room utilisation: used room-slots / total room-slots
    const totalRoomSlots = totalActiveRooms * totalTeachingSlots;
    const roomUtilisationPct =
      totalRoomSlots > 0 ? Math.round((usedRoomSlots / totalRoomSlots) * 100) : null;

    // Teacher utilisation: teacher-assigned slots / (unique teachers × teaching slots)
    const uniqueTeachers = new Set(teacherScheduleEntries.map((e) => e.teacher_staff_id));
    const totalTeacherSlots = uniqueTeachers.size * totalTeachingSlots;
    const teacherUtilisationPct =
      totalTeacherSlots > 0
        ? Math.round((teacherScheduleEntries.length / totalTeacherSlots) * 100)
        : null;

    // Avg gaps: for each teacher-day, count periods between first and last that are empty
    const avgGaps = this.computeAvgGaps(teacherScheduleEntries);

    // Preference score from latest run
    const preferenceScore =
      latestRun?.soft_preference_score != null &&
      latestRun?.soft_preference_max != null &&
      Number(latestRun.soft_preference_max) > 0
        ? Math.round(
            (Number(latestRun.soft_preference_score) / Number(latestRun.soft_preference_max)) * 100,
          )
        : null;

    return {
      total_classes: totalClasses,
      configured_classes: configuredClasses,
      scheduled_classes: scheduledClasses.length,
      pinned_entries: pinnedCount,
      active_run: activeRunCount > 0,
      room_utilisation_pct: roomUtilisationPct,
      teacher_utilisation_pct: teacherUtilisationPct,
      avg_gaps: avgGaps,
      preference_score: preferenceScore,
      latest_run: latestRun
        ? {
            ...latestRun,
            soft_preference_score:
              latestRun.soft_preference_score !== null
                ? Number(latestRun.soft_preference_score)
                : null,
            soft_preference_max:
              latestRun.soft_preference_max !== null ? Number(latestRun.soft_preference_max) : null,
            created_at: latestRun.created_at.toISOString(),
            applied_at: latestRun.applied_at?.toISOString() ?? null,
          }
        : null,
    };
  }

  private computeAvgGaps(
    entries: Array<{
      teacher_staff_id: string | null;
      weekday: number;
      period_order: number | null;
    }>,
  ): number | null {
    if (entries.length === 0) return null;

    // Group by teacher + weekday
    const groups = new Map<string, number[]>();
    for (const e of entries) {
      if (!e.teacher_staff_id || e.period_order == null) continue;
      const key = `${e.teacher_staff_id}-${e.weekday}`;
      const periods = groups.get(key) ?? [];
      periods.push(e.period_order);
      groups.set(key, periods);
    }

    if (groups.size === 0) return null;

    let totalGaps = 0;
    for (const periods of groups.values()) {
      periods.sort((a, b) => a - b);
      for (let i = 1; i < periods.length; i++) {
        const gap = periods[i]! - periods[i - 1]! - 1;
        if (gap > 0) totalGaps += gap;
      }
    }

    return Math.round((totalGaps / groups.size) * 10) / 10;
  }

  // ─── Workload ──────────────────────────────────────────────────────────────
  // Per-teacher period distribution

  async workload(tenantId: string, academicYearId: string) {
    // Get all schedule entries (auto_generated + manual) for workload
    const allSchedules = await this.schedulesReadFacade.findTeacherWorkloadEntries(
      tenantId,
      academicYearId,
    );

    // Aggregate by teacher
    const teacherPeriodMap = new Map<string, { name: string; total_periods: number }>();

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
    const availabilities = await this.staffAvailabilityReadFacade.findByStaffIds(
      tenantId,
      academicYearId,
      [...teacherPeriodMap.keys()],
    );

    const teacherAvailDays = new Map<string, Set<number>>();
    for (const a of availabilities) {
      const days = teacherAvailDays.get(a.staff_profile_id) ?? new Set<number>();
      days.add(a.weekday);
      teacherAvailDays.set(a.staff_profile_id, days);
    }

    // Get period counts per academic year for max context
    const totalTeachingPeriods = await this.schedulingReadFacade.countTeachingPeriods(
      tenantId,
      academicYearId,
    );

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
    const allConfiguredClasses = await this.schedulingReadFacade.findClassRequirementsWithDetails(
      tenantId,
      academicYearId,
      { activeAcademicOnly: true },
    );

    // Get currently scheduled classes (with count of auto_generated effective entries)
    const scheduledMap = await this.schedulesReadFacade.countEntriesPerClass(
      tenantId,
      academicYearId,
    );

    // Check the most recent run's unassigned list
    const latestCompletedRun = await this.schedulingRunsReadFacade.findLatestRunWithResult(
      tenantId,
      academicYearId,
    );

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
        periods_missing: c.periods_per_week - (scheduledMap.get(c.class_id) ?? 0),
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
    const staffProfile = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    return staffProfile?.id ?? null;
  }

  // ─── Preferences ──────────────────────────────────────────────────────────
  // Staff preference satisfaction from the latest run

  async preferences(tenantId: string, academicYearId: string, staffProfileId?: string) {
    const latestRun = await this.schedulingRunsReadFacade.findLatestRunWithResult(
      tenantId,
      academicYearId,
    );

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
      staffIds.length > 0 ? await this.staffProfileReadFacade.findByIds(tenantId, staffIds) : [];

    const staffNameMap = new Map(
      staffProfiles.map((sp) => [sp.id, `${sp.user.first_name} ${sp.user.last_name}`.trim()]),
    );

    const staffSatisfactionList = [...staffSatisfaction.entries()].map(([staffId, stats]) => ({
      staff_id: staffId,
      name: staffNameMap.get(staffId) ?? staffId,
      preferences_total: stats.total,
      preferences_satisfied: stats.satisfied,
      satisfaction_pct: stats.total > 0 ? Math.round((stats.satisfied / stats.total) * 100) : null,
      weighted_satisfaction_pct:
        stats.total_weight > 0
          ? Math.round((stats.satisfied_weight / stats.total_weight) * 100)
          : null,
    }));

    // Sort by weighted satisfaction ascending (worst first)
    staffSatisfactionList.sort(
      (a, b) => (a.weighted_satisfaction_pct ?? 0) - (b.weighted_satisfaction_pct ?? 0),
    );

    const overallScore =
      latestRun.soft_preference_score !== null && latestRun.soft_preference_max !== null
        ? Number(latestRun.soft_preference_max) > 0
          ? Math.round(
              (Number(latestRun.soft_preference_score) / Number(latestRun.soft_preference_max)) *
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

  // ─── Room Utilisation ─────────────────────────────────────────────────────
  // Per-room utilisation data for the academic year

  async roomUtilisation(tenantId: string, academicYearId: string) {
    const _effectiveFilter = {
      OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
    };

    const [rooms, totalTeachingSlots, roomSchedules] = await Promise.all([
      this.roomsReadFacade.findActiveRooms(tenantId),
      this.schedulingReadFacade.countTeachingPeriods(tenantId, academicYearId),
      this.schedulesReadFacade.findRoomScheduleEntries(tenantId, academicYearId),
    ]);

    // Count usage per room and find peak period
    const roomUsage = new Map<string, { count: number; periodCounts: Map<string, number> }>();
    for (const s of roomSchedules) {
      if (!s.room_id) continue;
      const existing = roomUsage.get(s.room_id) ?? {
        count: 0,
        periodCounts: new Map<string, number>(),
      };
      existing.count++;
      const periodLabel = s.schedule_period_template?.period_name ?? `P${s.period_order ?? 0}`;
      existing.periodCounts.set(periodLabel, (existing.periodCounts.get(periodLabel) ?? 0) + 1);
      roomUsage.set(s.room_id, existing);
    }

    const data = rooms.map((room) => {
      const usage = roomUsage.get(room.id);
      const count = usage?.count ?? 0;
      const utilisationPct =
        totalTeachingSlots > 0 ? Math.round((count / totalTeachingSlots) * 100) : 0;

      let peakPeriod: string | null = null;
      if (usage?.periodCounts.size) {
        let maxCount = 0;
        for (const [label, c] of usage.periodCounts) {
          if (c > maxCount) {
            maxCount = c;
            peakPeriod = label;
          }
        }
      }

      return {
        room_id: room.id,
        room_name: room.name,
        room_type: room.room_type,
        capacity: room.capacity ?? 0,
        utilisation_pct: utilisationPct,
        peak_period: peakPeriod,
      };
    });

    // Sort by utilisation descending
    data.sort((a, b) => b.utilisation_pct - a.utilisation_pct);

    return { data };
  }

  // ─── Trends ──────────────────────────────────────────────────────────────
  // Historical metrics from past scheduling runs

  async trends(tenantId: string, academicYearId: string) {
    const runs = await this.schedulingRunsReadFacade.findHistoricalRuns(tenantId, academicYearId);

    const totalTeachingSlots = await this.schedulingReadFacade.countTeachingPeriods(
      tenantId,
      academicYearId,
    );
    const totalActiveRooms = await this.roomsReadFacade.countActiveRooms(tenantId);

    const data = runs.map((run) => {
      const resultJson = run.result_json as unknown as SchedulingResultJson | null;
      const entries = resultJson?.entries ?? [];

      // Room utilisation from run entries
      const totalRoomSlots = totalActiveRooms * totalTeachingSlots;
      const roomEntries = entries.filter((e) => e.room_id).length;
      const roomUtil = totalRoomSlots > 0 ? Math.round((roomEntries / totalRoomSlots) * 100) : 0;

      // Teacher utilisation from run entries
      const uniqueTeachers = new Set(
        entries.filter((e) => e.teacher_staff_id).map((e) => e.teacher_staff_id),
      );
      const teacherEntries = entries.filter((e) => e.teacher_staff_id).length;
      const totalTeacherSlots = uniqueTeachers.size * totalTeachingSlots;
      const teacherUtil =
        totalTeacherSlots > 0 ? Math.round((teacherEntries / totalTeacherSlots) * 100) : 0;

      // Avg gaps from run entries
      const gapEntries = entries
        .filter((e) => e.teacher_staff_id)
        .map((e) => ({
          teacher_staff_id: e.teacher_staff_id,
          weekday: e.weekday,
          period_order: e.period_order,
        }));
      const avgGaps = this.computeAvgGaps(gapEntries) ?? 0;

      // Preference score
      const prefScore =
        run.soft_preference_score != null &&
        run.soft_preference_max != null &&
        Number(run.soft_preference_max) > 0
          ? Math.round((Number(run.soft_preference_score) / Number(run.soft_preference_max)) * 100)
          : 0;

      return {
        label: run.created_at.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
        }),
        room_utilisation: roomUtil,
        teacher_utilisation: teacherUtil,
        avg_gaps: avgGaps,
        preference_score: prefScore,
      };
    });

    return { data };
  }
}
