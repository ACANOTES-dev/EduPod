import { Injectable } from '@nestjs/common';

import type { SignalResult } from '@school/shared/early-warning';

import type {
  BehaviourExclusionCaseRow,
  BehaviourIncidentParticipantRow,
  BehaviourInterventionRow,
  BehaviourSanctionRow,
} from '../../behaviour/behaviour-read.facade';
import { BehaviourReadFacade } from '../../behaviour/behaviour-read.facade';

import { buildSignal } from './collector-utils';

// ─── Constants ──────────────────────────────────────────────────────────────

const INCIDENT_LOOKBACK_DAYS = 14;
const SEVERITY_LOOKBACK_DAYS = 30;

// ─── Collector ──────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourSignalCollector {
  constructor(private readonly behaviourReadFacade: BehaviourReadFacade) {}

  async collectSignals(
    tenantId: string,
    studentId: string,
    academicYearId: string,
  ): Promise<SignalResult> {
    // Fetch all data in parallel
    const [
      incidentParticipants14d,
      incidentParticipants30d,
      sanctions,
      exclusionCases,
      interventions,
    ] = await Promise.all([
      // 14-day incidents for frequency signal
      this.behaviourReadFacade.findRecentIncidents(tenantId, studentId, INCIDENT_LOOKBACK_DAYS),

      // 30-day incidents for escalating severity signal
      this.behaviourReadFacade.findRecentIncidents(tenantId, studentId, SEVERITY_LOOKBACK_DAYS),

      // All sanctions for the student
      this.behaviourReadFacade.findSanctionsForStudent(tenantId, studentId),

      // Exclusion cases for student
      this.behaviourReadFacade.findExclusionCasesForStudent(tenantId, studentId),

      // All interventions for the student
      this.behaviourReadFacade.findInterventionsForStudent(tenantId, studentId),
    ]);

    // Filter for negative polarity (facade returns all)
    const negative14d = incidentParticipants14d.filter(
      (p) => p.incident.polarity === 'negative',
    );
    const negative30d = incidentParticipants30d.filter(
      (p) => p.incident.polarity === 'negative',
    );

    // Filter sanctions: active ones
    const activeSanctions = sanctions.filter(
      (s) => s.status === 'scheduled' || s.status === 'partially_served',
    );

    // Filter exclusion cases: current academic year (incident info not available from facade,
    // so we include all — the facade already returns by student)
    // Note: we keep all exclusion cases since we don't have incident.academic_year_id in the facade row
    const _exclusionCases = exclusionCases;

    // Filter interventions: failed/overdue
    const now = new Date();
    const failedInterventions = interventions.filter((i) => {
      if (i.status === 'abandoned') return true;
      if (
        i.status === 'completed_intervention' &&
        ((i as unknown as Record<string, string>).outcome === 'deteriorated' ||
          (i as unknown as Record<string, string>).outcome === 'no_change')
      ) {
        return true;
      }
      if (i.status === 'active_intervention' && i.target_end_date && i.target_end_date < now) {
        return true;
      }
      return false;
    });

    const result: SignalResult = {
      domain: 'behaviour',
      rawScore: 0,
      signals: [],
      summaryFragments: [],
    };

    // ─── Signal 1: incident_frequency ───────────────────────────────────
    this.checkIncidentFrequency(negative14d, result);

    // ─── Signal 2: escalating_severity ──────────────────────────────────
    this.checkEscalatingSeverity(negative30d, result);

    // ─── Signal 3: active_sanction ──────────────────────────────────────
    this.checkActiveSanction(activeSanctions, result);

    // ─── Signal 4: exclusion_history ────────────────────────────────────
    this.checkExclusionHistory(_exclusionCases, result);

    // ─── Signal 5: failed_intervention ──────────────────────────────────
    this.checkFailedIntervention(failedInterventions, result);

    // Cap rawScore at 100
    result.rawScore = Math.min(
      100,
      result.signals.reduce((sum, s) => sum + s.scoreContribution, 0),
    );

    // Collect summary fragments
    result.summaryFragments = result.signals.map((s) => s.summaryFragment);

    return result;
  }

  // ─── Signal 1: incident_frequency ───────────────────────────────────────────

  private checkIncidentFrequency(
    participants: BehaviourIncidentParticipantRow[],
    result: SignalResult,
  ): void {
    const count = participants.length;
    if (count < 3) return;

    let scoreContribution: number;
    if (count <= 4) {
      scoreContribution = 10;
    } else if (count <= 6) {
      scoreContribution = 15;
    } else if (count <= 9) {
      scoreContribution = 20;
    } else {
      scoreContribution = 25;
    }

    // Source: most recent participant
    const source = participants[0];
    if (!source) return;

    result.signals.push(
      buildSignal({
        signalType: 'incident_frequency',
        scoreContribution,
        details: { count },
        sourceEntityType: 'BehaviourIncidentParticipant',
        sourceEntityId: source.id,
        summaryFragment: `${count} negative behaviour incidents in the last 14 days`,
      }),
    );
  }

  // ─── Signal 2: escalating_severity ──────────────────────────────────────────

  private checkEscalatingSeverity(
    participants: BehaviourIncidentParticipantRow[],
    result: SignalResult,
  ): void {
    if (participants.length === 0) return;

    const now = new Date();
    const fifteenDaysAgo = new Date(now);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const firstHalf = participants.filter((p) => new Date(p.incident.occurred_at) < fifteenDaysAgo);
    const secondHalf = participants.filter(
      (p) => new Date(p.incident.occurred_at) >= fifteenDaysAgo,
    );

    // Only emit if incidents exist in both halves
    if (firstHalf.length === 0 || secondHalf.length === 0) return;

    const avgFirst = firstHalf.reduce((sum, p) => sum + p.incident.severity, 0) / firstHalf.length;
    const avgSecond =
      secondHalf.reduce((sum, p) => sum + p.incident.severity, 0) / secondHalf.length;

    const increase = avgSecond - avgFirst;
    if (increase < 1) return;

    const scoreContribution = increase >= 3 ? 20 : 10;

    // Source: most severe recent participant
    const sortedByMostSevere = [...secondHalf].sort(
      (a, b) => b.incident.severity - a.incident.severity,
    );
    const source = sortedByMostSevere[0];
    if (!source) return;

    result.signals.push(
      buildSignal({
        signalType: 'escalating_severity',
        scoreContribution,
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

  // ─── Signal 3: active_sanction ──────────────────────────────────────────────

  private checkActiveSanction(sanctions: BehaviourSanctionRow[], result: SignalResult): void {
    if (sanctions.length === 0) return;

    // Score each sanction, pick the highest-scored one
    let highestScore = 0;
    let highestSanction: BehaviourSanctionRow | null = null;

    for (const sanction of sanctions) {
      const score = sanction.suspension_start_date !== null ? 30 : 15;
      if (score > highestScore) {
        highestScore = score;
        highestSanction = sanction;
      }
    }

    if (!highestSanction) return;

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

  // ─── Signal 4: exclusion_history ────────────────────────────────────────────

  private checkExclusionHistory(
    exclusionCases: BehaviourExclusionCaseRow[],
    result: SignalResult,
  ): void {
    const count = exclusionCases.length;
    if (count === 0) return;

    const scoreContribution = count >= 2 ? 35 : 20;
    const source = exclusionCases[0];
    if (!source) return;

    result.signals.push(
      buildSignal({
        signalType: 'exclusion_history',
        scoreContribution,
        details: { count },
        sourceEntityType: 'BehaviourExclusionCase',
        sourceEntityId: source.id,
        summaryFragment: `${count} exclusion case(s) this academic year`,
      }),
    );
  }

  // ─── Signal 5: failed_intervention ──────────────────────────────────────────

  private checkFailedIntervention(
    interventions: BehaviourInterventionRow[],
    result: SignalResult,
  ): void {
    const count = interventions.length;
    if (count === 0) return;

    const scoreContribution = count >= 2 ? 20 : 10;
    const source = interventions[0];
    if (!source) return;

    result.signals.push(
      buildSignal({
        signalType: 'failed_intervention',
        scoreContribution,
        details: {
          count,
          statuses: interventions.map((i) => i.status),
        },
        sourceEntityType: 'BehaviourIntervention',
        sourceEntityId: source.id,
        summaryFragment: `${count} failed or overdue behaviour intervention(s)`,
      }),
    );
  }
}
