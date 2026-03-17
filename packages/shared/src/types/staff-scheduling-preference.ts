export type PreferenceMode = 'prefer' | 'avoid';

export interface SubjectPreferencePayload {
  type: 'subject';
  subject_ids: string[];
  mode: PreferenceMode;
}

export interface ClassPreferencePayload {
  type: 'class_pref';
  class_ids: string[];
  mode: PreferenceMode;
}

export interface TimeSlotPreferencePayload {
  type: 'time_slot';
  weekday: number | null;
  preferred_period_orders: number[];
  mode: PreferenceMode;
}

export type PreferencePayload = SubjectPreferencePayload | ClassPreferencePayload | TimeSlotPreferencePayload;

export interface StaffSchedulingPreference {
  id: string;
  tenant_id: string;
  staff_profile_id: string;
  academic_year_id: string;
  preference_type: 'subject' | 'class_pref' | 'time_slot';
  preference_payload: PreferencePayload;
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
}
