// ─── Early Warning Frontend Types ─────────────────────────────────────────────

export type RiskTier = 'green' | 'yellow' | 'amber' | 'red';
export type SignalDomain = 'attendance' | 'grades' | 'behaviour' | 'wellbeing' | 'engagement';
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RiskProfileListItem {
  id: string;
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  class_name: string | null;
  composite_score: number;
  risk_tier: RiskTier;
  top_signal: string | null;
  trend_data: number[];
  assigned_to_name: string | null;
  last_computed_at: string;
}

export interface RiskProfileListResponse {
  data: RiskProfileListItem[];
  meta: { page: number; pageSize: number; total: number };
}

export interface RiskSignal {
  id: string;
  domain: SignalDomain;
  signal_type: string;
  severity: SignalSeverity;
  score_contribution: number;
  summary_fragment: string;
  detected_at: string;
}

export interface TierTransition {
  id: string;
  from_tier: RiskTier | null;
  to_tier: RiskTier;
  composite_score: number;
  transitioned_at: string;
}

export interface RiskProfileDetail {
  id: string;
  student_id: string;
  student_name: string;
  composite_score: number;
  risk_tier: RiskTier;
  tier_entered_at: string;
  attendance_score: number;
  grades_score: number;
  behaviour_score: number;
  wellbeing_score: number;
  engagement_score: number;
  summary_text: string;
  trend_data: number[];
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  signals: RiskSignal[];
  transitions: TierTransition[];
}

export interface TierSummaryResponse {
  data: {
    green: number;
    yellow: number;
    amber: number;
    red: number;
  };
}

export interface CohortRow {
  group_id: string;
  group_name: string;
  student_count: number;
  avg_composite: number;
  avg_attendance: number;
  avg_grades: number;
  avg_behaviour: number;
  avg_wellbeing: number;
  avg_engagement: number;
}

export interface CohortResponse {
  data: CohortRow[];
}

export interface EarlyWarningConfig {
  id: string;
  is_enabled: boolean;
  weights: {
    attendance: number;
    grades: number;
    behaviour: number;
    wellbeing: number;
    engagement: number;
  };
  thresholds: {
    green: number;
    yellow: number;
    amber: number;
    red: number;
  };
  hysteresis_buffer: number;
  routing_rules: {
    yellow: { role: string };
    amber: { role: string };
    red: { roles: string[] };
  };
  digest_day: number;
  digest_recipients: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const TIER_ORDER: RiskTier[] = ['red', 'amber', 'yellow', 'green'];

export const TIER_COLORS: Record<RiskTier, { bg: string; text: string; ring: string }> = {
  red: { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-200' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-200' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', ring: 'ring-yellow-200' },
  green: { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-200' },
};

export const DOMAIN_LABELS: Record<SignalDomain, string> = {
  attendance: 'Attendance',
  grades: 'Grades',
  behaviour: 'Behaviour',
  wellbeing: 'Wellbeing',
  engagement: 'Engagement',
};

export const DOMAIN_COLORS: Record<SignalDomain, string> = {
  attendance: 'bg-blue-500',
  grades: 'bg-purple-500',
  behaviour: 'bg-orange-500',
  wellbeing: 'bg-teal-500',
  engagement: 'bg-pink-500',
};

export const SEVERITY_COLORS: Record<SignalSeverity, { bg: string; text: string }> = {
  low: { bg: 'bg-slate-100', text: 'text-slate-600' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  critical: { bg: 'bg-red-100', text: 'text-red-700' },
};

/** Returns a heatmap cell colour class based on an average score (0-100). */
export function getHeatmapColor(score: number): string {
  if (score >= 75) return 'bg-red-200 text-red-900';
  if (score >= 50) return 'bg-amber-200 text-amber-900';
  if (score >= 30) return 'bg-yellow-200 text-yellow-900';
  return 'bg-emerald-200 text-emerald-900';
}
