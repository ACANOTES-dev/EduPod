// ─── Types & Constants for Exclusion Detail ──────────────────────────────────

export interface TimelineStep {
  step: string;
  required_by: string | null;
  completed_at: string | null;
  status: 'complete' | 'pending' | 'overdue' | 'not_started';
}

export interface HearingAttendee {
  name: string;
  role: string;
  relationship?: string;
}

export interface ExclusionDetail {
  id: string;
  case_number: string;
  type: string;
  status: string;
  formal_notice_issued_at: string | null;
  hearing_date: string | null;
  hearing_attendees: HearingAttendee[] | null;
  student_representation: string | null;
  board_pack_generated_at: string | null;
  decision: string | null;
  decision_date: string | null;
  decision_reasoning: string | null;
  decided_by_id: string | null;
  conditions_for_return: string | null;
  conditions_for_transfer: string | null;
  appeal_deadline: string | null;
  appeal_id: string | null;
  created_at: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    year_group?: { id: string; name: string } | null;
  } | null;
  sanction: {
    id: string;
    sanction_number: string;
    type: string;
    status: string;
  } | null;
  incident: {
    id: string;
    incident_number: string;
    description: string;
    category?: { id: string; name: string; severity: number } | null;
  } | null;
  decided_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  appeal: {
    id: string;
    appeal_number: string;
    status: string;
    grounds_category: string;
    submitted_at: string;
    decision: string | null;
  } | null;
}

export interface HistoryEntry {
  id: string;
  action: string;
  changes: Record<string, unknown>;
  performed_by_user?: { first_name: string; last_name: string } | null;
  created_at: string;
}

export interface StaffOption {
  id: string;
  user?: { first_name: string; last_name: string } | null;
  first_name?: string;
  last_name?: string;
}

// ─── Badge Colors ─────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  initiated: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  notice_issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  hearing_scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  hearing_held: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  decision_made: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  appeal_window: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  finalised: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  overturned: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export const TYPE_COLORS: Record<string, string> = {
  suspension_extended: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  expulsion: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  managed_move: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  permanent_exclusion: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

export const APPEAL_STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  hearing_scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  decided: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  withdrawn: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getDaysRemaining(deadline: string | null): number | null {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  return Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
