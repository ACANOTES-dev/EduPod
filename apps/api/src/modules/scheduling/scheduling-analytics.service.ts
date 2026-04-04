import { Injectable } from '@nestjs/common';

import type { AnalyticsQuery, HistoricalComparisonQuery } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';

export interface TeacherWorkloadEntry {
  staff_profile_id: string;
  name: string;
  periods_per_weekday: Record<number, number>;
  total_periods: number;
  cover_count: number;
}

export interface RoomUtilizationEntry {
  room_id: string;
  room_name: string;
  capacity: number | null;
  total_slots_available: number;
  slots_filled: number;
  utilization_rate: number;
}

@Injectable()
export class SchedulingAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomsReadFacade: RoomsReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly schedulingRunsReadFacade: SchedulingRunsReadFacade,
  ) {}

  // ─── Get Efficiency Dashboard ─────────────────────────────────────────────

  async getEfficiencyDashboard(tenantId: string, query: AnalyticsQuery) {
    const [schedules, teacherConfigs, rooms, periodTemplates, substitutionRecords, latestRun] =
      await Promise.all([
        this.schedulesReadFacade.findByAcademicYear(tenantId, query.academic_year_id),

        this.prisma.teacherSchedulingConfig.findMany({
          where: { tenant_id: tenantId, academic_year_id: query.academic_year_id },
          select: { staff_profile_id: true, max_periods_per_week: true },
        }),

        this.roomsReadFacade.findActiveRooms(tenantId),

        this.prisma.schedulePeriodTemplate.findMany({
          where: {
            tenant_id: tenantId,
            academic_year_id: query.academic_year_id,
            schedule_period_type: 'teaching',
          },
          select: { weekday: true, period_order: true },
          distinct: ['weekday', 'period_order'],
        }),

        this.prisma.substitutionRecord.count({
          where: { tenant_id: tenantId },
        }),

        this.schedulingRunsReadFacade.findLatestAppliedRun(tenantId, query.academic_year_id),
      ]);

    // Teacher utilization
    const teacherScheduleCounts = new Map<string, number>();
    for (const s of schedules) {
      if (s.teacher_staff_id) {
        teacherScheduleCounts.set(
          s.teacher_staff_id,
          (teacherScheduleCounts.get(s.teacher_staff_id) ?? 0) + 1,
        );
      }
    }

    const configMap = new Map(
      teacherConfigs.map((c) => [c.staff_profile_id, c.max_periods_per_week]),
    );

    let totalUtilizationPercent = 0;
    let teacherCount = 0;
    for (const [staffId, count] of teacherScheduleCounts) {
      const max = configMap.get(staffId);
      if (max) {
        totalUtilizationPercent += (count / max) * 100;
        teacherCount++;
      }
    }

    const avgTeacherUtilization =
      teacherCount > 0 ? Math.round(totalUtilizationPercent / teacherCount) : 0;

    // Room utilization
    const roomScheduleCounts = new Map<string, number>();
    for (const s of schedules) {
      if (s.room_id) {
        roomScheduleCounts.set(s.room_id, (roomScheduleCounts.get(s.room_id) ?? 0) + 1);
      }
    }

    const totalPeriodSlots = periodTemplates.length;
    const roomCount = rooms.length;
    const totalAvailableRoomSlots = roomCount * totalPeriodSlots;
    const totalFilledRoomSlots = [...roomScheduleCounts.values()].reduce((sum, c) => sum + c, 0);
    const roomUtilizationRate =
      totalAvailableRoomSlots > 0
        ? Math.round((totalFilledRoomSlots / totalAvailableRoomSlots) * 100)
        : 0;

    // Preference score
    const prefScore = latestRun?.soft_preference_score
      ? Number(latestRun.soft_preference_score)
      : null;
    const prefMax = latestRun?.soft_preference_max ? Number(latestRun.soft_preference_max) : null;
    const prefPercent =
      prefScore !== null && prefMax !== null && prefMax > 0
        ? Math.round((prefScore / prefMax) * 100)
        : null;

    return {
      academic_year_id: query.academic_year_id,
      teacher_utilization_avg_percent: avgTeacherUtilization,
      room_utilization_rate_percent: roomUtilizationRate,
      substitution_total_count: substitutionRecords,
      unassigned_slot_count: latestRun?.entries_unassigned ?? 0,
      preference_satisfaction_percent: prefPercent,
      total_active_schedules: schedules.length,
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Get Workload Heatmap ─────────────────────────────────────────────────

  async getWorkloadHeatmap(
    tenantId: string,
    query: AnalyticsQuery,
  ): Promise<{ data: TeacherWorkloadEntry[] }> {
    const teacherWorkloadEntries = await this.schedulesReadFacade.findTeacherWorkloadEntries(
      tenantId,
      query.academic_year_id,
    );
    // Wrap into shape expected by downstream code
    const schedules = teacherWorkloadEntries.map((e) => ({
      teacher_staff_id: e.teacher_staff_id,
      weekday: 0 as number, // workload heatmap doesn't need weekday from this query
      period_order: null as number | null,
      teacher: e.teacher,
    }));

    // Cover counts (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const coverRecords = await this.prisma.substitutionRecord.findMany({
      where: { tenant_id: tenantId, created_at: { gte: ninetyDaysAgo } },
      select: { substitute_staff_id: true },
    });

    const coverMap = new Map<string, number>();
    for (const r of coverRecords) {
      coverMap.set(r.substitute_staff_id, (coverMap.get(r.substitute_staff_id) ?? 0) + 1);
    }

    const teacherMap = new Map<
      string,
      { name: string; periods_per_weekday: Record<number, number>; total: number }
    >();

    for (const s of schedules) {
      if (!s.teacher_staff_id) continue;

      const existing = teacherMap.get(s.teacher_staff_id);
      const name = s.teacher
        ? `${s.teacher.user.first_name} ${s.teacher.user.last_name}`.trim()
        : s.teacher_staff_id;

      if (existing) {
        existing.periods_per_weekday[s.weekday] =
          (existing.periods_per_weekday[s.weekday] ?? 0) + 1;
        existing.total += 1;
      } else {
        teacherMap.set(s.teacher_staff_id, {
          name,
          periods_per_weekday: { [s.weekday]: 1 },
          total: 1,
        });
      }
    }

    const data: TeacherWorkloadEntry[] = [...teacherMap.entries()].map(([staffId, info]) => ({
      staff_profile_id: staffId,
      name: info.name,
      periods_per_weekday: info.periods_per_weekday,
      total_periods: info.total,
      cover_count: coverMap.get(staffId) ?? 0,
    }));

    data.sort((a, b) => b.total_periods - a.total_periods);

    return { data };
  }

  // ─── Get Room Utilization ─────────────────────────────────────────────────

  async getRoomUtilization(
    tenantId: string,
    query: AnalyticsQuery,
  ): Promise<{ data: RoomUtilizationEntry[] }> {
    const [rooms, roomSchedules, periodTemplates] = await Promise.all([
      this.roomsReadFacade.findActiveRoomBasics(tenantId),

      this.schedulesReadFacade.findByAcademicYear(tenantId, query.academic_year_id, {
        roomAssigned: true,
      }),

      this.prisma.schedulePeriodTemplate.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: query.academic_year_id,
          schedule_period_type: 'teaching',
        },
        select: { weekday: true },
        distinct: ['weekday', 'period_order'],
      }),
    ]);

    const totalSlotsPerRoom = periodTemplates.length;

    const roomScheduleCounts = new Map<string, number>();
    for (const s of roomSchedules) {
      if (s.room_id) {
        roomScheduleCounts.set(s.room_id, (roomScheduleCounts.get(s.room_id) ?? 0) + 1);
      }
    }

    const data: RoomUtilizationEntry[] = rooms.map((r) => {
      const filled = roomScheduleCounts.get(r.id) ?? 0;
      const rate = totalSlotsPerRoom > 0 ? Math.round((filled / totalSlotsPerRoom) * 100) : 0;

      return {
        room_id: r.id,
        room_name: r.name,
        capacity: r.capacity,
        total_slots_available: totalSlotsPerRoom,
        slots_filled: filled,
        utilization_rate: rate,
      };
    });

    data.sort((a, b) => b.utilization_rate - a.utilization_rate);

    return { data };
  }

  // ─── Get Historical Comparison ────────────────────────────────────────────

  async getHistoricalComparison(tenantId: string, query: HistoricalComparisonQuery) {
    const [yearA, yearB] = await Promise.all([
      this.getYearMetrics(tenantId, query.year_id_a),
      this.getYearMetrics(tenantId, query.year_id_b),
    ]);

    return {
      year_a: { academic_year_id: query.year_id_a, ...yearA },
      year_b: { academic_year_id: query.year_id_b, ...yearB },
      comparison: {
        schedule_count_delta: yearB.schedule_count - yearA.schedule_count,
        unassigned_delta: (yearB.unassigned_count ?? 0) - (yearA.unassigned_count ?? 0),
        substitution_delta: yearB.substitution_count - yearA.substitution_count,
      },
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getYearMetrics(tenantId: string, academicYearId: string) {
    const [scheduleCount, substitutionCount, latestRun] = await Promise.all([
      this.schedulesReadFacade.count(tenantId, { academic_year_id: academicYearId }),
      this.prisma.substitutionRecord.count({
        where: { tenant_id: tenantId },
      }),
      this.schedulingRunsReadFacade.findLatestAppliedRun(tenantId, academicYearId),
    ]);

    const prefScore = latestRun?.soft_preference_score
      ? Number(latestRun.soft_preference_score)
      : null;
    const prefMax = latestRun?.soft_preference_max ? Number(latestRun.soft_preference_max) : null;
    const prefPercent =
      prefScore !== null && prefMax !== null && prefMax > 0
        ? Math.round((prefScore / prefMax) * 100)
        : null;

    return {
      schedule_count: scheduleCount,
      substitution_count: substitutionCount,
      unassigned_count: latestRun?.entries_unassigned ?? null,
      preference_satisfaction_percent: prefPercent,
    };
  }
}
