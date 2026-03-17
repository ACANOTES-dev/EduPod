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
