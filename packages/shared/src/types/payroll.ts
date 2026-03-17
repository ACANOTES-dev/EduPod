export interface StaffCompensation {
  id: string;
  tenant_id: string;
  staff_profile_id: string;
  compensation_type: 'salaried' | 'per_class';
  base_salary: number | null;
  per_class_rate: number | null;
  assigned_class_count: number | null;
  bonus_class_rate: number | null;
  bonus_day_multiplier: number;
  effective_from: string;
  effective_to: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollRun {
  id: string;
  tenant_id: string;
  period_label: string;
  period_month: number;
  period_year: number;
  total_working_days: number;
  status: 'draft' | 'pending_approval' | 'finalised' | 'cancelled';
  total_basic_pay: number;
  total_bonus_pay: number;
  total_pay: number;
  headcount: number;
  created_by_user_id: string;
  finalised_by_user_id: string | null;
  finalised_at: string | null;
  approval_request_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollEntry {
  id: string;
  tenant_id: string;
  payroll_run_id: string;
  staff_profile_id: string;
  compensation_type: 'salaried' | 'per_class';
  snapshot_base_salary: number | null;
  snapshot_per_class_rate: number | null;
  snapshot_assigned_class_count: number | null;
  snapshot_bonus_class_rate: number | null;
  snapshot_bonus_day_multiplier: number | null;
  days_worked: number | null;
  classes_taught: number | null;
  auto_populated_class_count: number | null;
  basic_pay: number;
  bonus_pay: number;
  total_pay: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayslipSnapshotPayload {
  staff: {
    full_name: string;
    staff_number: string | null;
    department: string | null;
    job_title: string | null;
    employment_type: string;
    bank_name: string | null;
    bank_account_last4: string | null;
    bank_iban_last4: string | null;
  };
  period: {
    label: string;
    month: number;
    year: number;
    total_working_days: number;
  };
  compensation: {
    type: 'salaried' | 'per_class';
    base_salary: number | null;
    per_class_rate: number | null;
    assigned_class_count: number | null;
    bonus_class_rate: number | null;
    bonus_day_multiplier: number | null;
  };
  inputs: {
    days_worked: number | null;
    classes_taught: number | null;
  };
  calculations: {
    basic_pay: number;
    bonus_pay: number;
    total_pay: number;
  };
  school: {
    name: string;
    name_ar: string | null;
    logo_url: string | null;
    currency_code: string;
  };
}

export interface Payslip {
  id: string;
  tenant_id: string;
  payroll_entry_id: string;
  payslip_number: string;
  template_locale: string;
  issued_at: string;
  issued_by_user_id: string | null;
  snapshot_payload_json: PayslipSnapshotPayload;
  render_version: string;
  created_at: string;
}

export interface CostTrendPoint {
  period_month: number;
  period_year: number;
  period_label: string;
  total_basic_pay: number;
  total_bonus_pay: number;
  total_pay: number;
  headcount: number;
}

export interface YtdStaffSummary {
  staff_profile_id: string;
  staff_name: string;
  compensation_type: string;
  ytd_basic: number;
  ytd_bonus: number;
  ytd_total: number;
}

export interface BonusAnalysisItem {
  staff_profile_id: string;
  staff_name: string;
  compensation_type: string;
  months_with_bonus: number;
  total_bonus_amount: number;
  avg_bonus_per_month: number;
}

export interface StaffPaymentHistoryItem {
  payroll_entry_id: string;
  period_label: string;
  period_month: number;
  period_year: number;
  basic_pay: number;
  bonus_pay: number;
  total_pay: number;
  payslip_id: string | null;
}
