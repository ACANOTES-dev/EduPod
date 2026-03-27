import { z } from 'zod';

// ─── Common analytics query params ────────────────────────────────────────

export const behaviourAnalyticsQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
  academicPeriodId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  yearGroupId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  polarity: z.enum(['positive', 'negative', 'neutral']).optional(),
  categoryId: z.string().uuid().optional(),
  exposureNormalised: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .default('true'),
});

export type BehaviourAnalyticsQuery = z.infer<typeof behaviourAnalyticsQuerySchema>;

// ─── Pulse types ───────────────────────────────────────────────────────────

export interface PulseDimension {
  name: string;
  value: number | null;
  weight: number;
  label: string;
}

export interface PulseResult {
  dimensions: PulseDimension[];
  composite: number | null;
  composite_available: boolean;
  gate_reason: string | null;
  cached_at: string;
  pulse_enabled: boolean;
}

// ─── Overview ──────────────────────────────────────────────────────────────

export interface OverviewResult {
  total_incidents: number;
  prior_period_total: number;
  delta_percent: number | null;
  positive_negative_ratio: number | null;
  ratio_trend: 'improving' | 'stable' | 'declining' | null;
  open_follow_ups: number;
  active_alerts: number;
  data_quality: DataQuality;
}

export interface DataQuality {
  exposure_normalised: boolean;
  data_as_of: string;
}

// ─── Heatmap ───────────────────────────────────────────────────────────────

export interface HeatmapCell {
  weekday: number;
  period_order: number;
  raw_count: number;
  rate: number | null;
  polarity_breakdown: { positive: number; negative: number; neutral: number };
}

export interface HeatmapResult {
  cells: HeatmapCell[];
  data_quality: DataQuality;
}

// ─── Trends ────────────────────────────────────────────────────────────────

export interface TrendPoint {
  date: string;
  positive: number;
  negative: number;
  neutral: number;
  total: number;
}

export interface TrendResult {
  points: TrendPoint[];
  granularity: 'daily' | 'weekly' | 'monthly';
  data_quality: DataQuality;
}

// ─── Categories ────────────────────────────────────────────────────────────

export interface CategoryBreakdown {
  category_id: string;
  category_name: string;
  polarity: string;
  count: number;
  rate_per_100: number | null;
  trend_percent: number | null;
}

export interface CategoryResult {
  categories: CategoryBreakdown[];
  data_quality: DataQuality;
}

// ─── Subjects ──────────────────────────────────────────────────────────────

export interface SubjectAnalysis {
  subject_id: string;
  subject_name: string;
  incident_count: number;
  rate_per_100_periods: number | null;
  trend_percent: number | null;
}

export interface SubjectResult {
  subjects: SubjectAnalysis[];
  data_quality: DataQuality;
}

// ─── Staff ─────────────────────────────────────────────────────────────────

export interface StaffActivity {
  staff_id: string;
  staff_name: string;
  last_7_days: number;
  last_30_days: number;
  total_year: number;
  last_logged_at: string | null;
  inactive_flag: boolean;
}

export interface StaffResult {
  staff: StaffActivity[];
  data_quality: DataQuality;
}

// ─── Ratio ─────────────────────────────────────────────────────────────────

export interface RatioEntry {
  group_id: string;
  group_name: string;
  positive: number;
  negative: number;
  ratio: number | null;
}

export interface RatioResult {
  entries: RatioEntry[];
  data_quality: DataQuality;
}

// ─── Comparisons ───────────────────────────────────────────────────────────

export interface ComparisonEntry {
  year_group_id: string;
  year_group_name: string;
  incident_rate: number | null;
  positive_rate: number | null;
  negative_rate: number | null;
  student_count: number;
}

export interface ComparisonResult {
  entries: ComparisonEntry[];
  data_quality: DataQuality;
}

// ─── Policy effectiveness ──────────────────────────────────────────────────

export interface PolicyEffectivenessEntry {
  rule_id: string;
  rule_name: string;
  match_count: number;
  fire_count: number;
  fire_rate: number;
}

export interface PolicyEffectivenessResult {
  rules: PolicyEffectivenessEntry[];
  data_quality: DataQuality;
}

// ─── Task completion ───────────────────────────────────────────────────────

export interface TaskCompletionEntry {
  task_type: string;
  total: number;
  completed: number;
  overdue: number;
  completion_rate: number;
  avg_days_to_complete: number | null;
}

export interface TaskCompletionResult {
  entries: TaskCompletionEntry[];
  data_quality: DataQuality;
}

// ─── Sanctions ─────────────────────────────────────────────────────────────

export interface SanctionSummaryEntry {
  sanction_type: string;
  total: number;
  served: number;
  no_show: number;
  trend_percent: number | null;
}

export interface SanctionSummaryResult {
  entries: SanctionSummaryEntry[];
  data_quality: DataQuality;
}

// ─── Interventions ─────────────────────────────────────────────────────────

export interface InterventionOutcomeEntry {
  outcome: string;
  count: number;
  send_count: number;
  non_send_count: number;
}

export interface InterventionOutcomeResult {
  entries: InterventionOutcomeEntry[];
  data_quality: DataQuality;
}

// ─── AI Query ──────────────────────────────────────────────────────────────

export const aiQuerySchema = z.object({
  query: z.string().min(1).max(500),
  context: z
    .object({
      yearGroupId: z.string().uuid().optional(),
      studentId: z.string().uuid().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    })
    .optional(),
});

export type AIQueryInput = z.infer<typeof aiQuerySchema>;

export interface AIQueryResult {
  result: string;
  data_as_of: string;
  ai_generated: true;
  scope_applied: string;
  confidence: number | null;
  structured_data?: Record<string, unknown>;
}

export interface AIQueryHistoryEntry {
  id: string;
  query: string;
  result_summary: string;
  created_at: string;
}

export interface AIQueryHistoryResult {
  entries: AIQueryHistoryEntry[];
  meta: { page: number; pageSize: number; total: number };
}
