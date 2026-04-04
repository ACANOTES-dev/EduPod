import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { WorkloadAggregateService } from './workload-aggregate.service';
import type { ScheduleRow } from './workload-data.service';
import { WorkloadDataService } from './workload-data.service';
import { WorkloadMetricsService } from './workload-metrics.service';
import { WorkloadPersonalService } from './workload-personal.service';

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

// ─── Facade Service ─────────────────────────────────────────────────────────

/**
 * Thin facade that delegates personal workload operations to
 * WorkloadPersonalService and aggregate operations to
 * WorkloadAggregateService. Keeps the public API identical
 * for all callers (controllers, board-report service, tests).
 */
@Injectable()
export class WorkloadComputeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataService: WorkloadDataService,
    private readonly metricsService: WorkloadMetricsService,
    private readonly personalService: WorkloadPersonalService,
    private readonly aggregateService: WorkloadAggregateService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Personal (D2) — delegated to WorkloadPersonalService
  // ═══════════════════════════════════════════════════════════════════════════

  async getPersonalWorkloadSummary(
    tenantId: string,
    staffProfileId: string,
  ): Promise<PersonalWorkloadSummary> {
    return this.personalService.getPersonalWorkloadSummary(tenantId, staffProfileId);
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
    return this.personalService.getPersonalCoverHistory(tenantId, staffProfileId, page, pageSize);
  }

  async getPersonalTimetableQuality(
    tenantId: string,
    staffProfileId: string,
  ): Promise<PersonalTimetableQuality> {
    return this.personalService.getPersonalTimetableQuality(tenantId, staffProfileId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Aggregate (D3) — delegated to WorkloadAggregateService
  // ═══════════════════════════════════════════════════════════════════════════

  async getAggregateWorkloadSummary(tenantId: string): Promise<AggregateWorkloadSummary> {
    return this.aggregateService.getAggregateWorkloadSummary(tenantId);
  }

  async getCoverFairness(tenantId: string): Promise<CoverFairnessResult> {
    return this.aggregateService.getCoverFairness(tenantId);
  }

  async getAggregateTimetableQuality(tenantId: string): Promise<AggregateTimetableQuality> {
    return this.aggregateService.getAggregateTimetableQuality(tenantId);
  }

  async getAbsenceTrends(tenantId: string): Promise<AbsenceTrends> {
    return this.aggregateService.getAbsenceTrends(tenantId);
  }

  async getSubstitutionPressure(tenantId: string): Promise<SubstitutionPressure> {
    return this.aggregateService.getSubstitutionPressure(tenantId);
  }

  async getCorrelation(tenantId: string): Promise<CorrelationResult> {
    return this.aggregateService.getCorrelation(tenantId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Bulk (cron caching) — delegated to WorkloadAggregateService
  // ═══════════════════════════════════════════════════════════════════════════

  async computeAllAggregateMetrics(tenantId: string): Promise<AllAggregateMetrics> {
    return this.aggregateService.computeAllAggregateMetrics(tenantId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers (board report) — delegated to WorkloadAggregateService
  // ═══════════════════════════════════════════════════════════════════════════

  async getSchoolAverageCovers(tenantId: string): Promise<number> {
    return this.aggregateService.getSchoolAverageCovers(tenantId);
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
