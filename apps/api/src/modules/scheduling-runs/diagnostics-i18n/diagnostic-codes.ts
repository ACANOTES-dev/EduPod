/**
 * Single source of truth for all diagnostic codes across the scheduling
 * diagnostics module. The bilingual coverage spec asserts every value here
 * has entries in both en.ts and ar.ts — a new code cannot ship without
 * translations.
 *
 * Categories:
 *   - Feasibility sweep (pre-solve, §A)
 *   - IIS root-cause (post-solve, §B)
 *   - Legacy equivalents (§F audit carries these forward)
 */

// ─── Feasibility-sweep categories (§A) ──────────────────────────────────────

export const FEASIBILITY_CODES = [
  'global_capacity_shortfall',
  'subject_capacity_shortfall',
  'unreachable_class_subject',
  'class_weekly_overbook',
  'pin_conflict_teacher',
  'pin_conflict_class',
  'pin_conflict_room',
  'room_type_shortfall',
  'double_period_infeasible',
  'per_day_cap_conflict',
] as const;

export type FeasibilityCode = (typeof FEASIBILITY_CODES)[number];

// ─── IIS constraint types (§B) ──────────────────────────────────────────────

export const IIS_CODES = [
  'teacher_unavailable',
  'teacher_overloaded',
  'room_capacity_exceeded',
  'class_conflict',
  'subject_demand_exceeds_capacity',
  'pin_blocks_placement',
  'double_period_blocked',
  'student_overlap_conflict',
] as const;

export type IISCode = (typeof IIS_CODES)[number];

// ─── Post-solve diagnostic categories ───────────────────────────────────────

export const POST_SOLVE_CODES = [
  'teacher_supply_shortage',
  'workload_cap_hit',
  'availability_pinch',
  'pin_conflict',
  'unassigned_slots',
  'solver_budget_exhausted',
] as const;

export type PostSolveCode = (typeof POST_SOLVE_CODES)[number];

// ─── Union of all diagnostic codes ──────────────────────────────────────────

export const DIAGNOSTIC_CODES = [...FEASIBILITY_CODES, ...IIS_CODES, ...POST_SOLVE_CODES] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];
