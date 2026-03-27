import { apiClient } from '@/lib/api-client';

export interface SearchOption {
  id: string;
  label: string;
  description?: string;
}

export interface PastoralConcernInvolvedStudent {
  student_id: string;
  student_name: string;
  added_at: string;
}

export interface PastoralWitness {
  type: 'staff' | 'student';
  id: string;
  name: string;
}

export interface PastoralConcernVersion {
  id: string;
  concern_id: string;
  version_number: number;
  narrative: string;
  amendment_reason: string | null;
  amended_by_user_id: string;
  created_at: string;
}

export interface PastoralConcernListItem {
  id: string;
  student_id: string;
  student_name: string;
  category: string;
  severity: string;
  tier: number;
  occurred_at: string;
  created_at: string;
  follow_up_needed: boolean;
  case_id: string | null;
  students_involved: PastoralConcernInvolvedStudent[];
  author_name: string | null;
  author_masked_for_viewer: boolean;
  logged_by_user_id: string | null;
}

export interface PastoralConcernDetail extends PastoralConcernListItem {
  witnesses: PastoralWitness[] | null;
  actions_taken: string | null;
  follow_up_suggestion: string | null;
  location: string | null;
  behaviour_incident_id: string | null;
  parent_shareable: boolean;
  parent_share_level: string | null;
  acknowledged_at: string | null;
  acknowledged_by_user_id: string | null;
  versions: PastoralConcernVersion[];
}

export interface PastoralCaseListItem {
  id: string;
  case_number: string;
  student_id: string;
  student_name: string;
  status: string;
  tier: number;
  owner_user_id: string;
  owner_name: string | null;
  next_review_date: string | null;
  created_at: string;
  concern_count: number;
  student_count: number;
}

export interface PastoralCaseDetail extends PastoralCaseListItem {
  opened_by_user_id: string;
  opened_by_name: string | null;
  opened_reason: string;
  legal_hold: boolean;
  resolved_at: string | null;
  closed_at: string | null;
  updated_at: string;
  days_open: number;
  concerns: Array<{
    id: string;
    category: string;
    severity: string;
    tier: number;
    created_at: string;
    latest_narrative: string | null;
  }>;
  students: Array<{
    student_id: string;
    name: string;
    added_at: string;
    is_primary: boolean;
  }>;
}

export interface SstMeetingAttendee {
  user_id: string;
  name: string;
  present: boolean | null;
}

export interface SstAgendaItem {
  id: string;
  meeting_id: string;
  source: string;
  student_id: string | null;
  case_id: string | null;
  concern_id: string | null;
  description: string;
  discussion_notes: string | null;
  decisions: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface SstMeetingAction {
  id: string;
  meeting_id: string;
  agenda_item_id: string | null;
  student_id: string | null;
  case_id: string | null;
  description: string;
  assigned_to_user_id: string;
  due_date: string;
  completed_at: string | null;
  completed_by_user_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SstMeetingListItem {
  id: string;
  scheduled_at: string;
  status: string;
  attendees: SstMeetingAttendee[] | null;
  general_notes: string | null;
  agenda_precomputed_at: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SstMeetingDetail extends SstMeetingListItem {
  agenda_items: SstAgendaItem[];
  actions: SstMeetingAction[];
}

export interface PastoralApiListResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface PastoralApiDetailResponse<T> {
  data: T;
}

interface StudentSearchResponse {
  data: Array<{
    id: string;
    first_name: string;
    last_name: string;
    student_number?: string | null;
  }>;
}

interface StaffSearchResponse {
  data: Array<{
    id: string;
    user_id: string;
    job_title?: string | null;
    department?: string | null;
    user: {
      id: string;
      first_name: string;
      last_name: string;
      email?: string | null;
    };
  }>;
}

export const PASTORAL_CATEGORY_SUGGESTIONS = [
  'academic',
  'social',
  'emotional',
  'behavioural',
  'attendance',
  'family_home',
  'health',
  'child_protection',
  'bullying',
  'self_harm',
  'other',
] as const;

export const PASTORAL_SEVERITIES = ['routine', 'elevated', 'urgent', 'critical'] as const;

export const PASTORAL_CASE_STATUSES = [
  'open',
  'active',
  'monitoring',
  'resolved',
  'closed',
] as const;

export const PASTORAL_CASE_TRANSITIONS: Record<string, string[]> = {
  open: ['active'],
  active: ['monitoring', 'resolved'],
  monitoring: ['active', 'resolved'],
  resolved: ['closed'],
  closed: ['open'],
};

export const SST_MEETING_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;

export const PASTORAL_EDITABLE_TIERS = [1, 2] as const;

export function getLocaleFromPathname(pathname: string | null): string {
  return (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
}

export function formatPastoralValue(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeMeetingStatus(value: string): string {
  if (value === 'sst_in_progress') return 'in_progress';
  if (value === 'sst_completed') return 'completed';
  if (value === 'sst_cancelled') return 'cancelled';
  return value;
}

export function formatShortId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

export async function searchStudents(query: string): Promise<SearchOption[]> {
  const response = await apiClient<StudentSearchResponse>(
    `/api/v1/students?search=${encodeURIComponent(query)}&pageSize=10`,
    { silent: true },
  );

  return (response.data ?? []).map((student) => ({
    id: student.id,
    label: `${student.first_name} ${student.last_name}`.trim(),
    description: student.student_number ?? undefined,
  }));
}

export async function searchStaff(query: string): Promise<SearchOption[]> {
  const response = await apiClient<StaffSearchResponse>(
    `/api/v1/staff-profiles?search=${encodeURIComponent(query)}&pageSize=10`,
    { silent: true },
  );

  return (response.data ?? []).map((profile) => ({
    id: profile.user.id,
    label: `${profile.user.first_name} ${profile.user.last_name}`.trim(),
    description: profile.job_title ?? profile.department ?? profile.user.email ?? undefined,
  }));
}
