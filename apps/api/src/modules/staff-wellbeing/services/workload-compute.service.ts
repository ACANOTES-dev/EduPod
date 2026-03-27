import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Return Types ────────────────────────────────────────────────────────────

export interface PersonalWorkloadSummary {
  teaching_periods_per_week: number;
  cover_duties_this_term: number;
  school_average_covers: number;
  timetable_quality_score: number;
  timetable_quality_label: 'Good' | 'Moderate' | 'Needs attention';
  trend: {
    previous_term_periods: number | null;
    previous_term_covers: number | null;
  } | null;
  status: 'normal' | 'elevated' | 'high';
}

export interface CoverHistoryItem {
  date: string;
  period: string;
  subject: string | null;
  original_teacher: 'Colleague';
}

export interface PersonalTimetableQuality {
  free_period_distribution: { weekday: number; free_count: number }[];
  consecutive_periods: { max: number; average: number };
  split_days_count: number;
  room_changes: { average: number; max: number };
  school_averages: {
    consecutive_max: number;
    free_distribution_score: number;
    split_days_pct: number;
    room_changes_avg: number;
  };
  composite_score: number;
  composite_label: 'Good' | 'Moderate' | 'Needs attention';
}

export interface AggregateWorkloadSummary {
  average_teaching_periods: number;
  range: { min: number; max: number; p25: number; p50: number; p75: number };
  over_allocated_periods_count: number;
  average_cover_duties: number;
  over_allocated_covers_count: number;
  trend: {
    previous_average_periods: number | null;
    previous_average_covers: number | null;
  } | null;
}

export interface CoverFairnessResult {
  distribution: { cover_count: number; staff_count: number }[];
  gini_coefficient: number;
  range: { min: number; max: number; median: number };
  assessment:
    | 'Well distributed'
    | 'Moderate concentration'
    | 'Significant concentration \u2014 review recommended';
}

export interface AggregateTimetableQuality {
  consecutive_periods: {
    mean: number;
    median: number;
    range: { min: number; max: number };
  };
  free_period_clumping: {
    mean: number;
    median: number;
    range: { min: number; max: number };
  };
  split_timetable_pct: number;
  room_changes: {
    mean: number;
    median: number;
    range: { min: number; max: number };
  };
  trend: {
    previous_consecutive_mean: number | null;
    previous_free_clumping_mean: number | null;
    previous_split_pct: number | null;
    previous_room_changes_mean: number | null;
  } | null;
}

export interface AbsenceTrends {
  monthly_rates: { month: string; rate: number }[];
  day_of_week_pattern: { weekday: number; rate: number }[];
  term_comparison: { current: number; previous: number | null } | null;
  seasonal_pattern: { month: number; average_rate: number }[] | null;
}

export interface SubstitutionPressure {
  absence_rate: number;
  cover_difficulty: number;
  unfilled_rate: number;
  composite_score: number;
  trend: { month: string; score: number }[];
  assessment: 'Low' | 'Moderate' | 'High' | 'Critical';
}

export type CorrelationResult =
  | {
      status: 'accumulating';
      dataPoints: number;
      requiredDataPoints: 12;
      projectedAvailableDate: string;
      message: string;
    }
  | {
      status: 'available';
      dataPoints: number;
      series: {
        month: string;
        coverPressure: number;
        absenceRate: number;
      }[];
      trendDescription: string;
      disclaimer: string;
    };

export interface AllAggregateMetrics {
  workloadSummary: AggregateWorkloadSummary;
  coverFairness: CoverFairnessResult;
  timetableQuality: AggregateTimetableQuality;
  absenceTrends: AbsenceTrends;
  substitutionPressure: SubstitutionPressure;
  correlation: CorrelationResult;
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface ScheduleRow {
  id: string;
  weekday: number;
  period_order: number | null;
  room_id: string | null;
  schedule_period_template: {
    schedule_period_type: string;
    period_name: string;
    period_order: number;
  } | null;
  class_entity: { name: string } | null;
}

interface AcademicPeriodRow {
  id: string;
  start_date: Date;
  end_date: Date;
}

interface WellbeingSettings {
  workload_high_threshold_periods: number;
  workload_high_threshold_covers: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD_PERIODS = 22;
const DEFAULT_THRESHOLD_COVERS = 8;
const CORRELATION_DISCLAIMER =
  'This shows patterns that occurred together. It does not prove that one caused the other. Use this as a starting point for investigation, not a conclusion.';

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class WorkloadComputeService {
  private readonly logger = new Logger(WorkloadComputeService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Personal (D2)
  // ═══════════════════════════════════════════════════════════════════════════

  async getPersonalWorkloadSummary(
    tenantId: string,
    staffProfileId: string,
  ): Promise<PersonalWorkloadSummary> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<PersonalWorkloadSummary> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyPersonalSummary();
      }

      const currentPeriod = await this.getCurrentPeriod(
        db,
        tenantId,
        academicYear.id,
      );
      const previousPeriod = currentPeriod
        ? await this.getPreviousPeriod(db, tenantId, academicYear.id, currentPeriod)
        : null;

      // Teaching periods per week
      const teachingSchedules = await db.schedule.findMany({
        where: {
          tenant_id: tenantId,
          teacher_staff_id: staffProfileId,
          academic_year_id: academicYear.id,
          schedule_period_template: {
            schedule_period_type: 'teaching',
          },
        },
        select: { id: true },
      });
      const teachingPeriodsPerWeek = teachingSchedules.length;

      // Cover duties this term
      const coverDutiesThisTerm = currentPeriod
        ? await this.countCoversInRange(
            db,
            tenantId,
            staffProfileId,
            currentPeriod.start_date,
            currentPeriod.end_date,
          )
        : 0;

      // School average covers
      const schoolAverageCovers = currentPeriod
        ? await this.computeSchoolAverageCovers(
            db,
            tenantId,
            currentPeriod.start_date,
            currentPeriod.end_date,
          )
        : 0;

      // Timetable quality
      const allSchedules = await this.getTeacherSchedules(
        db,
        tenantId,
        staffProfileId,
        academicYear.id,
      );
      const compositeScore =
        WorkloadComputeService.computeTimetableCompositeScore(allSchedules);
      const compositeLabel =
        WorkloadComputeService.qualityLabel(compositeScore);

      // Trend (previous term)
      let trend: PersonalWorkloadSummary['trend'] = null;
      if (previousPeriod) {
        const previousCovers = await this.countCoversInRange(
          db,
          tenantId,
          staffProfileId,
          previousPeriod.start_date,
          previousPeriod.end_date,
        );
        trend = {
          previous_term_periods: teachingPeriodsPerWeek,
          previous_term_covers: previousCovers,
        };
      }

      // Status from thresholds
      const thresholds = await this.getWellbeingThresholds(db, tenantId);
      const status = this.computeStatus(
        teachingPeriodsPerWeek,
        coverDutiesThisTerm,
        thresholds,
      );

      return {
        teaching_periods_per_week: teachingPeriodsPerWeek,
        cover_duties_this_term: coverDutiesThisTerm,
        school_average_covers: WorkloadComputeService.round2(schoolAverageCovers),
        timetable_quality_score: compositeScore,
        timetable_quality_label: compositeLabel,
        trend,
        status,
      };
    }) as Promise<PersonalWorkloadSummary>;
  }

  async getPersonalCoverHistory(
    tenantId: string,
    staffProfileId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    data: CoverHistoryItem[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<{ data: CoverHistoryItem[]; meta: { page: number; pageSize: number; total: number } }> => {
      const db = tx as unknown as PrismaService;

      const coverStatuses: ('assigned' | 'confirmed' | 'completed')[] = [
        'assigned',
        'confirmed',
        'completed',
      ];

      const [records, total] = await Promise.all([
        db.substitutionRecord.findMany({
          where: {
            tenant_id: tenantId,
            substitute_staff_id: staffProfileId,
            status: { in: coverStatuses },
          },
          orderBy: { created_at: 'desc' as const },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            created_at: true,
            schedule: {
              select: {
                period_order: true,
                class_entity: { select: { name: true } },
                schedule_period_template: {
                  select: { period_name: true, period_order: true },
                },
              },
            },
          },
        }),
        db.substitutionRecord.count({
          where: {
            tenant_id: tenantId,
            substitute_staff_id: staffProfileId,
            status: { in: coverStatuses },
          },
        }),
      ]);

      const data: CoverHistoryItem[] = records.map((r) => ({
        date: r.created_at.toISOString().slice(0, 10),
        period:
          r.schedule.schedule_period_template?.period_name ??
          `Period ${r.schedule.period_order ?? 0}`,
        subject: r.schedule.class_entity?.name ?? null,
        original_teacher: 'Colleague' as const,
      }));

      return { data, meta: { page, pageSize, total } };
    }) as Promise<{ data: CoverHistoryItem[]; meta: { page: number; pageSize: number; total: number } }>;
  }

  async getPersonalTimetableQuality(
    tenantId: string,
    staffProfileId: string,
  ): Promise<PersonalTimetableQuality> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<PersonalTimetableQuality> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyTimetableQuality();
      }

      const schedules = await this.getTeacherSchedules(
        db,
        tenantId,
        staffProfileId,
        academicYear.id,
      );

      const allTemplates = await db.schedulePeriodTemplate.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYear.id,
          schedule_period_type: 'teaching',
        },
        select: { weekday: true, period_order: true },
      });

      // Free period distribution per weekday
      const freeDistribution =
        WorkloadComputeService.computeFreeDistribution(schedules, allTemplates);

      // Consecutive periods
      const consecutive =
        WorkloadComputeService.computeConsecutivePeriods(schedules);

      // Split days
      const splitDaysCount =
        WorkloadComputeService.computeSplitDays(schedules, allTemplates);

      // Room changes
      const roomChanges =
        WorkloadComputeService.computeRoomChanges(schedules);

      // School averages — compute for all teachers
      const allStaff = await db.staffProfile.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      });

      const schoolConsecutiveMaxes: number[] = [];
      const schoolFreeScores: number[] = [];
      const schoolSplitCounts: number[] = [];
      const schoolRoomAvgs: number[] = [];

      for (const staff of allStaff) {
        const staffSchedules = await this.getTeacherSchedules(
          db,
          tenantId,
          staff.id,
          academicYear.id,
        );
        if (staffSchedules.length === 0) continue;

        const sc = WorkloadComputeService.computeConsecutivePeriods(staffSchedules);
        schoolConsecutiveMaxes.push(sc.max);

        const sf = WorkloadComputeService.computeFreeDistribution(
          staffSchedules,
          allTemplates,
        );
        schoolFreeScores.push(
          WorkloadComputeService.scoreFreeDistribution(sf),
        );

        schoolSplitCounts.push(
          WorkloadComputeService.computeSplitDays(staffSchedules, allTemplates),
        );

        const sr = WorkloadComputeService.computeRoomChanges(staffSchedules);
        schoolRoomAvgs.push(sr.average);
      }

      const compositeScore =
        WorkloadComputeService.computeTimetableCompositeScore(schedules);

      return {
        free_period_distribution: freeDistribution,
        consecutive_periods: consecutive,
        split_days_count: splitDaysCount,
        room_changes: roomChanges,
        school_averages: {
          consecutive_max: WorkloadComputeService.round2(
            WorkloadComputeService.mean(schoolConsecutiveMaxes),
          ),
          free_distribution_score: WorkloadComputeService.round2(
            WorkloadComputeService.mean(schoolFreeScores),
          ),
          split_days_pct: WorkloadComputeService.round2(
            allStaff.length > 0
              ? (schoolSplitCounts.filter((c) => c > 0).length /
                  allStaff.length) *
                  100
              : 0,
          ),
          room_changes_avg: WorkloadComputeService.round2(
            WorkloadComputeService.mean(schoolRoomAvgs),
          ),
        },
        composite_score: compositeScore,
        composite_label: WorkloadComputeService.qualityLabel(compositeScore),
      };
    }) as Promise<PersonalTimetableQuality>;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Aggregate (D3)
  // ═══════════════════════════════════════════════════════════════════════════

  async getAggregateWorkloadSummary(
    tenantId: string,
  ): Promise<AggregateWorkloadSummary> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<AggregateWorkloadSummary> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyAggregateWorkload();
      }

      const currentPeriod = await this.getCurrentPeriod(
        db,
        tenantId,
        academicYear.id,
      );
      const previousPeriod = currentPeriod
        ? await this.getPreviousPeriod(db, tenantId, academicYear.id, currentPeriod)
        : null;

      const allStaff = await db.staffProfile.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      });

      const thresholds = await this.getWellbeingThresholds(db, tenantId);

      const teachingCounts: number[] = [];
      const coverCounts: number[] = [];
      let overAllocatedPeriods = 0;
      let overAllocatedCovers = 0;

      for (const staff of allStaff) {
        const scheduleCount = await db.schedule.count({
          where: {
            tenant_id: tenantId,
            teacher_staff_id: staff.id,
            academic_year_id: academicYear.id,
            schedule_period_template: {
              schedule_period_type: 'teaching',
            },
          },
        });
        teachingCounts.push(scheduleCount);

        if (scheduleCount > thresholds.workload_high_threshold_periods) {
          overAllocatedPeriods++;
        }

        if (currentPeriod) {
          const covers = await this.countCoversInRange(
            db,
            tenantId,
            staff.id,
            currentPeriod.start_date,
            currentPeriod.end_date,
          );
          coverCounts.push(covers);
          if (covers > thresholds.workload_high_threshold_covers) {
            overAllocatedCovers++;
          }
        } else {
          coverCounts.push(0);
        }
      }

      const sorted = [...teachingCounts].sort((a, b) => a - b);

      // Previous term averages
      let trend: AggregateWorkloadSummary['trend'] = null;
      if (previousPeriod && allStaff.length > 0) {
        let prevCoverTotal = 0;
        for (const staff of allStaff) {
          prevCoverTotal += await this.countCoversInRange(
            db,
            tenantId,
            staff.id,
            previousPeriod.start_date,
            previousPeriod.end_date,
          );
        }
        trend = {
          previous_average_periods: WorkloadComputeService.round2(
            WorkloadComputeService.mean(teachingCounts),
          ),
          previous_average_covers: WorkloadComputeService.round2(
            prevCoverTotal / allStaff.length,
          ),
        };
      }

      return {
        average_teaching_periods: WorkloadComputeService.round2(
          WorkloadComputeService.mean(teachingCounts),
        ),
        range: WorkloadComputeService.percentileRange(sorted),
        over_allocated_periods_count: overAllocatedPeriods,
        average_cover_duties: WorkloadComputeService.round2(
          WorkloadComputeService.mean(coverCounts),
        ),
        over_allocated_covers_count: overAllocatedCovers,
        trend,
      };
    }) as Promise<AggregateWorkloadSummary>;
  }

  async getCoverFairness(tenantId: string): Promise<CoverFairnessResult> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<CoverFairnessResult> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyCoverFairness();
      }

      const currentPeriod = await this.getCurrentPeriod(
        db,
        tenantId,
        academicYear.id,
      );
      if (!currentPeriod) {
        return this.emptyCoverFairness();
      }

      const allStaff = await db.staffProfile.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      });

      const coverCounts: number[] = [];
      for (const staff of allStaff) {
        const count = await this.countCoversInRange(
          db,
          tenantId,
          staff.id,
          currentPeriod.start_date,
          currentPeriod.end_date,
        );
        coverCounts.push(count);
      }

      const gini = WorkloadComputeService.computeGiniCoefficient(coverCounts);
      const sorted = [...coverCounts].sort((a, b) => a - b);

      // Distribution histogram
      const countMap = new Map<number, number>();
      for (const c of coverCounts) {
        countMap.set(c, (countMap.get(c) ?? 0) + 1);
      }
      const distribution = Array.from(countMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([cover_count, staff_count]) => ({ cover_count, staff_count }));

      return {
        distribution,
        gini_coefficient: WorkloadComputeService.round2(gini),
        range: {
          min: sorted[0] ?? 0,
          max: sorted[sorted.length - 1] ?? 0,
          median: WorkloadComputeService.median(sorted),
        },
        assessment: WorkloadComputeService.giniAssessment(gini),
      };
    }) as Promise<CoverFairnessResult>;
  }

  async getAggregateTimetableQuality(
    tenantId: string,
  ): Promise<AggregateTimetableQuality> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<AggregateTimetableQuality> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyAggregateTimetableQuality();
      }

      const allTemplates = await db.schedulePeriodTemplate.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYear.id,
          schedule_period_type: 'teaching',
        },
        select: { weekday: true, period_order: true },
      });

      const allStaff = await db.staffProfile.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      });

      const consecutiveMaxes: number[] = [];
      const freeClumpingScores: number[] = [];
      const roomAvgs: number[] = [];
      let splitCount = 0;
      let staffWithSchedules = 0;

      for (const staff of allStaff) {
        const schedules = await this.getTeacherSchedules(
          db,
          tenantId,
          staff.id,
          academicYear.id,
        );
        if (schedules.length === 0) continue;
        staffWithSchedules++;

        const cons = WorkloadComputeService.computeConsecutivePeriods(schedules);
        consecutiveMaxes.push(cons.max);

        const freeDist = WorkloadComputeService.computeFreeDistribution(
          schedules,
          allTemplates,
        );
        freeClumpingScores.push(
          WorkloadComputeService.scoreFreeDistribution(freeDist),
        );

        const splits = WorkloadComputeService.computeSplitDays(
          schedules,
          allTemplates,
        );
        if (splits > 0) splitCount++;

        const rc = WorkloadComputeService.computeRoomChanges(schedules);
        roomAvgs.push(rc.average);
      }

      const sortedConsec = [...consecutiveMaxes].sort((a, b) => a - b);
      const sortedFree = [...freeClumpingScores].sort((a, b) => a - b);
      const sortedRoom = [...roomAvgs].sort((a, b) => a - b);

      return {
        consecutive_periods: {
          mean: WorkloadComputeService.round2(
            WorkloadComputeService.mean(consecutiveMaxes),
          ),
          median: WorkloadComputeService.median(sortedConsec),
          range: {
            min: sortedConsec[0] ?? 0,
            max: sortedConsec[sortedConsec.length - 1] ?? 0,
          },
        },
        free_period_clumping: {
          mean: WorkloadComputeService.round2(
            WorkloadComputeService.mean(freeClumpingScores),
          ),
          median: WorkloadComputeService.median(sortedFree),
          range: {
            min: sortedFree[0] ?? 0,
            max: sortedFree[sortedFree.length - 1] ?? 0,
          },
        },
        split_timetable_pct: WorkloadComputeService.round2(
          staffWithSchedules > 0
            ? (splitCount / staffWithSchedules) * 100
            : 0,
        ),
        room_changes: {
          mean: WorkloadComputeService.round2(
            WorkloadComputeService.mean(roomAvgs),
          ),
          median: WorkloadComputeService.median(sortedRoom),
          range: {
            min: sortedRoom[0] ?? 0,
            max: sortedRoom[sortedRoom.length - 1] ?? 0,
          },
        },
        trend: null,
      };
    }) as Promise<AggregateTimetableQuality>;
  }

  async getAbsenceTrends(tenantId: string): Promise<AbsenceTrends> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<AbsenceTrends> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyAbsenceTrends();
      }

      const currentPeriod = await this.getCurrentPeriod(
        db,
        tenantId,
        academicYear.id,
      );

      const staffCount = await db.staffProfile.count({
        where: { tenant_id: tenantId },
      });

      if (staffCount === 0) {
        return this.emptyAbsenceTrends();
      }

      // All absences in the academic year
      const absences = await db.teacherAbsence.findMany({
        where: {
          tenant_id: tenantId,
          absence_date: {
            gte: academicYear.start_date,
            lte: academicYear.end_date,
          },
        },
        select: { absence_date: true },
      });

      // Monthly rates
      const monthlyMap = new Map<string, number>();
      for (const a of absences) {
        const d = a.absence_date;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
      }
      const monthlyRates = Array.from(monthlyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, count]) => ({
          month,
          rate: WorkloadComputeService.round2(count / staffCount),
        }));

      // Day-of-week pattern
      const dayMap = new Map<number, number>();
      for (const a of absences) {
        const wd = a.absence_date.getDay();
        dayMap.set(wd, (dayMap.get(wd) ?? 0) + 1);
      }
      const dayOfWeekPattern = Array.from(dayMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([weekday, count]) => ({
          weekday,
          rate: WorkloadComputeService.round2(count / staffCount),
        }));

      // Term comparison
      let termComparison: AbsenceTrends['term_comparison'] = null;
      if (currentPeriod) {
        const currentAbsences = await db.teacherAbsence.count({
          where: {
            tenant_id: tenantId,
            absence_date: {
              gte: currentPeriod.start_date,
              lte: currentPeriod.end_date,
            },
          },
        });
        const currentRate = WorkloadComputeService.round2(
          currentAbsences / staffCount,
        );

        const previousPeriod = await this.getPreviousPeriod(
          db,
          tenantId,
          academicYear.id,
          currentPeriod,
        );
        let previousRate: number | null = null;
        if (previousPeriod) {
          const prevAbsences = await db.teacherAbsence.count({
            where: {
              tenant_id: tenantId,
              absence_date: {
                gte: previousPeriod.start_date,
                lte: previousPeriod.end_date,
              },
            },
          });
          previousRate = WorkloadComputeService.round2(
            prevAbsences / staffCount,
          );
        }

        termComparison = { current: currentRate, previous: previousRate };
      }

      // Seasonal pattern — only if >= 12 months of data
      const seasonalPattern: AbsenceTrends['seasonal_pattern'] =
        monthlyRates.length >= 12
          ? this.computeSeasonalPattern(absences, staffCount)
          : null;

      return {
        monthly_rates: monthlyRates,
        day_of_week_pattern: dayOfWeekPattern,
        term_comparison: termComparison,
        seasonal_pattern: seasonalPattern,
      };
    }) as Promise<AbsenceTrends>;
  }

  async getSubstitutionPressure(
    tenantId: string,
  ): Promise<SubstitutionPressure> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<SubstitutionPressure> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptySubstitutionPressure();
      }

      const currentPeriod = await this.getCurrentPeriod(
        db,
        tenantId,
        academicYear.id,
      );

      const staffCount = await db.staffProfile.count({
        where: { tenant_id: tenantId },
      });

      if (staffCount === 0 || !currentPeriod) {
        return this.emptySubstitutionPressure();
      }

      // Days in current period
      const periodDays = WorkloadComputeService.schoolDaysBetween(
        currentPeriod.start_date,
        currentPeriod.end_date,
      );

      // Absences in current period
      const totalAbsences = await db.teacherAbsence.count({
        where: {
          tenant_id: tenantId,
          absence_date: {
            gte: currentPeriod.start_date,
            lte: currentPeriod.end_date,
          },
        },
      });

      // Substitution records in current period
      const totalSubs = await db.substitutionRecord.count({
        where: {
          tenant_id: tenantId,
          created_at: {
            gte: currentPeriod.start_date,
            lte: currentPeriod.end_date,
          },
          status: { in: ['assigned', 'confirmed', 'completed'] },
        },
      });

      const absenceRate =
        periodDays > 0 && staffCount > 0
          ? totalAbsences / staffCount / periodDays
          : 0;

      const coverDifficulty =
        totalAbsences > 0 ? totalSubs / totalAbsences : 0;

      const unfilled =
        totalAbsences > 0
          ? Math.max(0, totalAbsences - totalSubs) / totalAbsences
          : 0;

      const compositeScore =
        absenceRate * 0.4 + (1 - coverDifficulty) * 0.3 + unfilled * 0.3;

      // Monthly trend from academic year
      const allAbsences = await db.teacherAbsence.findMany({
        where: {
          tenant_id: tenantId,
          absence_date: {
            gte: academicYear.start_date,
            lte: academicYear.end_date,
          },
        },
        select: { absence_date: true },
      });

      const allSubs = await db.substitutionRecord.findMany({
        where: {
          tenant_id: tenantId,
          created_at: {
            gte: academicYear.start_date,
            lte: academicYear.end_date,
          },
          status: { in: ['assigned', 'confirmed', 'completed'] },
        },
        select: { created_at: true },
      });

      const trend = this.computeMonthlyPressureTrend(
        allAbsences,
        allSubs,
        staffCount,
      );

      return {
        absence_rate: WorkloadComputeService.round2(absenceRate),
        cover_difficulty: WorkloadComputeService.round2(coverDifficulty),
        unfilled_rate: WorkloadComputeService.round2(unfilled),
        composite_score: WorkloadComputeService.round2(compositeScore),
        trend,
        assessment: WorkloadComputeService.pressureAssessment(compositeScore),
      };
    }) as Promise<SubstitutionPressure>;
  }

  async getCorrelation(tenantId: string): Promise<CorrelationResult> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<CorrelationResult> => {
      const db = tx as unknown as PrismaService;

      // Get earliest absence to determine data availability
      const earliest = await db.teacherAbsence.findFirst({
        where: { tenant_id: tenantId },
        orderBy: { absence_date: 'asc' },
        select: { absence_date: true },
      });

      if (!earliest) {
        return {
          status: 'accumulating' as const,
          dataPoints: 0,
          requiredDataPoints: 12 as const,
          projectedAvailableDate: WorkloadComputeService.addMonths(
            new Date(),
            12,
          ),
          message:
            'No absence data yet. Correlation analysis requires at least 12 months of data.',
        };
      }

      const staffCount = await db.staffProfile.count({
        where: { tenant_id: tenantId },
      });

      // Compute months of data
      const now = new Date();
      const monthsDiff = WorkloadComputeService.monthsBetween(
        earliest.absence_date,
        now,
      );

      if (monthsDiff < 12) {
        const remainingMonths = 12 - monthsDiff;
        return {
          status: 'accumulating' as const,
          dataPoints: monthsDiff,
          requiredDataPoints: 12 as const,
          projectedAvailableDate: WorkloadComputeService.addMonths(
            now,
            remainingMonths,
          ),
          message: `${monthsDiff} month(s) of data collected. ${remainingMonths} more month(s) needed for correlation analysis.`,
        };
      }

      // Fetch all absences and substitutions
      const absences = await db.teacherAbsence.findMany({
        where: { tenant_id: tenantId },
        select: { absence_date: true },
      });

      const subs = await db.substitutionRecord.findMany({
        where: {
          tenant_id: tenantId,
          status: { in: ['assigned', 'confirmed', 'completed'] },
        },
        select: { created_at: true },
      });

      // Group by month
      const absenceByMonth = new Map<string, number>();
      for (const a of absences) {
        const key = `${a.absence_date.getFullYear()}-${String(a.absence_date.getMonth() + 1).padStart(2, '0')}`;
        absenceByMonth.set(key, (absenceByMonth.get(key) ?? 0) + 1);
      }

      const subsByMonth = new Map<string, number>();
      for (const s of subs) {
        const key = `${s.created_at.getFullYear()}-${String(s.created_at.getMonth() + 1).padStart(2, '0')}`;
        subsByMonth.set(key, (subsByMonth.get(key) ?? 0) + 1);
      }

      // Build series
      const allMonths = new Set([
        ...absenceByMonth.keys(),
        ...subsByMonth.keys(),
      ]);
      const sortedMonths = Array.from(allMonths).sort();

      const series = sortedMonths.map((month) => ({
        month,
        coverPressure: WorkloadComputeService.round2(
          (subsByMonth.get(month) ?? 0) / Math.max(staffCount, 1),
        ),
        absenceRate: WorkloadComputeService.round2(
          (absenceByMonth.get(month) ?? 0) / Math.max(staffCount, 1),
        ),
      }));

      // Simple trend description
      const trendDescription = this.describeCorrelationTrend(series);

      return {
        status: 'available' as const,
        dataPoints: sortedMonths.length,
        series,
        trendDescription,
        disclaimer: CORRELATION_DISCLAIMER,
      };
    }) as Promise<CorrelationResult>;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Bulk (cron caching)
  // ═══════════════════════════════════════════════════════════════════════════

  async computeAllAggregateMetrics(
    tenantId: string,
  ): Promise<AllAggregateMetrics> {
    this.logger.log(
      `Computing all aggregate metrics for tenant ${tenantId}`,
    );

    const [
      workloadSummary,
      coverFairness,
      timetableQuality,
      absenceTrends,
      substitutionPressure,
      correlation,
    ] = await Promise.all([
      this.getAggregateWorkloadSummary(tenantId),
      this.getCoverFairness(tenantId),
      this.getAggregateTimetableQuality(tenantId),
      this.getAbsenceTrends(tenantId),
      this.getSubstitutionPressure(tenantId),
      this.getCorrelation(tenantId),
    ]);

    return {
      workloadSummary,
      coverFairness,
      timetableQuality,
      absenceTrends,
      substitutionPressure,
      correlation,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers (board report)
  // ═══════════════════════════════════════════════════════════════════════════

  async getSchoolAverageCovers(tenantId: string): Promise<number> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<number> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.getActiveAcademicYear(db, tenantId);
      if (!academicYear) return 0;

      const currentPeriod = await this.getCurrentPeriod(
        db,
        tenantId,
        academicYear.id,
      );
      if (!currentPeriod) return 0;

      return this.computeSchoolAverageCovers(
        db,
        tenantId,
        currentPeriod.start_date,
        currentPeriod.end_date,
      );
    }) as Promise<number>;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async getActiveAcademicYear(
    db: PrismaService,
    tenantId: string,
  ): Promise<{ id: string; start_date: Date; end_date: Date } | null> {
    return db.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true, start_date: true, end_date: true },
    });
  }

  private async getCurrentPeriod(
    db: PrismaService,
    tenantId: string,
    academicYearId: string,
  ): Promise<AcademicPeriodRow | null> {
    const now = new Date();
    return db.academicPeriod.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        start_date: { lte: now },
        end_date: { gte: now },
      },
      select: { id: true, start_date: true, end_date: true },
    });
  }

  private async getPreviousPeriod(
    db: PrismaService,
    tenantId: string,
    academicYearId: string,
    currentPeriod: AcademicPeriodRow,
  ): Promise<AcademicPeriodRow | null> {
    return db.academicPeriod.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        end_date: { lt: currentPeriod.start_date },
      },
      orderBy: { end_date: 'desc' },
      select: { id: true, start_date: true, end_date: true },
    });
  }

  private async countCoversInRange(
    db: PrismaService,
    tenantId: string,
    staffProfileId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    return db.substitutionRecord.count({
      where: {
        tenant_id: tenantId,
        substitute_staff_id: staffProfileId,
        status: { in: ['assigned', 'confirmed', 'completed'] },
        created_at: { gte: startDate, lte: endDate },
      },
    });
  }

  private async computeSchoolAverageCovers(
    db: PrismaService,
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const allStaff = await db.staffProfile.findMany({
      where: { tenant_id: tenantId },
      select: { id: true },
    });

    if (allStaff.length === 0) return 0;

    let total = 0;
    for (const staff of allStaff) {
      total += await this.countCoversInRange(
        db,
        tenantId,
        staff.id,
        startDate,
        endDate,
      );
    }

    return WorkloadComputeService.round2(total / allStaff.length);
  }

  private async getTeacherSchedules(
    db: PrismaService,
    tenantId: string,
    staffProfileId: string,
    academicYearId: string,
  ): Promise<ScheduleRow[]> {
    return db.schedule.findMany({
      where: {
        tenant_id: tenantId,
        teacher_staff_id: staffProfileId,
        academic_year_id: academicYearId,
      },
      select: {
        id: true,
        weekday: true,
        period_order: true,
        room_id: true,
        schedule_period_template: {
          select: {
            schedule_period_type: true,
            period_name: true,
            period_order: true,
          },
        },
        class_entity: {
          select: { name: true },
        },
      },
    });
  }

  private async getWellbeingThresholds(
    db: PrismaService,
    tenantId: string,
  ): Promise<WellbeingSettings> {
    const setting = await db.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const raw = setting?.settings as Record<string, unknown> | null;
    const wellbeing = raw?.staff_wellbeing as Record<string, unknown> | undefined;

    return {
      workload_high_threshold_periods:
        (wellbeing?.workload_high_threshold_periods as number) ??
        DEFAULT_THRESHOLD_PERIODS,
      workload_high_threshold_covers:
        (wellbeing?.workload_high_threshold_covers as number) ??
        DEFAULT_THRESHOLD_COVERS,
    };
  }

  private computeStatus(
    teachingPeriods: number,
    coverDuties: number,
    thresholds: WellbeingSettings,
  ): 'normal' | 'elevated' | 'high' {
    const periodsHigh =
      teachingPeriods > thresholds.workload_high_threshold_periods;
    const coversHigh =
      coverDuties > thresholds.workload_high_threshold_covers;

    if (periodsHigh && coversHigh) return 'high';
    if (periodsHigh || coversHigh) return 'elevated';
    return 'normal';
  }

  private computeSeasonalPattern(
    absences: { absence_date: Date }[],
    staffCount: number,
  ): { month: number; average_rate: number }[] {
    const monthCounts = new Map<number, number[]>();
    for (const a of absences) {
      const m = a.absence_date.getMonth() + 1;
      if (!monthCounts.has(m)) {
        monthCounts.set(m, []);
      }
      const arr = monthCounts.get(m);
      if (arr) arr.push(1);
    }

    return Array.from(monthCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([month, counts]) => ({
        month,
        average_rate: WorkloadComputeService.round2(
          counts.length / staffCount,
        ),
      }));
  }

  private computeMonthlyPressureTrend(
    absences: { absence_date: Date }[],
    subs: { created_at: Date }[],
    staffCount: number,
  ): SubstitutionPressure['trend'] {
    const absenceByMonth = new Map<string, number>();
    for (const a of absences) {
      const key = `${a.absence_date.getFullYear()}-${String(a.absence_date.getMonth() + 1).padStart(2, '0')}`;
      absenceByMonth.set(key, (absenceByMonth.get(key) ?? 0) + 1);
    }

    const subsByMonth = new Map<string, number>();
    for (const s of subs) {
      const key = `${s.created_at.getFullYear()}-${String(s.created_at.getMonth() + 1).padStart(2, '0')}`;
      subsByMonth.set(key, (subsByMonth.get(key) ?? 0) + 1);
    }

    const allMonths = new Set([
      ...absenceByMonth.keys(),
      ...subsByMonth.keys(),
    ]);
    const sortedMonths = Array.from(allMonths).sort();

    return sortedMonths.map((month) => {
      const absCount = absenceByMonth.get(month) ?? 0;
      const subsCount = subsByMonth.get(month) ?? 0;
      const daysInMonth = 20; // approximate school days per month
      const absRate =
        staffCount > 0 && daysInMonth > 0
          ? absCount / staffCount / daysInMonth
          : 0;
      const coverDiff = absCount > 0 ? subsCount / absCount : 0;
      const unfilledRate =
        absCount > 0 ? Math.max(0, absCount - subsCount) / absCount : 0;
      const score = absRate * 0.4 + (1 - coverDiff) * 0.3 + unfilledRate * 0.3;
      return {
        month,
        score: WorkloadComputeService.round2(score),
      };
    });
  }

  private describeCorrelationTrend(
    series: { month: string; coverPressure: number; absenceRate: number }[],
  ): string {
    if (series.length < 2) return 'Insufficient data for trend analysis.';

    const recentHalf = series.slice(Math.floor(series.length / 2));
    const earlyHalf = series.slice(0, Math.floor(series.length / 2));

    const recentAvgAbsence =
      WorkloadComputeService.mean(recentHalf.map((s) => s.absenceRate));
    const earlyAvgAbsence =
      WorkloadComputeService.mean(earlyHalf.map((s) => s.absenceRate));

    const recentAvgCover =
      WorkloadComputeService.mean(recentHalf.map((s) => s.coverPressure));
    const earlyAvgCover =
      WorkloadComputeService.mean(earlyHalf.map((s) => s.coverPressure));

    const absenceTrend =
      recentAvgAbsence > earlyAvgAbsence * 1.1
        ? 'increasing'
        : recentAvgAbsence < earlyAvgAbsence * 0.9
          ? 'decreasing'
          : 'stable';

    const coverTrend =
      recentAvgCover > earlyAvgCover * 1.1
        ? 'increasing'
        : recentAvgCover < earlyAvgCover * 0.9
          ? 'decreasing'
          : 'stable';

    return `Absence rates are ${absenceTrend} and cover pressure is ${coverTrend} over the observed period.`;
  }

  // ─── Empty state helpers ──────────────────────────────────────────────────

  private emptyPersonalSummary(): PersonalWorkloadSummary {
    return {
      teaching_periods_per_week: 0,
      cover_duties_this_term: 0,
      school_average_covers: 0,
      timetable_quality_score: 100,
      timetable_quality_label: 'Good',
      trend: null,
      status: 'normal',
    };
  }

  private emptyTimetableQuality(): PersonalTimetableQuality {
    return {
      free_period_distribution: [],
      consecutive_periods: { max: 0, average: 0 },
      split_days_count: 0,
      room_changes: { average: 0, max: 0 },
      school_averages: {
        consecutive_max: 0,
        free_distribution_score: 0,
        split_days_pct: 0,
        room_changes_avg: 0,
      },
      composite_score: 100,
      composite_label: 'Good',
    };
  }

  private emptyAggregateWorkload(): AggregateWorkloadSummary {
    return {
      average_teaching_periods: 0,
      range: { min: 0, max: 0, p25: 0, p50: 0, p75: 0 },
      over_allocated_periods_count: 0,
      average_cover_duties: 0,
      over_allocated_covers_count: 0,
      trend: null,
    };
  }

  private emptyCoverFairness(): CoverFairnessResult {
    return {
      distribution: [],
      gini_coefficient: 0,
      range: { min: 0, max: 0, median: 0 },
      assessment: 'Well distributed',
    };
  }

  private emptyAggregateTimetableQuality(): AggregateTimetableQuality {
    return {
      consecutive_periods: {
        mean: 0,
        median: 0,
        range: { min: 0, max: 0 },
      },
      free_period_clumping: {
        mean: 0,
        median: 0,
        range: { min: 0, max: 0 },
      },
      split_timetable_pct: 0,
      room_changes: {
        mean: 0,
        median: 0,
        range: { min: 0, max: 0 },
      },
      trend: null,
    };
  }

  private emptyAbsenceTrends(): AbsenceTrends {
    return {
      monthly_rates: [],
      day_of_week_pattern: [],
      term_comparison: null,
      seasonal_pattern: null,
    };
  }

  private emptySubstitutionPressure(): SubstitutionPressure {
    return {
      absence_rate: 0,
      cover_difficulty: 0,
      unfilled_rate: 0,
      composite_score: 0.3,
      trend: [],
      assessment: 'Low',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Static computation helpers (testable via public methods with known input)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Compute Gini coefficient from an array of non-negative counts */
  static computeGiniCoefficient(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;

    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    let sumOfProducts = 0;
    for (let i = 0; i < n; i++) {
      sumOfProducts += (i + 1) * (sorted[i] ?? 0);
    }

    return (2 * sumOfProducts) / (n * total) - (n + 1) / n;
  }

  /** Gini assessment label */
  static giniAssessment(
    gini: number,
  ):
    | 'Well distributed'
    | 'Moderate concentration'
    | 'Significant concentration \u2014 review recommended' {
    if (gini < 0.15) return 'Well distributed';
    if (gini <= 0.3) return 'Moderate concentration';
    return 'Significant concentration \u2014 review recommended';
  }

  /** Compute timetable quality composite score from schedule data */
  static computeTimetableCompositeScore(schedules: ScheduleRow[]): number {
    if (schedules.length === 0) return 100;

    // Free distribution score (30%)
    // Simple proxy: compute stddev of teaching periods per weekday
    const freeScore = WorkloadComputeService.computeFreeDistributionScore(schedules);

    // Consecutive periods score (30%)
    const consec = WorkloadComputeService.computeConsecutivePeriods(schedules);
    const consecutiveScore =
      consec.max <= 2
        ? 100
        : consec.max === 3
          ? 80
          : consec.max === 4
            ? 50
            : 0;

    // Split timetable score (20%)
    // Simplified: check if schedules have a wide period_order gap per day
    const splitScore = WorkloadComputeService.computeSplitScore(schedules);

    // Room changes score (20%)
    const rc = WorkloadComputeService.computeRoomChanges(schedules);
    const roomScore = Math.max(0, 100 - rc.average * 25);

    const composite =
      freeScore * 0.3 +
      consecutiveScore * 0.3 +
      splitScore * 0.2 +
      roomScore * 0.2;

    return WorkloadComputeService.round2(Math.max(0, Math.min(100, composite)));
  }

  /** Quality label from composite score */
  static qualityLabel(
    score: number,
  ): 'Good' | 'Moderate' | 'Needs attention' {
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Moderate';
    return 'Needs attention';
  }

  /** Compute free period distribution per weekday */
  static computeFreeDistribution(
    schedules: ScheduleRow[],
    allTemplates: { weekday: number; period_order: number }[],
  ): { weekday: number; free_count: number }[] {
    // Get teaching template slots per weekday
    const templatesByDay = new Map<number, Set<number>>();
    for (const t of allTemplates) {
      if (!templatesByDay.has(t.weekday)) {
        templatesByDay.set(t.weekday, new Set());
      }
      templatesByDay.get(t.weekday)?.add(t.period_order);
    }

    // Get assigned slots per weekday
    const assignedByDay = new Map<number, Set<number>>();
    for (const s of schedules) {
      const order =
        s.schedule_period_template?.period_order ?? s.period_order ?? 0;
      if (!assignedByDay.has(s.weekday)) {
        assignedByDay.set(s.weekday, new Set());
      }
      assignedByDay.get(s.weekday)?.add(order);
    }

    // For each active weekday, free = template slots - assigned slots
    const result: { weekday: number; free_count: number }[] = [];
    const weekdays = new Set([
      ...templatesByDay.keys(),
      ...assignedByDay.keys(),
    ]);
    for (const wd of Array.from(weekdays).sort((a, b) => a - b)) {
      const templateSlots = templatesByDay.get(wd)?.size ?? 0;
      const assignedSlots = assignedByDay.get(wd)?.size ?? 0;
      result.push({
        weekday: wd,
        free_count: Math.max(0, templateSlots - assignedSlots),
      });
    }

    return result;
  }

  /** Score free period distribution (0-100, higher = more even) */
  static scoreFreeDistribution(
    distribution: { weekday: number; free_count: number }[],
  ): number {
    if (distribution.length === 0) return 100;
    const counts = distribution.map((d) => d.free_count);
    const avg = WorkloadComputeService.mean(counts);
    if (avg === 0) return 50; // no free periods = moderate

    const stddev = Math.sqrt(
      counts.reduce((sum, c) => sum + (c - avg) ** 2, 0) / counts.length,
    );

    // Normalise: stddev of 0 = perfect (100), stddev >= avg = bad (0)
    const normalised = Math.max(0, 1 - stddev / Math.max(avg, 1));
    return WorkloadComputeService.round2(normalised * 100);
  }

  /** Compute consecutive period metrics */
  static computeConsecutivePeriods(
    schedules: ScheduleRow[],
  ): { max: number; average: number } {
    // Group by weekday
    const byDay = new Map<number, number[]>();
    for (const s of schedules) {
      const order =
        s.schedule_period_template?.period_order ?? s.period_order ?? 0;
      if (!byDay.has(s.weekday)) {
        byDay.set(s.weekday, []);
      }
      byDay.get(s.weekday)?.push(order);
    }

    const dayMaxes: number[] = [];
    for (const [, orders] of byDay) {
      const sorted = [...orders].sort((a, b) => a - b);
      let maxConsec = 1;
      let current = 1;
      for (let i = 1; i < sorted.length; i++) {
        if ((sorted[i] ?? 0) === (sorted[i - 1] ?? 0) + 1) {
          current++;
          maxConsec = Math.max(maxConsec, current);
        } else {
          current = 1;
        }
      }
      dayMaxes.push(maxConsec);
    }

    return {
      max: dayMaxes.length > 0 ? Math.max(...dayMaxes) : 0,
      average: WorkloadComputeService.round2(
        WorkloadComputeService.mean(dayMaxes),
      ),
    };
  }

  /** Count split days: morning AND afternoon teaching with 2+ free gap */
  static computeSplitDays(
    schedules: ScheduleRow[],
    allTemplates: { weekday: number; period_order: number }[],
  ): number {
    // Determine midpoint per weekday based on template count
    const templateCountByDay = new Map<number, number>();
    for (const t of allTemplates) {
      templateCountByDay.set(
        t.weekday,
        (templateCountByDay.get(t.weekday) ?? 0) + 1,
      );
    }

    // Group assigned period orders by weekday
    const byDay = new Map<number, number[]>();
    for (const s of schedules) {
      const order =
        s.schedule_period_template?.period_order ?? s.period_order ?? 0;
      if (!byDay.has(s.weekday)) {
        byDay.set(s.weekday, []);
      }
      byDay.get(s.weekday)?.push(order);
    }

    let splitCount = 0;
    for (const [, orders] of byDay) {
      if (orders.length < 2) continue;
      const sorted = [...orders].sort((a, b) => a - b);

      // Check for a gap of 2+ between any consecutive assigned periods
      let hasSplit = false;
      for (let i = 1; i < sorted.length; i++) {
        if ((sorted[i] ?? 0) - (sorted[i - 1] ?? 0) >= 3) {
          // Gap of 2+ free periods means the difference is >= 3
          hasSplit = true;
          break;
        }
      }
      if (hasSplit) splitCount++;
    }

    return splitCount;
  }

  /** Room changes per day */
  static computeRoomChanges(
    schedules: ScheduleRow[],
  ): { average: number; max: number } {
    // Group by weekday, count distinct rooms per day
    const byDay = new Map<number, Set<string>>();
    for (const s of schedules) {
      if (!s.room_id) continue;
      if (!byDay.has(s.weekday)) {
        byDay.set(s.weekday, new Set());
      }
      byDay.get(s.weekday)?.add(s.room_id);
    }

    const changes: number[] = [];
    for (const [, rooms] of byDay) {
      // Room changes = distinct rooms - 1
      changes.push(Math.max(0, rooms.size - 1));
    }

    return {
      average: WorkloadComputeService.round2(
        WorkloadComputeService.mean(changes),
      ),
      max: changes.length > 0 ? Math.max(...changes) : 0,
    };
  }

  /** Substitution pressure assessment from composite score */
  static pressureAssessment(
    score: number,
  ): 'Low' | 'Moderate' | 'High' | 'Critical' {
    if (score < 0.25) return 'Low';
    if (score < 0.5) return 'Moderate';
    if (score < 0.75) return 'High';
    return 'Critical';
  }

  // ─── Private static utilities ──────────────────────────────────────────────

  private static computeFreeDistributionScore(
    schedules: ScheduleRow[],
  ): number {
    // Count teaching periods per weekday
    const countsByDay = new Map<number, number>();
    for (const s of schedules) {
      if (
        s.schedule_period_template?.schedule_period_type === 'teaching'
      ) {
        countsByDay.set(s.weekday, (countsByDay.get(s.weekday) ?? 0) + 1);
      }
    }

    const counts = Array.from(countsByDay.values());
    if (counts.length <= 1) return 100;

    const avg = WorkloadComputeService.mean(counts);
    const stddev = Math.sqrt(
      counts.reduce((sum, c) => sum + (c - avg) ** 2, 0) / counts.length,
    );

    // Normalise: lower stddev = more even distribution = higher score
    const maxExpectedStddev = avg; // worst case
    const normalised =
      maxExpectedStddev > 0
        ? Math.max(0, 1 - stddev / maxExpectedStddev)
        : 1;

    return WorkloadComputeService.round2(normalised * 100);
  }

  private static computeSplitScore(schedules: ScheduleRow[]): number {
    const byDay = new Map<number, number[]>();
    for (const s of schedules) {
      const order =
        s.schedule_period_template?.period_order ?? s.period_order ?? 0;
      if (!byDay.has(s.weekday)) {
        byDay.set(s.weekday, []);
      }
      byDay.get(s.weekday)?.push(order);
    }

    let splitDays = 0;
    let totalDays = 0;
    for (const [, orders] of byDay) {
      totalDays++;
      if (orders.length < 2) continue;
      const sorted = [...orders].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if ((sorted[i] ?? 0) - (sorted[i - 1] ?? 0) >= 3) {
          splitDays++;
          break;
        }
      }
    }

    if (totalDays === 0) return 100;
    return WorkloadComputeService.round2(
      (1 - splitDays / totalDays) * 100,
    );
  }

  /** Mean of an array, returns 0 for empty arrays */
  static mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /** Median of a sorted array */
  static median(sorted: number[]): number {
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return WorkloadComputeService.round2(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
    }
    return sorted[mid] ?? 0;
  }

  /** Percentile range from sorted array */
  static percentileRange(sorted: number[]): {
    min: number;
    max: number;
    p25: number;
    p50: number;
    p75: number;
  } {
    if (sorted.length === 0) {
      return { min: 0, max: 0, p25: 0, p50: 0, p75: 0 };
    }
    return {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      p25: WorkloadComputeService.percentile(sorted, 25),
      p50: WorkloadComputeService.percentile(sorted, 50),
      p75: WorkloadComputeService.percentile(sorted, 75),
    };
  }

  private static percentile(sorted: number[], pct: number): number {
    const idx = (pct / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower] ?? 0;
    const frac = idx - lower;
    return WorkloadComputeService.round2(
      (sorted[lower] ?? 0) * (1 - frac) + (sorted[upper] ?? 0) * frac,
    );
  }

  /** Round to 2 decimal places */
  static round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /** Count weekdays (Mon-Fri) between two dates */
  static schoolDaysBetween(start: Date, end: Date): number {
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day >= 1 && day <= 5) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  /** Calculate full months between two dates */
  static monthsBetween(start: Date, end: Date): number {
    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth())
    );
  }

  /** Add months to a date and return ISO date string */
  static addMonths(date: Date, months: number): string {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result.toISOString().slice(0, 10);
  }
}
