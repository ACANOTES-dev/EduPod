// ─── Risk Tiers ──────────────────────────────────────────────────────────────

export const RISK_TIERS = ['green', 'yellow', 'amber', 'red'] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

// ─── Signal Domains ──────────────────────────────────────────────────────────

export const SIGNAL_DOMAINS = ['attendance', 'grades', 'behaviour', 'wellbeing', 'engagement'] as const;
export type SignalDomain = (typeof SIGNAL_DOMAINS)[number];

// ─── Signal Severity ─────────────────────────────────────────────────────────

export const SIGNAL_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

// ─── Default Weights (must sum to 100) ───────────────────────────────────────

export const DEFAULT_WEIGHTS: Record<SignalDomain, number> = {
  attendance: 25,
  grades: 25,
  behaviour: 20,
  wellbeing: 20,
  engagement: 10,
} as const;

// ─── Default Tier Thresholds ─────────────────────────────────────────────────

export const DEFAULT_THRESHOLDS: Record<RiskTier, number> = {
  green: 0,
  yellow: 30,
  amber: 50,
  red: 75,
} as const;

// ─── Default Hysteresis Buffer ───────────────────────────────────────────────

export const DEFAULT_HYSTERESIS_BUFFER = 10;

// ─── Default Digest Day (Monday = 1) ─────────────────────────────────────────

export const DEFAULT_DIGEST_DAY = 1;

// ─── Default High Severity Events ────────────────────────────────────────────

export const DEFAULT_HIGH_SEVERITY_EVENTS = [
  'suspension',
  'critical_incident',
  'third_consecutive_absence',
] as const;
export type HighSeverityEvent = (typeof DEFAULT_HIGH_SEVERITY_EVENTS)[number];

// ─── Cross-Domain Boost Thresholds ───────────────────────────────────────────

export const CROSS_DOMAIN_BOOST = {
  DOMAIN_THRESHOLD: 40,
  BOOST_3_DOMAINS: 5,
  BOOST_4_DOMAINS: 10,
  BOOST_5_DOMAINS: 15,
} as const;

// ─── Signal Type Constants ───────────────────────────────────────────────────

export const ATTENDANCE_SIGNAL_TYPES = [
  'attendance_rate_decline',
  'consecutive_absences',
  'recurring_day_pattern',
  'chronic_tardiness',
  'attendance_trajectory',
] as const;

export const GRADES_SIGNAL_TYPES = [
  'below_class_mean',
  'grade_trajectory_decline',
  'missing_assessments',
  'score_anomaly',
  'multi_subject_decline',
] as const;

export const BEHAVIOUR_SIGNAL_TYPES = [
  'incident_frequency',
  'escalating_severity',
  'active_sanction',
  'exclusion_history',
  'failed_intervention',
] as const;

export const WELLBEING_SIGNAL_TYPES = [
  'declining_wellbeing_score',
  'low_mood_pattern',
  'active_pastoral_concern',
  'active_pastoral_case',
  'external_referral',
  'critical_incident_affected',
] as const;

export const ENGAGEMENT_SIGNAL_TYPES = [
  'low_notification_read_rate',
  'no_portal_login',
  'no_parent_inquiry',
  'slow_acknowledgement',
  'disengagement_trajectory',
] as const;

export const ALL_SIGNAL_TYPES = [
  ...ATTENDANCE_SIGNAL_TYPES,
  ...GRADES_SIGNAL_TYPES,
  ...BEHAVIOUR_SIGNAL_TYPES,
  ...WELLBEING_SIGNAL_TYPES,
  ...ENGAGEMENT_SIGNAL_TYPES,
] as const;
export type SignalType = (typeof ALL_SIGNAL_TYPES)[number];

// ─── Default Routing Rules ───────────────────────────────────────────────────

export const DEFAULT_ROUTING_RULES = {
  yellow: { role: 'homeroom_teacher' },
  amber: { role: 'year_head' },
  red: { roles: ['principal', 'pastoral_lead'] },
} as const;

// ─── Job Names ───────────────────────────────────────────────────────────────

export const EARLY_WARNING_COMPUTE_DAILY_JOB = 'early-warning:compute-daily';
export const EARLY_WARNING_COMPUTE_STUDENT_JOB = 'early-warning:compute-student';
export const EARLY_WARNING_WEEKLY_DIGEST_JOB = 'early-warning:weekly-digest';
