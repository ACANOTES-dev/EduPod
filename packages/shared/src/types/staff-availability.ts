export interface StaffAvailability {
  id: string;
  tenant_id: string;
  staff_profile_id: string;
  academic_year_id: string;
  weekday: number;
  available_from: string; // HH:mm
  available_to: string;   // HH:mm
  created_at: string;
  updated_at: string;
}
