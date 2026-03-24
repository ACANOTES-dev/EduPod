export type StudentStatus =
  | 'applicant'
  | 'active'
  | 'withdrawn'
  | 'graduated'
  | 'archived';

export type StudentGender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export interface Student {
  id: string;
  tenant_id: string;
  household_id: string;
  first_name: string;
  last_name: string;
  first_name_ar: string | null;
  last_name_ar: string | null;
  student_number: string | null;
  date_of_birth: string;
  gender: StudentGender | null;
  status: StudentStatus;
  entry_date: string | null;
  exit_date: string | null;
  year_group_id: string | null;
  class_homeroom_id: string | null;
  medical_notes: string | null;
  has_allergy: boolean;
  allergy_details: string | null;
  nationality: string | null;
  city_of_birth: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentParentLink {
  parent_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  relationship_label: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
}

export interface StudentEnrolment {
  id: string;
  class_id: string;
  class_name: string;
  subject_name: string | null;
  academic_year_name: string;
  status: string;
  start_date: string;
  end_date: string | null;
}

export interface StudentDetail extends Student {
  household_name: string;
  year_group_name: string | null;
  class_homeroom_name: string | null;
  parents: StudentParentLink[];
  enrolments: StudentEnrolment[];
}

export interface AllergyReportEntry {
  student_id: string;
  student_number: string | null;
  first_name: string;
  last_name: string;
  year_group_name: string | null;
  class_homeroom_name: string | null;
  allergy_details: string;
}

export interface StudentExportPack {
  student: StudentDetail;
  generated_at: string;
}
