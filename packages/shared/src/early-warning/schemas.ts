import { z } from 'zod';

// ─── Reusable Enum Schemas ───────────────────────────────────────────────────

export const riskTierSchema = z.enum(['green', 'yellow', 'amber', 'red']);
export const signalDomainSchema = z.enum(['attendance', 'grades', 'behaviour', 'wellbeing', 'engagement']);
export const signalSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// ─── Config JSONB Schemas ────────────────────────────────────────────────────

export const earlyWarningWeightsSchema = z.object({
  attendance: z.number().min(0).max(100),
  grades: z.number().min(0).max(100),
  behaviour: z.number().min(0).max(100),
  wellbeing: z.number().min(0).max(100),
  engagement: z.number().min(0).max(100),
}).refine(
  (w) => w.attendance + w.grades + w.behaviour + w.wellbeing + w.engagement === 100,
  { message: 'Weights must sum to 100', path: ['attendance'] },
).default({
  attendance: 25,
  grades: 25,
  behaviour: 20,
  wellbeing: 20,
  engagement: 10,
});
export type EarlyWarningWeightsDto = z.infer<typeof earlyWarningWeightsSchema>;

export const earlyWarningThresholdsSchema = z.object({
  green: z.number().min(0).max(100),
  yellow: z.number().min(0).max(100),
  amber: z.number().min(0).max(100),
  red: z.number().min(0).max(100),
}).refine(
  (t) => t.green < t.yellow && t.yellow < t.amber && t.amber < t.red,
  { message: 'Thresholds must be in ascending order: green < yellow < amber < red', path: ['green'] },
).default({
  green: 0,
  yellow: 30,
  amber: 50,
  red: 75,
});
export type EarlyWarningThresholdsDto = z.infer<typeof earlyWarningThresholdsSchema>;

export const routingRuleSingleSchema = z.object({
  role: z.string().min(1),
});

export const routingRuleMultipleSchema = z.object({
  roles: z.array(z.string().min(1)).min(1),
});

export const earlyWarningRoutingRulesSchema = z.object({
  yellow: routingRuleSingleSchema,
  amber: routingRuleSingleSchema,
  red: routingRuleMultipleSchema,
}).default({
  yellow: { role: 'homeroom_teacher' },
  amber: { role: 'year_head' },
  red: { roles: ['principal', 'pastoral_lead'] },
});
export type EarlyWarningRoutingRulesDto = z.infer<typeof earlyWarningRoutingRulesSchema>;

export const highSeverityEventsSchema = z.array(z.string().min(1)).default([
  'suspension',
  'critical_incident',
  'third_consecutive_absence',
]);

export const digestRecipientsSchema = z.array(z.string().uuid()).default([]);

// ─── Signal Summary JSONB Schema ─────────────────────────────────────────────

export const signalSummaryJsonSchema = z.object({
  summaryText: z.string(),
  topSignals: z.array(z.object({
    signalType: z.string(),
    domain: signalDomainSchema,
    severity: signalSeveritySchema,
    scoreContribution: z.number(),
    summaryFragment: z.string(),
  })),
});
export type SignalSummaryJsonDto = z.infer<typeof signalSummaryJsonSchema>;

// ─── Trend JSONB Schema ──────────────────────────────────────────────────────

export const trendJsonSchema = z.object({
  dailyScores: z.array(z.number().min(0).max(100)),
});
export type TrendJsonDto = z.infer<typeof trendJsonSchema>;

// ─── Trigger Signals JSONB Schema ────────────────────────────────────────────

export const triggerSignalsJsonSchema = z.object({
  signals: z.array(z.object({
    signalType: z.string(),
    domain: signalDomainSchema,
    severity: signalSeveritySchema,
    scoreContribution: z.number(),
  })),
});
export type TriggerSignalsJsonDto = z.infer<typeof triggerSignalsJsonSchema>;

// ─── Config Upsert Schema (PUT /v1/early-warnings/config) ───────────────────

export const updateEarlyWarningConfigSchema = z.object({
  is_enabled: z.boolean().optional(),
  weights_json: earlyWarningWeightsSchema.optional(),
  thresholds_json: earlyWarningThresholdsSchema.optional(),
  hysteresis_buffer: z.number().int().min(1).max(30).optional(),
  routing_rules_json: earlyWarningRoutingRulesSchema.optional(),
  digest_day: z.number().int().min(0).max(6).optional(),
  digest_recipients_json: digestRecipientsSchema.optional(),
  high_severity_events_json: highSeverityEventsSchema.optional(),
});
export type UpdateEarlyWarningConfigDto = z.infer<typeof updateEarlyWarningConfigSchema>;

// ─── Query Schemas ───────────────────────────────────────────────────────────

export const earlyWarningListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  risk_tier: riskTierSchema.optional(),
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  sort_by: z.enum(['composite_score', 'student_name']).default('composite_score'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});
export type EarlyWarningListQueryDto = z.infer<typeof earlyWarningListQuerySchema>;

export const cohortQuerySchema = z.object({
  group_by: z.enum(['year_group', 'class', 'subject', 'domain']),
  period: z.enum(['current', '7d', '30d', '90d', 'academic_year']).default('current'),
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  tier: riskTierSchema.optional(),
});
export type CohortQueryDto = z.infer<typeof cohortQuerySchema>;
export type CohortQuery = z.infer<typeof cohortQuerySchema>;

export const assignStudentSchema = z.object({
  assigned_to_user_id: z.string().uuid(),
});
export type AssignStudentDto = z.infer<typeof assignStudentSchema>;

// ─── GET /v1/early-warnings — List risk profiles ────────────────────────────

export const listEarlyWarningsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['composite_score', 'student_name', 'tier_entered_at']).default('composite_score'),
  order: z.enum(['asc', 'desc']).default('desc'),
  tier: riskTierSchema.optional(),
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
});
export type ListEarlyWarningsQuery = z.infer<typeof listEarlyWarningsQuerySchema>;

// ─── GET /v1/early-warnings/summary — Tier distribution ─────────────────────

export const earlyWarningSummaryQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
});
export type EarlyWarningSummaryQuery = z.infer<typeof earlyWarningSummaryQuerySchema>;

// ─── Response Types ─────────────────────────────────────────────────────────

export interface EarlyWarningListItem {
  id: string;
  student_id: string;
  student_name: string;
  composite_score: number;
  risk_tier: string;
  tier_entered_at: string;
  attendance_score: number;
  grades_score: number;
  behaviour_score: number;
  wellbeing_score: number;
  engagement_score: number;
  top_signal: string | null;
  trend_json: number[];
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  last_computed_at: string;
}

export interface EarlyWarningSummary {
  green: number;
  yellow: number;
  amber: number;
  red: number;
  total: number;
}

export interface CohortCell {
  groupKey: string;
  groupId: string;
  studentCount: number;
  avgCompositeScore: number;
  avgAttendanceScore: number;
  avgGradesScore: number;
  avgBehaviourScore: number;
  avgWellbeingScore: number;
  avgEngagementScore: number;
  tierDistribution: { green: number; yellow: number; amber: number; red: number };
}

export interface StudentRiskDetail {
  id: string;
  student_id: string;
  student_name: string;
  academic_year_id: string;
  composite_score: number;
  risk_tier: string;
  tier_entered_at: string;
  attendance_score: number;
  grades_score: number;
  behaviour_score: number;
  wellbeing_score: number;
  engagement_score: number;
  signal_summary_json: Record<string, unknown>;
  trend_json: number[];
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  last_computed_at: string;
  signals: StudentRiskSignalItem[];
  transitions: TierTransitionItem[];
}

export interface StudentRiskSignalItem {
  id: string;
  domain: string;
  signal_type: string;
  severity: string;
  score_contribution: number;
  details_json: Record<string, unknown>;
  detected_at: string;
}

export interface TierTransitionItem {
  id: string;
  from_tier: string | null;
  to_tier: string;
  composite_score: number;
  trigger_signals_json: Record<string, unknown>;
  transitioned_at: string;
}
