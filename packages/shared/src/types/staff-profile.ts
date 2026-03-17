export type EmploymentStatus = 'active' | 'inactive';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'substitute';

export interface BankDetails {
  bank_name: string | null;
  /** Last 4 characters only — never the full account number */
  bank_account_number_masked: string | null;
  /** Last 4 characters only — never the full IBAN */
  bank_iban_masked: string | null;
}

export interface StaffProfile {
  id: string;
  tenant_id: string;
  user_id: string;
  staff_number: string | null;
  job_title: string | null;
  employment_status: EmploymentStatus;
  department: string | null;
  employment_type: EmploymentType;
  bank_details: BankDetails;
  created_at: string;
  updated_at: string;
}

export interface StaffClassAssignment {
  class_id: string;
  class_name: string;
  subject_name: string | null;
  academic_year_name: string;
  assignment_role: string;
}

export interface StaffProfileDetail extends StaffProfile {
  user_first_name: string;
  user_last_name: string;
  user_email: string;
  class_assignments: StaffClassAssignment[];
}
