export interface Schedule {
  id: string;
  tenant_id: string;
  class_id: string;
  academic_year_id: string;
  room_id: string | null;
  teacher_staff_id: string | null;
  schedule_period_template_id: string | null;
  period_order: number | null;
  weekday: number;
  start_time: string;
  end_time: string;
  effective_start_date: string;
  effective_end_date: string | null;
  is_pinned: boolean;
  pin_reason: string | null;
  source: string;
  scheduling_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimetableEntry {
  schedule_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_id: string;
  class_name: string;
  room_id?: string;
  room_name?: string;
  teacher_staff_id?: string;
  teacher_name?: string;
  subject_name?: string;
}

export interface WorkloadEntry {
  staff_profile_id: string;
  name: string;
  total_periods: number;
  total_hours: number;
  per_day: Record<number, number>;
}

export interface Conflict {
  type: 'hard' | 'soft';
  category: 'room_double_booking' | 'teacher_double_booking' | 'student_double_booking' | 'room_over_capacity' | 'teacher_workload' | 'room_shared_warning';
  message: string;
  message_ar?: string;
  conflicting_schedule_id?: string;
  conflicting_entity?: { id: string; name: string };
}
