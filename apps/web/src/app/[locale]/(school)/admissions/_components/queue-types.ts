export interface ParentContact {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface QueueApplication {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: string | null;
  apply_date: string | null;
  fifo_position: number;
  is_sibling_application: boolean;
  waiting_list_substatus: 'awaiting_year_setup' | null;
  submitted_by_parent: ParentContact;
}

export interface QueueYearGroupBucket {
  year_group_id: string | null;
  year_group_name: string;
  display_order: number;
  target_academic_year_id: string | null;
  target_academic_year_name: string;
  capacity: {
    total: number;
    enrolled: number;
    conditional: number;
    available: number;
    configured: boolean;
  } | null;
  applications: QueueApplication[];
}

// ─── Generic year-group bucket (approved / rejected / conditional) ────────────

export interface YearGroupBucket<T> {
  year_group_id: string | null;
  year_group_name: string;
  display_order: number;
  target_academic_year_id: string | null;
  target_academic_year_name: string;
  capacity: {
    total: number;
    enrolled: number;
    conditional: number;
    available: number;
    configured: boolean;
  } | null;
  applications: T[];
}

// ─── Approved queue ──────────────────────────────────────────────────────────

export interface ApprovedRow {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  reviewed_at: string | null;
  reviewed_by: { id: string; first_name: string; last_name: string } | null;
  student_number: string | null;
  household_number: string | null;
  household_name: string | null;
  household_id: string | null;
  class_name: string | null;
  student_id: string | null;
  target_year_group_id: string | null;
  target_academic_year_id: string | null;
  target_year_group: { name: string; display_order: number } | null;
  target_academic_year: { name: string } | null;
}

// ─── Conditional approval queue ──────────────────────────────────────────────

export interface ConditionalApprovalRow {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: string | null;
  target_year_group_id: string | null;
  target_academic_year_id: string | null;
  target_year_group: { id: string; name: string; display_order: number } | null;
  target_academic_year: { id: string; name: string } | null;
  parent: ParentContact;
  payment_amount_cents: number | null;
  currency_code: string | null;
  payment_deadline: string | null;
  stripe_checkout_session_id: string | null;
  has_active_payment_link: boolean;
  payment_urgency: 'normal' | 'near_expiry' | 'overdue';
}

// ─── Rejected queue ──────────────────────────────────────────────────────────

export interface RejectedRow {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: { id: string; first_name: string; last_name: string } | null;
  parent: ParentContact;
  target_year_group_id: string | null;
  target_academic_year_id: string | null;
  target_year_group: { name: string; display_order: number } | null;
  target_academic_year: { name: string } | null;
}
