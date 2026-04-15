/**
 * CSP Solver v2 input/output types.
 * Pure data types — no database dependencies.
 * Key differences from v1:
 * - Period grids are per year group, not global
 * - Solver selects teachers from competency matrix (not pre-assigned)
 * - Curriculum requirements drive variable generation (subject + year group frequencies)
 * - Break supervision model: yard breaks (assigned) and classroom breaks (adjacency constraint)
 * - 3-tier constraint model for validation
 */

// ─── Input Types ────────────────────────────────────────────────────────────

export interface YearGroupInput {
  year_group_id: string;
  year_group_name: string;
  /** Class sections under this year group (e.g., Year 2A, Year 2B) */
  sections: Array<{
    class_id: string;
    class_name: string;
    student_count: number | null;
  }>;
  /** Period grid specific to this year group */
  period_grid: PeriodSlotV2[];
}

/** Extended PeriodSlot with supervision mode and break group */
export interface PeriodSlotV2 {
  weekday: number; // 0-6
  period_order: number;
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  period_type: 'teaching' | 'break_supervision' | 'assembly' | 'lunch_duty' | 'free';
  supervision_mode: 'none' | 'yard' | 'classroom_previous' | 'classroom_next';
  break_group_id: string | null;
}

export interface CurriculumEntry {
  year_group_id: string;
  subject_id: string;
  subject_name: string;
  min_periods_per_week: number;
  max_periods_per_day: number;
  preferred_periods_per_week: number | null;
  requires_double_period: boolean;
  double_period_count: number | null;
  /** Room type required for this subject (e.g., 'lab' for Science) */
  required_room_type: string | null;
  preferred_room_id: string | null;
  /**
   * SCHED-023: when set, this entry applies only to the named class inside the
   * year group and supersedes the year-group baseline for that one class.
   * When `null`, the entry is the year-group baseline applied to every class
   * that doesn't have a matching override.
   */
  class_id?: string | null;
}

/**
 * Teacher competency for a subject + year group.
 *
 * `class_id` is the pin/pool discriminator:
 * - `class_id === null` → **pool** entry. Teacher is qualified for the subject
 *   at the year-group level; the solver picks which section they teach.
 * - `class_id !== null` → **pin**. Teacher is fixed to that specific class
 *   section for the subject; the solver must honour it and only searches for
 *   time slot + room.
 */
export interface TeacherCompetencyEntry {
  subject_id: string;
  year_group_id: string;
  class_id: string | null;
}

export interface TeacherInputV2 {
  staff_profile_id: string;
  name: string;
  competencies: TeacherCompetencyEntry[];
  availability: Array<{
    weekday: number;
    from: string; // HH:mm
    to: string; // HH:mm
  }>;
  preferences: Array<{
    id: string;
    preference_type: 'subject' | 'class_pref' | 'time_slot';
    preference_payload: unknown;
    priority: 'low' | 'medium' | 'high';
  }>;
  max_periods_per_week: number | null;
  max_periods_per_day: number | null;
  max_supervision_duties_per_week: number | null;
}

export interface BreakGroupInput {
  break_group_id: string;
  name: string;
  year_group_ids: string[];
  required_supervisor_count: number;
}

/** Room info - same as v1 */
export interface RoomInfoV2 {
  room_id: string;
  room_type: string;
  capacity: number | null;
  is_exclusive: boolean;
}

export interface RoomClosureInput {
  room_id: string;
  date_from: string;
  date_to: string;
}

export interface PinnedEntryV2 {
  schedule_id: string;
  class_id: string;
  subject_id: string | null;
  year_group_id: string | null;
  room_id: string | null;
  teacher_staff_id: string | null;
  weekday: number;
  period_order: number;
}

export interface StudentOverlapV2 {
  class_id_a: string;
  class_id_b: string;
}

export interface SolverSettingsV2 {
  max_solver_duration_seconds: number;
  preference_weights: { low: number; medium: number; high: number };
  global_soft_weights: {
    even_subject_spread: number;
    minimise_teacher_gaps: number;
    room_consistency: number;
    workload_balance: number;
    break_duty_balance: number;
  };
  solver_seed: number | null;
}

/**
 * Per-(class, subject) room override — honoured by the solver's room-selection
 * scoring. When `required_room_type` is set, rooms of a different type are
 * forbidden. When `preferred_room_id` is set, the named room is rewarded
 * (but another room is acceptable if the preferred one is busy).
 *
 * Populated from `class_scheduling_requirements` in the orchestration layer
 * (SCHED-018). If the list is empty the solver behaves as it always has —
 * year-group-wide room hints on `CurriculumEntry` remain the only signal.
 */
export interface ClassRoomOverride {
  class_id: string;
  subject_id: string | null;
  preferred_room_id: string | null;
  required_room_type: string | null;
}

/**
 * SCHED-023 audit entry — populated by the orchestration layer when a
 * `class_subject_requirements` row supersedes a year-group
 * `curriculum_requirements` baseline for a specific (class, subject).
 * The worker copies this list into the run's `constraint_report` so the
 * admin sees exactly which classes deviated from the year-group defaults.
 */
export interface ClassSubjectOverrideAudit {
  class_id: string;
  subject_id: string;
  baseline_periods: number | null;
  override_periods: number;
  reason: 'class_subject_override';
}

export interface SolverInputV2 {
  year_groups: YearGroupInput[];
  curriculum: CurriculumEntry[];
  teachers: TeacherInputV2[];
  rooms: RoomInfoV2[];
  room_closures: RoomClosureInput[];
  break_groups: BreakGroupInput[];
  pinned_entries: PinnedEntryV2[];
  student_overlaps: StudentOverlapV2[];
  /** Optional per-(class, subject) room overrides — see ClassRoomOverride. */
  class_room_overrides?: ClassRoomOverride[];
  /**
   * SCHED-023: audit trail of class-subject overrides that were applied at
   * orchestration time. Consumed by the worker to attach onto the run's
   * constraint_report; has no effect on solver behaviour.
   */
  overrides_applied?: ClassSubjectOverrideAudit[];
  settings: SolverSettingsV2;
}

// ─── Output Types ───────────────────────────────────────────────────────────

export interface SolverAssignmentV2 {
  /** The class section being taught (e.g., Year 2A Maths) */
  class_id: string;
  subject_id: string | null;
  year_group_id: string;
  room_id: string | null;
  /** Teacher SELECTED by the solver from the competency pool */
  teacher_staff_id: string | null;
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  is_pinned: boolean;
  /** For supervision assignments: the break group being supervised */
  break_group_id: string | null;
  /** Whether this is a supervision duty (yard break) */
  is_supervision: boolean;
  preference_satisfaction: Array<{
    preference_id: string;
    teacher_staff_id: string;
    satisfied: boolean;
    weight: number;
  }>;
}

export interface UnassignedSlotV2 {
  year_group_id: string;
  subject_id: string | null;
  class_id: string | null;
  periods_remaining: number;
  reason: string;
}

/**
 * Quality metrics surfaced to admins to assess schedule shape beyond the
 * aggregate preference score. Added for SCHED-026 / STRESS-048.
 *
 *   - teacher_gap_index: per-teacher, per-day, `(span - lesson_count)` where
 *     span = `last_period - first_period + 1`. A value of 0 means no idle
 *     periods inside the teacher's working day; larger values = more gaps.
 *     Reported as min / avg / max across teachers with ≥1 assignment.
 *   - day_distribution_variance: per-class stddev of `lessons_per_day`
 *     across the week. 0 means every working day has the same load.
 *     Reported as min / avg / max across classes.
 *   - preference_breakdown: honoured vs violated counts rolled up by
 *     preference_type. Useful to see whether subject preferences got
 *     honoured while time-slot preferences got sacrificed (or vice versa).
 */
export interface QualityMetricsV2 {
  teacher_gap_index: { min: number; avg: number; max: number };
  day_distribution_variance: { min: number; avg: number; max: number };
  preference_breakdown: Array<{
    preference_type: 'subject' | 'class_pref' | 'time_slot';
    honoured: number;
    violated: number;
  }>;
}

export interface SolverOutputV2 {
  entries: SolverAssignmentV2[];
  unassigned: UnassignedSlotV2[];
  score: number;
  max_score: number;
  duration_ms: number;
  /** Breakdown of constraint satisfaction */
  constraint_summary: {
    tier1_violations: number; // should always be 0 in solver output
    tier2_violations: number;
    tier3_violations: number;
  };
  /** Optional quality metrics — emitted by the main solver path (SCHED-026). */
  quality_metrics?: QualityMetricsV2;
}

// ─── Validation Types ───────────────────────────────────────────────────────

export type ConstraintTier = 1 | 2 | 3;

export interface ConstraintViolation {
  tier: ConstraintTier;
  category: string; // e.g., 'teacher_double_booking', 'subject_min_frequency', etc.
  message: string;
  /** Cell coordinates for UI highlighting */
  cells: Array<{
    year_group_id: string;
    weekday: number;
    period_order: number;
  }>;
  /** Related entities for context */
  related_entities?: {
    teacher_staff_id?: string;
    teacher_name?: string;
    subject_id?: string;
    subject_name?: string;
    class_id?: string;
    room_id?: string;
    break_group_id?: string;
  };
}

export interface ValidationResult {
  violations: ConstraintViolation[];
  health_score: number; // 0-100
  summary: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  /** Per-cell violation map for efficient UI lookup: key = "yearGroupId:weekday:periodOrder" */
  cell_violations: Record<string, ConstraintViolation[]>;
}

// ─── Internal CSP Types ─────────────────────────────────────────────────────

/** A variable for the CSP solver - one per teaching slot or supervision slot to fill */
export interface CSPVariableV2 {
  /** Unique ID for this variable */
  id: string;
  type: 'teaching' | 'supervision';
  /** For teaching: the class section. For supervision: a generated ID */
  class_id: string | null;
  year_group_id: string;
  subject_id: string | null;
  /** Which numbered slot this is (e.g., Maths slot 0, 1, 2, 3 for 4x/week) */
  slot_index: number;
  /** For supervision: the break group being supervised */
  break_group_id: string | null;
  /** For double periods: whether this slot must be paired with the next */
  is_double_period_start: boolean;
}

/** Domain value: a possible assignment for a variable */
export interface DomainValueV2 {
  weekday: number;
  period_order: number;
  teacher_staff_id: string;
  room_id: string | null;
}

/** Progress callback */
export type ProgressCallbackV2 = (assigned: number, total: number, phase: string) => void;

/** Cancel check callback */
export type CancelCheckV2 = () => boolean;
