import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type { ScheduleRow } from './workload-data.service';
import { WorkloadDataService } from './workload-data.service';
import { WorkloadMetricsService } from './workload-metrics.service';

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

// ─── Constants ───────────────────────────────────────────────────────────────

const CORRELATION_DISCLAIMER =
  'This shows patterns that occurred together. It does not prove that one caused the other. Use this as a starting point for investigation, not a conclusion.';

// ─── Facade Service ─────────────────────────────────────────────────────────

/**
 * Thin facade that delegates data access to WorkloadDataService and
 * pure computation to WorkloadMetricsService. Keeps the public API identical
 * for all callers (controllers, board-report service, tests).
 */
@Injectable()
export class WorkloadComputeService {
  private readonly logger = new Logger(WorkloadComputeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataService: WorkloadDataService,
    private readonly metricsService: WorkloadMetricsService,
  ) {}

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

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyPersonalSummary();
      }

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);
      const previousPeriod = currentPeriod
        ? await this.dataService.getPreviousPeriod(db, tenantId, academicYear.id, currentPeriod)
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
        ? await this.dataService.countCoversInRange(
            db,
            tenantId,
            staffProfileId,
            currentPeriod.start_date,
            currentPeriod.end_date,
          )
        : 0;

      // School average covers
      const schoolAverageCovers = currentPeriod
        ? await this.dataService.computeSchoolAverageCovers(
            db,
            tenantId,
            currentPeriod.start_date,
            currentPeriod.end_date,
          )
        : 0;

      // Timetable quality
      const allSchedules = await this.dataService.getTeacherSchedules(
        db,
        tenantId,
        staffProfileId,
        academicYear.id,
      );
      const compositeScore = WorkloadMetricsService.computeTimetableCompositeScore(allSchedules);
      const compositeLabel = WorkloadMetricsService.qualityLabel(compositeScore);

      // Trend (previous term)
      let trend: PersonalWorkloadSummary['trend'] = null;
      if (previousPeriod) {
        const previousCovers = await this.dataService.countCoversInRange(
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
      const thresholds = await this.dataService.getWellbeingThresholds(db, tenantId);
      const status = this.dataService.computeStatus(
        teachingPeriodsPerWeek,
        coverDutiesThisTerm,
        thresholds,
      );

      return {
        teaching_periods_per_week: teachingPeriodsPerWeek,
        cover_duties_this_term: coverDutiesThisTerm,
        school_average_covers: WorkloadMetricsService.round2(schoolAverageCovers),
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

    return rlsClient.$transaction(
      async (
        tx,
      ): Promise<{
        data: CoverHistoryItem[];
        meta: { page: number; pageSize: number; total: number };
      }> => {
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
      },
    ) as Promise<{
      data: CoverHistoryItem[];
      meta: { page: number; pageSize: number; total: number };
    }>;
  }

  async getPersonalTimetableQuality(
    tenantId: string,
    staffProfileId: string,
  ): Promise<PersonalTimetableQuality> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<PersonalTimetableQuality> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyTimetableQuality();
      }

      const schedules = await this.dataService.getTeacherSchedules(
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
      const freeDistribution = WorkloadMetricsService.computeFreeDistribution(
        schedules,
        allTemplates,
      );

      // Consecutive periods
      const consecutive = WorkloadMetricsService.computeConsecutivePeriods(schedules);

      // Split days
      const splitDaysCount = WorkloadMetricsService.computeSplitDays(schedules, allTemplates);

      // Room changes
      const roomChanges = WorkloadMetricsService.computeRoomChanges(schedules);

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
        const staffSchedules = await this.dataService.getTeacherSchedules(
          db,
          tenantId,
          staff.id,
          academicYear.id,
        );
        if (staffSchedules.length === 0) continue;

        const sc = WorkloadMetricsService.computeConsecutivePeriods(staffSchedules);
        schoolConsecutiveMaxes.push(sc.max);

        const sf = WorkloadMetricsService.computeFreeDistribution(staffSchedules, allTemplates);
        schoolFreeScores.push(WorkloadMetricsService.scoreFreeDistribution(sf));

        schoolSplitCounts.push(
          WorkloadMetricsService.computeSplitDays(staffSchedules, allTemplates),
        );

        const sr = WorkloadMetricsService.computeRoomChanges(staffSchedules);
        schoolRoomAvgs.push(sr.average);
      }

      const compositeScore = WorkloadMetricsService.computeTimetableCompositeScore(schedules);

      return {
        free_period_distribution: freeDistribution,
        consecutive_periods: consecutive,
        split_days_count: splitDaysCount,
        room_changes: roomChanges,
        school_averages: {
          consecutive_max: WorkloadMetricsService.round2(
            WorkloadMetricsService.mean(schoolConsecutiveMaxes),
          ),
          free_distribution_score: WorkloadMetricsService.round2(
            WorkloadMetricsService.mean(schoolFreeScores),
          ),
          split_days_pct: WorkloadMetricsService.round2(
            allStaff.length > 0
              ? (schoolSplitCounts.filter((c) => c > 0).length / allStaff.length) * 100
              : 0,
          ),
          room_changes_avg: WorkloadMetricsService.round2(
            WorkloadMetricsService.mean(schoolRoomAvgs),
          ),
        },
        composite_score: compositeScore,
        composite_label: WorkloadMetricsService.qualityLabel(compositeScore),
      };
    }) as Promise<PersonalTimetableQuality>;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Aggregate (D3)
  // ═══════════════════════════════════════════════════════════════════════════

  async getAggregateWorkloadSummary(tenantId: string): Promise<AggregateWorkloadSummary> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<AggregateWorkloadSummary> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyAggregateWorkload();
      }

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);
      const previousPeriod = currentPeriod
        ? await this.dataService.getPreviousPeriod(db, tenantId, academicYear.id, currentPeriod)
        : null;

      const allStaff = await db.staffProfile.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      });

      const thresholds = await this.dataService.getWellbeingThresholds(db, tenantId);

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
          const covers = await this.dataService.countCoversInRange(
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
          prevCoverTotal += await this.dataService.countCoversInRange(
            db,
            tenantId,
            staff.id,
            previousPeriod.start_date,
            previousPeriod.end_date,
          );
        }
        trend = {
          previous_average_periods: WorkloadMetricsService.round2(
            WorkloadMetricsService.mean(teachingCounts),
          ),
          previous_average_covers: WorkloadMetricsService.round2(prevCoverTotal / allStaff.length),
        };
      }

      return {
        average_teaching_periods: WorkloadMetricsService.round2(
          WorkloadMetricsService.mean(teachingCounts),
        ),
        range: WorkloadMetricsService.percentileRange(sorted),
        over_allocated_periods_count: overAllocatedPeriods,
        average_cover_duties: WorkloadMetricsService.round2(
          WorkloadMetricsService.mean(coverCounts),
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

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyCoverFairness();
      }

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);
      if (!currentPeriod) {
        return this.emptyCoverFairness();
      }

      const allStaff = await db.staffProfile.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      });

      const coverCounts: number[] = [];
      for (const staff of allStaff) {
        const count = await this.dataService.countCoversInRange(
          db,
          tenantId,
          staff.id,
          currentPeriod.start_date,
          currentPeriod.end_date,
        );
        coverCounts.push(count);
      }

      const gini = WorkloadMetricsService.computeGiniCoefficient(coverCounts);
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
        gini_coefficient: WorkloadMetricsService.round2(gini),
        range: {
          min: sorted[0] ?? 0,
          max: sorted[sorted.length - 1] ?? 0,
          median: WorkloadMetricsService.median(sorted),
        },
        assessment: WorkloadMetricsService.giniAssessment(gini),
      };
    }) as Promise<CoverFairnessResult>;
  }

  async getAggregateTimetableQuality(tenantId: string): Promise<AggregateTimetableQuality> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<AggregateTimetableQuality> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
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
        const schedules = await this.dataService.getTeacherSchedules(
          db,
          tenantId,
          staff.id,
          academicYear.id,
        );
        if (schedules.length === 0) continue;
        staffWithSchedules++;

        const cons = WorkloadMetricsService.computeConsecutivePeriods(schedules);
        consecutiveMaxes.push(cons.max);

        const freeDist = WorkloadMetricsService.computeFreeDistribution(schedules, allTemplates);
        freeClumpingScores.push(WorkloadMetricsService.scoreFreeDistribution(freeDist));

        const splits = WorkloadMetricsService.computeSplitDays(schedules, allTemplates);
        if (splits > 0) splitCount++;

        const rc = WorkloadMetricsService.computeRoomChanges(schedules);
        roomAvgs.push(rc.average);
      }

      const sortedConsec = [...consecutiveMaxes].sort((a, b) => a - b);
      const sortedFree = [...freeClumpingScores].sort((a, b) => a - b);
      const sortedRoom = [...roomAvgs].sort((a, b) => a - b);

      return {
        consecutive_periods: {
          mean: WorkloadMetricsService.round2(WorkloadMetricsService.mean(consecutiveMaxes)),
          median: WorkloadMetricsService.median(sortedConsec),
          range: {
            min: sortedConsec[0] ?? 0,
            max: sortedConsec[sortedConsec.length - 1] ?? 0,
          },
        },
        free_period_clumping: {
          mean: WorkloadMetricsService.round2(WorkloadMetricsService.mean(freeClumpingScores)),
          median: WorkloadMetricsService.median(sortedFree),
          range: {
            min: sortedFree[0] ?? 0,
            max: sortedFree[sortedFree.length - 1] ?? 0,
          },
        },
        split_timetable_pct: WorkloadMetricsService.round2(
          staffWithSchedules > 0 ? (splitCount / staffWithSchedules) * 100 : 0,
        ),
        room_changes: {
          mean: WorkloadMetricsService.round2(WorkloadMetricsService.mean(roomAvgs)),
          median: WorkloadMetricsService.median(sortedRoom),
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

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyAbsenceTrends();
      }

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);

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
          rate: WorkloadMetricsService.round2(count / staffCount),
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
          rate: WorkloadMetricsService.round2(count / staffCount),
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
        const currentRate = WorkloadMetricsService.round2(currentAbsences / staffCount);

        const previousPeriod = await this.dataService.getPreviousPeriod(
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
          previousRate = WorkloadMetricsService.round2(prevAbsences / staffCount);
        }

        termComparison = { current: currentRate, previous: previousRate };
      }

      // Seasonal pattern — only if >= 12 months of data
      const seasonalPattern: AbsenceTrends['seasonal_pattern'] =
        monthlyRates.length >= 12 ? this.computeSeasonalPattern(absences, staffCount) : null;

      return {
        monthly_rates: monthlyRates,
        day_of_week_pattern: dayOfWeekPattern,
        term_comparison: termComparison,
        seasonal_pattern: seasonalPattern,
      };
    }) as Promise<AbsenceTrends>;
  }

  async getSubstitutionPressure(tenantId: string): Promise<SubstitutionPressure> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<SubstitutionPressure> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptySubstitutionPressure();
      }

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);

      const staffCount = await db.staffProfile.count({
        where: { tenant_id: tenantId },
      });

      if (staffCount === 0 || !currentPeriod) {
        return this.emptySubstitutionPressure();
      }

      // Days in current period
      const periodDays = WorkloadMetricsService.schoolDaysBetween(
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
        periodDays > 0 && staffCount > 0 ? totalAbsences / staffCount / periodDays : 0;

      const coverDifficulty = totalAbsences > 0 ? totalSubs / totalAbsences : 0;

      const unfilled =
        totalAbsences > 0 ? Math.max(0, totalAbsences - totalSubs) / totalAbsences : 0;

      const compositeScore = absenceRate * 0.4 + (1 - coverDifficulty) * 0.3 + unfilled * 0.3;

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

      const trend = this.computeMonthlyPressureTrend(allAbsences, allSubs, staffCount);

      return {
        absence_rate: WorkloadMetricsService.round2(absenceRate),
        cover_difficulty: WorkloadMetricsService.round2(coverDifficulty),
        unfilled_rate: WorkloadMetricsService.round2(unfilled),
        composite_score: WorkloadMetricsService.round2(compositeScore),
        trend,
        assessment: WorkloadMetricsService.pressureAssessment(compositeScore),
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
          projectedAvailableDate: WorkloadMetricsService.addMonths(new Date(), 12),
          message: 'No absence data yet. Correlation analysis requires at least 12 months of data.',
        };
      }

      const staffCount = await db.staffProfile.count({
        where: { tenant_id: tenantId },
      });

      // Compute months of data
      const now = new Date();
      const monthsDiff = WorkloadMetricsService.monthsBetween(earliest.absence_date, now);

      if (monthsDiff < 12) {
        const remainingMonths = 12 - monthsDiff;
        return {
          status: 'accumulating' as const,
          dataPoints: monthsDiff,
          requiredDataPoints: 12 as const,
          projectedAvailableDate: WorkloadMetricsService.addMonths(now, remainingMonths),
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
      const allMonths = new Set([...absenceByMonth.keys(), ...subsByMonth.keys()]);
      const sortedMonths = Array.from(allMonths).sort();

      const series = sortedMonths.map((month) => ({
        month,
        coverPressure: WorkloadMetricsService.round2(
          (subsByMonth.get(month) ?? 0) / Math.max(staffCount, 1),
        ),
        absenceRate: WorkloadMetricsService.round2(
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

  async computeAllAggregateMetrics(tenantId: string): Promise<AllAggregateMetrics> {
    this.logger.log(`Computing all aggregate metrics for tenant ${tenantId}`);

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

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) return 0;

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);
      if (!currentPeriod) return 0;

      return this.dataService.computeSchoolAverageCovers(
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
        average_rate: WorkloadMetricsService.round2(counts.length / staffCount),
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

    const allMonths = new Set([...absenceByMonth.keys(), ...subsByMonth.keys()]);
    const sortedMonths = Array.from(allMonths).sort();

    return sortedMonths.map((month) => {
      const absCount = absenceByMonth.get(month) ?? 0;
      const subsCount = subsByMonth.get(month) ?? 0;
      const daysInMonth = 20; // approximate school days per month
      const absRate = staffCount > 0 && daysInMonth > 0 ? absCount / staffCount / daysInMonth : 0;
      const coverDiff = absCount > 0 ? subsCount / absCount : 0;
      const unfilledRate = absCount > 0 ? Math.max(0, absCount - subsCount) / absCount : 0;
      const score = absRate * 0.4 + (1 - coverDiff) * 0.3 + unfilledRate * 0.3;
      return {
        month,
        score: WorkloadMetricsService.round2(score),
      };
    });
  }

  private describeCorrelationTrend(
    series: { month: string; coverPressure: number; absenceRate: number }[],
  ): string {
    if (series.length < 2) return 'Insufficient data for trend analysis.';

    const recentHalf = series.slice(Math.floor(series.length / 2));
    const earlyHalf = series.slice(0, Math.floor(series.length / 2));

    const recentAvgAbsence = WorkloadMetricsService.mean(recentHalf.map((s) => s.absenceRate));
    const earlyAvgAbsence = WorkloadMetricsService.mean(earlyHalf.map((s) => s.absenceRate));

    const recentAvgCover = WorkloadMetricsService.mean(recentHalf.map((s) => s.coverPressure));
    const earlyAvgCover = WorkloadMetricsService.mean(earlyHalf.map((s) => s.coverPressure));

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
  // Static delegation — preserves backward compatibility for tests and callers
  // that reference WorkloadComputeService.staticMethod(...)
  // ═══════════════════════════════════════════════════════════════════════════

  static computeGiniCoefficient(values: number[]): number {
    return WorkloadMetricsService.computeGiniCoefficient(values);
  }

  static giniAssessment(
    gini: number,
  ):
    | 'Well distributed'
    | 'Moderate concentration'
    | 'Significant concentration \u2014 review recommended' {
    return WorkloadMetricsService.giniAssessment(gini);
  }

  static computeTimetableCompositeScore(schedules: ScheduleRow[]): number {
    return WorkloadMetricsService.computeTimetableCompositeScore(schedules);
  }

  static qualityLabel(score: number): 'Good' | 'Moderate' | 'Needs attention' {
    return WorkloadMetricsService.qualityLabel(score);
  }

  static computeFreeDistribution(
    schedules: ScheduleRow[],
    allTemplates: { weekday: number; period_order: number }[],
  ): { weekday: number; free_count: number }[] {
    return WorkloadMetricsService.computeFreeDistribution(schedules, allTemplates);
  }

  static scoreFreeDistribution(distribution: { weekday: number; free_count: number }[]): number {
    return WorkloadMetricsService.scoreFreeDistribution(distribution);
  }

  static computeConsecutivePeriods(schedules: ScheduleRow[]): { max: number; average: number } {
    return WorkloadMetricsService.computeConsecutivePeriods(schedules);
  }

  static computeSplitDays(
    schedules: ScheduleRow[],
    allTemplates: { weekday: number; period_order: number }[],
  ): number {
    return WorkloadMetricsService.computeSplitDays(schedules, allTemplates);
  }

  static computeRoomChanges(schedules: ScheduleRow[]): { average: number; max: number } {
    return WorkloadMetricsService.computeRoomChanges(schedules);
  }

  static pressureAssessment(score: number): 'Low' | 'Moderate' | 'High' | 'Critical' {
    return WorkloadMetricsService.pressureAssessment(score);
  }

  static mean(values: number[]): number {
    return WorkloadMetricsService.mean(values);
  }

  static median(sorted: number[]): number {
    return WorkloadMetricsService.median(sorted);
  }

  static percentileRange(sorted: number[]): {
    min: number;
    max: number;
    p25: number;
    p50: number;
    p75: number;
  } {
    return WorkloadMetricsService.percentileRange(sorted);
  }

  static round2(n: number): number {
    return WorkloadMetricsService.round2(n);
  }

  static schoolDaysBetween(start: Date, end: Date): number {
    return WorkloadMetricsService.schoolDaysBetween(start, end);
  }

  static monthsBetween(start: Date, end: Date): number {
    return WorkloadMetricsService.monthsBetween(start, end);
  }

  static addMonths(date: Date, months: number): string {
    return WorkloadMetricsService.addMonths(date, months);
  }
}
