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

export interface ConditionalApprovalRow {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: string | null;
  target_year_group: { id: string; name: string } | null;
  target_academic_year: { id: string; name: string } | null;
  parent: ParentContact;
  payment_amount_cents: number | null;
  currency_code: string | null;
  payment_deadline: string | null;
  stripe_checkout_session_id: string | null;
  has_active_payment_link: boolean;
  payment_urgency: 'normal' | 'near_expiry' | 'overdue';
}

export interface RejectedRow {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: { id: string; first_name: string; last_name: string } | null;
  parent: ParentContact;
}
