export interface GradingScaleConfig {
  type: 'numeric' | 'letter' | 'custom';
  ranges?: Array<{
    min: number;
    max: number;
    label: string;
    gpa_value?: number;
  }>;
  grades?: Array<{
    label: string;
    numeric_value?: number;
  }>;
  passing_threshold?: number;
}

export interface GradingScale {
  id: string;
  tenant_id: string;
  name: string;
  config_json: GradingScaleConfig;
  is_in_use?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssessmentCategory {
  id: string;
  tenant_id: string;
  name: string;
  default_weight: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryWeightJson {
  weights: Array<{
    category_id: string;
    weight: number;
  }>;
}

export interface ClassSubjectGradeConfig {
  id: string;
  tenant_id: string;
  class_id: string;
  subject_id: string;
  grading_scale_id: string;
  category_weight_json: CategoryWeightJson;
  grading_scale?: GradingScale;
  created_at: string;
  updated_at: string;
}

export type AssessmentStatus = 'draft' | 'open' | 'closed' | 'locked';

export interface Assessment {
  id: string;
  tenant_id: string;
  class_id: string;
  subject_id: string;
  academic_period_id: string;
  category_id: string;
  title: string;
  max_score: number;
  due_date: string | null;
  grading_deadline: string | null;
  status: AssessmentStatus;
  grade_count?: number;
  student_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Grade {
  id: string;
  tenant_id: string;
  assessment_id: string;
  student_id: string;
  raw_score: number | null;
  is_missing: boolean;
  comment: string | null;
  entered_by_user_id: string;
  entered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeriodGradeSnapshot {
  id: string;
  tenant_id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  academic_period_id: string;
  computed_value: number;
  display_value: string;
  overridden_value: string | null;
  override_reason: string | null;
  override_actor_user_id: string | null;
  snapshot_at: string;
  created_at: string;
  updated_at: string;
}

export type ReportCardStatus = 'draft' | 'published' | 'revised';

export interface ReportCardSnapshot {
  student: {
    full_name: string;
    student_number: string | null;
    year_group: string;
    class_homeroom: string | null;
  };
  period: {
    name: string;
    academic_year: string;
    start_date: string;
    end_date: string;
  };
  subjects: Array<{
    subject_name: string;
    subject_code: string | null;
    computed_value: number;
    display_value: string;
    overridden_value: string | null;
    assessments: Array<{
      title: string;
      category: string;
      max_score: number;
      raw_score: number | null;
      is_missing: boolean;
    }>;
  }>;
  attendance_summary?: {
    total_days: number;
    present_days: number;
    absent_days: number;
    late_days: number;
  };
  teacher_comment: string | null;
  principal_comment: string | null;
}

export interface ReportCard {
  id: string;
  tenant_id: string;
  student_id: string;
  academic_period_id: string;
  status: ReportCardStatus;
  template_locale: string;
  teacher_comment: string | null;
  principal_comment: string | null;
  published_at: string | null;
  published_by_user_id: string | null;
  revision_of_report_card_id: string | null;
  snapshot_payload_json: ReportCardSnapshot;
  created_at: string;
  updated_at: string;
}

export interface TranscriptData {
  student: {
    id: string;
    full_name: string;
    student_number: string | null;
    year_group: string;
  };
  years: Array<{
    academic_year: string;
    periods: Array<{
      period_name: string;
      subjects: Array<{
        subject_name: string;
        subject_code: string | null;
        computed_value: number;
        display_value: string;
        overridden_value: string | null;
      }>;
    }>;
  }>;
}

export interface ImportRow {
  row_number: number;
  student_identifier: string;
  subject_code?: string;
  subject_name?: string;
  assessment_title: string;
  score: number;
  student_id?: string;
  assessment_id?: string;
  match_status: 'matched' | 'unmatched' | 'ambiguous';
  match_reason?: string;
}

export interface StudentGradesSummary {
  student: {
    id: string;
    full_name: string;
    student_number: string | null;
  };
  subjects: Array<{
    subject_name: string;
    subject_code: string | null;
    period_grade?: {
      computed_value: number;
      display_value: string;
      overridden_value: string | null;
    };
    assessments: Array<{
      id: string;
      title: string;
      category: string;
      max_score: number;
      raw_score: number | null;
      is_missing: boolean;
    }>;
  }>;
}

// ─── Rubric Types ─────────────────────────────────────────────────────────

export interface RubricLevel {
  label: string;
  points: number;
  description: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  max_points: number;
  levels: RubricLevel[];
}

export interface RubricTemplate {
  id: string;
  tenant_id: string;
  name: string;
  subject_id: string | null;
  created_by_user_id: string;
  criteria: RubricCriterion[];
  created_at: string;
  updated_at: string;
}

export interface RubricGrade {
  id: string;
  tenant_id: string;
  grade_id: string;
  criterion_id: string;
  level_index: number;
  points_awarded: number;
  created_at: string;
  updated_at: string;
}

// ─── Standards Types ──────────────────────────────────────────────────────

export interface CurriculumStandard {
  id: string;
  tenant_id: string;
  subject_id: string;
  year_group_id: string;
  code: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CompetencyScaleLevel {
  label: string;
  threshold_min: number;
}

export interface CompetencyScale {
  id: string;
  tenant_id: string;
  name: string;
  levels: CompetencyScaleLevel[];
  created_at: string;
  updated_at: string;
}

export interface StudentCompetencySnapshot {
  id: string;
  tenant_id: string;
  student_id: string;
  standard_id: string;
  academic_period_id: string;
  competency_level: string;
  score_average: number;
  computed_from_count: number;
  last_updated: string;
}

// ─── GPA Types ────────────────────────────────────────────────────────────

export interface GpaSnapshot {
  id: string;
  tenant_id: string;
  student_id: string;
  academic_period_id: string;
  gpa_value: number;
  credit_hours_total: number;
  snapshot_at: string;
}

// ─── Grade Curve Types ────────────────────────────────────────────────────

export type CurveMethod = 'none' | 'linear_shift' | 'linear_scale' | 'sqrt' | 'bell' | 'custom';

export interface GradeCurveAudit {
  id: string;
  tenant_id: string;
  assessment_id: string;
  applied_by_user_id: string;
  applied_at: string;
  method: CurveMethod;
  params: Record<string, unknown> | null;
  before_scores: Array<{ student_id: string; raw_score: number | null }>;
  after_scores: Array<{ student_id: string; raw_score: number | null }>;
  can_undo: boolean;
}

// ─── Assessment Template Types ────────────────────────────────────────────

export interface AssessmentTemplate {
  id: string;
  tenant_id: string;
  name: string;
  subject_id: string | null;
  category_id: string;
  max_score: number;
  rubric_template_id: string | null;
  standard_ids: string[] | null;
  counts_toward_report_card: boolean;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

// ─── AI Grading Types ─────────────────────────────────────────────────────

export type AiGradingInstructionStatus = 'draft' | 'pending_approval' | 'active' | 'rejected';

export interface AiGradingInstruction {
  id: string;
  tenant_id: string;
  class_id: string;
  subject_id: string;
  instruction_text: string;
  status: AiGradingInstructionStatus;
  submitted_by_user_id: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiGradingReference {
  id: string;
  tenant_id: string;
  assessment_id: string;
  file_url: string;
  file_type: string;
  uploaded_by_user_id: string;
  status: 'pending_approval' | 'active' | 'rejected';
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Risk Alert Types ─────────────────────────────────────────────────────

export type AcademicRiskLevel = 'low' | 'medium' | 'high';

export type AcademicAlertType =
  | 'at_risk_low'
  | 'at_risk_medium'
  | 'at_risk_high'
  | 'score_anomaly'
  | 'class_anomaly'
  | 'grading_pattern_anomaly'
  | 'teacher_variance';

export type AcademicAlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface StudentAcademicRiskAlert {
  id: string;
  tenant_id: string;
  student_id: string;
  risk_level: AcademicRiskLevel;
  alert_type: AcademicAlertType;
  subject_id: string | null;
  trigger_reason: string;
  details_json: Record<string, unknown>;
  detected_date: string;
  status: AcademicAlertStatus;
  acknowledged_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Progress Report Types ────────────────────────────────────────────────

export type ProgressReportStatus = 'draft' | 'sent';

export type TrendDirection = 'improving' | 'declining' | 'stable';

export interface ProgressReportEntry {
  id: string;
  tenant_id: string;
  progress_report_id: string;
  subject_id: string;
  current_average: number;
  trend: TrendDirection;
  teacher_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgressReport {
  id: string;
  tenant_id: string;
  student_id: string;
  class_id: string;
  academic_period_id: string;
  generated_at: string;
  generated_by_user_id: string;
  status: ProgressReportStatus;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  entries?: ProgressReportEntry[];
}

// ─── Analytics Types ──────────────────────────────────────────────────────

export interface GradeDistributionStats {
  mean: number;
  median: number;
  mode: number | null;
  std_dev: number;
  pass_rate: number;
  min: number;
  max: number;
  percentile_bands: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  count: number;
}

export interface TeacherConsistencyReport {
  subject_id: string;
  subject_name: string;
  year_group_id: string;
  year_group_name: string;
  teachers: Array<{
    user_id: string;
    full_name: string;
    class_id: string;
    class_name: string;
    mean: number;
    pass_rate: number;
    std_dev: number;
    deviation_from_cohort: number;
    flagged: boolean;
  }>;
}

export interface BenchmarkComparison {
  dimension: 'class' | 'year_group' | 'period';
  groups: Array<{
    id: string;
    name: string;
    mean: number;
    pass_rate: number;
    student_count: number;
  }>;
}

// ─── NL Query Types ───────────────────────────────────────────────────────

export interface NlQueryResult {
  question: string;
  structured_query: Record<string, unknown>;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}
