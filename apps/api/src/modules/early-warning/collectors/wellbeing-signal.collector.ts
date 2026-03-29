import { Injectable } from '@nestjs/common';

import type { SignalResult } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';

import { buildSignal } from './collector-utils';

// ─── Constants ──────────────────────────────────────────────────────────────

const CHECKIN_LOOKBACK_DAYS = 30;
const CONCERN_LOOKBACK_DAYS = 90;
const RECENT_CHECKIN_COUNT = 5;
const LOW_MOOD_CHECKIN_COUNT = 3;
const LOW_MOOD_THRESHOLD = 2;

// ─── Internal Interfaces ────────────────────────────────────────────────────

interface CheckinRow {
  id: string;
  tenant_id: string;
  student_id: string;
  mood_score: number;
  checkin_date: Date;
  created_at: Date;
}

interface ConcernRow {
  id: string;
  tenant_id: string;
  student_id: string;
  category: string;
  severity: string;
  follow_up_needed: boolean;
  acknowledged_at: Date | null;
  created_at: Date;
}

interface CaseRow {
  id: string;
  tenant_id: string;
  student_id: string;
  status: string;
}

interface ReferralRow {
  id: string;
  tenant_id: string;
  student_id: string;
  referral_type: string;
  referral_body_name: string | null;
  status: string;
}

interface IncidentAffectedRow {
  id: string;
  tenant_id: string;
  student_id: string | null;
  impact_level: string;
  wellbeing_flag_active: boolean;
}

// ─── Collector ──────────────────────────────────────────────────────────────

@Injectable()
export class WellbeingSignalCollector {
  constructor(private readonly prisma: PrismaService) {}

  async collectSignals(
    tenantId: string,
    studentId: string,
    _academicYearId: string,
  ): Promise<SignalResult> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - CHECKIN_LOOKBACK_DAYS);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - CONCERN_LOOKBACK_DAYS);

    // Fetch all queries in parallel — single round-trip batch
    const [checkins, concerns, cases, referrals, incidentAffected] =
      await Promise.all([
        this.prisma.studentCheckin.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            checkin_date: { gte: thirtyDaysAgo },
          },
          orderBy: { checkin_date: 'desc' },
        }) as Promise<CheckinRow[]>,

        this.prisma.pastoralConcern.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            created_at: { gte: ninetyDaysAgo },
            OR: [
              { follow_up_needed: true },
              { severity: { in: ['urgent', 'critical'] } },
            ],
          },
          orderBy: { created_at: 'desc' },
        }) as Promise<ConcernRow[]>,

        this.prisma.pastoralCase.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            status: { in: ['open', 'active', 'monitoring'] },
          },
        }) as Promise<CaseRow[]>,

        this.prisma.pastoralReferral.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            status: { in: ['submitted', 'acknowledged', 'assessment_scheduled'] },
          },
        }) as Promise<ReferralRow[]>,

        this.prisma.criticalIncidentAffected.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            wellbeing_flag_active: true,
          },
        }) as Promise<IncidentAffectedRow[]>,
      ]);

    const result: SignalResult = {
      domain: 'wellbeing',
      rawScore: 0,
      signals: [],
      summaryFragments: [],
    };

    const hasAnyData =
      checkins.length > 0 ||
      concerns.length > 0 ||
      cases.length > 0 ||
      referrals.length > 0 ||
      incidentAffected.length > 0;

    if (!hasAnyData) {
      return result;
    }

    // ─── Signal 1: declining_wellbeing_score ─────────────────────────────
    this.checkDecliningWellbeingScore(checkins, result);

    // ─── Signal 2: low_mood_pattern ─────────────────────────────────────
    this.checkLowMoodPattern(checkins, result);

    // ─── Signal 3: active_pastoral_concern ──────────────────────────────
    this.checkActivePastoralConcern(concerns, result);

    // ─── Signal 4: active_pastoral_case ─────────────────────────────────
    this.checkActivePastoralCase(cases, result);

    // ─── Signal 5: external_referral ────────────────────────────────────
    this.checkExternalReferral(referrals, result);

    // ─── Signal 6: critical_incident_affected ───────────────────────────
    this.checkCriticalIncidentAffected(incidentAffected, result);

    // Cap rawScore at 100
    result.rawScore = Math.min(
      100,
      result.signals.reduce((sum, s) => sum + s.scoreContribution, 0),
    );

    // Collect summary fragments
    result.summaryFragments = result.signals.map((s) => s.summaryFragment);

    return result;
  }

  // ─── Signal 1: declining_wellbeing_score ──────────────────────────────────

  private checkDecliningWellbeingScore(
    checkins: CheckinRow[],
    result: SignalResult,
  ): void {
    if (checkins.length < RECENT_CHECKIN_COUNT) return;

    const recent = checkins.slice(0, RECENT_CHECKIN_COUNT);
    const midpoint = Math.floor(recent.length / 2);

    // recent is ordered DESC — first half = newest, second half = oldest
    const newerHalf = recent.slice(0, midpoint);
    const olderHalf = recent.slice(midpoint);

    const newerAvg =
      newerHalf.reduce((sum, c) => sum + c.mood_score, 0) / newerHalf.length;
    const olderAvg =
      olderHalf.reduce((sum, c) => sum + c.mood_score, 0) / olderHalf.length;

    // Declining means the newer scores are lower than the older ones
    const decline = olderAvg - newerAvg;
    if (decline <= 0) return;

    let scoreContribution: number;
    if (decline > 2.0) {
      scoreContribution = 25;
    } else if (decline >= 1.0) {
      scoreContribution = 15;
    } else {
      // decline 0.5 to 1.0
      scoreContribution = 10;
    }

    result.signals.push(
      buildSignal({
        signalType: 'declining_wellbeing_score',
        scoreContribution,
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

  // ─── Signal 2: low_mood_pattern ───────────────────────────────────────────

  private checkLowMoodPattern(
    checkins: CheckinRow[],
    result: SignalResult,
  ): void {
    if (checkins.length < LOW_MOOD_CHECKIN_COUNT) return;

    const lastThree = checkins.slice(0, LOW_MOOD_CHECKIN_COUNT);
    const allLowMood = lastThree.every(
      (c) => c.mood_score <= LOW_MOOD_THRESHOLD,
    );
    if (!allLowMood) return;

    const scores = lastThree.map((c) => c.mood_score);
    const allOnes = scores.every((s) => s === 1);
    const allTwos = scores.every((s) => s === 2);

    let scoreContribution: number;
    if (allOnes) {
      scoreContribution = 20;
    } else if (allTwos) {
      scoreContribution = 10;
    } else {
      // Mix of 1s and 2s
      scoreContribution = 15;
    }

    result.signals.push(
      buildSignal({
        signalType: 'low_mood_pattern',
        scoreContribution,
        details: {
          scores,
          checkinCount: lastThree.length,
        },
        sourceEntityType: 'StudentCheckin',
        sourceEntityId: lastThree[0]?.id ?? '',
        summaryFragment: `Low mood in last ${lastThree.length} check-ins (scores: ${scores.join(', ')})`,
      }),
    );
  }

  // ─── Signal 3: active_pastoral_concern ────────────────────────────────────

  private checkActivePastoralConcern(
    concerns: ConcernRow[],
    result: SignalResult,
  ): void {
    const firstConcern = concerns[0];
    if (!firstConcern) return;

    // Score by highest severity found
    const hasCritical = concerns.some((c) => c.severity === 'critical');
    const hasUrgent = concerns.some((c) => c.severity === 'urgent');

    let scoreContribution: number;
    if (hasCritical) {
      scoreContribution = 30;
    } else if (hasUrgent) {
      scoreContribution = 20;
    } else {
      // elevated with follow_up_needed
      scoreContribution = 15;
    }

    // Use the highest-severity concern for the signal source
    const primaryConcern = hasCritical
      ? (concerns.find((c) => c.severity === 'critical') ?? firstConcern)
      : hasUrgent
        ? (concerns.find((c) => c.severity === 'urgent') ?? firstConcern)
        : firstConcern;

    result.signals.push(
      buildSignal({
        signalType: 'active_pastoral_concern',
        scoreContribution,
        details: {
          category: primaryConcern.category,
          severity: primaryConcern.severity,
          follow_up_needed: primaryConcern.follow_up_needed,
          concernCount: concerns.length,
        },
        sourceEntityType: 'PastoralConcern',
        sourceEntityId: primaryConcern.id,
        summaryFragment: `Active pastoral concern: ${primaryConcern.category} (severity: ${primaryConcern.severity})`,
      }),
    );
  }

  // ─── Signal 4: active_pastoral_case ───────────────────────────────────────

  private checkActivePastoralCase(
    cases: CaseRow[],
    result: SignalResult,
  ): void {
    const firstCase = cases[0];
    if (!firstCase) return;

    const scoreContribution = cases.length >= 2 ? 20 : 10;

    result.signals.push(
      buildSignal({
        signalType: 'active_pastoral_case',
        scoreContribution,
        details: {
          caseCount: cases.length,
          statuses: cases.map((c) => c.status),
        },
        sourceEntityType: 'PastoralCase',
        sourceEntityId: firstCase.id,
        summaryFragment: `${cases.length} active pastoral case(s)`,
      }),
    );
  }

  // ─── Signal 5: external_referral ──────────────────────────────────────────

  private checkExternalReferral(
    referrals: ReferralRow[],
    result: SignalResult,
  ): void {
    const primaryReferral = referrals[0];
    if (!primaryReferral) return;

    const scoreContribution = referrals.length >= 2 ? 25 : 15;

    result.signals.push(
      buildSignal({
        signalType: 'external_referral',
        scoreContribution,
        details: {
          referralCount: referrals.length,
          referralType: primaryReferral.referral_type,
          referralBodyName: primaryReferral.referral_body_name,
          status: primaryReferral.status,
        },
        sourceEntityType: 'PastoralReferral',
        sourceEntityId: primaryReferral.id,
        summaryFragment: `External referral active: ${primaryReferral.referral_type} to ${primaryReferral.referral_body_name ?? 'N/A'} (${primaryReferral.status})`,
      }),
    );
  }

  // ─── Signal 6: critical_incident_affected ─────────────────────────────────

  private checkCriticalIncidentAffected(
    incidents: IncidentAffectedRow[],
    result: SignalResult,
  ): void {
    const firstIncident = incidents[0];
    if (!firstIncident) return;

    // Use highest impact level score
    const hasDirect = incidents.some((i) => i.impact_level === 'direct');
    const scoreContribution = hasDirect ? 35 : 20;

    const primaryIncident = hasDirect
      ? (incidents.find((i) => i.impact_level === 'direct') ?? firstIncident)
      : firstIncident;

    result.signals.push(
      buildSignal({
        signalType: 'critical_incident_affected',
        scoreContribution,
        details: {
          impactLevel: primaryIncident.impact_level,
          incidentCount: incidents.length,
        },
        sourceEntityType: 'CriticalIncidentAffected',
        sourceEntityId: primaryIncident.id,
        summaryFragment: `Affected by critical incident (impact: ${primaryIncident.impact_level})`,
      }),
    );
  }
}
