import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AbsenceTrends,
  AggregateWorkloadSummary,
  AggregateTimetableQuality,
  BoardReportSummary,
  CoverFairnessResult,
  CorrelationResult,
  SubstitutionPressure,
} from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { WorkloadCacheService } from './workload-cache.service';
import { WorkloadComputeService } from './workload-compute.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function describeCoverDistribution(gini: number): string {
  if (gini <= 0.15) {
    return 'Normal distribution';
  }
  if (gini <= 0.3) {
    return 'Slightly right-skewed — some staff carry a heavier share';
  }
  return 'Right-skewed — a few staff carry disproportionate load';
}

function computeAverageTimetableScore(
  quality: AggregateTimetableQuality,
): number {
  // Average the four sub-metrics (each normalised to 0-100 range)
  // consecutive_periods.mean, free_period_clumping.mean, split_timetable_pct, room_changes.mean
  // Lower consecutive is better (invert), higher free clumping is better,
  // lower split is better (invert), lower room changes is better (invert).
  // For simplicity, composite = weighted average of the median/mean values.
  const consecutiveScore = Math.max(0, 100 - quality.consecutive_periods.mean * 10);
  const clumpingScore = Math.min(100, quality.free_period_clumping.mean * 20);
  const splitScore = Math.max(0, 100 - quality.split_timetable_pct * 100);
  const roomScore = Math.max(0, 100 - quality.room_changes.mean * 10);

  return Math.round(((consecutiveScore + clumpingScore + splitScore + roomScore) / 4) * 10) / 10;
}

function scoreTolabel(score: number): 'Good' | 'Moderate' | 'Needs attention' {
  if (score >= 70) return 'Good';
  if (score >= 45) return 'Moderate';
  return 'Needs attention';
}

function computeTrendDirection(
  trend: SubstitutionPressure['trend'],
): 'improving' | 'stable' | 'worsening' | null {
  if (trend.length < 6) return null;

  // Compare average of last 3 months to previous 3 months
  const recent = trend.slice(-3);
  const prior = trend.slice(-6, -3);

  const recentAvg = recent.reduce((sum, t) => sum + t.score, 0) / recent.length;
  const priorAvg = prior.reduce((sum, t) => sum + t.score, 0) / prior.length;

  const delta = recentAvg - priorAvg;
  // Threshold: 5% change is meaningful
  if (delta < -2) return 'improving';
  if (delta > 2) return 'worsening';
  return 'stable';
}

function findHighestAbsenceDay(
  dayOfWeek: AbsenceTrends['day_of_week_pattern'],
): string | null {
  if (dayOfWeek.length === 0) return null;

  let highest = dayOfWeek[0]!;
  for (const entry of dayOfWeek) {
    if (entry.rate > highest.rate) {
      highest = entry;
    }
  }

  return WEEKDAY_NAMES[highest.weekday] ?? null;
}

function buildCorrelationInsight(
  correlation: CorrelationResult,
): BoardReportSummary['correlation_insight'] {
  if (correlation.status === 'accumulating') {
    if (correlation.dataPoints === 0) return null;
    return {
      status: 'accumulating',
      summary: `Collecting data (${correlation.dataPoints} of ${correlation.requiredDataPoints} months). ${correlation.message}`,
    };
  }

  return {
    status: 'available',
    summary: correlation.trendDescription,
  };
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class BoardReportService {
  private readonly logger = new Logger(BoardReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly computeService: WorkloadComputeService,
    private readonly cacheService: WorkloadCacheService,
  ) {}

  async generateTermlySummary(tenantId: string): Promise<BoardReportSummary> {
    this.logger.log(`Generating termly board report for tenant ${tenantId}`);

    // 1. Resolve academic year + term
    const { termName, academicYearName } =
      await this.resolveAcademicContext(tenantId);

    // 2. Gather all aggregate metrics (cache-first, compute on miss)
    const [
      workloadSummary,
      coverFairness,
      timetableQuality,
      absenceTrends,
      substitutionPressure,
      correlation,
    ] = await Promise.all([
      this.getCachedOrCompute<AggregateWorkloadSummary>(
        tenantId,
        'workload-summary',
        () => this.computeService.getAggregateWorkloadSummary(tenantId),
      ),
      this.getCachedOrCompute<CoverFairnessResult>(
        tenantId,
        'cover-fairness',
        () => this.computeService.getCoverFairness(tenantId),
      ),
      this.getCachedOrCompute<AggregateTimetableQuality>(
        tenantId,
        'timetable-quality',
        () => this.computeService.getAggregateTimetableQuality(tenantId),
      ),
      this.getCachedOrCompute<AbsenceTrends>(
        tenantId,
        'absence-trends',
        () => this.computeService.getAbsenceTrends(tenantId),
      ),
      this.getCachedOrCompute<SubstitutionPressure>(
        tenantId,
        'substitution-pressure',
        () => this.computeService.getSubstitutionPressure(tenantId),
      ),
      this.getCachedOrCompute<CorrelationResult>(
        tenantId,
        'correlation',
        () => this.computeService.getCorrelation(tenantId),
      ),
    ]);

    // 3. Compile board report
    const averageScore = computeAverageTimetableScore(timetableQuality);

    const report: BoardReportSummary = {
      workload_distribution: {
        average_periods: workloadSummary.average_teaching_periods,
        range: {
          min: workloadSummary.range.min,
          max: workloadSummary.range.max,
        },
        over_allocated_count: workloadSummary.over_allocated_periods_count,
      },
      cover_fairness: {
        gini_coefficient: coverFairness.gini_coefficient,
        distribution_shape: describeCoverDistribution(
          coverFairness.gini_coefficient,
        ),
        assessment: coverFairness.assessment,
      },
      timetable_quality: {
        average_score: averageScore,
        label: scoreTolabel(averageScore),
      },
      substitution_pressure: {
        composite_score: substitutionPressure.composite_score,
        assessment: substitutionPressure.assessment,
        trend_direction: computeTrendDirection(substitutionPressure.trend),
      },
      absence_pattern: {
        current_term_rate: absenceTrends.term_comparison?.current ?? 0,
        previous_term_rate: absenceTrends.term_comparison?.previous ?? null,
        highest_day: findHighestAbsenceDay(absenceTrends.day_of_week_pattern),
      },
      correlation_insight: buildCorrelationInsight(correlation),
      generated_at: new Date().toISOString(),
      term_name: termName,
      academic_year_name: academicYearName,
    };

    this.logger.log(
      `Board report generated for tenant ${tenantId} — term: ${termName}`,
    );

    return report;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getCachedOrCompute<T>(
    tenantId: string,
    metricType: string,
    computeFn: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.cacheService.getCachedAggregate<T>(
      tenantId,
      metricType,
    );
    if (cached) return cached;

    const result = await computeFn();

    await this.cacheService.setCachedAggregate(tenantId, metricType, result);

    return result;
  }

  private async resolveAcademicContext(
    tenantId: string,
  ): Promise<{ termName: string; academicYearName: string }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const academicYear = await db.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        select: { id: true, name: true },
      });

      if (!academicYear) {
        throw new NotFoundException({
          error: {
            code: 'NO_ACTIVE_ACADEMIC_YEAR',
            message:
              'No active academic year found. A board report cannot be generated without an active academic year.',
          },
        });
      }

      const now = new Date();
      const currentPeriod = await db.academicPeriod.findFirst({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYear.id,
          start_date: { lte: now },
          end_date: { gte: now },
        },
        select: { name: true },
      });

      return {
        termName: currentPeriod?.name ?? 'Current Term',
        academicYearName: academicYear.name,
      };
    }) as Promise<{ termName: string; academicYearName: string }>;
  }
}
