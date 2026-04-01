import { $Enums, Prisma, PrismaClient } from '@prisma/client';

import type {
  DetectedSignal,
  EarlyWarningRoutingRules,
  EarlyWarningThresholds,
  EarlyWarningWeights,
  RiskAssessment,
  RiskTier,
  SignalResult,
  SignalSummaryJson,
  TrendJson,
  TriggerSignalsJson,
} from '@school/shared';
import {
  CROSS_DOMAIN_BOOST,
  DEFAULT_HYSTERESIS_BUFFER,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
} from '@school/shared';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_TOP_SIGNALS = 5;
const MAX_TREND_LENGTH = 30;
const MAX_COMPOSITE_SCORE = 100;
const DOMAIN_KEYS = ['attendance', 'grades', 'behaviour', 'wellbeing', 'engagement'] as const;

type DomainKey = (typeof DOMAIN_KEYS)[number];

// ─── Config Loading ─────────────────────────────────────────────────────────

export interface EarlyWarningTenantConfig {
  isEnabled: boolean;
  weights: EarlyWarningWeights;
  thresholds: EarlyWarningThresholds;
  hysteresisBuffer: number;
  routingRules: EarlyWarningRoutingRules;
  highSeverityEvents: string[];
  digestDay: number;
  digestRecipients: string[];
}

/**
 * Loads early-warning configuration for a tenant, returning defaults where
 * no config row exists.
 */
export async function loadTenantConfig(
  tx: PrismaClient,
  tenantId: string,
): Promise<EarlyWarningTenantConfig> {
  const config = await tx.earlyWarningConfig.findUnique({
    where: { tenant_id: tenantId },
  });

  if (!config) {
    return {
      isEnabled: false,
      weights: { ...DEFAULT_WEIGHTS },
      thresholds: { ...DEFAULT_THRESHOLDS },
      hysteresisBuffer: DEFAULT_HYSTERESIS_BUFFER,
      routingRules: {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      },
      highSeverityEvents: ['suspension', 'critical_incident', 'third_consecutive_absence'],
      digestDay: 1,
      digestRecipients: [],
    };
  }

  return {
    isEnabled: config.is_enabled,
    weights: config.weights_json as unknown as EarlyWarningWeights,
    thresholds: config.thresholds_json as unknown as EarlyWarningThresholds,
    hysteresisBuffer: config.hysteresis_buffer,
    routingRules: config.routing_rules_json as unknown as EarlyWarningRoutingRules,
    highSeverityEvents: config.high_severity_events_json as unknown as string[],
    digestDay: config.digest_day,
    digestRecipients: config.digest_recipients_json as unknown as string[],
  };
}

// ─── Scoring Engine (inlined — cannot import from API app) ──────────────────

/**
 * Cross-domain boost tiers:
 *   3 domains above threshold -> +5
 *   4 domains above threshold -> +10
 *   5 domains above threshold -> +15
 */
const CROSS_DOMAIN_BOOST_MAP: Record<number, number> = {
  3: CROSS_DOMAIN_BOOST.BOOST_3_DOMAINS,
  4: CROSS_DOMAIN_BOOST.BOOST_4_DOMAINS,
  5: CROSS_DOMAIN_BOOST.BOOST_5_DOMAINS,
};

/** Tier ordering for hysteresis (green = 0 lowest risk, red = 3 highest) */
const TIER_ORDER: Record<RiskTier, number> = { green: 0, yellow: 1, amber: 2, red: 3 };
const TIERS_BY_ORDER: RiskTier[] = ['green', 'yellow', 'amber', 'red'];

/**
 * Pure computation: takes 5 signal results + config, returns a RiskAssessment.
 * Mirrors ScoringEngine.computeRisk from apps/api.
 */
export function computeRiskAssessment(
  signals: SignalResult[],
  weights: EarlyWarningWeights,
  thresholds: EarlyWarningThresholds,
  hysteresisBuffer: number,
  previousTier: RiskTier | null,
  trendHistory: number[],
): RiskAssessment {
  // 1. Extract domain scores
  const domainScores: Record<DomainKey, number> = {
    attendance: 0,
    grades: 0,
    behaviour: 0,
    wellbeing: 0,
    engagement: 0,
  };
  for (const signal of signals) {
    domainScores[signal.domain as DomainKey] = signal.rawScore;
  }

  // 2. Apply weighted sum
  let weightedScore = 0;
  for (const key of DOMAIN_KEYS) {
    weightedScore += domainScores[key] * (weights[key] / 100);
  }

  // 3. Cross-domain correlation boost
  let domainsAbove = 0;
  for (const key of DOMAIN_KEYS) {
    if (domainScores[key] >= CROSS_DOMAIN_BOOST.DOMAIN_THRESHOLD) {
      domainsAbove++;
    }
  }
  const crossDomainBoost = CROSS_DOMAIN_BOOST_MAP[domainsAbove] ?? 0;

  // 4. Composite score (capped at 100)
  const compositeScore = Math.min(
    MAX_COMPOSITE_SCORE,
    Math.round(weightedScore + crossDomainBoost),
  );

  // 5. Tier assignment with hysteresis
  const { tier, tierChanged } = assignTierWithHysteresis(
    compositeScore,
    previousTier,
    thresholds,
    hysteresisBuffer,
  );

  // 6. Aggregate all signals
  const allSignals: DetectedSignal[] = [];
  for (const result of signals) {
    allSignals.push(...result.signals);
  }

  // 7. Build trend data (append current, trim to 30)
  const combined = [...trendHistory, compositeScore];
  const trendData =
    combined.length > MAX_TREND_LENGTH
      ? combined.slice(combined.length - MAX_TREND_LENGTH)
      : combined;

  // 8. Build NL summary
  const summaryText = buildSummary(compositeScore, trendHistory, allSignals);

  return {
    compositeScore,
    riskTier: tier,
    domainScores: {
      attendance: domainScores.attendance,
      grades: domainScores.grades,
      behaviour: domainScores.behaviour,
      wellbeing: domainScores.wellbeing,
      engagement: domainScores.engagement,
    },
    crossDomainBoost,
    signals: allSignals,
    summaryText,
    trendData,
    tierChanged,
    previousTier,
  };
}

// ─── Hysteresis Evaluator ───────────────────────────────────────────────────

function assignTierWithHysteresis(
  compositeScore: number,
  previousTier: RiskTier | null,
  thresholds: EarlyWarningThresholds,
  hysteresisBuffer: number,
): { tier: RiskTier; tierChanged: boolean } {
  const rawTier = rawTierFromScore(compositeScore, thresholds);

  // First computation — no hysteresis
  if (previousTier === null) {
    return { tier: rawTier, tierChanged: true };
  }

  const rawOrder = TIER_ORDER[rawTier];
  const prevOrder = TIER_ORDER[previousTier];

  // Upgrading (worsening) — immediate
  if (rawOrder > prevOrder) {
    return { tier: rawTier, tierChanged: true };
  }

  // Same raw tier — no change
  if (rawOrder === prevOrder) {
    return { tier: previousTier, tierChanged: false };
  }

  // Downgrading (improving) — apply hysteresis at each tier boundary
  let effectiveTier = previousTier;
  for (let order = prevOrder; order > 0; order--) {
    const tierAtOrder = TIERS_BY_ORDER[order];
    if (!tierAtOrder) continue;
    const entryThreshold = thresholds[tierAtOrder];
    const hysteresisLine = entryThreshold - hysteresisBuffer;

    if (compositeScore <= hysteresisLine) {
      const lowerTier = TIERS_BY_ORDER[order - 1];
      if (lowerTier) {
        effectiveTier = lowerTier;
      }
    } else {
      break;
    }
  }

  return { tier: effectiveTier, tierChanged: effectiveTier !== previousTier };
}

function rawTierFromScore(score: number, thresholds: EarlyWarningThresholds): RiskTier {
  if (score >= thresholds.red) return 'red';
  if (score >= thresholds.amber) return 'amber';
  if (score >= thresholds.yellow) return 'yellow';
  return 'green';
}

// ─── Summary Builder ────────────────────────────────────────────────────────

const STABILITY_THRESHOLD = 5;
const DAYS_PER_WEEK = 7;

function buildSummary(
  currentScore: number,
  trendHistory: number[],
  signals: DetectedSignal[],
): string {
  const parts: string[] = [];

  // Trend sentence
  const rounded = Math.round(currentScore);
  if (trendHistory.length === 0) {
    parts.push(`Risk score is ${rounded}.`);
  } else {
    const totalDays = trendHistory.length;
    const weeks = Math.max(1, Math.ceil(totalDays / DAYS_PER_WEEK));
    const earliestSlice = trendHistory.slice(0, Math.min(DAYS_PER_WEEK, totalDays));
    const earliestAvg = Math.round(
      earliestSlice.reduce((sum, val) => sum + val, 0) / earliestSlice.length,
    );
    const diff = rounded - earliestAvg;

    if (Math.abs(diff) < STABILITY_THRESHOLD) {
      parts.push(`Risk score stable at ${rounded}.`);
    } else if (diff > 0) {
      parts.push(
        `Risk score increased from ${earliestAvg} to ${rounded} over the past ${weeks} week${weeks === 1 ? '' : 's'}.`,
      );
    } else {
      parts.push(
        `Risk score decreased from ${earliestAvg} to ${rounded} over the past ${weeks} week${weeks === 1 ? '' : 's'}.`,
      );
    }
  }

  // Top signal fragments
  const fragments = signals
    .filter((s) => s.summaryFragment.length > 0)
    .sort((a, b) => b.scoreContribution - a.scoreContribution)
    .slice(0, MAX_TOP_SIGNALS)
    .map((s) => s.summaryFragment);

  if (fragments.length > 0) {
    parts.push(fragments.join(' '));
  }

  return parts.join(' ');
}

// ─── Profile Upsert ─────────────────────────────────────────────────────────

/**
 * Upserts the StudentRiskProfile row using the computed RiskAssessment.
 * Creates if new, updates if existing. Returns the profile id.
 */
export async function upsertRiskProfile(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
  academicYearId: string,
  assessment: RiskAssessment,
): Promise<string> {
  const now = new Date();

  const signalSummaryJson: SignalSummaryJson = {
    summaryText: assessment.summaryText,
    topSignals: [...assessment.signals]
      .sort((a, b) => b.scoreContribution - a.scoreContribution)
      .slice(0, MAX_TOP_SIGNALS)
      .map((s) => ({
        signalType: s.signalType,
        domain: inferDomainFromSignalType(
          s.signalType,
        ) as SignalSummaryJson['topSignals'][0]['domain'],
        severity: s.severity,
        scoreContribution: s.scoreContribution,
        summaryFragment: s.summaryFragment,
      })),
  };

  const trendJson: TrendJson = { dailyScores: assessment.trendData };

  const profileData = {
    composite_score: assessment.compositeScore,
    risk_tier: assessment.riskTier as $Enums.EarlyWarningRiskTier,
    attendance_score: assessment.domainScores.attendance,
    grades_score: assessment.domainScores.grades,
    behaviour_score: assessment.domainScores.behaviour,
    wellbeing_score: assessment.domainScores.wellbeing,
    engagement_score: assessment.domainScores.engagement,
    signal_summary_json: signalSummaryJson as unknown as Prisma.InputJsonValue,
    trend_json: trendJson as unknown as Prisma.InputJsonValue,
    last_computed_at: now,
    tier_entered_at: assessment.tierChanged ? now : undefined,
  };

  const profile = await tx.studentRiskProfile.upsert({
    where: {
      uq_risk_profile_tenant_student_year: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_year_id: academicYearId,
      },
    },
    create: {
      tenant_id: tenantId,
      student_id: studentId,
      academic_year_id: academicYearId,
      ...profileData,
      tier_entered_at: now,
    },
    update: profileData,
    select: { id: true },
  });

  return profile.id;
}

// ─── Signal Audit Trail ─────────────────────────────────────────────────────

/**
 * Writes detected signals to the append-only student_risk_signals table.
 */
export async function writeSignalAuditTrail(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
  academicYearId: string,
  signals: DetectedSignal[],
): Promise<void> {
  const now = new Date();

  if (signals.length === 0) return;

  await tx.studentRiskSignal.createMany({
    data: signals.map((s) => ({
      tenant_id: tenantId,
      student_id: studentId,
      academic_year_id: academicYearId,
      domain: inferDomainFromSignalType(s.signalType) as $Enums.EarlyWarningDomain,
      signal_type: s.signalType,
      severity: s.severity as $Enums.EarlyWarningSignalSeverity,
      score_contribution: s.scoreContribution,
      details_json: s.details as Prisma.InputJsonValue,
      source_entity_type: s.sourceEntityType,
      source_entity_id: s.sourceEntityId,
      detected_at: now,
    })),
  });
}

// ─── Tier Transition Log ────────────────────────────────────────────────────

/**
 * Logs a tier transition to the append-only early_warning_tier_transitions table
 * and optionally creates a notification routed to the appropriate staff member.
 */
export async function logTierTransition(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
  profileId: string,
  assessment: RiskAssessment,
  routingRules: EarlyWarningRoutingRules,
): Promise<void> {
  const now = new Date();

  // Build trigger signals JSON
  const triggerSignalsJson: TriggerSignalsJson = {
    signals: assessment.signals
      .sort((a, b) => b.scoreContribution - a.scoreContribution)
      .slice(0, MAX_TOP_SIGNALS)
      .map((s) => ({
        signalType: s.signalType,
        domain: inferDomainFromSignalType(
          s.signalType,
        ) as TriggerSignalsJson['signals'][0]['domain'],
        severity: s.severity,
        scoreContribution: s.scoreContribution,
      })),
  };

  // Route notification based on tier
  const routedUserId = await resolveRoutedUser(
    tx,
    tenantId,
    studentId,
    assessment.riskTier,
    routingRules,
  );

  // Create notification if we have a user to route to and the tier worsened
  let notificationId: string | undefined;
  if (routedUserId && assessment.tierChanged) {
    const notification = await tx.notification.create({
      data: {
        tenant_id: tenantId,
        recipient_user_id: routedUserId,
        channel: 'in_app',
        template_key: 'early_warning_tier_change',
        locale: 'en',
        status: 'delivered',
        payload_json: {
          student_id: studentId,
          from_tier: assessment.previousTier,
          to_tier: assessment.riskTier,
          composite_score: assessment.compositeScore,
          summary_text: assessment.summaryText,
        } as Prisma.InputJsonValue,
        source_entity_type: 'early_warning_tier_transition',
        source_entity_id: profileId,
        delivered_at: now,
      },
      select: { id: true },
    });
    notificationId = notification.id;
  }

  await tx.earlyWarningTierTransition.create({
    data: {
      tenant_id: tenantId,
      student_id: studentId,
      profile_id: profileId,
      from_tier: assessment.previousTier as $Enums.EarlyWarningRiskTier | undefined,
      to_tier: assessment.riskTier as $Enums.EarlyWarningRiskTier,
      composite_score: assessment.compositeScore,
      trigger_signals_json: triggerSignalsJson as unknown as Prisma.InputJsonValue,
      routed_to_user_id: routedUserId ?? undefined,
      notification_id: notificationId,
      transitioned_at: now,
    },
  });
}

// ─── Staff Routing ──────────────────────────────────────────────────────────

/**
 * Resolves the user_id to route a tier transition notification to,
 * based on the routing rules and the student's assigned staff.
 */
async function resolveRoutedUser(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
  riskTier: RiskTier,
  routingRules: EarlyWarningRoutingRules,
): Promise<string | null> {
  // Green tier — no routing needed
  if (riskTier === 'green') return null;

  // Determine target role(s) from routing rules
  let targetRoles: string[];
  if (riskTier === 'red') {
    targetRoles = routingRules.red.roles;
  } else if (riskTier === 'amber') {
    targetRoles = [routingRules.amber.role];
  } else {
    // yellow
    targetRoles = [routingRules.yellow.role];
  }

  // For homeroom_teacher: find the student's homeroom teacher via ClassEnrolment
  if (targetRoles.includes('homeroom_teacher')) {
    const enrolment = await tx.classEnrolment.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
        class_entity: { homeroom_teacher_staff_id: { not: null } },
      },
      include: {
        class_entity: {
          select: { homeroom_teacher_staff_id: true },
        },
      },
    });

    if (enrolment?.class_entity?.homeroom_teacher_staff_id) {
      // Look up the staff member's user_id via StaffProfile
      const staff = await tx.staffProfile.findUnique({
        where: { id: enrolment.class_entity.homeroom_teacher_staff_id },
        select: { user_id: true },
      });
      if (staff?.user_id) return staff.user_id;
    }
  }

  // For year_head: find via the user role assignment
  // (YearGroup does not have a head_of_year_id field, so we fall through
  // to the generic role-based lookup below)

  // For year_head, principal, pastoral_lead: find via MembershipRole -> TenantMembership
  for (const role of targetRoles) {
    if (role === 'homeroom_teacher') continue;

    // Look up the first active membership with this role_key
    const membershipRole = await tx.membershipRole.findFirst({
      where: {
        tenant_id: tenantId,
        role: { role_key: role },
        membership: { membership_status: 'active' },
      },
      include: {
        membership: { select: { user_id: true } },
      },
    });

    if (membershipRole?.membership?.user_id) return membershipRole.membership.user_id;
  }

  return null;
}

// ─── Domain Inference ───────────────────────────────────────────────────────

const SIGNAL_TYPE_DOMAIN_MAP: Record<string, string> = {
  // Attendance signals
  attendance_rate_decline: 'attendance',
  consecutive_absences: 'attendance',
  recurring_day_pattern: 'attendance',
  chronic_tardiness: 'attendance',
  attendance_trajectory: 'attendance',
  // Grades signals
  below_class_mean: 'grades',
  grade_trajectory_decline: 'grades',
  missing_assessments: 'grades',
  score_anomaly: 'grades',
  multi_subject_decline: 'grades',
  // Behaviour signals
  incident_frequency: 'behaviour',
  escalating_severity: 'behaviour',
  active_sanction: 'behaviour',
  exclusion_history: 'behaviour',
  failed_intervention: 'behaviour',
  // Wellbeing signals
  declining_wellbeing_score: 'wellbeing',
  low_mood_pattern: 'wellbeing',
  active_pastoral_concern: 'wellbeing',
  active_pastoral_case: 'wellbeing',
  external_referral: 'wellbeing',
  critical_incident_affected: 'wellbeing',
  // Engagement signals
  low_notification_read_rate: 'engagement',
  no_portal_login: 'engagement',
  no_parent_inquiry: 'engagement',
  slow_acknowledgement: 'engagement',
  disengagement_trajectory: 'engagement',
};

function inferDomainFromSignalType(signalType: string): string {
  return SIGNAL_TYPE_DOMAIN_MAP[signalType] ?? 'attendance';
}

// ─── Active Academic Year ───────────────────────────────────────────────────

/**
 * Returns the current academic year for a tenant (the one whose date range
 * includes today, or the most recently started one).
 */
export async function getActiveAcademicYear(
  tx: PrismaClient,
  tenantId: string,
): Promise<{ id: string } | null> {
  const now = new Date();

  // Try exact match: today falls within the year's date range
  const activeYear = await tx.academicYear.findFirst({
    where: {
      tenant_id: tenantId,
      start_date: { lte: now },
      end_date: { gte: now },
    },
    select: { id: true },
    orderBy: { start_date: 'desc' },
  });

  if (activeYear) return activeYear;

  // Fallback: most recently started year
  return tx.academicYear.findFirst({
    where: { tenant_id: tenantId },
    select: { id: true },
    orderBy: { start_date: 'desc' },
  });
}
