export interface SchedulePeriodTemplate {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  weekday: number;
  period_name: string;
  period_name_ar: string | null;
  period_order: number;
  start_time: string; // HH:mm
  end_time: string;   // HH:mm
  schedule_period_type: 'teaching' | 'break_supervision' | 'assembly' | 'lunch_duty' | 'free';
  created_at: string;
  updated_at: string;
}
