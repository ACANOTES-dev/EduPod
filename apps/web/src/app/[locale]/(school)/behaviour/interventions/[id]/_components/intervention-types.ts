// ─── Shared types for intervention detail components ─────────────────────────

export interface InterventionGoal {
  id: string;
  goal_text: string;
  measurable_target: string | null;
  deadline: string | null;
  status: string;
  progress_pct: number | null;
}

export interface InterventionStrategy {
  id: string;
  strategy_text: string;
  frequency: string | null;
  responsible_staff_id: string | null;
  responsible_staff_user?: { first_name: string; last_name: string } | null;
}

export interface InterventionDetail {
  id: string;
  title: string;
  intervention_type: string;
  status: string;
  trigger_description: string | null;
  send_awareness: boolean;
  send_notes: string | null;
  start_date: string;
  target_end_date: string | null;
  next_review_date: string | null;
  review_frequency_days: number;
  created_at: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    year_group?: { name: string } | null;
  } | null;
  assigned_to_user: {
    first_name: string;
    last_name: string;
  } | null;
  goals: InterventionGoal[];
  strategies: InterventionStrategy[];
}

export interface ReviewEntry {
  id: string;
  review_date: string;
  progress: string;
  notes: string | null;
  next_review_date: string | null;
  points_since_last: number | null;
  attendance_rate: number | null;
  reviewer_user?: { first_name: string; last_name: string } | null;
  goal_updates: Array<{
    goal_id: string;
    status: string;
    notes: string | null;
  }>;
}

export interface ReviewAutoPopulate {
  points_since_last: number;
  attendance_rate: number;
  goal_statuses: Array<{
    goal_id: string;
    goal_text: string;
    current_status: string;
  }>;
}

export interface TaskEntry {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  assigned_to_user?: { first_name: string; last_name: string } | null;
  created_at: string;
}

export interface LinkedIncident {
  id: string;
  incident_number: string;
  description: string;
  status: string;
  occurred_at: string;
  category?: { name: string; color: string | null } | null;
}

export interface HistoryEntry {
  id: string;
  action: string;
  changes: Record<string, unknown>;
  performed_by_user?: { first_name: string; last_name: string } | null;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'history', label: 'History' },
] as const;

export type DetailTab = (typeof DETAIL_TABS)[number]['key'];

export const TYPE_LABELS: Record<string, string> = {
  behaviour_plan: 'Behaviour Plan',
  mentoring: 'Mentoring',
  counselling_referral: 'Counselling',
  restorative: 'Restorative',
  academic_support: 'Academic Support',
  parent_engagement: 'Parent Engagement',
  external_agency: 'External Agency',
  other: 'Other',
};

export const TYPE_COLORS: Record<string, string> = {
  behaviour_plan: 'bg-blue-100 text-blue-700',
  mentoring: 'bg-purple-100 text-purple-700',
  counselling_referral: 'bg-pink-100 text-pink-700',
  restorative: 'bg-green-100 text-green-700',
  academic_support: 'bg-amber-100 text-amber-700',
  parent_engagement: 'bg-teal-100 text-teal-700',
  external_agency: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-700',
};

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  overdue: 'bg-red-100 text-red-700',
  monitoring: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  closed_unsuccessful: 'bg-gray-100 text-gray-700',
  draft: 'bg-gray-100 text-gray-500',
};

export const PROGRESS_COLORS: Record<string, string> = {
  on_track: 'bg-green-100 text-green-700',
  some_progress: 'bg-amber-100 text-amber-700',
  no_progress: 'bg-red-100 text-red-700',
  regression: 'bg-red-200 text-red-800',
};

export const STATUS_TRANSITIONS: Record<string, Array<{ value: string; label: string }>> = {
  active: [
    { value: 'monitoring', label: 'Move to Monitoring' },
    { value: 'completed', label: 'Mark Completed' },
    { value: 'closed_unsuccessful', label: 'Close (Unsuccessful)' },
  ],
  monitoring: [
    { value: 'active', label: 'Reactivate' },
    { value: 'completed', label: 'Mark Completed' },
    { value: 'closed_unsuccessful', label: 'Close (Unsuccessful)' },
  ],
  completed: [{ value: 'active', label: 'Reactivate' }],
  closed_unsuccessful: [{ value: 'active', label: 'Reactivate' }],
  draft: [{ value: 'active', label: 'Activate' }],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
