import { Injectable } from '@nestjs/common';

import type { DetectedSignal, SignalResult } from '@school/shared/early-warning';

import { PrismaService } from '../../prisma/prisma.service';

import { buildSignal } from './collector-utils';

// ─── Alert Type Score Map ───────────────────────────────────────────────────

const ALERT_TYPE_SCORES: Record<string, { score: number; severity: 'low' | 'medium' | 'high' }> = {
  at_risk_low: { score: 10, severity: 'low' },
  at_risk_medium: { score: 20, severity: 'medium' },
  at_risk_high: { score: 30, severity: 'high' },
};

// ─── Trajectory Decline Thresholds ──────────────────────────────────────────

function trajectoryScore(
  declineCount: number,
): { score: number; severity: 'low' | 'medium' | 'high' } | null {
  if (declineCount >= 3) return { score: 25, severity: 'high' };
  if (declineCount === 2) return { score: 15, severity: 'medium' };
  if (declineCount === 1) return { score: 10, severity: 'low' };
  return null;
}

// ─── Missing Assessments Thresholds ─────────────────────────────────────────

function missingScore(
  count: number,
): { score: number; severity: 'low' | 'medium' | 'high' } | null {
  if (count >= 6) return { score: 20, severity: 'high' };
  if (count >= 4) return { score: 15, severity: 'medium' };
  if (count >= 2) return { score: 10, severity: 'low' };
  return null;
}

// ─── Score Anomaly Thresholds ───────────────────────────────────────────────

function anomalyScore(count: number): { score: number; severity: 'medium' | 'high' } | null {
  if (count >= 2) return { score: 25, severity: 'high' };
  if (count === 1) return { score: 15, severity: 'medium' };
  return null;
}

// ─── Multi-Subject Decline Thresholds ───────────────────────────────────────

function multiSubjectScore(
  count: number,
): { score: number; severity: 'medium' | 'high' | 'critical' } | null {
  if (count >= 5) return { score: 30, severity: 'critical' };
  if (count === 4) return { score: 20, severity: 'high' };
  if (count === 3) return { score: 15, severity: 'medium' };
  return null;
}

// ─── Types for Internal Computation ─────────────────────────────────────────

interface SnapshotRow {
  id: string;
  subject_id: string;
  academic_period_id: string;
  computed_value: { toNumber?: () => number } | number;
  academic_period: { start_date: Date };
}

interface RiskAlertRow {
  id: string;
  alert_type: string;
  trigger_reason: string;
  subject_id: string | null;
}

interface MissingGradeRow {
  id: string;
}

interface ProgressEntryRow {
  subject_id: string;
  trend: string;
}

// ─── Collector ──────────────────────────────────────────────────────────────

@Injectable()
export class GradesSignalCollector {
  constructor(private readonly prisma: PrismaService) {}

  async collectSignals(
    tenantId: string,
    studentId: string,
    academicYearId: string,
  ): Promise<SignalResult> {
    const signals: DetectedSignal[] = [];

    // Fetch all data in parallel
    const [riskAlerts, snapshots, missingGrades, progressEntries] = await Promise.all([
      this.fetchRiskAlerts(tenantId, studentId),
      this.fetchPeriodSnapshots(tenantId, studentId, academicYearId),
      this.fetchMissingGrades(tenantId, studentId, academicYearId),
      this.fetchDecliningProgressEntries(tenantId, studentId, academicYearId),
    ]);

    // ─── Signal 1: below_class_mean ───────────────────────────────────────────
    const atRiskAlerts = riskAlerts.filter((a) => a.alert_type in ALERT_TYPE_SCORES);
    const belowClassMeanSignal = this.computeBelowClassMean(atRiskAlerts);
    if (belowClassMeanSignal) {
      signals.push(belowClassMeanSignal);
    }

    // ─── Signals 2 & 5: grade_trajectory_decline + multi_subject_decline ──────
    const decliningSubjects = this.computeDecliningSubjects(snapshots, progressEntries);

    const trajectorySignal = this.computeGradeTrajectoryDecline(decliningSubjects, snapshots);
    if (trajectorySignal) {
      signals.push(trajectorySignal);
    }

    const multiSubjectSignal = this.computeMultiSubjectDecline(decliningSubjects, snapshots);
    if (multiSubjectSignal) {
      signals.push(multiSubjectSignal);
    }

    // ─── Signal 3: missing_assessments ────────────────────────────────────────
    const missingSignal = this.computeMissingAssessments(missingGrades);
    if (missingSignal) {
      signals.push(missingSignal);
    }

    // ─── Signal 4: score_anomaly ──────────────────────────────────────────────
    const anomalyAlerts = riskAlerts.filter((a) => a.alert_type === 'score_anomaly');
    const anomalySignal = this.computeScoreAnomaly(anomalyAlerts);
    if (anomalySignal) {
      signals.push(anomalySignal);
    }

    // ─── Build Result ─────────────────────────────────────────────────────────
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

  // ─── Data Fetchers ──────────────────────────────────────────────────────────

  private async fetchRiskAlerts(tenantId: string, studentId: string): Promise<RiskAlertRow[]> {
    return this.prisma.studentAcademicRiskAlert.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
        alert_type: {
          in: ['at_risk_low', 'at_risk_medium', 'at_risk_high', 'score_anomaly'],
        },
      },
      select: {
        id: true,
        alert_type: true,
        trigger_reason: true,
        subject_id: true,
      },
    });
  }

  private async fetchPeriodSnapshots(
    tenantId: string,
    studentId: string,
    academicYearId: string,
  ): Promise<SnapshotRow[]> {
    return this.prisma.periodGradeSnapshot.findMany({
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
    });
  }

  private async fetchMissingGrades(
    tenantId: string,
    studentId: string,
    academicYearId: string,
  ): Promise<MissingGradeRow[]> {
    return this.prisma.grade.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        is_missing: true,
        assessment: {
          academic_period: { academic_year_id: academicYearId },
        },
      },
      select: { id: true },
    });
  }

  private async fetchDecliningProgressEntries(
    tenantId: string,
    studentId: string,
    academicYearId: string,
  ): Promise<ProgressEntryRow[]> {
    return this.prisma.progressReportEntry.findMany({
      where: {
        tenant_id: tenantId,
        trend: 'declining',
        progress_report: {
          student_id: studentId,
          academic_period: { academic_year_id: academicYearId },
        },
      },
      select: { subject_id: true, trend: true },
    });
  }

  // ─── Signal Computers ───────────────────────────────────────────────────────

  private computeBelowClassMean(atRiskAlerts: RiskAlertRow[]): DetectedSignal | null {
    const first = atRiskAlerts[0];
    if (!first) return null;

    // Find the highest-scored alert
    let best: RiskAlertRow = first;
    let bestScore = ALERT_TYPE_SCORES[best.alert_type]?.score ?? 0;

    for (let i = 1; i < atRiskAlerts.length; i++) {
      const alert = atRiskAlerts[i];
      if (!alert) continue;
      const entryScore = ALERT_TYPE_SCORES[alert.alert_type]?.score ?? 0;
      if (entryScore > bestScore) {
        best = alert;
        bestScore = entryScore;
      }
    }

    return buildSignal({
      signalType: 'below_class_mean',
      scoreContribution: bestScore,
      details: { alertType: best.alert_type, subjectId: best.subject_id },
      sourceEntityType: 'StudentAcademicRiskAlert',
      sourceEntityId: best.id,
      summaryFragment: `Academic risk alert: ${best.trigger_reason}`,
    });
  }

  /**
   * Compute the set of subjects whose grades are declining.
   * Merges evidence from period grade snapshots (actual grade delta) and
   * progress report entries (teacher-assessed trend). Returns the higher count.
   */
  private computeDecliningSubjects(
    snapshots: SnapshotRow[],
    progressEntries: ProgressEntryRow[],
  ): { subjectIds: Set<string>; biggestDeclineSnapshotId: string | null } {
    // Group snapshots by subject
    const bySubject = new Map<string, SnapshotRow[]>();
    for (const s of snapshots) {
      const existing = bySubject.get(s.subject_id);
      if (existing) {
        existing.push(s);
      } else {
        bySubject.set(s.subject_id, [s]);
      }
    }

    // Find subjects with declining snapshots (compare last two periods)
    const snapshotDeclining = new Set<string>();
    let biggestDecline = 0;
    let biggestDeclineSnapshotId: string | null = null;

    for (const [subjectId, subjectSnapshots] of bySubject) {
      if (subjectSnapshots.length < 2) continue;

      // Already ordered by start_date asc from the query
      const prev = subjectSnapshots[subjectSnapshots.length - 2];
      const curr = subjectSnapshots[subjectSnapshots.length - 1];
      if (!prev || !curr) continue;
      const prevVal = toNumber(prev.computed_value);
      const currVal = toNumber(curr.computed_value);

      if (currVal < prevVal) {
        snapshotDeclining.add(subjectId);
        const decline = prevVal - currVal;
        if (decline > biggestDecline) {
          biggestDecline = decline;
          biggestDeclineSnapshotId = curr.id;
        }
      }
    }

    // Find subjects declining per progress reports
    const progressDeclining = new Set<string>();
    for (const entry of progressEntries) {
      progressDeclining.add(entry.subject_id);
    }

    // Use the higher count source
    const usedSet =
      progressDeclining.size > snapshotDeclining.size ? progressDeclining : snapshotDeclining;

    return { subjectIds: usedSet, biggestDeclineSnapshotId };
  }

  private computeGradeTrajectoryDecline(
    declining: { subjectIds: Set<string>; biggestDeclineSnapshotId: string | null },
    snapshots: SnapshotRow[],
  ): DetectedSignal | null {
    const count = declining.subjectIds.size;
    const tier = trajectoryScore(count);
    if (!tier) return null;

    const sourceId = declining.biggestDeclineSnapshotId ?? snapshots[0]?.id ?? '';

    return buildSignal({
      signalType: 'grade_trajectory_decline',
      scoreContribution: tier.score,
      details: { decliningSubjectCount: count, subjectIds: [...declining.subjectIds] },
      sourceEntityType: 'PeriodGradeSnapshot',
      sourceEntityId: sourceId,
      summaryFragment: `Grade declined in ${count} subject(s) between periods`,
    });
  }

  private computeMissingAssessments(missingGrades: MissingGradeRow[]): DetectedSignal | null {
    const count = missingGrades.length;
    const tier = missingScore(count);
    if (!tier) return null;

    return buildSignal({
      signalType: 'missing_assessments',
      scoreContribution: tier.score,
      details: { missingCount: count },
      sourceEntityType: 'Grade',
      sourceEntityId: missingGrades[0]?.id ?? '',
      summaryFragment: `${count} missing assessment(s) in current period`,
    });
  }

  private computeScoreAnomaly(anomalyAlerts: RiskAlertRow[]): DetectedSignal | null {
    const count = anomalyAlerts.length;
    const tier = anomalyScore(count);
    if (!tier) return null;

    const first = anomalyAlerts[0];
    if (!first) return null;
    return buildSignal({
      signalType: 'score_anomaly',
      scoreContribution: tier.score,
      details: { anomalyCount: count, alertType: first.alert_type },
      sourceEntityType: 'StudentAcademicRiskAlert',
      sourceEntityId: first.id,
      summaryFragment: `Score anomaly detected: ${first.trigger_reason}`,
    });
  }

  private computeMultiSubjectDecline(
    declining: { subjectIds: Set<string>; biggestDeclineSnapshotId: string | null },
    snapshots: SnapshotRow[],
  ): DetectedSignal | null {
    const count = declining.subjectIds.size;
    const tier = multiSubjectScore(count);
    if (!tier) return null;

    const sourceId = declining.biggestDeclineSnapshotId ?? snapshots[0]?.id ?? '';

    return buildSignal({
      signalType: 'multi_subject_decline',
      scoreContribution: tier.score,
      details: { decliningSubjectCount: count, subjectIds: [...declining.subjectIds] },
      sourceEntityType: 'PeriodGradeSnapshot',
      sourceEntityId: sourceId,
      summaryFragment: `Declining grades across ${count} subjects simultaneously`,
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value: { toNumber?: () => number } | number): number {
  if (typeof value === 'number') return value;
  if (typeof value?.toNumber === 'function') return value.toNumber();
  return Number(value);
}
