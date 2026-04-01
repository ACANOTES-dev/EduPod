// ─── Shared types for wellbeing/surveys components ───────────────────────────

export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived';
export type QuestionType = 'likert_5' | 'single_choice' | 'freeform';
export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'ad_hoc';

export interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType;
  display_order: number;
  options: string[] | null;
  is_required: boolean;
}

export interface Survey {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  frequency: Frequency;
  window_opens_at: string;
  window_closes_at: string;
  min_response_threshold: number;
  dept_drill_down_threshold: number;
  moderation_enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  questions?: SurveyQuestion[];
  _count?: { survey_responses: number };
  participation_count?: number;
  eligible_count?: number;
}

export interface SurveyListResponse {
  data: Survey[];
  meta: { page: number; pageSize: number; total: number };
}

export interface QuestionFormItem {
  tempId: string;
  question_text: string;
  question_type: QuestionType;
  options: string[];
  is_required: boolean;
}

export interface SurveyFormState {
  title: string;
  description: string;
  frequency: Frequency;
  window_opens_at: string;
  window_closes_at: string;
  min_response_threshold: number;
  dept_drill_down_threshold: number;
  moderation_enabled: boolean;
  questions: QuestionFormItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<SurveyStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-500',
};

export const STATUSES: Array<SurveyStatus | 'all'> = [
  'all',
  'draft',
  'active',
  'closed',
  'archived',
];
export const FREQUENCIES: Frequency[] = ['weekly', 'fortnightly', 'monthly', 'ad_hoc'];
export const QUESTION_TYPES: QuestionType[] = ['likert_5', 'single_choice', 'freeform'];
export const PAGE_SIZE = 20;

export const DEFAULT_FORM: SurveyFormState = {
  title: '',
  description: '',
  frequency: 'monthly',
  window_opens_at: '',
  window_closes_at: '',
  min_response_threshold: 5,
  dept_drill_down_threshold: 10,
  moderation_enabled: true,
  questions: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function generateTempId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDateRange(opens: string, closes: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  return `${fmt(opens)} — ${fmt(closes)}`;
}

export function toDatetimeLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocal(local: string): string {
  if (!local) return '';
  return new Date(local).toISOString();
}
