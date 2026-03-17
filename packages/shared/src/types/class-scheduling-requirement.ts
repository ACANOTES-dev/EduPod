export interface ClassSchedulingRequirement {
  id: string;
  tenant_id: string;
  class_id: string;
  academic_year_id: string;
  periods_per_week: number;
  required_room_type: string | null;
  preferred_room_id: string | null;
  max_consecutive_periods: number;
  min_consecutive_periods: number;
  spread_preference: 'spread_evenly' | 'cluster' | 'no_preference';
  student_count: number | null;
  created_at: string;
  updated_at: string;
}
