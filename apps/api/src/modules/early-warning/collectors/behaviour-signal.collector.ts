import { Injectable } from '@nestjs/common';

import type { SignalResult } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';

import { buildSignal } from './collector-utils';

// ─── Constants ──────────────────────────────────────────────────────────────

const INCIDENT_LOOKBACK_DAYS = 14;
const SEVERITY_LOOKBACK_DAYS = 30;

// ─── Internal Types ─────────────────────────────────────────────────────────

interface IncidentParticipantRow {
  id: string;
  incident: {
    id: string;
    polarity: string;
    severity: number;
    occurred_at: Date;
  };
}

interface SanctionRow {
  id: string;
  type: string;
  status: string;
  suspension_start_date: Date | null;
}

interface ExclusionCaseRow {
  id: string;
  incident: {
    academic_year_id: string;
  };
}

interface InterventionRow {
  id: string;
  status: string;
  outcome: string | null;
  target_end_date: Date | null;
}

// ─── Collector ──────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourSignalCollector {
  constructor(private readonly prisma: PrismaService) {}

  async collectSignals(
    tenantId: string,
    studentId: string,
    academicYearId: string,
  ): Promise<SignalResult> {
    const now = new Date();
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - INCIDENT_LOOKBACK_DAYS);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - SEVERITY_LOOKBACK_DAYS);

    // Fetch all data in parallel
    const [incidentParticipants14d, incidentParticipants30d, sanctions, exclusionCases, interventions] =
      await Promise.all([
        // 14-day incidents for frequency signal
        this.prisma.behaviourIncidentParticipant.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            role: 'subject',
            incident: {
              polarity: 'negative',
              occurred_at: { gte: fourteenDaysAgo },
            },
          },
          include: {
            incident: {
              select: { id: true, polarity: true, severity: true, occurred_at: true },
            },
          },
          orderBy: { incident: { occurred_at: 'desc' } },
        }) as Promise<IncidentParticipantRow[]>,

        // 30-day incidents for escalating severity signal
        this.prisma.behaviourIncidentParticipant.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            role: 'subject',
            incident: {
              polarity: 'negative',
              occurred_at: { gte: thirtyDaysAgo },
            },
          },
          include: {
            incident: {
              select: { id: true, polarity: true, severity: true, occurred_at: true },
            },
          },
          orderBy: { incident: { occurred_at: 'desc' } },
        }) as Promise<IncidentParticipantRow[]>,

        // Active sanctions
        this.prisma.behaviourSanction.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            status: { in: ['scheduled', 'partially_served'] },
          },
        }) as Promise<SanctionRow[]>,

        // Exclusion cases in current academic year
        this.prisma.behaviourExclusionCase.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            incident: { academic_year_id: academicYearId },
          },
          include: {
            incident: { select: { academic_year_id: true } },
          },
        }) as Promise<ExclusionCaseRow[]>,

        // Failed/overdue interventions
        this.prisma.behaviourIntervention.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            OR: [
              {
                status: 'completed_intervention',
                outcome: { in: ['deteriorated', 'no_change'] },
              },
              { status: 'abandoned' },
              {
                status: 'active_intervention',
                target_end_date: { lt: now },
              },
            ],
          },
        }) as Promise<InterventionRow[]>,
      ]);

    const result: SignalResult = {
      domain: 'behaviour',
      rawScore: 0,
      signals: [],
      summaryFragments: [],
    };

    // ─── Signal 1: incident_frequency ───────────────────────────────────
    this.checkIncidentFrequency(incidentParticipants14d, result);

    // ─── Signal 2: escalating_severity ──────────────────────────────────
    this.checkEscalatingSeverity(incidentParticipants30d, result);

    // ─── Signal 3: active_sanction ──────────────────────────────────────
    this.checkActiveSanction(sanctions, result);

    // ─── Signal 4: exclusion_history ────────────────────────────────────
    this.checkExclusionHistory(exclusionCases, result);

    // ─── Signal 5: failed_intervention ──────────────────────────────────
    this.checkFailedIntervention(interventions, result);

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
    participants: IncidentParticipantRow[],
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
    participants: IncidentParticipantRow[],
    result: SignalResult,
  ): void {
    if (participants.length === 0) return;

    const now = new Date();
    const fifteenDaysAgo = new Date(now);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const firstHalf = participants.filter(
      (p) => new Date(p.incident.occurred_at) < fifteenDaysAgo,
    );
    const secondHalf = participants.filter(
      (p) => new Date(p.incident.occurred_at) >= fifteenDaysAgo,
    );

    // Only emit if incidents exist in both halves
    if (firstHalf.length === 0 || secondHalf.length === 0) return;

    const avgFirst =
      firstHalf.reduce((sum, p) => sum + p.incident.severity, 0) / firstHalf.length;
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

  private checkActiveSanction(
    sanctions: SanctionRow[],
    result: SignalResult,
  ): void {
    if (sanctions.length === 0) return;

    // Score each sanction, pick the highest-scored one
    let highestScore = 0;
    let highestSanction: SanctionRow | null = null;

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
    exclusionCases: ExclusionCaseRow[],
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
    interventions: InterventionRow[],
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
          outcomes: interventions.map((i) => i.outcome),
        },
        sourceEntityType: 'BehaviourIntervention',
        sourceEntityId: source.id,
        summaryFragment: `${count} failed or overdue behaviour intervention(s)`,
      }),
    );
  }
}
