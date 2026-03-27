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
  student_name?: string;
  status: string;
  tier: number;
  owner_user_id: string;
  owner_name: string | null;
  next_review_date: string | null;
  created_at: string;
  concern_count: number;
  student_count: number;
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

export const PASTORAL_EDITABLE_TIERS = [1, 2] as const;

export function getLocaleFromPathname(pathname: string | null): string {
  return (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
}

export function formatPastoralValue(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
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
