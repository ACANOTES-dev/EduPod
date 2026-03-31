import type {
  CreateEngagementEventDto,
  CreateEngagementFormTemplateDto,
  EngagementFormField,
} from '@school/shared';

export type EngagementTemplateStatus = 'draft' | 'published' | 'archived';
export type EngagementSubmissionStatus =
  | 'pending'
  | 'submitted'
  | 'acknowledged'
  | 'expired'
  | 'revoked';
export type EngagementConsentStatus = 'active' | 'expired' | 'revoked';
export type EngagementEventStatus =
  | 'draft'
  | 'published'
  | 'open'
  | 'closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'archived';
export type EngagementParticipantStatus =
  | 'invited'
  | 'registered'
  | 'consent_pending'
  | 'consent_granted'
  | 'consent_declined'
  | 'payment_pending'
  | 'confirmed'
  | 'attended'
  | 'absent'
  | 'withdrawn';
export type EngagementConsentDecision = 'pending' | 'granted' | 'declined' | null;
export type EngagementPaymentStatus = 'pending' | 'paid' | 'waived' | 'not_required' | null;
export type EngagementTargetType = 'whole_school' | 'year_group' | 'class_group' | 'custom';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface AcademicYearOption {
  id: string;
  name: string;
  status?: string;
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

export interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
}

export interface StaffOption {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  staff_number?: string | null;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

export interface FormTemplateRecord {
  id: string;
  name: string;
  description: string | null;
  form_type: CreateEngagementFormTemplateDto['form_type'];
  consent_type: CreateEngagementFormTemplateDto['consent_type'] | null;
  fields_json: EngagementFormField[];
  requires_signature: boolean;
  academic_year_id: string | null;
  status: EngagementTemplateStatus;
  created_at: string;
  updated_at: string;
}

export interface FormSubmissionRecord {
  id: string;
  form_template_id: string;
  event_id: string | null;
  student_id: string;
  status: EngagementSubmissionStatus;
  submitted_at: string | null;
  acknowledged_at: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
  responses_json?: Record<string, unknown> | null;
  signature_json?: Record<string, unknown> | null;
  form_template?: {
    name: string;
    form_type: CreateEngagementFormTemplateDto['form_type'];
    consent_type?: string | null;
    fields_json?: EngagementFormField[];
    requires_signature?: boolean;
  };
  student?: {
    id?: string;
    first_name: string;
    last_name: string;
  };
  consent_record?: ConsentRecordRow | null;
}

export interface ConsentRecordRow {
  id: string;
  student_id: string;
  consent_type: 'one_time' | 'annual' | 'standing';
  status: EngagementConsentStatus;
  granted_at: string;
  revoked_at: string | null;
  expires_at: string | null;
  form_template?: {
    name: string;
    form_type: CreateEngagementFormTemplateDto['form_type'];
  };
  student?: {
    first_name: string;
    last_name: string;
  };
}

export interface EventRecord {
  id: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  event_type: CreateEngagementEventDto['event_type'];
  status: EngagementEventStatus;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  location_ar: string | null;
  capacity: number | null;
  target_type: EngagementTargetType;
  target_config_json?: {
    year_group_ids?: string[];
    class_ids?: string[];
    student_ids?: string[];
  } | null;
  consent_form_template_id: string | null;
  risk_assessment_template_id: string | null;
  fee_amount: number | null;
  fee_description: string | null;
  slot_duration_minutes: number | null;
  buffer_minutes: number | null;
  consent_deadline: string | null;
  payment_deadline: string | null;
  booking_deadline: string | null;
  risk_assessment_required: boolean;
  risk_assessment_approved?: boolean;
  academic_year_id: string;
  academic_year?: {
    id: string;
    name: string;
  } | null;
  consent_form_template?: {
    id: string;
    name: string;
    form_type: string;
  } | null;
  risk_assessment_template?: {
    id: string;
    name: string;
    form_type: string;
  } | null;
  participant_count?: number;
  staff_count?: number;
  created_at?: string;
  updated_at?: string;
  staff?: Array<{
    id: string;
    role: string;
    staff: {
      id: string;
      user_id?: string | null;
    };
  }>;
}

export interface EventDashboardData {
  total_invited: number;
  total_registered: number;
  consent_stats: {
    granted: number;
    pending: number;
    declined: number;
    expired: number;
  };
  payment_stats: {
    paid: number;
    pending: number;
    waived: number;
    not_required: number;
  };
  capacity: number | null;
  capacity_used: number;
}

export interface EventParticipantRow {
  id: string;
  student_id: string;
  status: EngagementParticipantStatus;
  consent_status: EngagementConsentDecision;
  payment_status: EngagementPaymentStatus;
  attendance_status?: string | null;
  created_at: string;
  updated_at: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    class_enrolments: Array<{
      class_entity: {
        id: string;
        name: string;
        year_group: {
          id: string;
          name: string;
        } | null;
      } | null;
    }>;
  };
}

export interface TripPackStaffMember {
  id: string;
  role: string;
  name?: string | null;
}

export interface TripPackEmergencyContact {
  contact_name: string;
  phone: string;
  relationship_label: string;
}

export interface TripPackStudent {
  id?: string;
  name: string;
  year_group: string;
  class_name: string;
  date_of_birth: string;
  medical_notes: string | null;
  has_allergy: boolean;
  allergy_details: string | null;
  emergency_contacts: TripPackEmergencyContact[];
  consent_status: string;
  consent_submitted_at: string | null;
}

export interface TripPackPreview {
  event: {
    title: string;
    title_ar?: string | null;
    start_date: string;
    end_date: string;
    start_time: string | null;
    end_time: string | null;
    location: string;
    location_ar?: string | null;
    risk_assessment_approved: boolean;
  };
  staff: TripPackStaffMember[];
  students: TripPackStudent[];
  generated_at: string;
}

export interface EventAttendanceRow {
  id: string;
  student_id: string;
  attendance_marked: boolean;
  attendance_marked_at: string | null;
  student: {
    first_name: string;
    last_name: string;
    full_name?: string | null;
  };
}

export interface EventAttendanceSummary {
  total: number;
  marked_present: number;
  marked_absent: number;
  unmarked: number;
}

export interface EventAttendanceResponse {
  data: EventAttendanceRow[];
  summary: EventAttendanceSummary;
}

export interface EngagementIncidentReport {
  id: string;
  tenant_id?: string;
  event_id: string;
  title: string;
  description: string;
  reported_by_user_id: string;
  created_at: string;
  updated_at: string;
  reported_by?: {
    id: string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

export interface ConferenceTeacherRef {
  id: string;
  user_id?: string | null;
  user?: {
    id: string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
  } | null;
}

export interface ConferenceBookingSummary {
  id: string;
  student_id: string;
  booking_type: 'parent_booked' | 'admin_booked' | 'walk_in';
  status: 'confirmed' | 'cancelled' | 'completed';
  student: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export interface ConferenceTimeSlotRecord {
  id: string;
  tenant_id?: string;
  event_id: string;
  teacher_id: string;
  start_time: string;
  end_time: string;
  status: 'available' | 'booked' | 'blocked' | 'completed' | 'cancelled';
  created_at?: string;
  updated_at?: string;
  teacher?: ConferenceTeacherRef | null;
  booking?: ConferenceBookingSummary | null;
}

export interface ConferenceBookingRecord {
  id: string;
  tenant_id?: string;
  time_slot_id: string;
  student_id: string;
  booked_by_user_id: string;
  booking_type: 'parent_booked' | 'admin_booked' | 'walk_in';
  status: 'confirmed' | 'cancelled' | 'completed';
  video_call_link?: string | null;
  notes?: string | null;
  booked_at: string;
  cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
  time_slot: {
    id: string;
    start_time: string;
    end_time: string;
    teacher_id?: string;
    teacher?: ConferenceTeacherRef | null;
  };
  student: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export interface ConferenceStatsPerTeacher {
  teacher_id: string;
  total: number;
  available: number;
  booked: number;
  blocked: number;
  completed: number;
  cancelled: number;
}

export interface ConferenceBookingStats {
  per_teacher: ConferenceStatsPerTeacher[];
  totals: {
    total: number;
    available: number;
    booked: number;
    blocked: number;
    completed: number;
    cancelled: number;
  };
}

export interface TeacherConferenceSchedule {
  teacher_id: string;
  event_id: string;
  slots: Array<
    ConferenceTimeSlotRecord & {
      booking?:
        | (ConferenceBookingRecord & {
            booked_by?: {
              id: string;
              email?: string | null;
              first_name?: string | null;
              last_name?: string | null;
            } | null;
          })
        | null;
    }
  >;
}

export interface ParentConferenceBookingsResponse {
  data: ConferenceBookingRecord[];
  allow_parent_conference_cancellation?: boolean;
}

export interface ParentPendingForm {
  id: string;
  form_template_id: string;
  event_id: string | null;
  student_id: string;
  status: EngagementSubmissionStatus;
  created_at: string;
  form_template: {
    name: string;
    form_type: CreateEngagementFormTemplateDto['form_type'];
  };
  student: {
    first_name: string;
    last_name: string;
  };
}

export interface ParentEventRow {
  id: string;
  title: string;
  title_ar: string | null;
  event_type: CreateEngagementEventDto['event_type'];
  status: EngagementEventStatus;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  location_ar: string | null;
  fee_amount: number | null;
  consent_deadline: string | null;
  payment_deadline: string | null;
  participants: Array<{
    id: string;
    student_id: string;
    status: EngagementParticipantStatus;
    consent_status: EngagementConsentDecision;
    payment_status: EngagementPaymentStatus;
  }>;
}

export interface ParentEventDetail extends EventRecord {
  my_participants: Array<{
    id: string;
    student_id: string;
    status: EngagementParticipantStatus;
    consent_status: EngagementConsentDecision;
    payment_status: EngagementPaymentStatus;
    student: {
      id: string;
      first_name: string;
      last_name: string;
    };
  }>;
}

export interface SignatureValue {
  type: 'drawn' | 'typed';
  data: string;
  timestamp: string;
  legal_text_version: string;
  typed_name?: string;
}

export const FORM_TYPE_OPTIONS: Array<{
  value: CreateEngagementFormTemplateDto['form_type'];
  label: string;
}> = [
  { value: 'consent_form', label: 'consentForm' },
  { value: 'risk_assessment', label: 'riskAssessment' },
  { value: 'survey', label: 'survey' },
  { value: 'policy_signoff', label: 'policySignoff' },
];

export const CONSENT_TYPE_OPTIONS: Array<{
  value: 'one_time' | 'annual' | 'standing';
  label: string;
}> = [
  { value: 'one_time', label: 'oneTime' },
  { value: 'annual', label: 'annual' },
  { value: 'standing', label: 'standing' },
];

export const EVENT_TYPE_OPTIONS: Array<{
  value: CreateEngagementEventDto['event_type'];
  label: string;
}> = [
  { value: 'school_trip', label: 'schoolTrip' },
  { value: 'overnight_trip', label: 'overnightTrip' },
  { value: 'sports_event', label: 'sportsEvent' },
  { value: 'cultural_event', label: 'culturalEvent' },
  { value: 'in_school_event', label: 'inSchoolEvent' },
  { value: 'after_school_activity', label: 'afterSchoolActivity' },
  { value: 'parent_conference', label: 'parentConference' },
  { value: 'policy_signoff', label: 'policySignoff' },
];

export const TARGET_TYPE_OPTIONS: Array<{ value: EngagementTargetType; label: string }> = [
  { value: 'whole_school', label: 'wholeSchool' },
  { value: 'year_group', label: 'yearGroups' },
  { value: 'class_group', label: 'classes' },
  { value: 'custom', label: 'custom' },
];

export function humanizeStatus(value: string | null | undefined): string {
  return (value ?? '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function pickLocalizedValue(
  locale: string,
  englishValue: string | null | undefined,
  arabicValue?: string | null,
): string {
  if (locale === 'ar' && arabicValue && arabicValue.trim().length > 0) {
    return arabicValue;
  }

  return englishValue ?? '';
}

export function getFieldLabel(field: EngagementFormField, locale: string): string {
  return pickLocalizedValue(locale, field.label.en, field.label.ar);
}

export function getFieldHelpText(field: EngagementFormField, locale: string): string {
  return pickLocalizedValue(locale, field.help_text?.en, field.help_text?.ar);
}

export function formatDisplayDate(value: string | null | undefined, locale: string): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDisplayDateTime(value: string | null | undefined, locale: string): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatDisplayTime(value: string | null | undefined, locale: string): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  const [hours, minutes] = value.split(':');

  if (!hours || !minutes) {
    return value;
  }

  const syntheticDate = new Date();
  syntheticDate.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(syntheticDate);
}

export function formatDisplayTimeRange(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
  locale: string,
): string {
  if (!startValue && !endValue) {
    return '—';
  }

  if (!endValue) {
    return formatDisplayTime(startValue, locale);
  }

  return `${formatDisplayTime(startValue, locale)} - ${formatDisplayTime(endValue, locale)}`;
}

export function parseFieldOptions(
  field: EngagementFormField,
): Array<{ value: string; label: string }> {
  if (!Array.isArray(field.options_json)) {
    return [];
  }

  return field.options_json
    .map((option) => {
      if (typeof option === 'string') {
        return {
          value: option,
          label: option,
        };
      }

      if (option && typeof option === 'object') {
        const value = 'value' in option && typeof option.value === 'string' ? option.value : '';
        const label = 'label' in option && typeof option.label === 'string' ? option.label : value;
        return value
          ? {
              value,
              label,
            }
          : null;
      }

      return null;
    })
    .filter((option): option is { value: string; label: string } => option !== null);
}

export function shouldRenderField(
  field: EngagementFormField,
  values: Record<string, unknown>,
): boolean {
  const config =
    field.conditional_visibility_json && typeof field.conditional_visibility_json === 'object'
      ? (field.conditional_visibility_json as Record<string, unknown>)
      : null;

  if (!config) {
    return true;
  }

  const dependsOnFieldKey =
    typeof config.depends_on_field_key === 'string' ? config.depends_on_field_key : null;
  const showWhenValue = typeof config.show_when_value === 'string' ? config.show_when_value : null;

  if (!dependsOnFieldKey || !showWhenValue) {
    return true;
  }

  const dependencyValue = values[dependsOnFieldKey];

  if (Array.isArray(dependencyValue)) {
    return dependencyValue.includes(showWhenValue);
  }

  if (typeof dependencyValue === 'boolean') {
    return String(dependencyValue) === showWhenValue;
  }

  return String(dependencyValue ?? '') === showWhenValue;
}

export function createEmptyField(displayOrder: number): EngagementFormField {
  return {
    id: crypto.randomUUID(),
    field_key: `engagement_field_${displayOrder + 1}_${Math.random().toString(36).slice(2, 8)}`,
    label: {
      en: '',
      ar: '',
    },
    help_text: {
      en: '',
      ar: '',
    },
    field_type: 'short_text',
    required: false,
    display_order: displayOrder,
    options_json: [],
    validation_rules_json: undefined,
    conditional_visibility_json: undefined,
    config: undefined,
  };
}

export function getParticipantClassName(participant: EventParticipantRow): string {
  const activeEnrolment = participant.student.class_enrolments[0];
  return activeEnrolment?.class_entity?.name ?? '—';
}

export function getParticipantYearGroupName(participant: EventParticipantRow): string {
  const activeEnrolment = participant.student.class_enrolments[0];
  return activeEnrolment?.class_entity?.year_group?.name ?? '—';
}

export function getStaffDisplayName(staff: {
  first_name?: string | null;
  last_name?: string | null;
  staff_number?: string | null;
  user?: {
    name?: string | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}): string {
  const userName = staff.user?.name?.trim();

  if (userName) {
    return userName;
  }

  const userFirstLast = [staff.user?.first_name, staff.user?.last_name].filter(Boolean).join(' ');

  if (userFirstLast) {
    return userFirstLast;
  }

  const directName = [staff.first_name, staff.last_name].filter(Boolean).join(' ');

  if (directName) {
    return directName;
  }

  return staff.user?.email ?? staff.staff_number ?? '—';
}

export function isTripEvent(eventType: CreateEngagementEventDto['event_type'] | string): boolean {
  return eventType === 'school_trip' || eventType === 'overnight_trip';
}

export function isConferenceEvent(
  eventType: CreateEngagementEventDto['event_type'] | string,
): boolean {
  return eventType === 'parent_conference';
}

export function needsAction(participant: {
  consent_status: EngagementConsentDecision;
  payment_status: EngagementPaymentStatus;
}): boolean {
  return participant.consent_status === 'pending' || participant.payment_status === 'pending';
}
