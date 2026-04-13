export interface FormField {
  id: string;
  field_key: string;
  label: string;
  help_text?: string | null;
  field_type: string;
  required: boolean;
  options_json?: Array<{ value: string; label: string }> | null;
  conditional_visibility_json?: {
    depends_on_field_key: string;
    show_when_value: string | string[];
  } | null;
  display_order: number;
}

export interface NoteRow {
  id: string;
  note: string;
  is_internal: boolean;
  created_at: string;
  author: { id: string; first_name: string; last_name: string };
}

export type TimelineKind =
  | 'submitted'
  | 'status_changed'
  | 'system_event'
  | 'admin_note'
  | 'payment_event'
  | 'override_granted';

// ADM-009: structured action emitted by the state machine on every
// transition. Frontend uses it to render distinct labels in the
// Timeline tab; null is treated as a legacy admin note.
export type TimelineAction =
  | 'submitted'
  | 'auto_routed'
  | 'moved_to_conditional_approval'
  | 'cash_recorded'
  | 'bank_recorded'
  | 'stripe_completed'
  | 'override_approved'
  | 'rejected'
  | 'withdrawn'
  | 'auto_promoted'
  | 'manually_promoted'
  | 'reverted_by_expiry'
  | 'payment_link_regenerated'
  | 'admin_note';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  action: TimelineAction | null;
  at: string;
  message: string;
  actor: { id: string; first_name: string; last_name: string } | null;
}

export interface CapacitySummary {
  total_capacity: number;
  enrolled_student_count: number;
  conditional_approval_count: number;
  available_seats: number;
  configured: boolean;
}

export interface PaymentEventSummary {
  id: string;
  stripe_event_id: string;
  stripe_session_id: string | null;
  amount_cents: number;
  status: string;
  created_at: string;
}

export interface OverrideRecord {
  id: string;
  override_type: string;
  justification: string;
  expected_amount_cents: number;
  actual_amount_cents: number;
  created_at: string;
  approved_by: { id: string; first_name: string; last_name: string };
}

export interface MaterialisedStudent {
  id: string;
  first_name: string;
  last_name: string;
}

export interface ApplicationDetail {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: string | null;
  status: string;
  waiting_list_substatus: string | null;
  submitted_at: string | null;
  apply_date: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  payment_amount_cents: number | null;
  currency_code: string | null;
  payment_deadline: string | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
  updated_at: string;
  payload_json: Record<string, unknown>;
  form_definition: {
    id: string;
    name: string;
    fields: FormField[];
  } | null;
  submitted_by: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  reviewed_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  target_academic_year: { id: string; name: string } | null;
  target_year_group: { id: string; name: string } | null;
  materialised_student: MaterialisedStudent | null;
  override_record: OverrideRecord | null;
  payment_events: PaymentEventSummary[];
  capacity: CapacitySummary | null;
  notes: NoteRow[];
  timeline: TimelineEvent[];
}
