/**
 * CP-SAT-native solver contract v3.
 *
 * Designed around CP-SAT's decision variables, domains, and objective terms
 * rather than the legacy TypeScript solver's internal representation.
 *
 * Key differences from v2:
 *   - Flat period_slots[] with integer indices (replaces per-year-group period_grid)
 *   - Hard demand split from soft preferences
 *   - solve_status is a required first-class field (not optional cp_sat_status)
 *   - Per-entry room_assignment_source clarifies solver vs greedy-post-pass
 *   - objective_breakdown exposes CP-SAT's actual optimisation targets
 *   - constraint_snapshot generalises the old overrides_applied audit trail
 *   - Early-stop fields are required (no legacy backward-compat needed)
 *   - CANCELLED is a first-class solve status
 *
 * Introduced in Stage 10. assembleSolverInput emits v3 in Stage 11.
 * v2 types stay until Stage 11 completes.
 */

// ─── Shared Literals ───────────────────────────────────────��──────────────────

export type PeriodTypeV3 = 'teaching' | 'break_supervision' | 'assembly' | 'lunch_duty' | 'free';
export type SupervisionModeV3 = 'none' | 'yard' | 'classroom_previous' | 'classroom_next';
export type PreferenceTypeV3 = 'subject' | 'class_pref' | 'time_slot';
export type PreferencePriorityV3 = 'low' | 'medium' | 'high';

// ─── Input Types ──────────────────────────────────────────────────────────────

/**
 * Flat period slot with a stable integer index. The solver operates on
 * indices; consumers join back to (weekday, period_order, times) via this
 * lookup table. Slots are enumerated across all year groups — two year
 * groups with different grids produce separate slots.
 */
export interface PeriodSlotV3 {
  index: number;
  year_group_id: string;
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  period_type: PeriodTypeV3;
  supervision_mode: SupervisionModeV3;
  break_group_id: string | null;
}

export interface ClassV3 {
  class_id: string;
  class_name: string;
  year_group_id: string;
  year_group_name: string;
  student_count: number | null;
}

export interface SubjectV3 {
  subject_id: string;
  subject_name: string;
}

export interface TeacherCompetencyV3 {
  subject_id: string;
  year_group_id: string;
  /** null = pool entry (solver picks section); non-null = pinned to class. */
  class_id: string | null;
}

export interface TeacherAvailabilityV3 {
  weekday: number;
  from: string;
  to: string;
}

export interface TeacherV3 {
  staff_profile_id: string;
  name: string;
  competencies: TeacherCompetencyV3[];
  availability: TeacherAvailabilityV3[];
  max_periods_per_week: number | null;
  max_periods_per_day: number | null;
  max_supervision_duties_per_week: number | null;
}

export interface RoomV3 {
  room_id: string;
  room_type: string;
  capacity: number | null;
  is_exclusive: boolean;
}

export interface RoomClosureV3 {
  room_id: string;
  date_from: string;
  date_to: string;
}

export interface BreakGroupV3 {
  break_group_id: string;
  name: string;
  year_group_ids: string[];
  required_supervisor_count: number;
}

/**
 * Hard demand — what the model MUST satisfy. One row per (class, subject).
 * Split from preferences so the solver can distinguish between constraints
 * and objective terms at the contract level.
 */
export interface DemandV3 {
  class_id: string;
  subject_id: string;
  periods_per_week: number;
  max_per_day: number | null;
  required_doubles: number;
  required_room_type: string | null;
}

// ─── Preferences (soft side) ────────────────────────────────────────────────

export interface ClassPreferenceV3 {
  class_id: string;
  subject_id: string;
  preferred_periods_per_week: number | null;
  preferred_room_id: string | null;
}

export interface TeacherPreferenceV3 {
  id: string;
  teacher_staff_id: string;
  preference_type: PreferenceTypeV3;
  preference_payload: unknown;
  priority: PreferencePriorityV3;
}

export interface GlobalSoftWeightsV3 {
  even_subject_spread: number;
  minimise_teacher_gaps: number;
  room_consistency: number;
  workload_balance: number;
  break_duty_balance: number;
}

export interface PreferencesV3 {
  class_preferences: ClassPreferenceV3[];
  teacher_preferences: TeacherPreferenceV3[];
  global_weights: GlobalSoftWeightsV3;
  preference_weights: { low: number; medium: number; high: number };
}

// ─── Pinned / Overlaps / Settings ───────────────────────────────────────────

export interface PinnedAssignmentV3 {
  schedule_id: string;
  class_id: string;
  subject_id: string | null;
  /** Index into period_slots[] — replaces (weekday, period_order). */
  period_index: number;
  teacher_staff_id: string | null;
  room_id: string | null;
}

export interface StudentOverlapV3 {
  class_id_a: string;
  class_id_b: string;
}

export interface SolverSettingsV3 {
  max_solver_duration_seconds: number;
  solver_seed: number | null;
}

// ─── Constraint Snapshot ────────────────────────────────────────────────────

/**
 * Generalised audit entry for non-default modelling decisions made by
 * the orchestration layer. Replaces v2's overrides_applied. Types include:
 *   - class_subject_override: (class, subject) curriculum deviation
 *   - pin_inclusion: a pinned schedule entry was injected
 *   - break_group_supervision: supervision resolution details
 *   - room_override: per-(class, subject) room override from SCHED-018
 */
export interface ConstraintSnapshotEntry {
  type: string;
  description: string;
  details: Record<string, unknown>;
}

// ─── SolverInputV3 ──────────────────────────────────────────────────────────

export interface SolverInputV3 {
  period_slots: PeriodSlotV3[];
  classes: ClassV3[];
  subjects: SubjectV3[];
  teachers: TeacherV3[];
  rooms: RoomV3[];
  room_closures: RoomClosureV3[];
  break_groups: BreakGroupV3[];
  demand: DemandV3[];
  preferences: PreferencesV3;
  pinned: PinnedAssignmentV3[];
  student_overlaps: StudentOverlapV3[];
  settings: SolverSettingsV3;
  constraint_snapshot: ConstraintSnapshotEntry[];
}

// ─── Output Types ─────────────────────────────────────────────────────────────

/**
 * CP-SAT native solve status. Upper-case to match OR-Tools convention.
 * CANCELLED is first-class (Stage 9.5.1 cooperative cancel).
 */
export type SolveStatusV3 =
  | 'OPTIMAL'
  | 'FEASIBLE'
  | 'INFEASIBLE'
  | 'MODEL_INVALID'
  | 'UNKNOWN'
  | 'CANCELLED';

export type EarlyStopReasonV3 = 'stagnation' | 'gap' | 'cancelled' | 'not_triggered';

/**
 * SCHED-041 §A — unified termination bucket combining CP-SAT's status with
 * the sidecar's cooperative halt signals. Lets operators answer "what
 * actually stopped this solve?" without joining `solve_status` and
 * `early_stop_reason` client-side. See `SolverDiagnosticsV3` below.
 */
export type TerminationReasonV3 =
  | 'optimal'
  | 'feasible_at_deadline'
  | 'infeasible'
  | 'model_invalid'
  | 'unknown_at_deadline'
  | 'cancelled'
  | 'early_stop_stagnation'
  | 'early_stop_gap';

/**
 * Rooms are assigned by a greedy post-pass (Stage 4 dropped rooms from CP-SAT).
 * This field makes the source explicit so Stage 12 diagnostics can distinguish
 * solver-chosen slots from greedy-assigned rooms.
 */
export type RoomAssignmentSource = 'solver' | 'greedy_post_pass';

export interface PreferenceSatisfactionV3 {
  preference_id: string;
  teacher_staff_id: string;
  satisfied: boolean;
  weight: number;
}

export interface AssignmentV3 {
  class_id: string;
  subject_id: string | null;
  year_group_id: string;
  /** Index into the input's period_slots[] — the canonical CP-SAT representation. */
  period_index: number;
  /** Derived from period_slots[period_index] for consumer convenience. */
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  teacher_staff_id: string | null;
  room_id: string | null;
  room_assignment_source: RoomAssignmentSource;
  is_pinned: boolean;
  is_supervision: boolean;
  break_group_id: string | null;
  preference_satisfaction: PreferenceSatisfactionV3[];
}

/**
 * Per-lesson unassigned demand. One row per unplaceable lesson (not per
 * (class, subject) aggregate like legacy). More informative for Stage 12
 * diagnostics consumption.
 */
export interface UnassignedDemandV3 {
  class_id: string;
  subject_id: string | null;
  year_group_id: string;
  lesson_index: number;
  reason: string;
}

// ─── Quality Metrics ────────────────────────────────────────────────────────

export interface QualityMetricRangeV3 {
  min: number;
  avg: number;
  max: number;
}

export interface PreferenceBreakdownEntryV3 {
  preference_type: PreferenceTypeV3;
  honoured: number;
  violated: number;
}

/**
 * Quality metrics extended with CP-SAT-native signals. Keeps the v2 metrics
 * (teacher_gap_index, day_distribution_variance, preference_breakdown) for
 * backward compatibility, and adds the actual objective value, greedy-hint
 * score, and whether CP-SAT improved on greedy — the signals admins need
 * to understand what the solver actually did.
 */
export interface QualityMetricsV3 {
  teacher_gap_index: QualityMetricRangeV3;
  day_distribution_variance: QualityMetricRangeV3;
  preference_breakdown: PreferenceBreakdownEntryV3[];
  /** CP-SAT's raw objective value. null when solve_status is UNKNOWN/CANCELLED. */
  cp_sat_objective_value: number | null;
  /** Greedy hint's placement score (placement_weight × placed_count). */
  greedy_hint_score: number;
  /** true when CP-SAT found a solution strictly better than the greedy hint. */
  cp_sat_improved_on_greedy: boolean;
}

/**
 * Per-term breakdown of the CP-SAT objective. Each term corresponds to a
 * soft preference or the placement maximisation — weight × contribution.
 * Admins see: "the schedule lost 40 points on teacher_gap_minimisation —
 * try widening teacher availability."
 */
export interface ObjectiveBreakdownEntry {
  term_name: string;
  weight: number;
  contribution: number;
  best_possible: number;
}

// ─── SolverOutputV3 ─────────────────────────────────────────────────────────

/**
 * SCHED-041 §A — structured CP-SAT telemetry captured per solve.
 *
 * Every field is optional during the rollout: older sidecar builds omit
 * the block entirely (`solver_diagnostics === null`), and the
 * MODEL_INVALID / transport-failure paths return before telemetry is
 * captured. Consumers should treat all fields as nullable and tolerate
 * `null` gracefully.
 *
 * The worker persists this into `scheduling_runs.solver_diagnostics`
 * (separate JSONB column, not nested in `result_json`) so operators
 * can run queries like:
 *
 *   SELECT id, solver_diagnostics->>'termination_reason',
 *          solver_diagnostics->>'improvements_found',
 *          solver_diagnostics->>'cp_sat_improved_on_greedy'
 *   FROM scheduling_runs
 *   WHERE tenant_id = '...' AND status = 'completed'
 *   ORDER BY created_at DESC;
 */
export interface SolverDiagnosticsV3 {
  /** Runtime environment. */
  or_tools_version: string | null;
  /** Multi-line CP-SAT `response_stats()` dump, truncated to 16 KB. */
  response_stats_text: string | null;

  /** Solver-level counters from CP-SAT's ResponseProto. */
  solver_wall_time_seconds: number | null;
  solver_user_time_seconds: number | null;
  solver_deterministic_time: number | null;
  num_booleans: number | null;
  num_branches: number | null;
  num_conflicts: number | null;
  num_binary_propagations: number | null;
  num_integer_propagations: number | null;
  num_restarts: number | null;
  num_lp_iterations: number | null;

  /** Worker parameters — what we asked CP-SAT to do. */
  num_search_workers: number | null;
  max_time_in_seconds: number | null;
  random_seed: number | null;

  /**
   * Objective trajectory (SCHED-041 core signal).
   * - `greedy_hint_score` / `greedy_placement_count` — what the warm-start produced.
   * - `final_objective_value` / `final_objective_bound` — CP-SAT's best objective
   *   and best upper bound at termination.
   * - `final_relative_gap` — (bound - value) / max(1, |value|).
   * - `first_solution_objective` / `first_solution_wall_time_seconds` — when CP-SAT
   *   produced its first feasible (accepted hint → near-zero wall time).
   * - `improvements_found` — strictly-better objective tics observed; 0 is the
   *   "CP-SAT found nothing" signature; 1 is the "accepted hint and never
   *   improved" signature (the SCHED-041 plateau).
   * - `cp_sat_improved_on_greedy` — whether final > greedy_hint_score.
   */
  greedy_hint_score: number | null;
  greedy_placement_count: number | null;
  final_objective_value: number | null;
  final_objective_bound: number | null;
  final_relative_gap: number | null;
  first_solution_objective: number | null;
  first_solution_wall_time_seconds: number | null;
  improvements_found: number;
  cp_sat_improved_on_greedy: boolean;

  /** Presolve / hint survival signal. */
  placement_vars_count: number | null;
  placement_vars_hinted_to_1: number | null;

  /** Terminal-state summary. */
  termination_reason: TerminationReasonV3 | null;
  solution_info: string | null;
}

export interface SolverOutputV3 {
  solve_status: SolveStatusV3;
  entries: AssignmentV3[];
  unassigned: UnassignedDemandV3[];
  quality_metrics: QualityMetricsV3;
  objective_breakdown: ObjectiveBreakdownEntry[];
  hard_violations: number;
  soft_score: number;
  soft_max_score: number;
  duration_ms: number;
  constraint_snapshot: ConstraintSnapshotEntry[];
  early_stop_triggered: boolean;
  early_stop_reason: EarlyStopReasonV3;
  time_saved_ms: number;
  /**
   * SCHED-041 §A — structured CP-SAT telemetry. `null` when the sidecar is
   * running an older build that doesn't emit diagnostics, or when the solve
   * errored out before telemetry could be captured (e.g. MODEL_INVALID).
   */
  solver_diagnostics?: SolverDiagnosticsV3 | null;
}

// ─── Version tagging (persisted on result_json) ─────────────────────────────

export type ResultSchemaVersion = 'v2' | 'v3';
