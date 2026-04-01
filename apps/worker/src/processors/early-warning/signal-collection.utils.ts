import { PrismaClient } from '@prisma/client';

import type { DetectedSignal, SignalResult, SignalSeverity } from '@school/shared';

/**
 * Signal collection utilities for the worker.
 *
 * The collector classes live in apps/api/ and cannot be imported directly
 * into the worker app. This module re-implements the signal collection
 * queries inline using the raw PrismaClient available in job transactions.
 *
 * The logic mirrors the 5 API collectors exactly:
 *   - AttendanceSignalCollector
 *   - GradesSignalCollector
 *   - BehaviourSignalCollector
 *   - WellbeingSignalCollector
 *   - EngagementSignalCollector
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const ATTENDANCE_LOOKBACK_DAYS = 30;
const ATTENDANCE_WEEKS_TO_TRACK = 4;
const BEHAVIOUR_INCIDENT_LOOKBACK_DAYS = 14;
const BEHAVIOUR_SEVERITY_LOOKBACK_DAYS = 30;
const WELLBEING_CHECKIN_LOOKBACK_DAYS = 30;
const WELLBEING_CONCERN_LOOKBACK_DAYS = 90;
const ENGAGEMENT_LOOKBACK_DAYS = 30;
const ENGAGEMENT_WEEKS_TO_TRACK = 4;

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

// ─── Shared Helpers ─────────────────────────────────────────────────────────

function mapSeverity(score: number): SignalSeverity {
  if (score <= 10) return 'low';
  if (score <= 20) return 'medium';
  if (score <= 30) return 'high';
  return 'critical';
}

function buildSignal(params: {
  signalType: string;
  scoreContribution: number;
  details: Record<string, unknown>;
  sourceEntityType: string;
  sourceEntityId: string;
  summaryFragment: string;
}): DetectedSignal {
  return { ...params, severity: mapSeverity(params.scoreContribution) };
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

function toDecimalNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value !== null && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Collects signals from all 5 domains for a single student.
 * Returns an array of 5 SignalResult objects (one per domain).
 */
export async function collectAllSignals(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
  academicYearId: string,
): Promise<SignalResult[]> {
  const [attendance, grades, behaviour, wellbeing, engagement] = await Promise.all([
    collectAttendanceSignals(tx, tenantId, studentId),
    collectGradesSignals(tx, tenantId, studentId, academicYearId),
    collectBehaviourSignals(tx, tenantId, studentId, academicYearId),
    collectWellbeingSignals(tx, tenantId, studentId),
    collectEngagementSignals(tx, tenantId, studentId, academicYearId),
  ]);

  return [attendance, grades, behaviour, wellbeing, engagement];
}

// ─── Attendance Signals ─────────────────────────────────────────────────────

interface AttendanceSummaryRow {
  id: string;
  summary_date: Date;
  derived_status: string;
}

interface PatternAlertRow {
  id: string;
  alert_type: string;
  status: string;
  details_json: Record<string, unknown>;
}

async function collectAttendanceSignals(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
): Promise<SignalResult> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - ATTENDANCE_LOOKBACK_DAYS);

  const [summaries, patternAlerts] = await Promise.all([
    tx.dailyAttendanceSummary.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        summary_date: { gte: thirtyDaysAgo },
      },
      orderBy: { summary_date: 'desc' },
      select: { id: true, summary_date: true, derived_status: true },
    }) as Promise<AttendanceSummaryRow[]>,

    tx.attendancePatternAlert.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
      },
      select: { id: true, alert_type: true, status: true, details_json: true },
    }) as Promise<PatternAlertRow[]>,
  ]);

  const result: SignalResult = {
    domain: 'attendance',
    rawScore: 0,
    signals: [],
    summaryFragments: [],
  };
  if (summaries.length === 0 && patternAlerts.length === 0) return result;

  // Signal 1: attendance_rate_decline
  checkAttendanceRateDecline(summaries, result);
  // Signal 2: consecutive_absences
  checkConsecutiveAbsences(summaries, result);
  // Signal 3: recurring_day_pattern
  checkRecurringDayPattern(patternAlerts, result);
  // Signal 4: chronic_tardiness
  checkChronicTardiness(summaries, patternAlerts, result);
  // Signal 5: attendance_trajectory
  checkAttendanceTrajectory(summaries, result);

  result.rawScore = Math.min(
    100,
    result.signals.reduce((sum, s) => sum + s.scoreContribution, 0),
  );
  result.summaryFragments = result.signals.map((s) => s.summaryFragment);
  return result;
}

function checkAttendanceRateDecline(summaries: AttendanceSummaryRow[], result: SignalResult): void {
  const schoolDays = summaries.filter((s) => !isWeekend(new Date(s.summary_date)));
  if (schoolDays.length === 0) return;

  const attendedDays = schoolDays.filter(
    (s) => s.derived_status === 'present' || s.derived_status === 'late',
  ).length;
  const absentDays = schoolDays.length - attendedDays;
  const rate = Math.round((attendedDays / schoolDays.length) * 100);
  if (rate >= 90) return;

  const scoreContribution = rate >= 80 ? 10 : rate >= 70 ? 20 : 30;
  const mostRecentAbsent = summaries.find((s) => s.derived_status === 'absent');
  const firstSummary = summaries[0];
  if (!firstSummary) return;

  result.signals.push(
    buildSignal({
      signalType: 'attendance_rate_decline',
      scoreContribution,
      details: { rate, absentDays, totalDays: schoolDays.length },
      sourceEntityType: 'DailyAttendanceSummary',
      sourceEntityId: mostRecentAbsent?.id ?? firstSummary.id,
      summaryFragment: `Attendance rate ${rate}% over the last 30 days (${absentDays} absences)`,
    }),
  );
}

function checkConsecutiveAbsences(summaries: AttendanceSummaryRow[], result: SignalResult): void {
  if (summaries.length === 0) return;

  const schoolDaySummaries = summaries
    .filter((s) => !isWeekend(new Date(s.summary_date)))
    .sort((a, b) => new Date(b.summary_date).getTime() - new Date(a.summary_date).getTime());

  let consecutiveCount = 0;
  let streakEnd: Date | null = null;
  let streakStart: Date | null = null;
  let firstAbsentId: string | null = null;

  for (const summary of schoolDaySummaries) {
    if (summary.derived_status === 'absent') {
      consecutiveCount++;
      if (!streakEnd) streakEnd = new Date(summary.summary_date);
      streakStart = new Date(summary.summary_date);
      firstAbsentId = summary.id;
    } else {
      break;
    }
  }

  if (consecutiveCount < 3) return;

  const scoreContribution = consecutiveCount === 3 ? 15 : consecutiveCount === 4 ? 20 : 25;

  result.signals.push(
    buildSignal({
      signalType: 'consecutive_absences',
      scoreContribution,
      details: {
        consecutiveCount,
        startDate: formatDate(streakStart!),
        endDate: formatDate(streakEnd!),
      },
      sourceEntityType: 'DailyAttendanceSummary',
      sourceEntityId: firstAbsentId!,
      summaryFragment: `Absent ${consecutiveCount} consecutive school days (${formatDate(streakStart!)}\u2013${formatDate(streakEnd!)})`,
    }),
  );
}

function checkRecurringDayPattern(patternAlerts: PatternAlertRow[], result: SignalResult): void {
  const recurringAlerts = patternAlerts.filter(
    (a) => a.alert_type === 'recurring_day' && a.status === 'active',
  );
  if (recurringAlerts.length === 0) return;

  const scoreContribution = recurringAlerts.length >= 2 ? 20 : 10;
  const primaryAlert = recurringAlerts[0];
  if (!primaryAlert) return;
  const details = primaryAlert.details_json;
  const dayName = (details.day_name as string) ?? 'Unknown';
  const count = (details.count as number) ?? 0;

  result.signals.push(
    buildSignal({
      signalType: 'recurring_day_pattern',
      scoreContribution,
      details: { alertCount: recurringAlerts.length, dayName, count },
      sourceEntityType: 'AttendancePatternAlert',
      sourceEntityId: primaryAlert.id,
      summaryFragment: `Recurring absences on ${dayName}s (${count} of last 4 weeks)`,
    }),
  );
}

function checkChronicTardiness(
  summaries: AttendanceSummaryRow[],
  patternAlerts: PatternAlertRow[],
  result: SignalResult,
): void {
  const schoolDays = summaries.filter((s) => !isWeekend(new Date(s.summary_date)));
  const attendedDays = schoolDays.filter(
    (s) => s.derived_status === 'present' || s.derived_status === 'late',
  );
  const lateDays = schoolDays.filter((s) => s.derived_status === 'late');

  let rateScore = 0;
  let lateRate = 0;
  if (attendedDays.length > 0) {
    lateRate = Math.round((lateDays.length / attendedDays.length) * 100);
    if (lateRate > 50) rateScore = 15;
    else if (lateRate >= 30) rateScore = 10;
    else if (lateRate > 20) rateScore = 5;
  }

  const tardinessAlerts = patternAlerts.filter(
    (a) => a.alert_type === 'chronic_tardiness' && a.status === 'active',
  );
  const alertScore = tardinessAlerts.length > 0 ? 10 : 0;
  const scoreContribution = Math.max(rateScore, alertScore);
  if (scoreContribution === 0) return;

  const mostRecentLate = summaries.find((s) => s.derived_status === 'late');
  const firstTardinessAlert = tardinessAlerts[0];
  const firstSummaryFallback = summaries[0];

  let sourceEntityType: string;
  let sourceEntityId: string;
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

function checkAttendanceTrajectory(summaries: AttendanceSummaryRow[], result: SignalResult): void {
  if (summaries.length === 0) return;

  const weekRates = computeWeeklyAttendanceRates(summaries, ATTENDANCE_WEEKS_TO_TRACK);
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

  const weeksDecline = consecutiveDeclines > 0 ? consecutiveDeclines + 1 : 0;
  if (weeksDecline < 3) return;

  const scoreContribution = weeksDecline >= 4 ? 20 : 10;
  const mostRecent = summaries[0];
  if (!mostRecent) return;

  result.signals.push(
    buildSignal({
      signalType: 'attendance_trajectory',
      scoreContribution,
      details: { weeksDecline, weekRates },
      sourceEntityType: 'DailyAttendanceSummary',
      sourceEntityId: mostRecent.id,
      summaryFragment: `Attendance declining ${weeksDecline} consecutive weeks: ${weekRates.join(' \u2192 ')}%`,
    }),
  );
}

function computeWeeklyAttendanceRates(
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
    rates.push(Math.round((attended / weekSummaries.length) * 100));
  }

  return rates;
}

// ─── Grades Signals ─────────────────────────────────────────────────────────

const ALERT_TYPE_SCORES: Record<string, number> = {
  at_risk_low: 10,
  at_risk_medium: 20,
  at_risk_high: 30,
};

async function collectGradesSignals(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
  academicYearId: string,
): Promise<SignalResult> {
  const signals: DetectedSignal[] = [];

  const [riskAlerts, snapshots, missingGrades, progressEntries] = await Promise.all([
    tx.studentAcademicRiskAlert.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
        alert_type: { in: ['at_risk_low', 'at_risk_medium', 'at_risk_high', 'score_anomaly'] },
      },
      select: { id: true, alert_type: true, trigger_reason: true, subject_id: true },
    }),
    tx.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_period: { academic_year_id: academicYearId },
      },
      select: {
        id: true,
        subject_id: true,
        academic_period_id: true,
        computed_value: true,
        academic_period: { select: { start_date: true } },
      },
      orderBy: { academic_period: { start_date: 'asc' } },
    }),
    tx.grade.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        is_missing: true,
        assessment: { academic_period: { academic_year_id: academicYearId } },
      },
      select: { id: true },
    }),
    tx.progressReportEntry.findMany({
      where: {
        tenant_id: tenantId,
        trend: 'declining',
        progress_report: {
          student_id: studentId,
          academic_period: { academic_year_id: academicYearId },
        },
      },
      select: { subject_id: true, trend: true },
    }),
  ]);

  // Signal 1: below_class_mean
  const atRiskAlerts = riskAlerts.filter((a) => a.alert_type in ALERT_TYPE_SCORES);
  if (atRiskAlerts.length > 0) {
    let best = atRiskAlerts[0]!;
    let bestScore = ALERT_TYPE_SCORES[best.alert_type] ?? 0;
    for (let i = 1; i < atRiskAlerts.length; i++) {
      const alert = atRiskAlerts[i];
      if (!alert) continue;
      const entryScore = ALERT_TYPE_SCORES[alert.alert_type] ?? 0;
      if (entryScore > bestScore) {
        best = alert;
        bestScore = entryScore;
      }
    }
    signals.push(
      buildSignal({
        signalType: 'below_class_mean',
        scoreContribution: bestScore,
        details: { alertType: best.alert_type, subjectId: best.subject_id },
        sourceEntityType: 'StudentAcademicRiskAlert',
        sourceEntityId: best.id,
        summaryFragment: `Academic risk alert: ${best.trigger_reason}`,
      }),
    );
  }

  // Signals 2 & 5: grade trajectory + multi-subject decline
  const bySubject = new Map<
    string,
    Array<{ id: string; computed_value: unknown; start_date: Date }>
  >();
  for (const s of snapshots) {
    const existing = bySubject.get(s.subject_id) ?? [];
    existing.push({
      id: s.id,
      computed_value: s.computed_value,
      start_date: s.academic_period.start_date,
    });
    bySubject.set(s.subject_id, existing);
  }

  const snapshotDeclining = new Set<string>();
  let biggestDecline = 0;
  let biggestDeclineSnapshotId: string | null = null;

  for (const [subjectId, subjectSnapshots] of bySubject) {
    if (subjectSnapshots.length < 2) continue;
    const prev = subjectSnapshots[subjectSnapshots.length - 2];
    const curr = subjectSnapshots[subjectSnapshots.length - 1];
    if (!prev || !curr) continue;
    const prevVal = toDecimalNumber(prev.computed_value);
    const currVal = toDecimalNumber(curr.computed_value);
    if (currVal < prevVal) {
      snapshotDeclining.add(subjectId);
      const decline = prevVal - currVal;
      if (decline > biggestDecline) {
        biggestDecline = decline;
        biggestDeclineSnapshotId = curr.id;
      }
    }
  }

  const progressDeclining = new Set<string>();
  for (const entry of progressEntries) {
    progressDeclining.add(entry.subject_id);
  }

  const decliningSet =
    progressDeclining.size > snapshotDeclining.size ? progressDeclining : snapshotDeclining;
  const decliningCount = decliningSet.size;
  const sourceSnapId = biggestDeclineSnapshotId ?? snapshots[0]?.id ?? '';

  // Signal 2: grade_trajectory_decline
  if (decliningCount >= 1) {
    const score = decliningCount >= 3 ? 25 : decliningCount === 2 ? 15 : 10;
    signals.push(
      buildSignal({
        signalType: 'grade_trajectory_decline',
        scoreContribution: score,
        details: { decliningSubjectCount: decliningCount, subjectIds: [...decliningSet] },
        sourceEntityType: 'PeriodGradeSnapshot',
        sourceEntityId: sourceSnapId,
        summaryFragment: `Grade declined in ${decliningCount} subject(s) between periods`,
      }),
    );
  }

  // Signal 5: multi_subject_decline
  if (decliningCount >= 3) {
    const score = decliningCount >= 5 ? 30 : decliningCount === 4 ? 20 : 15;
    signals.push(
      buildSignal({
        signalType: 'multi_subject_decline',
        scoreContribution: score,
        details: { decliningSubjectCount: decliningCount, subjectIds: [...decliningSet] },
        sourceEntityType: 'PeriodGradeSnapshot',
        sourceEntityId: sourceSnapId,
        summaryFragment: `Declining grades across ${decliningCount} subjects simultaneously`,
      }),
    );
  }

  // Signal 3: missing_assessments
  const missingCount = missingGrades.length;
  if (missingCount >= 2) {
    const score = missingCount >= 6 ? 20 : missingCount >= 4 ? 15 : 10;
    signals.push(
      buildSignal({
        signalType: 'missing_assessments',
        scoreContribution: score,
        details: { missingCount },
        sourceEntityType: 'Grade',
        sourceEntityId: missingGrades[0]?.id ?? '',
        summaryFragment: `${missingCount} missing assessment(s) in current period`,
      }),
    );
  }

  // Signal 4: score_anomaly
  const anomalyAlerts = riskAlerts.filter((a) => a.alert_type === 'score_anomaly');
  if (anomalyAlerts.length >= 1) {
    const score = anomalyAlerts.length >= 2 ? 25 : 15;
    const first = anomalyAlerts[0]!;
    signals.push(
      buildSignal({
        signalType: 'score_anomaly',
        scoreContribution: score,
        details: { anomalyCount: anomalyAlerts.length, alertType: first.alert_type },
        sourceEntityType: 'StudentAcademicRiskAlert',
        sourceEntityId: first.id,
        summaryFragment: `Score anomaly detected: ${first.trigger_reason}`,
      }),
    );
  }

  const rawScore = Math.min(
    100,
    signals.reduce((sum, s) => sum + s.scoreContribution, 0),
  );
  return {
    domain: 'grades',
    rawScore,
    signals,
    summaryFragments: signals.map((s) => s.summaryFragment),
  };
}

// ─── Behaviour Signals ──────────────────────────────────────────────────────

async function collectBehaviourSignals(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
  academicYearId: string,
): Promise<SignalResult> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - BEHAVIOUR_INCIDENT_LOOKBACK_DAYS);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - BEHAVIOUR_SEVERITY_LOOKBACK_DAYS);

  const [
    incidentParticipants14d,
    incidentParticipants30d,
    sanctions,
    exclusionCases,
    interventions,
  ] = await Promise.all([
    tx.behaviourIncidentParticipant.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        role: 'subject',
        incident: { polarity: 'negative', occurred_at: { gte: fourteenDaysAgo } },
      },
      include: {
        incident: { select: { id: true, polarity: true, severity: true, occurred_at: true } },
      },
      orderBy: { incident: { occurred_at: 'desc' } },
    }),
    tx.behaviourIncidentParticipant.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        role: 'subject',
        incident: { polarity: 'negative', occurred_at: { gte: thirtyDaysAgo } },
      },
      include: {
        incident: { select: { id: true, polarity: true, severity: true, occurred_at: true } },
      },
      orderBy: { incident: { occurred_at: 'desc' } },
    }),
    tx.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['scheduled', 'partially_served'] },
      },
      select: { id: true, type: true, status: true, suspension_start_date: true },
    }),
    tx.behaviourExclusionCase.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        incident: { academic_year_id: academicYearId },
      },
      select: { id: true },
    }),
    tx.behaviourIntervention.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        OR: [
          { status: 'completed_intervention', outcome: { in: ['deteriorated', 'no_change'] } },
          { status: 'abandoned' },
          { status: 'active_intervention', target_end_date: { lt: now } },
        ],
      },
      select: { id: true, status: true, outcome: true },
    }),
  ]);

  const result: SignalResult = {
    domain: 'behaviour',
    rawScore: 0,
    signals: [],
    summaryFragments: [],
  };

  // Signal 1: incident_frequency
  const count14d = incidentParticipants14d.length;
  if (count14d >= 3) {
    const score = count14d <= 4 ? 10 : count14d <= 6 ? 15 : count14d <= 9 ? 20 : 25;
    const source = incidentParticipants14d[0];
    if (source) {
      result.signals.push(
        buildSignal({
          signalType: 'incident_frequency',
          scoreContribution: score,
          details: { count: count14d },
          sourceEntityType: 'BehaviourIncidentParticipant',
          sourceEntityId: source.id,
          summaryFragment: `${count14d} negative behaviour incidents in the last 14 days`,
        }),
      );
    }
  }

  // Signal 2: escalating_severity
  if (incidentParticipants30d.length > 0) {
    const fifteenDaysAgo = new Date(now);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const firstHalf = incidentParticipants30d.filter(
      (p) => new Date(p.incident.occurred_at) < fifteenDaysAgo,
    );
    const secondHalf = incidentParticipants30d.filter(
      (p) => new Date(p.incident.occurred_at) >= fifteenDaysAgo,
    );

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const avgFirst =
        firstHalf.reduce((sum, p) => sum + p.incident.severity, 0) / firstHalf.length;
      const avgSecond =
        secondHalf.reduce((sum, p) => sum + p.incident.severity, 0) / secondHalf.length;
      const increase = avgSecond - avgFirst;

      if (increase >= 1) {
        const score = increase >= 3 ? 20 : 10;
        const sorted = [...secondHalf].sort((a, b) => b.incident.severity - a.incident.severity);
        const source = sorted[0];
        if (source) {
          result.signals.push(
            buildSignal({
              signalType: 'escalating_severity',
              scoreContribution: score,
              details: {
                avgFirst,
                avgSecond,
                increase,
                firstHalfCount: firstHalf.length,
                secondHalfCount: secondHalf.length,
              },
              sourceEntityType: 'BehaviourIncidentParticipant',
              sourceEntityId: source.id,
              summaryFragment: `Incident severity escalating: average ${avgFirst.toFixed(1)} \u2192 ${avgSecond.toFixed(1)} over 30 days`,
            }),
          );
        }
      }
    }
  }

  // Signal 3: active_sanction
  if (sanctions.length > 0) {
    let highestScore = 0;
    let highestSanction = sanctions[0]!;
    for (const sanction of sanctions) {
      const score = sanction.suspension_start_date !== null ? 30 : 15;
      if (score > highestScore) {
        highestScore = score;
        highestSanction = sanction;
      }
    }
    result.signals.push(
      buildSignal({
        signalType: 'active_sanction',
        scoreContribution: highestScore,
        details: {
          type: highestSanction.type,
          status: highestSanction.status,
          isSuspension: highestSanction.suspension_start_date !== null,
        },
        sourceEntityType: 'BehaviourSanction',
        sourceEntityId: highestSanction.id,
        summaryFragment: `Active sanction: ${highestSanction.type} (${highestSanction.status})`,
      }),
    );
  }

  // Signal 4: exclusion_history
  const exclusionCount = exclusionCases.length;
  if (exclusionCount > 0) {
    const score = exclusionCount >= 2 ? 35 : 20;
    const source = exclusionCases[0]!;
    result.signals.push(
      buildSignal({
        signalType: 'exclusion_history',
        scoreContribution: score,
        details: { count: exclusionCount },
        sourceEntityType: 'BehaviourExclusionCase',
        sourceEntityId: source.id,
        summaryFragment: `${exclusionCount} exclusion case(s) this academic year`,
      }),
    );
  }

  // Signal 5: failed_intervention
  const interventionCount = interventions.length;
  if (interventionCount > 0) {
    const score = interventionCount >= 2 ? 20 : 10;
    const source = interventions[0]!;
    result.signals.push(
      buildSignal({
        signalType: 'failed_intervention',
        scoreContribution: score,
        details: {
          count: interventionCount,
          statuses: interventions.map((i) => i.status),
          outcomes: interventions.map((i) => i.outcome),
        },
        sourceEntityType: 'BehaviourIntervention',
        sourceEntityId: source.id,
        summaryFragment: `${interventionCount} failed or overdue behaviour intervention(s)`,
      }),
    );
  }

  result.rawScore = Math.min(
    100,
    result.signals.reduce((sum, s) => sum + s.scoreContribution, 0),
  );
  result.summaryFragments = result.signals.map((s) => s.summaryFragment);
  return result;
}

// ─── Wellbeing Signals ──────────────────────────────────────────────────────

async function collectWellbeingSignals(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
): Promise<SignalResult> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - WELLBEING_CHECKIN_LOOKBACK_DAYS);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - WELLBEING_CONCERN_LOOKBACK_DAYS);

  const [checkins, concerns, cases, referrals, incidentAffected] = await Promise.all([
    tx.studentCheckin.findMany({
      where: { tenant_id: tenantId, student_id: studentId, checkin_date: { gte: thirtyDaysAgo } },
      orderBy: { checkin_date: 'desc' },
      select: { id: true, mood_score: true, checkin_date: true },
    }),
    tx.pastoralConcern.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        created_at: { gte: ninetyDaysAgo },
        OR: [{ follow_up_needed: true }, { severity: { in: ['urgent', 'critical'] } }],
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, category: true, severity: true, follow_up_needed: true },
    }),
    tx.pastoralCase.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['open', 'active', 'monitoring'] },
      },
      select: { id: true, status: true },
    }),
    tx.pastoralReferral.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['submitted', 'acknowledged', 'assessment_scheduled'] },
      },
      select: { id: true, referral_type: true, referral_body_name: true, status: true },
    }),
    tx.criticalIncidentAffected.findMany({
      where: { tenant_id: tenantId, student_id: studentId, wellbeing_flag_active: true },
      select: { id: true, impact_level: true },
    }),
  ]);

  const result: SignalResult = {
    domain: 'wellbeing',
    rawScore: 0,
    signals: [],
    summaryFragments: [],
  };
  const hasData =
    checkins.length > 0 ||
    concerns.length > 0 ||
    cases.length > 0 ||
    referrals.length > 0 ||
    incidentAffected.length > 0;
  if (!hasData) return result;

  // Signal 1: declining_wellbeing_score
  if (checkins.length >= 5) {
    const recent = checkins.slice(0, 5);
    const midpoint = Math.floor(recent.length / 2);
    const newerHalf = recent.slice(0, midpoint);
    const olderHalf = recent.slice(midpoint);
    const newerAvg = newerHalf.reduce((sum, c) => sum + c.mood_score, 0) / newerHalf.length;
    const olderAvg = olderHalf.reduce((sum, c) => sum + c.mood_score, 0) / olderHalf.length;
    const decline = olderAvg - newerAvg;

    if (decline > 0) {
      const score = decline > 2.0 ? 25 : decline >= 1.0 ? 15 : 10;
      result.signals.push(
        buildSignal({
          signalType: 'declining_wellbeing_score',
          scoreContribution: score,
          details: {
            olderAvg: Number(olderAvg.toFixed(1)),
            newerAvg: Number(newerAvg.toFixed(1)),
            decline: Number(decline.toFixed(1)),
            checkinCount: recent.length,
          },
          sourceEntityType: 'StudentCheckin',
          sourceEntityId: recent[0]?.id ?? '',
          summaryFragment: `Wellbeing score declining: average ${olderAvg.toFixed(1)} \u2192 ${newerAvg.toFixed(1)} over last ${recent.length} check-ins`,
        }),
      );
    }
  }

  // Signal 2: low_mood_pattern
  if (checkins.length >= 3) {
    const lastThree = checkins.slice(0, 3);
    const allLowMood = lastThree.every((c) => c.mood_score <= 2);
    if (allLowMood) {
      const scores = lastThree.map((c) => c.mood_score);
      const allOnes = scores.every((s) => s === 1);
      const allTwos = scores.every((s) => s === 2);
      const score = allOnes ? 20 : allTwos ? 10 : 15;
      result.signals.push(
        buildSignal({
          signalType: 'low_mood_pattern',
          scoreContribution: score,
          details: { scores, checkinCount: lastThree.length },
          sourceEntityType: 'StudentCheckin',
          sourceEntityId: lastThree[0]?.id ?? '',
          summaryFragment: `Low mood in last ${lastThree.length} check-ins (scores: ${scores.join(', ')})`,
        }),
      );
    }
  }

  // Signal 3: active_pastoral_concern
  if (concerns.length > 0) {
    const hasCritical = concerns.some((c) => c.severity === 'critical');
    const hasUrgent = concerns.some((c) => c.severity === 'urgent');
    const score = hasCritical ? 30 : hasUrgent ? 20 : 15;
    const primary = hasCritical
      ? (concerns.find((c) => c.severity === 'critical') ?? concerns[0]!)
      : hasUrgent
        ? (concerns.find((c) => c.severity === 'urgent') ?? concerns[0]!)
        : concerns[0]!;
    result.signals.push(
      buildSignal({
        signalType: 'active_pastoral_concern',
        scoreContribution: score,
        details: {
          category: primary.category,
          severity: primary.severity,
          follow_up_needed: primary.follow_up_needed,
          concernCount: concerns.length,
        },
        sourceEntityType: 'PastoralConcern',
        sourceEntityId: primary.id,
        summaryFragment: `Active pastoral concern: ${primary.category} (severity: ${primary.severity})`,
      }),
    );
  }

  // Signal 4: active_pastoral_case
  if (cases.length > 0) {
    const score = cases.length >= 2 ? 20 : 10;
    result.signals.push(
      buildSignal({
        signalType: 'active_pastoral_case',
        scoreContribution: score,
        details: { caseCount: cases.length, statuses: cases.map((c) => c.status) },
        sourceEntityType: 'PastoralCase',
        sourceEntityId: cases[0]!.id,
        summaryFragment: `${cases.length} active pastoral case(s)`,
      }),
    );
  }

  // Signal 5: external_referral
  if (referrals.length > 0) {
    const score = referrals.length >= 2 ? 25 : 15;
    const primary = referrals[0]!;
    result.signals.push(
      buildSignal({
        signalType: 'external_referral',
        scoreContribution: score,
        details: {
          referralCount: referrals.length,
          referralType: primary.referral_type,
          referralBodyName: primary.referral_body_name,
          status: primary.status,
        },
        sourceEntityType: 'PastoralReferral',
        sourceEntityId: primary.id,
        summaryFragment: `External referral active: ${primary.referral_type} to ${primary.referral_body_name ?? 'N/A'} (${primary.status})`,
      }),
    );
  }

  // Signal 6: critical_incident_affected
  if (incidentAffected.length > 0) {
    const hasDirect = incidentAffected.some((i) => i.impact_level === 'direct');
    const score = hasDirect ? 35 : 20;
    const primary = hasDirect
      ? (incidentAffected.find((i) => i.impact_level === 'direct') ?? incidentAffected[0]!)
      : incidentAffected[0]!;
    result.signals.push(
      buildSignal({
        signalType: 'critical_incident_affected',
        scoreContribution: score,
        details: { impactLevel: primary.impact_level, incidentCount: incidentAffected.length },
        sourceEntityType: 'CriticalIncidentAffected',
        sourceEntityId: primary.id,
        summaryFragment: `Affected by critical incident (impact: ${primary.impact_level})`,
      }),
    );
  }

  result.rawScore = Math.min(
    100,
    result.signals.reduce((sum, s) => sum + s.scoreContribution, 0),
  );
  result.summaryFragments = result.signals.map((s) => s.summaryFragment);
  return result;
}

// ─── Engagement Signals ─────────────────────────────────────────────────────

interface ParentUserMapping {
  parentId: string;
  userId: string;
}

async function collectEngagementSignals(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
  academicYearId: string,
): Promise<SignalResult> {
  const signals: DetectedSignal[] = [];

  // Resolve parent user IDs
  const studentParents = await tx.studentParent.findMany({
    where: { student_id: studentId, tenant_id: tenantId },
    include: { parent: { select: { id: true, user_id: true } } },
  });

  const parentUsers: ParentUserMapping[] = [];
  for (const sp of studentParents) {
    const parent = sp.parent as { id: string; user_id: string | null };
    if (parent.user_id) {
      parentUsers.push({ parentId: parent.id, userId: parent.user_id });
    }
  }

  if (parentUsers.length === 0) {
    return { domain: 'engagement', rawScore: 0, signals: [], summaryFragments: [] };
  }

  const userIds = parentUsers.map((p) => p.userId);
  const parentIds = parentUsers.map((p) => p.parentId);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - ENGAGEMENT_LOOKBACK_DAYS * MS_PER_DAY);

  const [notifications, users, academicYear, acknowledgements] = await Promise.all([
    tx.notification.findMany({
      where: {
        tenant_id: tenantId,
        recipient_user_id: { in: userIds },
        channel: 'in_app',
        created_at: { gte: thirtyDaysAgo },
      },
      select: { id: true, recipient_user_id: true, read_at: true, created_at: true },
      orderBy: { created_at: 'desc' },
    }),
    tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, last_login_at: true },
    }),
    tx.academicYear.findFirst({
      where: { id: academicYearId, tenant_id: tenantId },
      select: { id: true, start_date: true, end_date: true },
    }),
    tx.behaviourParentAcknowledgement.findMany({
      where: { tenant_id: tenantId, parent_id: { in: parentIds }, sent_at: { gte: thirtyDaysAgo } },
      select: { id: true, parent_id: true, sent_at: true, acknowledged_at: true },
    }),
  ]);

  // Also count parent inquiries
  let inquiryCount = 0;
  if (academicYear) {
    const inquiries = await tx.parentInquiry.findMany({
      where: {
        tenant_id: tenantId,
        parent_id: { in: parentIds },
        created_at: { gte: academicYear.start_date, lte: academicYear.end_date },
      },
      select: { id: true },
    });
    inquiryCount = inquiries.length;
  }

  // Signal 1: low_notification_read_rate
  if (notifications.length > 0) {
    let bestRate = -1;
    let bestRead = 0;
    let bestTotal = 0;
    let bestUserId = '';
    for (const pu of parentUsers) {
      const parentNotifs = notifications.filter((n) => n.recipient_user_id === pu.userId);
      if (parentNotifs.length === 0) continue;
      const readCount = parentNotifs.filter((n) => n.read_at !== null).length;
      const rate = Math.round((readCount / parentNotifs.length) * 100);
      if (rate > bestRate) {
        bestRate = rate;
        bestRead = readCount;
        bestTotal = parentNotifs.length;
        bestUserId = pu.userId;
      }
    }
    if (bestRate >= 0 && bestRate < 30) {
      const score = bestRate >= 15 ? 10 : bestRate >= 1 ? 15 : 20;
      const unread = notifications.find(
        (n) => n.recipient_user_id === bestUserId && n.read_at === null,
      );
      const sourceId = unread?.id ?? notifications[0]?.id ?? '';
      signals.push(
        buildSignal({
          signalType: 'low_notification_read_rate',
          scoreContribution: score,
          details: { bestRate, read: bestRead, total: bestTotal },
          sourceEntityType: 'Notification',
          sourceEntityId: sourceId,
          summaryFragment: `Parent notification read rate: ${bestRate}% (${bestRead}/${bestTotal} in 30 days)`,
        }),
      );
    }
  }

  // Signal 2: no_portal_login
  {
    let bestLoginDate: Date | null = null;
    let bestUserId = '';
    for (const pu of parentUsers) {
      const user = users.find((u) => u.id === pu.userId);
      if (!user) continue;
      if (user.last_login_at) {
        if (!bestLoginDate || user.last_login_at > bestLoginDate) {
          bestLoginDate = user.last_login_at;
          bestUserId = pu.userId;
        }
      }
    }
    const firstParent = parentUsers[0];
    if (!bestUserId && firstParent) bestUserId = firstParent.userId;

    const daysSince = bestLoginDate
      ? Math.floor((now.getTime() - bestLoginDate.getTime()) / MS_PER_DAY)
      : Infinity;

    if (daysSince >= 21) {
      const score = daysSince <= 30 ? 15 : daysSince <= 60 ? 20 : 25;
      const summaryText =
        daysSince === Infinity
          ? 'No parent portal login ever recorded'
          : `No parent portal login in ${daysSince} days`;
      signals.push(
        buildSignal({
          signalType: 'no_portal_login',
          scoreContribution: score,
          details: { daysSince: daysSince === Infinity ? 'never' : `${daysSince}` },
          sourceEntityType: 'User',
          sourceEntityId: bestUserId,
          summaryFragment: summaryText,
        }),
      );
    }
  }

  // Signal 3: no_parent_inquiry
  if (inquiryCount === 0 && academicYear) {
    const yearStartMs = new Date(academicYear.start_date).getTime();
    const monthsElapsed = Math.floor((now.getTime() - yearStartMs) / (MS_PER_DAY * 30));
    const score = monthsElapsed > 6 ? 15 : monthsElapsed >= 3 ? 10 : 5;
    signals.push(
      buildSignal({
        signalType: 'no_parent_inquiry',
        scoreContribution: score,
        details: { monthsElapsed },
        sourceEntityType: 'Student',
        sourceEntityId: studentId,
        summaryFragment: 'No parent-initiated inquiries this academic year',
      }),
    );
  }

  // Signal 4: slow_acknowledgement
  if (acknowledgements.length > 0) {
    let bestAvgHours = Infinity;
    for (const pu of parentUsers) {
      const parentAcks = acknowledgements.filter((a) => a.parent_id === pu.parentId);
      if (parentAcks.length === 0) continue;
      let totalHours = 0;
      let countWithResponse = 0;
      let hasUnacknowledged = false;
      for (const ack of parentAcks) {
        if (ack.acknowledged_at) {
          totalHours +=
            (new Date(ack.acknowledged_at).getTime() - new Date(ack.sent_at).getTime()) /
            MS_PER_HOUR;
          countWithResponse++;
        } else {
          hasUnacknowledged = true;
        }
      }
      let avgHours: number;
      if (countWithResponse > 0) avgHours = totalHours / countWithResponse;
      else if (hasUnacknowledged) avgHours = Infinity;
      else continue;
      if (avgHours < bestAvgHours) bestAvgHours = avgHours;
    }

    if (bestAvgHours >= 72) {
      const score =
        bestAvgHours === Infinity || bestAvgHours > 168 ? 20 : bestAvgHours > 120 ? 15 : 10;
      let slowestAckId = acknowledgements[0]?.id ?? '';
      let slowestTime = -1;
      for (const ack of acknowledgements) {
        if (ack.acknowledged_at) {
          const time = new Date(ack.acknowledged_at).getTime() - new Date(ack.sent_at).getTime();
          if (time > slowestTime) {
            slowestTime = time;
            slowestAckId = ack.id;
          }
        } else {
          slowestAckId = ack.id;
          slowestTime = Infinity;
        }
      }
      const displayHours = bestAvgHours === Infinity ? 'never' : `${Math.round(bestAvgHours)}`;
      signals.push(
        buildSignal({
          signalType: 'slow_acknowledgement',
          scoreContribution: score,
          details: { avgHours: displayHours },
          sourceEntityType: 'BehaviourParentAcknowledgement',
          sourceEntityId: slowestAckId,
          summaryFragment:
            bestAvgHours === Infinity
              ? 'Behaviour acknowledgements never acknowledged'
              : `Average behaviour acknowledgement time: ${Math.round(bestAvgHours)} hours`,
        }),
      );
    }
  }

  // Signal 5: disengagement_trajectory
  if (notifications.length > 0) {
    let bestWeeklyRates: number[] = [];
    for (const pu of parentUsers) {
      const parentNotifs = notifications.filter((n) => n.recipient_user_id === pu.userId);
      if (parentNotifs.length === 0) continue;
      const weeklyRates = computeWeeklyReadRates(parentNotifs, now, ENGAGEMENT_WEEKS_TO_TRACK);
      const avg = weeklyRates.reduce((sum, r) => sum + r, 0) / weeklyRates.length;
      const bestAvg =
        bestWeeklyRates.length > 0
          ? bestWeeklyRates.reduce((sum, r) => sum + r, 0) / bestWeeklyRates.length
          : -1;
      if (avg > bestAvg) bestWeeklyRates = weeklyRates;
    }

    if (bestWeeklyRates.length >= 2) {
      let consecutiveDeclines = 0;
      for (let i = 1; i < bestWeeklyRates.length; i++) {
        const current = bestWeeklyRates[i];
        const previous = bestWeeklyRates[i - 1];
        if (current !== undefined && previous !== undefined && current < previous)
          consecutiveDeclines++;
        else consecutiveDeclines = 0;
      }

      if (consecutiveDeclines >= 3) {
        const score = consecutiveDeclines >= 4 ? 20 : 10;
        const mostRecent = notifications[0];
        if (mostRecent) {
          signals.push(
            buildSignal({
              signalType: 'disengagement_trajectory',
              scoreContribution: score,
              details: { consecutiveDeclines, weeklyRates: bestWeeklyRates },
              sourceEntityType: 'Notification',
              sourceEntityId: mostRecent.id,
              summaryFragment: `Parent engagement declining over ${consecutiveDeclines} consecutive weeks`,
            }),
          );
        }
      }
    }
  }

  const rawScore = Math.min(
    100,
    signals.reduce((sum, s) => sum + s.scoreContribution, 0),
  );
  return {
    domain: 'engagement',
    rawScore,
    signals,
    summaryFragments: signals.map((s) => s.summaryFragment),
  };
}

function computeWeeklyReadRates(
  notifications: Array<{ read_at: Date | null; created_at: Date }>,
  now: Date,
  weekCount: number,
): number[] {
  const rates: number[] = [];
  for (let w = weekCount - 1; w >= 0; w--) {
    const weekEnd = new Date(now.getTime() - w * 7 * MS_PER_DAY);
    const weekStart = new Date(weekEnd.getTime() - 6 * MS_PER_DAY);
    const weekNotifs = notifications.filter((n) => {
      const d = new Date(n.created_at);
      return d >= weekStart && d <= weekEnd;
    });
    if (weekNotifs.length === 0) {
      rates.push(100);
      continue;
    }
    const readCount = weekNotifs.filter((n) => n.read_at !== null).length;
    rates.push(Math.round((readCount / weekNotifs.length) * 100));
  }
  return rates;
}
