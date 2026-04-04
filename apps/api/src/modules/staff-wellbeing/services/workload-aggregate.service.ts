import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type {
  AbsenceTrends,
  AggregateTimetableQuality,
  AggregateWorkloadSummary,
  AllAggregateMetrics,
  CorrelationResult,
  CoverFairnessResult,
  SubstitutionPressure,
} from './workload-compute.service';
import { WorkloadDataService } from './workload-data.service';
import { WorkloadEmptyStateService } from './workload-empty-state.service';
import { WorkloadMetricsService } from './workload-metrics.service';
import { WorkloadTrendAnalysisService } from './workload-trend-analysis.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const CORRELATION_DISCLAIMER =
  'This shows patterns that occurred together. It does not prove that one caused the other. Use this as a starting point for investigation, not a conclusion.';

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Aggregate/school-wide workload operations: workload summary, distributions,
 * over-allocation detection, cover fairness, timetable quality, absence trends,
 * substitution pressure, and correlation analysis.
 */
@Injectable()
export class WorkloadAggregateService {
  private readonly logger = new Logger(WorkloadAggregateService.name);
  private readonly emptyStateService = new WorkloadEmptyStateService();
  private readonly trendAnalysisService = new WorkloadTrendAnalysisService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataService: WorkloadDataService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Aggregate workload summary
  // ═══════════════════════════════════════════════════════════════════════════

  async getAggregateWorkloadSummary(tenantId: string): Promise<AggregateWorkloadSummary> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<AggregateWorkloadSummary> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyStateService.emptyAggregateWorkload();
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Cover fairness
  // ═══════════════════════════════════════════════════════════════════════════

  async getCoverFairness(tenantId: string): Promise<CoverFairnessResult> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<CoverFairnessResult> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyStateService.emptyCoverFairness();
      }

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);
      if (!currentPeriod) {
        return this.emptyStateService.emptyCoverFairness();
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Aggregate timetable quality
  // ═══════════════════════════════════════════════════════════════════════════

  async getAggregateTimetableQuality(tenantId: string): Promise<AggregateTimetableQuality> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<AggregateTimetableQuality> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyStateService.emptyAggregateTimetableQuality();
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Absence trends
  // ═══════════════════════════════════════════════════════════════════════════

  async getAbsenceTrends(tenantId: string): Promise<AbsenceTrends> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<AbsenceTrends> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyStateService.emptyAbsenceTrends();
      }

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);

      const staffCount = await db.staffProfile.count({
        where: { tenant_id: tenantId },
      });

      if (staffCount === 0) {
        return this.emptyStateService.emptyAbsenceTrends();
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
        monthlyRates.length >= 12
          ? this.trendAnalysisService.computeSeasonalPattern(absences, staffCount)
          : null;

      return {
        monthly_rates: monthlyRates,
        day_of_week_pattern: dayOfWeekPattern,
        term_comparison: termComparison,
        seasonal_pattern: seasonalPattern,
      };
    }) as Promise<AbsenceTrends>;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Substitution pressure
  // ═══════════════════════════════════════════════════════════════════════════

  async getSubstitutionPressure(tenantId: string): Promise<SubstitutionPressure> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<SubstitutionPressure> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyStateService.emptySubstitutionPressure();
      }

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);

      const staffCount = await db.staffProfile.count({
        where: { tenant_id: tenantId },
      });

      if (staffCount === 0 || !currentPeriod) {
        return this.emptyStateService.emptySubstitutionPressure();
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

      const trend = this.trendAnalysisService.computeMonthlyPressureTrend(
        allAbsences,
        allSubs,
        staffCount,
      );

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

  // ═══════════════════════════════════════════════════════════════════════════
  // Correlation analysis
  // ═══════════════════════════════════════════════════════════════════════════

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
      const trendDescription = this.trendAnalysisService.describeCorrelationTrend(series);

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
}
