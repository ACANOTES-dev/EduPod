export interface SchedulingRun {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  mode: 'auto' | 'hybrid';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'applied' | 'discarded';
  config_snapshot: unknown | null;
  result_json: SchedulingResultJson | null;
  proposed_adjustments: SchedulingAdjustment[] | null;
  hard_constraint_violations: number;
  soft_preference_score: number | null;
  soft_preference_max: number | null;
  entries_generated: number;
  entries_pinned: number;
  entries_unassigned: number;
  solver_duration_ms: number | null;
  solver_seed: number | null;
  failure_reason: string | null;
  created_by_user_id: string;
  applied_by_user_id: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchedulingResultEntry {
  class_id: string;
  room_id: string | null;
  teacher_staff_id: string | null;
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  is_pinned: boolean;
  preference_satisfaction: Array<{
    preference_id: string;
    teacher_staff_id: string;
    satisfied: boolean;
    weight: number;
  }>;
}

export interface SchedulingUnassignedSlot {
  class_id: string;
  periods_remaining: number;
  reason: string;
}

export interface SchedulingResultJson {
  entries: SchedulingResultEntry[];
  unassigned: SchedulingUnassignedSlot[];
}

export type SchedulingAdjustment =
  | { type: 'move'; class_id: string; from_weekday: number; from_period_order: number; to_weekday: number; to_period_order: number; to_room_id?: string }
  | { type: 'swap'; entry_a: { class_id: string; weekday: number; period_order: number }; entry_b: { class_id: string; weekday: number; period_order: number } }
  | { type: 'remove'; class_id: string; weekday: number; period_order: number }
  | { type: 'add'; class_id: string; room_id: string | null; teacher_staff_id: string | null; weekday: number; period_order: number };

export interface SchedulingRunProgress {
  status: string;
  phase: 'preparing' | 'solving' | 'complete' | 'failed';
  entries_assigned: number;
  entries_total: number;
  elapsed_ms: number;
}

export interface PrerequisiteCheck {
  key: string;
  passed: boolean;
  message: string;
  message_ar?: string;
  details?: unknown;
}

export interface PrerequisitesResult {
  ready: boolean;
  checks: PrerequisiteCheck[];
}
