export type ClassStatus = 'active' | 'inactive' | 'archived';

export type ClassStaffRole = 'teacher' | 'assistant' | 'homeroom' | 'substitute';

export type EnrolmentStatus = 'active' | 'dropped' | 'completed';

export interface Class {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  year_group_id: string | null;
  subject_id: string | null;
  homeroom_teacher_staff_id: string | null;
  name: string;
  status: ClassStatus;
  created_at: string;
  updated_at: string;
}

export interface ClassStaff {
  id: string;
  class_id: string;
  staff_profile_id: string;
  staff_first_name: string;
  staff_last_name: string;
  assignment_role: ClassStaffRole;
  created_at: string;
  updated_at: string;
}

export interface ClassEnrolment {
  id: string;
  class_id: string;
  student_id: string;
  student_first_name: string;
  student_last_name: string;
  student_number: string | null;
  status: EnrolmentStatus;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassDetail extends Class {
  academic_year_name: string;
  year_group_name: string | null;
  subject_name: string | null;
  homeroom_teacher_name: string | null;
  staff: ClassStaff[];
  enrolments: ClassEnrolment[];
}
