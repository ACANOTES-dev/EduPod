import { Injectable } from '@nestjs/common';

import type { AnalyticsFilters, LoadFilters } from './homework-analytics.helpers';
import { HomeworkCompletionAnalyticsService } from './homework-completion-analytics.service';
import { HomeworkLoadAnalyticsService } from './homework-load-analytics.service';
import { HomeworkStudentAnalyticsService } from './homework-student-analytics.service';

// ─── Facade ──────────────────────────────────────────────────────────────────

/**
 * Thin facade that preserves the public API consumed by HomeworkAnalyticsController.
 * All logic lives in the three sub-services.
 */
@Injectable()
export class HomeworkAnalyticsService {
  constructor(
    private readonly completionAnalytics: HomeworkCompletionAnalyticsService,
    private readonly loadAnalytics: HomeworkLoadAnalyticsService,
    private readonly studentAnalytics: HomeworkStudentAnalyticsService,
  ) {}

  // ─── Completion Analytics ──────────────────────────────────────────────────

  /** Per-class (and optionally per-subject) completion rates. */
  completionRates(tenantId: string, filters: AnalyticsFilters) {
    return this.completionAnalytics.completionRates(tenantId, filters);
  }

  /** Homework volume, completion rates, type breakdown and student rankings for a class. */
  classPatterns(tenantId: string, classId: string, filters: AnalyticsFilters) {
    return this.completionAnalytics.classPatterns(tenantId, classId, filters);
  }

  /** Cross-class analytics for a single subject. */
  subjectTrends(tenantId: string, subjectId: string, filters: AnalyticsFilters) {
    return this.completionAnalytics.subjectTrends(tenantId, subjectId, filters);
  }

  /** Homework setting patterns for a specific teacher. */
  teacherPatterns(tenantId: string, staffId: string, filters: AnalyticsFilters) {
    return this.completionAnalytics.teacherPatterns(tenantId, staffId, filters);
  }

  /** Aggregate homework analytics across all classes in a year group. */
  yearGroupOverview(tenantId: string, yearGroupId: string, filters: AnalyticsFilters) {
    return this.completionAnalytics.yearGroupOverview(tenantId, yearGroupId, filters);
  }

  // ─── Load Analytics ────────────────────────────────────────────────────────

  /** Cross-subject load analysis per class per week. */
  loadAnalysis(tenantId: string, filters: LoadFilters) {
    return this.loadAnalytics.loadAnalysis(tenantId, filters);
  }

  /** Assignment counts by date and day of week for heatmap rendering. */
  dailyLoadHeatmap(tenantId: string, filters: AnalyticsFilters) {
    return this.loadAnalytics.dailyLoadHeatmap(tenantId, filters);
  }

  // ─── Student Analytics ─────────────────────────────────────────────────────

  /** Individual student homework trends with per-subject breakdown. */
  studentTrends(tenantId: string, studentId: string, filters: AnalyticsFilters) {
    return this.studentAnalytics.studentTrends(tenantId, studentId, filters);
  }

  /** Students with completion rate below 50% across 3+ assignments. */
  nonCompleters(tenantId: string, filters: AnalyticsFilters) {
    return this.studentAnalytics.nonCompleters(tenantId, filters);
  }

  /** Students grouped by completion rate buckets with average points. */
  correlationAnalysis(tenantId: string, filters: AnalyticsFilters) {
    return this.studentAnalytics.correlationAnalysis(tenantId, filters);
  }
}
