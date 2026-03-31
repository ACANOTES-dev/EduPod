// ─── Shared types for survey detail components ──────────────────────────────

export interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: 'likert_5' | 'single_choice' | 'freeform';
  display_order: number;
  options: string[] | null;
  is_required: boolean;
}

export interface Survey {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'active' | 'closed' | 'archived';
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'ad_hoc';
  window_opens_at: string;
  window_closes_at: string;
  min_response_threshold: number;
  dept_drill_down_threshold: number;
  moderation_enabled: boolean;
  created_at: string;
  updated_at: string;
  questions: SurveyQuestion[];
  participation_count?: number;
  eligible_count?: number;
}

export interface LikertResult {
  question_id: string;
  question_text: string;
  question_type: 'likert_5';
  mean: number;
  median: number;
  distribution: Record<string, number>;
  response_count: number;
}

export interface SingleChoiceResult {
  question_id: string;
  question_text: string;
  question_type: 'single_choice';
  distribution: Record<string, number>;
  response_count: number;
}

export interface FreeformResult {
  question_id: string;
  question_text: string;
  question_type: 'freeform';
  approved_count: number;
  redacted_count: number;
  response_count: number;
}

export type QuestionResult = LikertResult | SingleChoiceResult | FreeformResult;

export interface DepartmentInfo {
  department: string;
  staff_count: number;
  eligible: boolean;
}

export interface SurveyResultsResponse {
  survey_id: string;
  response_count: number;
  eligible_count: number;
  below_threshold: boolean;
  questions: QuestionResult[];
  departments?: DepartmentInfo[];
}

export interface ModerationItem {
  id: string;
  question_id: string;
  question_text: string;
  answer_text: string;
  moderation_status: 'pending' | 'flagged';
  flagged_matches: string[] | null;
  submitted_at: string;
}

export interface ModeratedComment {
  question_id: string;
  question_text: string;
  answer_text: string;
  moderation_status: 'approved' | 'redacted';
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LIKERT_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];

export const CHOICE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];

export const STATUS_BADGE_VARIANT: Record<
  Survey['status'],
  'secondary' | 'success' | 'info' | 'warning'
> = {
  draft: 'secondary',
  active: 'success',
  closed: 'info',
  archived: 'warning',
};
