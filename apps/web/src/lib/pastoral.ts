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

export interface PastoralInterventionTargetOutcome {
  description: string;
  measurable_target: string;
}

export interface PastoralInterventionListItem {
  id: string;
  tenant_id: string;
  case_id: string;
  student_id: string;
  student_name?: string | null;
  case_number?: string | null;
  intervention_type: string;
  continuum_level: number;
  target_outcomes: PastoralInterventionTargetOutcome[];
  review_cycle_weeks: number;
  next_review_date: string;
  parent_informed: boolean;
  parent_consented: boolean | null;
  parent_input: string | null;
  student_voice: string | null;
  status: string;
  outcome_notes: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface PastoralInterventionAction {
  id: string;
  description: string;
  assigned_to_user_id: string;
  frequency: string | null;
  start_date: string;
  due_date: string | null;
  completed_at: string | null;
  status: string;
  created_at: string;
}

export interface PastoralInterventionProgressNote {
  id: string;
  note: string;
  recorded_by_user_id: string;
  created_at: string;
}

export interface PastoralInterventionDetail extends PastoralInterventionListItem {
  actions: PastoralInterventionAction[];
  recent_progress: PastoralInterventionProgressNote[];
  case: {
    id: string;
    case_number: string;
    status: string;
  } | null;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export interface InterventionTypeOption {
  key: string;
  label: string;
  active: boolean;
}

export interface PastoralReferralRecommendation {
  id: string;
  recommendation: string;
  assigned_to_user_id: string | null;
  review_date: string | null;
  status: string;
  status_note: string | null;
  created_at: string;
  assigned_to?: {
    first_name: string;
    last_name: string;
  } | null;
}

export interface PastoralReferralListItem {
  id: string;
  tenant_id: string;
  case_id: string | null;
  student_id: string;
  referral_type: string;
  referral_body_name: string | null;
  status: string;
  reason: string | null;
  submitted_at: string | null;
  submitted_by_user_id: string | null;
  acknowledged_at: string | null;
  assessment_scheduled_date: string | null;
  assessment_completed_at: string | null;
  pre_populated_data: Record<string, unknown> | null;
  manual_additions: Record<string, unknown> | null;
  external_reference: string | null;
  report_received_at: string | null;
  report_summary: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  student?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export interface PastoralReferralDetail extends PastoralReferralListItem {
  recommendations: PastoralReferralRecommendation[];
  case: {
    id: string;
    case_number: string;
    status: string;
  } | null;
}

export interface PastoralCheckinRecord {
  id: string;
  checkin_date: string;
  mood_score: number;
  freeform_text: string | null;
  was_flagged: boolean;
}

export interface PastoralMonitoringCheckinRecord extends PastoralCheckinRecord {
  flag_reason: string | null;
  auto_concern_id: string | null;
  student_id: string;
  student_name?: string | null;
}

export interface PastoralCheckinStatus {
  enabled: boolean;
  can_submit_today: boolean;
  frequency: 'daily' | 'weekly';
  last_checkin_date: string | null;
}

export interface PastoralCheckinConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  monitoring_owner_user_ids: string[];
  monitoring_hours_start: string;
  monitoring_hours_end: string;
  monitoring_days: number[];
  flagged_keywords: string[];
  consecutive_low_threshold: number;
  min_cohort_for_aggregate: number;
  prerequisites_acknowledged: boolean;
}

export interface PastoralCheckinPrerequisiteStatus {
  monitoring_ownership_defined: boolean;
  monitoring_hours_defined: boolean;
  escalation_protocol_defined: boolean;
  prerequisites_acknowledged: boolean;
  all_met: boolean;
}

export interface PastoralMoodTrendDataPoint {
  period: string;
  average_mood: number;
  response_count: number;
}

export interface PastoralDayOfWeekPattern {
  day: number;
  average_mood: number;
  response_count: number;
}

export interface PastoralExamComparisonResult {
  before_period: {
    average_mood: number;
    response_count: number;
  };
  during_period: {
    average_mood: number;
    response_count: number;
  };
  after_period: {
    average_mood: number;
    response_count: number;
  };
}

export interface YearGroupOption {
  id: string;
  name: string;
}

export interface ClassOption {
  id: string;
  name: string;
  year_group?: {
    id: string;
    name: string;
  } | null;
}

export interface PastoralCriticalIncidentResponsePlanItem {
  id: string;
  label: string;
  description: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  is_done: boolean;
  completed_at: string | null;
  completed_by_id: string | null;
  completed_by_name: string | null;
  notes: string | null;
}

export interface PastoralCriticalIncidentResponsePlan {
  immediate: PastoralCriticalIncidentResponsePlanItem[];
  short_term: PastoralCriticalIncidentResponsePlanItem[];
  medium_term: PastoralCriticalIncidentResponsePlanItem[];
  long_term: PastoralCriticalIncidentResponsePlanItem[];
}

export interface PastoralCriticalIncidentExternalSupportEntry {
  id: string;
  provider_type: string;
  provider_name: string;
  contact_person: string | null;
  contact_details: string | null;
  visit_date: string | null;
  visit_time_start: string | null;
  visit_time_end: string | null;
  availability_notes: string | null;
  students_seen: string[];
  outcome_notes: string | null;
  recorded_by_id: string;
  recorded_at: string;
}

export interface PastoralCriticalIncidentListItem {
  id: string;
  tenant_id: string;
  incident_type: string;
  description: string;
  occurred_at: string;
  scope: string;
  scope_ids: string[] | null;
  declared_by_user_id: string;
  status: string;
  response_plan: PastoralCriticalIncidentResponsePlan | null;
  external_support_log: PastoralCriticalIncidentExternalSupportEntry[] | null;
  created_at: string;
  updated_at: string;
}

export interface PastoralCriticalIncidentDetail extends PastoralCriticalIncidentListItem {
  affected_count: number;
}

export interface PastoralCriticalIncidentAffectedPerson {
  id: string;
  incident_id: string;
  affected_type: string;
  student_id: string | null;
  staff_profile_id: string | null;
  impact_level: string;
  notes: string | null;
  support_offered: boolean;
  created_at: string;
  student?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  staff_profile?: {
    id: string;
    user?: {
      first_name: string;
      last_name: string;
    } | null;
  } | null;
}

export interface PastoralCriticalIncidentAffectedSummary {
  total_students: number;
  total_staff: number;
  directly_affected_count: number;
  indirectly_affected_count: number;
  support_offered_count: number;
  support_pending_count: number;
}

export interface PastoralCriticalIncidentResponsePlanProgress {
  phase: string;
  total: number;
  completed: number;
  percentage: number;
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

interface YearGroupResponse {
  data: YearGroupOption[];
}

interface ClassResponse {
  data: ClassOption[];
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

export const PASTORAL_INTERVENTION_STATUSES = [
  'active',
  'achieved',
  'partially_achieved',
  'not_achieved',
  'escalated',
  'withdrawn',
] as const;

export const PASTORAL_ACTION_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'overdue',
] as const;

export const PASTORAL_REFERRAL_TYPES = [
  'neps',
  'camhs',
  'tusla_family_support',
  'jigsaw',
  'pieta_house',
  'other_external',
] as const;

export const PASTORAL_REFERRAL_STATUSES = [
  'draft',
  'submitted',
  'acknowledged',
  'assessment_scheduled',
  'assessment_complete',
  'report_received',
  'recommendations_implemented',
  'withdrawn',
] as const;

export const PASTORAL_RECOMMENDATION_STATUSES = [
  'pending',
  'in_progress',
  'implemented',
  'not_applicable',
] as const;

export const SST_MEETING_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;

export const PASTORAL_CRITICAL_INCIDENT_TYPES = [
  'bereavement',
  'serious_accident',
  'community_trauma',
  'other',
] as const;

export const PASTORAL_CRITICAL_INCIDENT_SCOPES = [
  'whole_school',
  'year_group',
  'class',
  'individual',
] as const;

export const PASTORAL_CRITICAL_INCIDENT_STATUSES = ['active', 'monitoring', 'closed'] as const;

export const PASTORAL_CHECKIN_FLAG_REASONS = ['keyword_match', 'consecutive_low'] as const;

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

export function normalizeInterventionStatus(value: string): string {
  if (value === 'pc_active') return 'active';
  return value;
}

export function normalizeActionStatus(value: string): string {
  if (value === 'pc_pending') return 'pending';
  if (value === 'pc_in_progress') return 'in_progress';
  if (value === 'pc_completed') return 'completed';
  if (value === 'pc_cancelled') return 'cancelled';
  if (value === 'pc_overdue') return 'overdue';
  return value;
}

export function normalizeRecommendationStatus(value: string): string {
  if (value === 'rec_pending') return 'pending';
  if (value === 'rec_in_progress') return 'in_progress';
  return value;
}

export function normalizeCriticalIncidentStatus(value: string): string {
  if (value === 'ci_active') return 'active';
  if (value === 'ci_monitoring') return 'monitoring';
  if (value === 'ci_closed') return 'closed';
  return value;
}

export function normalizeCriticalIncidentType(value: string): string {
  if (value === 'ci_other') return 'other';
  return value;
}

export function normalizeCriticalIncidentScope(value: string): string {
  if (value === 'class_group') return 'class';
  return value;
}

export function normalizeCriticalIncidentImpactLevel(value: string): string {
  if (value === 'direct') return 'directly_affected';
  if (value === 'indirect') return 'indirectly_affected';
  return value;
}

export function formatShortId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

export function formatStudentName(
  student: { first_name: string; last_name: string } | null | undefined,
): string {
  if (!student) {
    return '';
  }

  return `${student.first_name} ${student.last_name}`.trim();
}

export function formatStaffProfileName(
  profile:
    | {
        user?: {
          first_name: string;
          last_name: string;
        } | null;
      }
    | null
    | undefined,
): string {
  if (!profile?.user) {
    return '';
  }

  return `${profile.user.first_name} ${profile.user.last_name}`.trim();
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

export async function searchStaffProfiles(query: string): Promise<SearchOption[]> {
  const response = await apiClient<StaffSearchResponse>(
    `/api/v1/staff-profiles?search=${encodeURIComponent(query)}&pageSize=10`,
    { silent: true },
  );

  return (response.data ?? []).map((profile) => ({
    id: profile.id,
    label: `${profile.user.first_name} ${profile.user.last_name}`.trim(),
    description: profile.job_title ?? profile.department ?? profile.user.email ?? undefined,
  }));
}

export async function loadYearGroups(): Promise<YearGroupOption[]> {
  const response = await apiClient<YearGroupResponse>('/api/v1/year-groups', {
    silent: true,
  });

  return response.data ?? [];
}

export async function loadClasses(): Promise<ClassOption[]> {
  const response = await apiClient<ClassResponse>('/api/v1/classes?pageSize=100', {
    silent: true,
  });

  return response.data ?? [];
}
