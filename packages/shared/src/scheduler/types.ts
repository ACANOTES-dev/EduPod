/**
 * CSP Solver input/output types.
 * Pure data types — no database dependencies.
 */

export interface PeriodSlot {
  weekday: number; // 0-6
  period_order: number;
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  period_type:
    | 'teaching'
    | 'break_supervision'
    | 'assembly'
    | 'lunch_duty'
    | 'free';
}

export interface ClassRequirement {
  class_id: string;
  periods_per_week: number;
  required_room_type: string | null;
  preferred_room_id: string | null;
  max_consecutive: number;
  min_consecutive: number;
  spread_preference: 'spread_evenly' | 'cluster' | 'no_preference';
  student_count: number | null;
  teachers: Array<{ staff_profile_id: string; assignment_role: string }>;
  /** Whether this class is a supervision-type (break_supervision, lunch_duty) */
  is_supervision: boolean;
}

export interface TeacherAvailability {
  weekday: number;
  from: string; // HH:mm
  to: string; // HH:mm
}

export interface TeacherPreference {
  id: string;
  preference_type: 'subject' | 'class_pref' | 'time_slot';
  preference_payload: unknown;
  priority: 'low' | 'medium' | 'high';
}

export interface TeacherInfo {
  staff_profile_id: string;
  availability: TeacherAvailability[];
  preferences: TeacherPreference[];
}

export interface RoomInfo {
  room_id: string;
  room_type: string;
  capacity: number | null;
  is_exclusive: boolean;
}

export interface PinnedEntry {
  schedule_id: string;
  class_id: string;
  room_id: string | null;
  teacher_staff_id: string | null;
  weekday: number;
  period_order: number;
}

export interface StudentOverlap {
  class_id_a: string;
  class_id_b: string;
}

export interface SolverSettings {
  max_solver_duration_seconds: number;
  preference_weights: { low: number; medium: number; high: number };
  global_soft_weights: {
    even_subject_spread: number;
    minimise_teacher_gaps: number;
    room_consistency: number;
    workload_balance: number;
  };
  solver_seed: number | null;
}

export interface SolverInput {
  period_grid: PeriodSlot[];
  classes: ClassRequirement[];
  teachers: TeacherInfo[];
  rooms: RoomInfo[];
  pinned_entries: PinnedEntry[];
  student_overlaps: StudentOverlap[];
  settings: SolverSettings;
}

/** A single assignment in the solution */
export interface SolverAssignment {
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

export interface UnassignedSlot {
  class_id: string;
  periods_remaining: number;
  reason: string;
}

export interface SolverOutput {
  entries: SolverAssignment[];
  unassigned: UnassignedSlot[];
  score: number;
  max_score: number;
  duration_ms: number;
}

/** Callback for progress reporting */
export type ProgressCallback = (assigned: number, total: number) => void;

/** Callback to check if solving should be cancelled */
export type CancelCheck = () => boolean;

/** Internal variable for CSP: one slot-to-fill for a class */
export interface CSPVariable {
  class_id: string;
  variable_index: number; // e.g., class needs 5 periods → indices 0-4
}

/** Domain value: a possible assignment for a variable */
export interface DomainValue {
  weekday: number;
  period_order: number;
  room_id: string | null;
}
