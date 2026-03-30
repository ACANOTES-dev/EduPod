import { Injectable } from '@nestjs/common';

import type { ScheduleRow } from './workload-data.service';

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Pure metric computation — timetable quality, statistical helpers, and scoring.
 * All methods are stateless and operate on pre-fetched data.
 */
@Injectable()
export class WorkloadMetricsService {
  // ═══════════════════════════════════════════════════════════════════════════
  // Gini coefficient
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Timetable quality
  // ═══════════════════════════════════════════════════════════════════════════

  /** Compute timetable quality composite score from schedule data */
  static computeTimetableCompositeScore(schedules: ScheduleRow[]): number {
    if (schedules.length === 0) return 100;

    // Free distribution score (30%)
    const freeScore = WorkloadMetricsService.computeFreeDistributionScore(schedules);

    // Consecutive periods score (30%)
    const consec = WorkloadMetricsService.computeConsecutivePeriods(schedules);
    const consecutiveScore =
      consec.max <= 2 ? 100 : consec.max === 3 ? 80 : consec.max === 4 ? 50 : 0;

    // Split timetable score (20%)
    const splitScore = WorkloadMetricsService.computeSplitScore(schedules);

    // Room changes score (20%)
    const rc = WorkloadMetricsService.computeRoomChanges(schedules);
    const roomScore = Math.max(0, 100 - rc.average * 25);

    const composite = freeScore * 0.3 + consecutiveScore * 0.3 + splitScore * 0.2 + roomScore * 0.2;

    return WorkloadMetricsService.round2(Math.max(0, Math.min(100, composite)));
  }

  /** Quality label from composite score */
  static qualityLabel(score: number): 'Good' | 'Moderate' | 'Needs attention' {
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
      const order = s.schedule_period_template?.period_order ?? s.period_order ?? 0;
      if (!assignedByDay.has(s.weekday)) {
        assignedByDay.set(s.weekday, new Set());
      }
      assignedByDay.get(s.weekday)?.add(order);
    }

    // For each active weekday, free = template slots - assigned slots
    const result: { weekday: number; free_count: number }[] = [];
    const weekdays = new Set([...templatesByDay.keys(), ...assignedByDay.keys()]);
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
  static scoreFreeDistribution(distribution: { weekday: number; free_count: number }[]): number {
    if (distribution.length === 0) return 100;
    const counts = distribution.map((d) => d.free_count);
    const avg = WorkloadMetricsService.mean(counts);
    if (avg === 0) return 50; // no free periods = moderate

    const stddev = Math.sqrt(counts.reduce((sum, c) => sum + (c - avg) ** 2, 0) / counts.length);

    // Normalise: stddev of 0 = perfect (100), stddev >= avg = bad (0)
    const normalised = Math.max(0, 1 - stddev / Math.max(avg, 1));
    return WorkloadMetricsService.round2(normalised * 100);
  }

  /** Compute consecutive period metrics */
  static computeConsecutivePeriods(schedules: ScheduleRow[]): { max: number; average: number } {
    // Group by weekday
    const byDay = new Map<number, number[]>();
    for (const s of schedules) {
      const order = s.schedule_period_template?.period_order ?? s.period_order ?? 0;
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
      average: WorkloadMetricsService.round2(WorkloadMetricsService.mean(dayMaxes)),
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
      templateCountByDay.set(t.weekday, (templateCountByDay.get(t.weekday) ?? 0) + 1);
    }

    // Group assigned period orders by weekday
    const byDay = new Map<number, number[]>();
    for (const s of schedules) {
      const order = s.schedule_period_template?.period_order ?? s.period_order ?? 0;
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
  static computeRoomChanges(schedules: ScheduleRow[]): { average: number; max: number } {
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
      average: WorkloadMetricsService.round2(WorkloadMetricsService.mean(changes)),
      max: changes.length > 0 ? Math.max(...changes) : 0,
    };
  }

  /** Substitution pressure assessment from composite score */
  static pressureAssessment(score: number): 'Low' | 'Moderate' | 'High' | 'Critical' {
    if (score < 0.25) return 'Low';
    if (score < 0.5) return 'Moderate';
    if (score < 0.75) return 'High';
    return 'Critical';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Statistical utilities
  // ═══════════════════════════════════════════════════════════════════════════

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
      return WorkloadMetricsService.round2(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
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
      p25: WorkloadMetricsService.percentile(sorted, 25),
      p50: WorkloadMetricsService.percentile(sorted, 50),
      p75: WorkloadMetricsService.percentile(sorted, 75),
    };
  }

  private static percentile(sorted: number[], pct: number): number {
    const idx = (pct / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower] ?? 0;
    const frac = idx - lower;
    return WorkloadMetricsService.round2(
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
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  }

  /** Add months to a date and return ISO date string */
  static addMonths(date: Date, months: number): string {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result.toISOString().slice(0, 10);
  }

  // ─── Private static utilities ──────────────────────────────────────────────

  private static computeFreeDistributionScore(schedules: ScheduleRow[]): number {
    // Count teaching periods per weekday
    const countsByDay = new Map<number, number>();
    for (const s of schedules) {
      if (s.schedule_period_template?.schedule_period_type === 'teaching') {
        countsByDay.set(s.weekday, (countsByDay.get(s.weekday) ?? 0) + 1);
      }
    }

    const counts = Array.from(countsByDay.values());
    if (counts.length <= 1) return 100;

    const avg = WorkloadMetricsService.mean(counts);
    const stddev = Math.sqrt(counts.reduce((sum, c) => sum + (c - avg) ** 2, 0) / counts.length);

    // Normalise: lower stddev = more even distribution = higher score
    const maxExpectedStddev = avg; // worst case
    const normalised = maxExpectedStddev > 0 ? Math.max(0, 1 - stddev / maxExpectedStddev) : 1;

    return WorkloadMetricsService.round2(normalised * 100);
  }

  private static computeSplitScore(schedules: ScheduleRow[]): number {
    const byDay = new Map<number, number[]>();
    for (const s of schedules) {
      const order = s.schedule_period_template?.period_order ?? s.period_order ?? 0;
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
    return WorkloadMetricsService.round2((1 - splitDays / totalDays) * 100);
  }
}
