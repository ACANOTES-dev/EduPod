export interface Subject {
  id: string;
  name: string;
}

export interface StaffProfile {
  id: string;
  name: string;
  roles: string[];
}

export interface Competency {
  id: string;
  staff_profile_id: string;
  subject_id: string;
  year_group_id: string;
  class_id: string | null;
}
