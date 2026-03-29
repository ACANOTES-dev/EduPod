import { Injectable } from '@nestjs/common';
import type { SignalResult } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';

import { buildSignal } from './collector-utils';

// ─── Constants ──────────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 30;
const WEEKS_TO_TRACK = 4;

// ─── Internal Helpers ───────────────────────────────────────────────────────

interface AttendanceSummaryRow {
  id: string;
  tenant_id: string;
  student_id: string;
  summary_date: Date;
  derived_status: string;
  derived_payload: unknown;
}

interface PatternAlertRow {
  id: string;
  tenant_id: string;
  student_id: string;
  alert_type: string;
  detected_date: Date;
  window_start: Date;
  window_end: Date;
  details_json: Record<string, unknown>;
  status: string;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Compute the Monday-to-Friday weekly attendance rates for the last N weeks.
 * Returns rates in chronological order (oldest week first).
 */
function computeWeeklyRates(
  summaries: AttendanceSummaryRow[],
  weekCount: number,
): number[] {
  const now = new Date();
  const rates: number[] = [];

  for (let w = weekCount - 1; w >= 0; w--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);

    const weekSummaries = summaries.filter((s) => {
      const d = new Date(s.summary_date);
      return d >= weekStart && d <= weekEnd && !isWeekend(d);
    });

    if (weekSummaries.length === 0) {
      rates.push(100);
      continue;
    }

    const attended = weekSummaries.filter(
      (s) => s.derived_status === 'present' || s.derived_status === 'late',
    ).length;
    const rate = Math.round((attended / weekSummaries.length) * 100);
    rates.push(rate);
  }

  return rates;
}

// ─── Collector ──────────────────────────────────────────────────────────────

@Injectable()
export class AttendanceSignalCollector {
  constructor(private readonly prisma: PrismaService) {}

  async collectSignals(
    tenantId: string,
    studentId: string,
    _academicYearId: string,
  ): Promise<SignalResult> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - LOOKBACK_DAYS);

    // Fetch both queries in parallel — single DB round-trip batch
    const [summaries, patternAlerts] = await Promise.all([
      this.prisma.dailyAttendanceSummary.findMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          summary_date: { gte: thirtyDaysAgo },
        },
        orderBy: { summary_date: 'desc' },
      }) as Promise<AttendanceSummaryRow[]>,

      this.prisma.attendancePatternAlert.findMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          status: 'active',
        },
      }) as Promise<PatternAlertRow[]>,
    ]);

    const result: SignalResult = {
      domain: 'attendance',
      rawScore: 0,
      signals: [],
      summaryFragments: [],
    };

    if (summaries.length === 0 && patternAlerts.length === 0) {
      return result;
    }

    // ─── Signal 1: attendance_rate_decline ─────────────────────────────────
    this.checkAttendanceRateDecline(summaries, result);

    // ─── Signal 2: consecutive_absences ───────────────────────────────────
    this.checkConsecutiveAbsences(summaries, result);

    // ─── Signal 3: recurring_day_pattern ──────────────────────────────────
    this.checkRecurringDayPattern(patternAlerts, result);

    // ─── Signal 4: chronic_tardiness ──────────────────────────────────────
    this.checkChronicTardiness(summaries, patternAlerts, result);

    // ─── Signal 5: attendance_trajectory ──────────────────────────────────
    this.checkAttendanceTrajectory(summaries, result);

    // Cap rawScore at 100
    result.rawScore = Math.min(
      100,
      result.signals.reduce((sum, s) => sum + s.scoreContribution, 0),
    );

    // Collect summary fragments
    result.summaryFragments = result.signals.map((s) => s.summaryFragment);

    return result;
  }

  // ─── Signal 1: attendance_rate_decline ──────────────────────────────────────

  private checkAttendanceRateDecline(
    summaries: AttendanceSummaryRow[],
    result: SignalResult,
  ): void {
    if (summaries.length === 0) return;

    const schoolDays = summaries.filter(
      (s) => !isWeekend(new Date(s.summary_date)),
    );
    if (schoolDays.length === 0) return;

    const attendedDays = schoolDays.filter(
      (s) => s.derived_status === 'present' || s.derived_status === 'late',
    ).length;
    const absentDays = schoolDays.length - attendedDays;
    const rate = Math.round((attendedDays / schoolDays.length) * 100);

    if (rate >= 90) return;

    let scoreContribution: number;
    if (rate >= 80) {
      scoreContribution = 10;
    } else if (rate >= 70) {
      scoreContribution = 20;
    } else {
      scoreContribution = 30;
    }

    // Source entity: most recent absent day
    const mostRecentAbsent = summaries.find(
      (s) => s.derived_status === 'absent',
    );
    const firstSummary = summaries[0];
    if (!firstSummary) return;
    const sourceId = mostRecentAbsent?.id ?? firstSummary.id;

    result.signals.push(
      buildSignal({
        signalType: 'attendance_rate_decline',
        scoreContribution,
        details: { rate, absentDays, totalDays: schoolDays.length },
        sourceEntityType: 'DailyAttendanceSummary',
        sourceEntityId: sourceId,
        summaryFragment: `Attendance rate ${rate}% over the last 30 days (${absentDays} absences)`,
      }),
    );
  }

  // ─── Signal 2: consecutive_absences ─────────────────────────────────────────

  private checkConsecutiveAbsences(
    summaries: AttendanceSummaryRow[],
    result: SignalResult,
  ): void {
    if (summaries.length === 0) return;

    // Summaries are ordered DESC by date — walk backward from most recent
    const schoolDaySummaries = summaries
      .filter((s) => !isWeekend(new Date(s.summary_date)))
      .sort(
        (a, b) =>
          new Date(b.summary_date).getTime() -
          new Date(a.summary_date).getTime(),
      );

    let consecutiveCount = 0;
    let streakEnd: Date | null = null;
    let streakStart: Date | null = null;
    let firstAbsentId: string | null = null;

    for (const summary of schoolDaySummaries) {
      if (summary.derived_status === 'absent') {
        consecutiveCount++;
        if (!streakEnd) {
          streakEnd = new Date(summary.summary_date);
        }
        streakStart = new Date(summary.summary_date);
        firstAbsentId = summary.id;
      } else {
        break;
      }
    }

    if (consecutiveCount < 3) return;

    let scoreContribution: number;
    if (consecutiveCount === 3) {
      scoreContribution = 15;
    } else if (consecutiveCount === 4) {
      scoreContribution = 20;
    } else {
      scoreContribution = 25;
    }

    const startDate = formatDate(streakStart!);
    const endDate = formatDate(streakEnd!);

    result.signals.push(
      buildSignal({
        signalType: 'consecutive_absences',
        scoreContribution,
        details: {
          consecutiveCount,
          startDate,
          endDate,
        },
        sourceEntityType: 'DailyAttendanceSummary',
        sourceEntityId: firstAbsentId!,
        summaryFragment: `Absent ${consecutiveCount} consecutive school days (${startDate}\u2013${endDate})`,
      }),
    );
  }

  // ─── Signal 3: recurring_day_pattern ────────────────────────────────────────

  private checkRecurringDayPattern(
    patternAlerts: PatternAlertRow[],
    result: SignalResult,
  ): void {
    const recurringAlerts = patternAlerts.filter(
      (a) => a.alert_type === 'recurring_day' && a.status === 'active',
    );

    if (recurringAlerts.length === 0) return;

    const scoreContribution = recurringAlerts.length >= 2 ? 20 : 10;

    // Use the first alert for source entity and details
    const primaryAlert = recurringAlerts[0];
    if (!primaryAlert) return;
    const details = primaryAlert.details_json as Record<string, unknown>;
    const dayName = (details.day_name as string) ?? 'Unknown';
    const count = (details.count as number) ?? 0;

    result.signals.push(
      buildSignal({
        signalType: 'recurring_day_pattern',
        scoreContribution,
        details: {
          alertCount: recurringAlerts.length,
          dayName,
          count,
        },
        sourceEntityType: 'AttendancePatternAlert',
        sourceEntityId: primaryAlert.id,
        summaryFragment: `Recurring absences on ${dayName}s (${count} of last 4 weeks)`,
      }),
    );
  }

  // ─── Signal 4: chronic_tardiness ────────────────────────────────────────────

  private checkChronicTardiness(
    summaries: AttendanceSummaryRow[],
    patternAlerts: PatternAlertRow[],
    result: SignalResult,
  ): void {
    // Rate-based tardiness score
    const schoolDays = summaries.filter(
      (s) => !isWeekend(new Date(s.summary_date)),
    );
    const attendedDays = schoolDays.filter(
      (s) => s.derived_status === 'present' || s.derived_status === 'late',
    );
    const lateDays = schoolDays.filter(
      (s) => s.derived_status === 'late',
    );

    let rateScore = 0;
    let lateRate = 0;

    if (attendedDays.length > 0) {
      lateRate = Math.round((lateDays.length / attendedDays.length) * 100);

      if (lateRate > 50) {
        rateScore = 15;
      } else if (lateRate >= 30) {
        rateScore = 10;
      } else if (lateRate > 20) {
        rateScore = 5;
      }
    }

    // Pattern alert-based tardiness score
    const tardinessAlerts = patternAlerts.filter(
      (a) => a.alert_type === 'chronic_tardiness' && a.status === 'active',
    );
    const alertScore = tardinessAlerts.length > 0 ? 10 : 0;

    // Use the higher of the two scores
    const scoreContribution = Math.max(rateScore, alertScore);
    if (scoreContribution === 0) return;

    // Determine source entity: prefer the most recent late summary, fall back to pattern alert
    let sourceEntityType: string;
    let sourceEntityId: string;

    const mostRecentLate = summaries.find((s) => s.derived_status === 'late');
    const firstTardinessAlert = tardinessAlerts[0];
    const firstSummaryFallback = summaries[0];

    if (mostRecentLate) {
      sourceEntityType = 'DailyAttendanceSummary';
      sourceEntityId = mostRecentLate.id;
    } else if (firstTardinessAlert) {
      sourceEntityType = 'AttendancePatternAlert';
      sourceEntityId = firstTardinessAlert.id;
    } else if (firstSummaryFallback) {
      sourceEntityType = 'DailyAttendanceSummary';
      sourceEntityId = firstSummaryFallback.id;
    } else {
      return;
    }

    result.signals.push(
      buildSignal({
        signalType: 'chronic_tardiness',
        scoreContribution,
        details: {
          lateDays: lateDays.length,
          attendedDays: attendedDays.length,
          lateRate,
          hasPatternAlert: tardinessAlerts.length > 0,
        },
        sourceEntityType,
        sourceEntityId,
        summaryFragment: `Late ${lateDays.length} of ${attendedDays.length} attended days (${lateRate}%)`,
      }),
    );
  }

  // ─── Signal 5: attendance_trajectory ────────────────────────────────────────

  private checkAttendanceTrajectory(
    summaries: AttendanceSummaryRow[],
    result: SignalResult,
  ): void {
    if (summaries.length === 0) return;

    const weekRates = computeWeeklyRates(summaries, WEEKS_TO_TRACK);

    // Count consecutive declining transitions. With N data points, max = N-1 transitions.
    // "3 weeks declining" = 2 transitions (rates decreased in 2 consecutive pairs).
    // "4 weeks declining" = 3 transitions (rates decreased in 3 consecutive pairs).
    let consecutiveDeclines = 0;
    for (let i = 1; i < weekRates.length; i++) {
      const current = weekRates[i];
      const previous = weekRates[i - 1];
      if (current !== undefined && previous !== undefined && current < previous) {
        consecutiveDeclines++;
      } else {
        consecutiveDeclines = 0;
      }
    }

    // weeksDecline = number of weeks involved = transitions + 1
    const weeksDecline = consecutiveDeclines > 0 ? consecutiveDeclines + 1 : 0;

    if (weeksDecline < 3) return;

    const scoreContribution = weeksDecline >= 4 ? 20 : 10;

    // Source entity: most recent summary
    const mostRecent = summaries[0];
    if (!mostRecent) return;

    result.signals.push(
      buildSignal({
        signalType: 'attendance_trajectory',
        scoreContribution,
        details: {
          weeksDecline,
          weekRates,
        },
        sourceEntityType: 'DailyAttendanceSummary',
        sourceEntityId: mostRecent.id,
        summaryFragment: `Attendance declining ${weeksDecline} consecutive weeks: ${weekRates.join(' \u2192 ')}%`,
      }),
    );
  }
}
