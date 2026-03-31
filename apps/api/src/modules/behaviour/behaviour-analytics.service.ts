import { Injectable } from '@nestjs/common';
import type {
  BehaviourAnalyticsQuery,
  BenchmarkQuery,
  BenchmarkResult,
  CategoryResult,
  ClassComparisonResult,
  ComparisonResult,
  CsvExportQuery,
  HeatmapResult,
  InterventionOutcomeResult,
  OverviewResult,
  PolicyEffectivenessResult,
  RatioResult,
  SanctionSummaryResult,
  StaffResult,
  SubjectResult,
  TaskCompletionResult,
  TeacherAnalyticsResult,
  TrendResult,
} from '@school/shared';

import { BehaviourComparisonAnalyticsService } from './behaviour-comparison-analytics.service';
import { BehaviourExportAnalyticsService } from './behaviour-export-analytics.service';
import { BehaviourIncidentAnalyticsService } from './behaviour-incident-analytics.service';
import { BehaviourSanctionAnalyticsService } from './behaviour-sanction-analytics.service';
import { BehaviourStaffAnalyticsService } from './behaviour-staff-analytics.service';

/**
 * Thin delegate that preserves the public API surface for controllers and
 * other consumers. Each method forwards to the appropriate sub-service.
 */
@Injectable()
export class BehaviourAnalyticsService {
  constructor(
    private readonly incidentAnalytics: BehaviourIncidentAnalyticsService,
    private readonly comparisonAnalytics: BehaviourComparisonAnalyticsService,
    private readonly staffAnalytics: BehaviourStaffAnalyticsService,
    private readonly sanctionAnalytics: BehaviourSanctionAnalyticsService,
    private readonly exportAnalytics: BehaviourExportAnalyticsService,
  ) {}

  // ─── Incident Analytics ────────────────────────────────────────────────────

  getOverview(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<OverviewResult> {
    return this.incidentAnalytics.getOverview(tenantId, userId, permissions, query);
  }

  getHeatmap(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<HeatmapResult> {
    return this.incidentAnalytics.getHeatmap(tenantId, userId, permissions, query);
  }

  getHistoricalHeatmap(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<HeatmapResult> {
    return this.incidentAnalytics.getHistoricalHeatmap(tenantId, userId, permissions, query);
  }

  getTrends(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<TrendResult> {
    return this.incidentAnalytics.getTrends(tenantId, userId, permissions, query);
  }

  getCategories(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<CategoryResult> {
    return this.incidentAnalytics.getCategories(tenantId, userId, permissions, query);
  }

  getSubjects(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<SubjectResult> {
    return this.incidentAnalytics.getSubjects(tenantId, userId, permissions, query);
  }

  // ─── Comparison Analytics ──────────────────────────────────────────────────

  getRatio(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<RatioResult> {
    return this.comparisonAnalytics.getRatio(tenantId, userId, permissions, query);
  }

  getComparisons(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<ComparisonResult> {
    return this.comparisonAnalytics.getComparisons(tenantId, userId, permissions, query);
  }

  getClassComparisons(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<ClassComparisonResult> {
    return this.comparisonAnalytics.getClassComparisons(tenantId, userId, permissions, query);
  }

  // ─── Staff & Teacher Analytics ─────────────────────────────────────────────

  getStaffActivity(tenantId: string, query: BehaviourAnalyticsQuery): Promise<StaffResult> {
    return this.staffAnalytics.getStaffActivity(tenantId, query);
  }

  getTeacherAnalytics(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<TeacherAnalyticsResult> {
    return this.staffAnalytics.getTeacherAnalytics(tenantId, query);
  }

  // ─── Sanction & Policy Analytics ───────────────────────────────────────────

  getSanctions(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<SanctionSummaryResult> {
    return this.sanctionAnalytics.getSanctions(tenantId, userId, permissions, query);
  }

  getInterventionOutcomes(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<InterventionOutcomeResult> {
    return this.sanctionAnalytics.getInterventionOutcomes(tenantId, query);
  }

  getPolicyEffectiveness(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<PolicyEffectivenessResult> {
    return this.sanctionAnalytics.getPolicyEffectiveness(tenantId, query);
  }

  getTaskCompletion(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<TaskCompletionResult> {
    return this.sanctionAnalytics.getTaskCompletion(tenantId, query);
  }

  getBenchmarks(tenantId: string, query: BenchmarkQuery): Promise<BenchmarkResult> {
    return this.sanctionAnalytics.getBenchmarks(tenantId, query);
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  exportCsv(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: CsvExportQuery,
  ): Promise<{ content: string; filename: string }> {
    return this.exportAnalytics.exportCsv(tenantId, userId, permissions, query);
  }
}
