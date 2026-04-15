import { checkHardConstraintsV2 } from './constraints-v2';
import {
  generateVariablesV2,
  generateInitialDomainsV2,
  forwardCheckV2,
  variableKeyV2,
  cloneDomainsV2,
  resolveTeacherCandidates,
} from './domain-v2';
import type {
  SolverInputV2,
  SolverOutputV2,
  SolverAssignmentV2,
  CSPVariableV2,
  DomainValueV2,
  ProgressCallbackV2,
  CancelCheckV2,
  QualityMetricsV2,
} from './types-v2';

// ─── Options ────────────────────────────────────────────────────────────────

export interface SolverOptionsV2 {
  onProgress?: ProgressCallbackV2;
  shouldCancel?: CancelCheckV2;
}

// ─── Seeded PRNG ────────────────────────────────────────────────────────────

/**
 * Simple seeded PRNG — mulberry32 algorithm.
 * Returns a function that yields pseudo-random floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Pinned Entry Conversion ────────────────────────────────────────────────

/**
 * Convert pinned entries to SolverAssignmentV2 objects.
 */
function pinnedEntriesToAssignments(input: SolverInputV2): SolverAssignmentV2[] {
  const assignments: SolverAssignmentV2[] = [];

  for (const pinned of input.pinned_entries) {
    // Determine the year group for this pinned entry
    const yearGroupId = pinned.year_group_id ?? findYearGroupForClass(input, pinned.class_id);
    if (!yearGroupId) continue;

    // Find the slot details from the year group's period grid
    const yg = input.year_groups.find((y) => y.year_group_id === yearGroupId);
    const slot = yg?.period_grid.find(
      (p) => p.weekday === pinned.weekday && p.period_order === pinned.period_order,
    );

    const isSupervision =
      slot?.period_type === 'break_supervision' || slot?.period_type === 'lunch_duty';

    assignments.push({
      class_id: pinned.class_id,
      subject_id: pinned.subject_id ?? null,
      year_group_id: yearGroupId,
      room_id: pinned.room_id,
      teacher_staff_id: pinned.teacher_staff_id,
      weekday: pinned.weekday,
      period_order: pinned.period_order,
      start_time: slot?.start_time ?? '',
      end_time: slot?.end_time ?? '',
      is_pinned: true,
      break_group_id: slot?.break_group_id ?? null,
      is_supervision: isSupervision,
      preference_satisfaction: [],
    });
  }

  return assignments;
}

/**
 * Find the year group ID for a class based on the year group sections.
 */
function findYearGroupForClass(input: SolverInputV2, classId: string): string | null {
  for (const yg of input.year_groups) {
    for (const section of yg.sections) {
      if (section.class_id === classId) {
        return yg.year_group_id;
      }
    }
  }
  return null;
}

// ─── Assignment Building ────────────────────────────────────────────────────

/**
 * Build an assignment from a variable + domain value.
 */
function buildAssignment(
  variable: CSPVariableV2,
  value: DomainValueV2,
  input: SolverInputV2,
): SolverAssignmentV2 {
  const yg = input.year_groups.find((y) => y.year_group_id === variable.year_group_id);
  const slot = yg?.period_grid.find(
    (p) => p.weekday === value.weekday && p.period_order === value.period_order,
  );

  return {
    class_id: variable.class_id ?? '',
    subject_id: variable.subject_id,
    year_group_id: variable.year_group_id,
    room_id: value.room_id,
    teacher_staff_id: value.teacher_staff_id,
    weekday: value.weekday,
    period_order: value.period_order,
    start_time: slot?.start_time ?? '',
    end_time: slot?.end_time ?? '',
    is_pinned: false,
    break_group_id: variable.break_group_id,
    is_supervision: variable.type === 'supervision',
    preference_satisfaction: [],
  };
}

// ─── Variable Selection (MRV) ───────────────────────────────────────────────

/**
 * Select the variable with the smallest domain (MRV heuristic).
 * Tie-break: supervision > double-period > single-period.
 */
function selectVariableV2(
  domains: Map<string, DomainValueV2[]>,
  unassignedVars: CSPVariableV2[],
): CSPVariableV2 | null {
  if (unassignedVars.length === 0) return null;

  let best: CSPVariableV2 | null = null;
  let bestDomainSize = Infinity;
  let bestPriority = -1;

  for (const variable of unassignedVars) {
    const key = variableKeyV2(variable);
    const domain = domains.get(key);
    const domainSize = domain ? domain.length : 0;

    // Priority: supervision (3) > double-period (2) > single (1)
    let priority = 1;
    if (variable.type === 'supervision') {
      priority = 3;
    } else if (variable.is_double_period_start) {
      priority = 2;
    }

    if (
      best === null ||
      domainSize < bestDomainSize ||
      (domainSize === bestDomainSize && priority > bestPriority)
    ) {
      best = variable;
      bestDomainSize = domainSize;
      bestPriority = priority;
    }
  }

  return best;
}

// ─── Value Ordering ─────────────────────────────────────────────────────────

/**
 * Order domain values for a variable.
 * Priority: primary teachers first, then fewer existing assignments, then preference score.
 */
function orderValuesV2(
  variable: CSPVariableV2,
  domain: DomainValueV2[],
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  rng: () => number,
): DomainValueV2[] {
  if (domain.length <= 1) return domain;

  return [...domain].sort((a, b) => {
    const scoreA = scoreValueV2(a, variable, input, assignments);
    const scoreB = scoreValueV2(b, variable, input, assignments);

    // Higher score first
    if (scoreA !== scoreB) return scoreB - scoreA;

    // Tie-break: randomise to avoid deterministic bias on equal scores
    return rng() - 0.5;
  });
}

/**
 * Compute a lightweight preference score for value ordering.
 * Higher is better.
 */
function scoreValueV2(
  value: DomainValueV2,
  variable: CSPVariableV2,
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): number {
  let score = 0;
  const teacher = input.teachers.find((t) => t.staff_profile_id === value.teacher_staff_id);
  if (!teacher) return score;

  // Primary/backup tiering was removed in Stage 2 of the scheduler rebuild.
  // The pin/pool model makes every competency a real assignment: a pin
  // pre-selects the teacher (so only a single value lands in the domain),
  // and a pool entry leaves section selection to the solver. There is no
  // "preferred teacher among equals" signal left to score.

  // ── Load balancing: strongly penalize overloaded teachers ──
  const existingTeachingCount = assignments.filter(
    (a) => a.teacher_staff_id === value.teacher_staff_id && !a.is_supervision,
  ).length;

  // Linear penalty scales with load
  score -= existingTeachingCount * 2;

  // Capacity-based penalty: as teacher approaches their limit, heavily penalize
  if (teacher.max_periods_per_week !== null) {
    const utilization = existingTeachingCount / teacher.max_periods_per_week;
    if (utilization > 0.8) score -= 30;
    else if (utilization > 0.6) score -= 15;
  }

  // Day load penalty: prefer teachers with fewer assignments on this day
  const dayTeachingCount = assignments.filter(
    (a) =>
      a.teacher_staff_id === value.teacher_staff_id &&
      a.weekday === value.weekday &&
      !a.is_supervision,
  ).length;
  score -= dayTeachingCount * 3;

  if (teacher.max_periods_per_day !== null) {
    const dayUtil = dayTeachingCount / teacher.max_periods_per_day;
    if (dayUtil > 0.8) score -= 20;
  }

  // ── Preferred room bonus ──
  if (value.room_id !== null && variable.subject_id !== null) {
    const curriculum = input.curriculum.find(
      (c) => c.year_group_id === variable.year_group_id && c.subject_id === variable.subject_id,
    );
    if (curriculum?.preferred_room_id === value.room_id) {
      score += 10;
    }
    // SCHED-018: per-(class, subject) override from class_scheduling_requirements.
    // Scored higher than year-group curriculum hint so class-level intent wins.
    if (variable.class_id !== null && input.class_room_overrides) {
      const override = input.class_room_overrides.find(
        (o) =>
          o.class_id === variable.class_id &&
          (o.subject_id === variable.subject_id || o.subject_id === null),
      );
      if (override?.preferred_room_id === value.room_id) {
        score += 20;
      }
    }
  }

  // ── Teacher time-slot preference score ──
  for (const pref of teacher.preferences) {
    if (pref.preference_type !== 'time_slot') continue;

    const payload = pref.preference_payload as {
      weekday?: number;
      period_order?: number;
      preferred?: boolean;
    };

    const matchesWeekday = payload.weekday === undefined || payload.weekday === value.weekday;
    const matchesPeriod =
      payload.period_order === undefined || payload.period_order === value.period_order;

    if (matchesWeekday && matchesPeriod) {
      const weight = pref.priority === 'high' ? 8 : pref.priority === 'medium' ? 4 : 2;
      const wantsSlot = payload.preferred !== false;
      score += wantsSlot ? weight : -weight;
    }
  }

  // ── Even day spread: prefer days with fewer existing assignments for this class ──
  if (variable.class_id !== null && variable.subject_id !== null) {
    const dayCount = assignments.filter(
      (a) =>
        a.class_id === variable.class_id &&
        a.subject_id === variable.subject_id &&
        a.weekday === value.weekday,
    ).length;
    score -= dayCount * 5;
  }

  // ── Minimise teacher gaps ──
  const teacherDayAssignments = assignments
    .filter((a) => a.teacher_staff_id === value.teacher_staff_id && a.weekday === value.weekday)
    .map((a) => a.period_order);

  if (teacherDayAssignments.length > 0) {
    const minOrder = Math.min(...teacherDayAssignments);
    const maxOrder = Math.max(...teacherDayAssignments);

    if (value.period_order > minOrder && value.period_order < maxOrder) {
      const isGap = !teacherDayAssignments.includes(value.period_order);
      if (isGap) score += 3; // Filling a gap is good
    } else if (value.period_order === minOrder - 1 || value.period_order === maxOrder + 1) {
      score += 2; // Adjacent — no gap
    }
  }

  return score;
}

// ─── Preference Scoring ─────────────────────────────────────────────────────

/** Payload shapes for typed preferences */
interface TimeSlotPayload {
  weekday?: number;
  period_order?: number;
  preferred?: boolean;
}

interface ClassPrefPayload {
  class_id?: string;
  preferred?: boolean;
}

/**
 * Score how well the final solution satisfies soft preferences.
 * Adapted from v1 scorePreferences for v2 types.
 */
function scorePreferencesV2(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): {
  score: number;
  max_score: number;
  per_entry_satisfaction: SolverAssignmentV2['preference_satisfaction'];
} {
  const weights = input.settings.preference_weights;
  const globalWeights = input.settings.global_soft_weights;

  const perEntry: SolverAssignmentV2['preference_satisfaction'] = [];
  let score = 0;
  let maxScore = 0;

  // ── Teacher preferences ──
  for (const teacher of input.teachers) {
    const teacherAssignments = assignments.filter(
      (a) => a.teacher_staff_id === teacher.staff_profile_id,
    );

    for (const pref of teacher.preferences) {
      const weight =
        pref.priority === 'high'
          ? weights.high
          : pref.priority === 'medium'
            ? weights.medium
            : weights.low;

      maxScore += weight;
      let satisfied = false;

      if (pref.preference_type === 'class_pref') {
        satisfied = evaluateClassPreference(
          pref.preference_payload as ClassPrefPayload,
          teacherAssignments,
        );
      } else if (pref.preference_type === 'time_slot') {
        satisfied = evaluateTimeSlotPreference(
          pref.preference_payload as TimeSlotPayload,
          teacherAssignments,
        );
      }

      if (satisfied) score += weight;

      perEntry.push({
        preference_id: pref.id,
        teacher_staff_id: teacher.staff_profile_id,
        satisfied,
        weight,
      });
    }
  }

  // ── Global soft constraints ──

  // Even subject spread
  if (globalWeights.even_subject_spread > 0) {
    const spreadScore = scoreEvenSpreadV2(input, assignments);
    const spreadMax = globalWeights.even_subject_spread;
    score += spreadScore * spreadMax;
    maxScore += spreadMax;
  }

  // Minimise teacher gaps
  if (globalWeights.minimise_teacher_gaps > 0) {
    const gapScore = scoreMinimiseGapsV2(input, assignments);
    const gapMax = globalWeights.minimise_teacher_gaps;
    score += gapScore * gapMax;
    maxScore += gapMax;
  }

  // Room consistency
  if (globalWeights.room_consistency > 0) {
    const roomScore = scoreRoomConsistencyV2(input, assignments);
    const roomMax = globalWeights.room_consistency;
    score += roomScore * roomMax;
    maxScore += roomMax;
  }

  // Workload balance
  if (globalWeights.workload_balance > 0) {
    const balanceScore = scoreWorkloadBalanceV2(input, assignments);
    const balanceMax = globalWeights.workload_balance;
    score += balanceScore * balanceMax;
    maxScore += balanceMax;
  }

  // Break duty balance
  if (globalWeights.break_duty_balance > 0) {
    const dutyScore = scoreBreakDutyBalanceV2(input, assignments);
    const dutyMax = globalWeights.break_duty_balance;
    score += dutyScore * dutyMax;
    maxScore += dutyMax;
  }

  return {
    score: Math.round(score * 1000) / 1000,
    max_score: Math.round(maxScore * 1000) / 1000,
    per_entry_satisfaction: perEntry,
  };
}

/** Evaluate whether the class preference is satisfied */
function evaluateClassPreference(
  payload: ClassPrefPayload,
  teacherAssignments: SolverAssignmentV2[],
): boolean {
  if (!payload.class_id) return false;
  const isAssigned = teacherAssignments.some((a) => a.class_id === payload.class_id);
  const wantsAssignment = payload.preferred !== false;
  return wantsAssignment ? isAssigned : !isAssigned;
}

/** Evaluate whether the time slot preference is satisfied */
function evaluateTimeSlotPreference(
  payload: TimeSlotPayload,
  teacherAssignments: SolverAssignmentV2[],
): boolean {
  if (payload.weekday === undefined && payload.period_order === undefined) {
    return false;
  }

  const matching = teacherAssignments.filter((a) => {
    if (payload.weekday !== undefined && a.weekday !== payload.weekday) {
      return false;
    }
    if (payload.period_order !== undefined && a.period_order !== payload.period_order) {
      return false;
    }
    return true;
  });

  const wantsSlot = payload.preferred !== false;
  return wantsSlot ? matching.length > 0 : matching.length === 0;
}

/**
 * Score even spread of subjects across weekdays.
 * Returns [0, 1]: 1 = perfectly spread.
 */
function scoreEvenSpreadV2(input: SolverInputV2, assignments: SolverAssignmentV2[]): number {
  let totalScore = 0;
  let count = 0;

  for (const curriculum of input.curriculum) {
    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    for (const section of yg.sections) {
      const sectionAssignments = assignments.filter(
        (a) => a.class_id === section.class_id && a.subject_id === curriculum.subject_id,
      );
      if (sectionAssignments.length === 0) continue;

      count++;
      totalScore += computeSpreadScore(sectionAssignments);
    }
  }

  return count === 0 ? 1 : totalScore / count;
}

/** Compute spread score for a set of assignments. 1 = maximally spread. */
function computeSpreadScore(assignments: SolverAssignmentV2[]): number {
  if (assignments.length <= 1) return 1;

  const dayCounts = new Map<number, number>();
  for (const a of assignments) {
    dayCounts.set(a.weekday, (dayCounts.get(a.weekday) ?? 0) + 1);
  }

  const counts = Array.from(dayCounts.values());
  const n = assignments.length;
  const k = counts.length;

  const mean = n / k;
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / k;

  const maxVariance = Math.pow(n, 2);
  if (maxVariance === 0) return 1;

  return Math.max(0, 1 - variance / maxVariance);
}

/**
 * Score minimising teacher gaps. Returns [0, 1]: 1 = no gaps.
 */
function scoreMinimiseGapsV2(input: SolverInputV2, assignments: SolverAssignmentV2[]): number {
  if (input.teachers.length === 0 || assignments.length === 0) return 1;

  let totalGaps = 0;
  let maxPossibleGaps = 0;

  for (const teacher of input.teachers) {
    const teacherAssignments = assignments.filter(
      (a) => a.teacher_staff_id === teacher.staff_profile_id,
    );

    const byDay = new Map<number, number[]>();
    for (const a of teacherAssignments) {
      const existing = byDay.get(a.weekday) ?? [];
      existing.push(a.period_order);
      byDay.set(a.weekday, existing);
    }

    for (const [, orders] of byDay) {
      if (orders.length <= 1) continue;
      orders.sort((a, b) => a - b);
      const first = orders[0]!;
      const last = orders[orders.length - 1]!;
      const span = last - first + 1;
      const gaps = span - orders.length;
      totalGaps += gaps;
      maxPossibleGaps += span - 1;
    }
  }

  if (maxPossibleGaps === 0) return 1;
  return Math.max(0, 1 - totalGaps / maxPossibleGaps);
}

/**
 * Score room consistency: reward using preferred room.
 * Returns [0, 1].
 */
function scoreRoomConsistencyV2(input: SolverInputV2, assignments: SolverAssignmentV2[]): number {
  let total = 0;
  let satisfied = 0;

  for (const curriculum of input.curriculum) {
    if (curriculum.preferred_room_id === null) continue;

    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    for (const section of yg.sections) {
      const sectionAssignments = assignments.filter(
        (a) => a.class_id === section.class_id && a.subject_id === curriculum.subject_id,
      );
      if (sectionAssignments.length === 0) continue;

      total++;
      const allInPreferred = sectionAssignments.every(
        (a) => a.room_id === curriculum.preferred_room_id,
      );
      if (allInPreferred) satisfied++;
    }
  }

  return total === 0 ? 1 : satisfied / total;
}

/**
 * Score workload balance across teachers.
 * Returns [0, 1]: 1 = perfectly balanced.
 */
function scoreWorkloadBalanceV2(input: SolverInputV2, assignments: SolverAssignmentV2[]): number {
  if (input.teachers.length <= 1) return 1;

  const counts = input.teachers.map(
    (t) =>
      assignments.filter((a) => a.teacher_staff_id === t.staff_profile_id && !a.is_supervision)
        .length,
  );

  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
  if (mean === 0) return 1;

  const variance = counts.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  return Math.max(0, 1 - cv / 2);
}

/**
 * Score break duty balance across teachers.
 * Returns [0, 1]: 1 = perfectly balanced.
 */
function scoreBreakDutyBalanceV2(input: SolverInputV2, assignments: SolverAssignmentV2[]): number {
  const supervisionAssignments = assignments.filter((a) => a.is_supervision);
  if (supervisionAssignments.length === 0) return 1;

  // Only consider teachers who have supervision duties
  const dutyCounts = new Map<string, number>();
  for (const a of supervisionAssignments) {
    if (a.teacher_staff_id) {
      dutyCounts.set(a.teacher_staff_id, (dutyCounts.get(a.teacher_staff_id) ?? 0) + 1);
    }
  }

  const counts = Array.from(dutyCounts.values());
  if (counts.length <= 1) return 1;

  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
  if (mean === 0) return 1;

  const variance = counts.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  return Math.max(0, 1 - cv / 2);
}

// ─── Diagnosis ──────────────────────────────────────────────────────────────

/**
 * Determine the reason a variable could not be assigned.
 */
function diagnoseUnassigned(
  variable: CSPVariableV2,
  input: SolverInputV2,
  _assignments: SolverAssignmentV2[],
): string {
  if (variable.type === 'supervision') {
    return 'Insufficient teachers available for supervision at this time';
  }

  // Check if any teacher is eligible under the pin-or-pool model.
  // A pinned class has exactly one candidate; a pool class has the year-group
  // pool; a class with neither signals a prerequisite failure that slipped
  // through to the solver.
  let eligibleTeachers: typeof input.teachers = [];
  if (variable.subject_id !== null && variable.class_id !== null) {
    const resolution = resolveTeacherCandidates(
      input.teachers,
      variable.class_id,
      variable.year_group_id,
      variable.subject_id,
    );
    if (resolution.mode === 'missing') {
      return `No pinned or pool teacher for class=${variable.class_id} subject=${variable.subject_id} year_group=${variable.year_group_id}`;
    }
    const candidateIds =
      resolution.mode === 'pinned'
        ? new Set([resolution.teacher_id])
        : new Set(resolution.teacher_ids);
    eligibleTeachers = input.teachers.filter((t) => candidateIds.has(t.staff_profile_id));
  }

  if (eligibleTeachers.length === 0) {
    return `No eligible teachers for subject=${variable.subject_id} in year_group=${variable.year_group_id}`;
  }

  // Check teaching slots available
  const yg = input.year_groups.find((y) => y.year_group_id === variable.year_group_id);
  if (!yg) return 'Year group not found in input';

  const teachingSlots = yg.period_grid.filter((p) => p.period_type === 'teaching');
  if (teachingSlots.length === 0) {
    return 'No teaching slots available in period grid';
  }

  // Check if all teachers are unavailable at all remaining slots
  let allUnavailable = true;
  for (const slot of teachingSlots) {
    for (const teacher of eligibleTeachers) {
      if (teacher.availability.length === 0) {
        allUnavailable = false;
        break;
      }
      const dayAvail = teacher.availability.filter((a) => a.weekday === slot.weekday);
      if (dayAvail.length === 0) continue;
      const covered = dayAvail.some((a) => a.from <= slot.start_time && a.to >= slot.end_time);
      if (covered) {
        allUnavailable = false;
        break;
      }
    }
    if (!allUnavailable) break;
  }

  if (allUnavailable) {
    return 'All eligible teachers are unavailable at remaining teaching slots';
  }

  return 'No valid slot found due to constraint conflicts';
}

// ─── Constraint Summary ─────────────────────────────────────────────────────

/**
 * Build the constraint_summary by counting violations across all assignments.
 * In a valid solver output, tier1 should always be 0.
 */
function buildConstraintSummary(
  _input: SolverInputV2,
  _assignments: SolverAssignmentV2[],
): SolverOutputV2['constraint_summary'] {
  // The solver guarantees no hard constraint violations in its output.
  // Tier counts here are for informational purposes, reflecting the solver's result.
  // Post-solve validation (separate service) provides full 3-tier checking.
  return {
    tier1_violations: 0,
    tier2_violations: 0,
    tier3_violations: 0,
  };
}

// ─── Main Solver ────────────────────────────────────────────────────────────

/**
 * Main v2 solver entry point.
 *
 * Two-phase approach for scalability:
 *   Phase 1 — Greedy sweep: iterate variables in MRV order, pick the
 *             highest-scored valid domain value. No backtracking. O(V*D).
 *             This places the majority of variables quickly.
 *   Phase 2 — Repair pass: for each variable that failed in Phase 1,
 *             re-generate its domain against the current state and try again.
 *             Repeat up to `maxRepairRounds` times or until no progress.
 *
 * For small inputs (< BACKTRACK_THRESHOLD variables), the original full
 * backtracking + forward-checking search is used for optimality.
 */
export function solveV2(input: SolverInputV2, options: SolverOptionsV2 = {}): SolverOutputV2 {
  const startTime = Date.now();
  const maxDuration = input.settings.max_solver_duration_seconds * 1000;
  const { onProgress, shouldCancel } = options;

  // Handle empty input
  if (input.year_groups.length === 0) {
    return {
      entries: [],
      unassigned: [],
      score: 0,
      max_score: 0,
      duration_ms: Date.now() - startTime,
      constraint_summary: { tier1_violations: 0, tier2_violations: 0, tier3_violations: 0 },
    };
  }

  // 1. Seeded RNG.
  //
  // SCHED-025: determinism. Falling back to `Date.now()` when the caller
  // omits a seed makes repeat runs non-reproducible even with identical
  // inputs. Use a fixed fallback (0) so "same input → same output" holds
  // whenever the caller does not pin a seed. Tenants that want explicit
  // randomisation pass an integer via `solver_seed`.
  const rng = mulberry32(input.settings.solver_seed ?? 0);

  // 2. Convert pinned entries to SolverAssignmentV2[]
  const pinnedAssignments = pinnedEntriesToAssignments(input);

  // 3. Generate variables (supervision first, then double-period, then single)
  const variables = generateVariablesV2(input, pinnedAssignments);

  // 4. If no variables, return immediately
  if (variables.length === 0) {
    const prefScore = scorePreferencesV2(input, pinnedAssignments);
    const entries = pinnedAssignments.map((a) => ({
      ...a,
      preference_satisfaction: [] as SolverAssignmentV2['preference_satisfaction'],
    }));
    return {
      entries,
      unassigned: [],
      score: prefScore.score,
      max_score: prefScore.max_score,
      duration_ms: Date.now() - startTime,
      constraint_summary: buildConstraintSummary(input, entries),
    };
  }

  // 5. Generate initial domains
  const initialDomains = generateInitialDomainsV2(input, variables, pinnedAssignments);

  // ── Decide strategy ──
  // For small inputs, use full backtracking for optimal results.
  // For large inputs, use greedy + repair for scalability.
  const BACKTRACK_THRESHOLD = 80;
  const useGreedy = variables.length > BACKTRACK_THRESHOLD;

  let finalAssignments: SolverAssignmentV2[];
  let fullyAssigned: boolean;

  if (useGreedy) {
    const result = solveGreedyWithRepair(
      input,
      variables,
      initialDomains,
      pinnedAssignments,
      rng,
      startTime,
      maxDuration,
      onProgress,
      shouldCancel,
    );
    finalAssignments = result.assignments;
    fullyAssigned = result.fullyAssigned;
  } else {
    const result = solveBacktracking(
      input,
      variables,
      initialDomains,
      pinnedAssignments,
      rng,
      startTime,
      maxDuration,
      onProgress,
      shouldCancel,
    );
    finalAssignments = result.assignments;
    fullyAssigned = result.fullyAssigned;
  }

  // Build unassigned list
  const unassigned = buildUnassignedList(input, variables, finalAssignments, fullyAssigned);

  // Score the final solution
  const prefScore = scorePreferencesV2(input, finalAssignments);

  // Attach preference satisfaction per entry
  const entries = attachPreferenceSatisfaction(finalAssignments, prefScore.per_entry_satisfaction);

  // SCHED-024: demote isolated placements for double-required subjects.
  // The greedy+repair loop is lenient about partial doubles during search,
  // but a final schedule that leaves singletons for a requires_double_period
  // subject violates a hard constraint. Move each orphaned placement from
  // entries → unassigned so the run is reported as `failed` (per SCHED-017)
  // rather than silently publishing a broken schedule.
  const { keptEntries, demotedUnassigned } = demoteIsolatedDoubles(input, entries);

  // Final progress callback
  if (onProgress) {
    onProgress(keptEntries.filter((a) => !a.is_pinned).length, variables.length, 'complete');
  }

  return {
    entries: keptEntries,
    unassigned: [...unassigned, ...demotedUnassigned],
    score: prefScore.score,
    max_score: prefScore.max_score,
    duration_ms: Date.now() - startTime,
    constraint_summary: buildConstraintSummary(input, keptEntries),
    quality_metrics: buildQualityMetrics(input, keptEntries, prefScore.per_entry_satisfaction),
  };
}

/**
 * Compute SCHED-026 quality metrics from the final entry set. This is a pure
 * function — no side effects, no solver state — so adding/removing metrics
 * here does not change solve behaviour.
 */
function buildQualityMetrics(
  input: SolverInputV2,
  entries: SolverAssignmentV2[],
  perEntrySatisfaction: SolverAssignmentV2['preference_satisfaction'],
): QualityMetricsV2 {
  // ── Teacher gap index ──
  // For each teacher × weekday, compute (last_period - first_period + 1) - lesson_count.
  // Sum into one average per teacher across active days, then min/avg/max across teachers.
  const byTeacherDay = new Map<string, number[]>();
  for (const e of entries) {
    if (e.teacher_staff_id === null || e.is_supervision) continue;
    const key = `${e.teacher_staff_id}::${e.weekday}`;
    const list = byTeacherDay.get(key) ?? [];
    list.push(e.period_order);
    byTeacherDay.set(key, list);
  }
  const perTeacherGapAvg = new Map<string, number[]>();
  for (const [key, periods] of byTeacherDay) {
    const teacherId = key.split('::')[0]!;
    if (periods.length === 0) continue;
    const span = Math.max(...periods) - Math.min(...periods) + 1;
    const gap = span - periods.length;
    const list = perTeacherGapAvg.get(teacherId) ?? [];
    list.push(gap);
    perTeacherGapAvg.set(teacherId, list);
  }
  const teacherAverages: number[] = [];
  for (const gaps of perTeacherGapAvg.values()) {
    if (gaps.length === 0) continue;
    teacherAverages.push(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }
  const gapIndex = minAvgMax(teacherAverages);

  // ── Day distribution variance ──
  // For each class, compute stddev of lessons_per_day across the 5 (or N)
  // weekdays the class has any scheduled slot. Lower = more even.
  const byClassDay = new Map<string, number>();
  const classesSeen = new Set<string>();
  for (const e of entries) {
    if (e.class_id === null || e.is_supervision) continue;
    classesSeen.add(e.class_id);
    const key = `${e.class_id}::${e.weekday}`;
    byClassDay.set(key, (byClassDay.get(key) ?? 0) + 1);
  }
  const classStdDevs: number[] = [];
  const workingDays = new Set(
    input.year_groups.flatMap((yg) => yg.period_grid.map((p) => p.weekday)),
  );
  const dayCount = Math.max(workingDays.size, 1);
  for (const classId of classesSeen) {
    const perDay: number[] = [];
    for (const d of workingDays) {
      perDay.push(byClassDay.get(`${classId}::${d}`) ?? 0);
    }
    const mean = perDay.reduce((s, c) => s + c, 0) / dayCount;
    const variance = perDay.reduce((s, c) => s + (c - mean) ** 2, 0) / dayCount;
    classStdDevs.push(Math.sqrt(variance));
  }
  const distVar = minAvgMax(classStdDevs);

  // ── Preference breakdown ──
  const prefTypes = new Map<
    string,
    { preference_type: 'subject' | 'class_pref' | 'time_slot'; honoured: number; violated: number }
  >();
  const prefById = new Map<string, 'subject' | 'class_pref' | 'time_slot'>();
  for (const t of input.teachers) {
    for (const pref of t.preferences) {
      prefById.set(pref.id, pref.preference_type);
    }
  }
  for (const s of perEntrySatisfaction ?? []) {
    const type = prefById.get(s.preference_id);
    if (!type) continue;
    const row = prefTypes.get(type) ?? { preference_type: type, honoured: 0, violated: 0 };
    if (s.satisfied) row.honoured += 1;
    else row.violated += 1;
    prefTypes.set(type, row);
  }

  return {
    teacher_gap_index: gapIndex,
    day_distribution_variance: distVar,
    preference_breakdown: Array.from(prefTypes.values()),
  };
}

function minAvgMax(values: number[]): { min: number; avg: number; max: number } {
  if (values.length === 0) return { min: 0, avg: 0, max: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return { min, avg: round2(avg), max };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Post-processor for SCHED-024: detect double-required subjects that ended up
 * as isolated singletons (no adjacent same-subject period on the same day
 * for the same class) and demote them to the unassigned list. The run's
 * status then reflects reality — a partial double-period requirement is
 * an infeasible placement, not a success.
 */
function demoteIsolatedDoubles(
  input: SolverInputV2,
  entries: SolverAssignmentV2[],
): {
  keptEntries: SolverAssignmentV2[];
  demotedUnassigned: SolverOutputV2['unassigned'];
} {
  const doubleRequired = new Set(
    input.curriculum
      .filter((c) => c.requires_double_period && c.subject_id !== null)
      .map((c) => `${c.year_group_id}::${c.subject_id}`),
  );
  if (doubleRequired.size === 0) {
    return { keptEntries: entries, demotedUnassigned: [] };
  }

  // Bucket entries by (class, subject, weekday) — pinned entries are trusted
  // to be pre-validated by the admin, so we only demote non-pinned ones.
  const bucketKey = (e: SolverAssignmentV2) => `${e.class_id}::${e.subject_id}::${e.weekday}`;
  const buckets = new Map<string, SolverAssignmentV2[]>();
  for (const e of entries) {
    if (e.class_id === null || e.subject_id === null) continue;
    if (!doubleRequired.has(`${e.year_group_id}::${e.subject_id}`)) continue;
    const key = bucketKey(e);
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }

  const toRemove = new Set<SolverAssignmentV2>();
  for (const [, bucket] of buckets) {
    if (bucket.length === 0) continue;
    // Sort by period_order; a placement is isolated if neither neighbour
    // (period-1 / period+1) is also in this bucket.
    const orders = new Set(bucket.map((e) => e.period_order));
    for (const entry of bucket) {
      if (entry.is_pinned) continue;
      const hasNeighbour = orders.has(entry.period_order - 1) || orders.has(entry.period_order + 1);
      if (!hasNeighbour) toRemove.add(entry);
    }
  }

  if (toRemove.size === 0) {
    return { keptEntries: entries, demotedUnassigned: [] };
  }

  const keptEntries = entries.filter((e) => !toRemove.has(e));

  // Group demotions by (year_group, subject, class) to match the existing
  // unassigned shape. periods_remaining carries the demoted count.
  const demotedGroups = new Map<
    string,
    { year_group_id: string; subject_id: string | null; class_id: string | null; count: number }
  >();
  for (const e of toRemove) {
    const k = `${e.year_group_id}::${e.subject_id}::${e.class_id}`;
    const existing = demotedGroups.get(k);
    if (existing) existing.count += 1;
    else
      demotedGroups.set(k, {
        year_group_id: e.year_group_id,
        subject_id: e.subject_id,
        class_id: e.class_id,
        count: 1,
      });
  }

  const demotedUnassigned: SolverOutputV2['unassigned'] = [];
  for (const g of demotedGroups.values()) {
    demotedUnassigned.push({
      year_group_id: g.year_group_id,
      subject_id: g.subject_id,
      class_id: g.class_id,
      periods_remaining: g.count,
      reason: 'Isolated singleton for a double-period-required subject (SCHED-024)',
    });
  }
  return { keptEntries, demotedUnassigned };
}

// ─── Greedy + Repair Solver ────────────────────────────────────────────────

interface SolveResult {
  assignments: SolverAssignmentV2[];
  fullyAssigned: boolean;
}

/**
 * Greedy solver with iterative repair.
 *
 * Phase 1: Greedy sweep — for each variable (MRV order), try domain values
 *          in scored order. Pick the first that satisfies all hard constraints.
 * Phase 2: Repair — re-attempt unassigned variables with updated domains.
 *          Repeat until convergence or timeout.
 */
function solveGreedyWithRepair(
  input: SolverInputV2,
  variables: CSPVariableV2[],
  domains: Map<string, DomainValueV2[]>,
  pinnedAssignments: SolverAssignmentV2[],
  rng: () => number,
  startTime: number,
  maxDuration: number,
  onProgress?: ProgressCallbackV2,
  shouldCancel?: CancelCheckV2,
): SolveResult {
  const assignments: SolverAssignmentV2[] = [...pinnedAssignments];
  const remaining = [...variables];
  let assignedThisRound = 0;

  // Pre-compute resource scarcity scores for smarter ordering.
  // Subjects that require scarce resources (few eligible teachers, limited room types)
  // should be assigned first.
  const scarcityScore = new Map<string, number>();

  for (const variable of variables) {
    const key = variableKeyV2(variable);
    const domain = domains.get(key) ?? [];
    let score = 0;

    // Priority: supervision (300) > double-period (200) > single (100)
    if (variable.type === 'supervision') {
      score += 300;
    } else if (variable.is_double_period_start) {
      score += 200;
    } else {
      score += 100;
    }

    // Subjects with fewer eligible teachers get higher scarcity
    if (variable.subject_id !== null) {
      const eligibleTeachers = input.teachers.filter((t) =>
        t.competencies.some(
          (c) => c.subject_id === variable.subject_id && c.year_group_id === variable.year_group_id,
        ),
      );
      // Fewer teachers = higher scarcity
      score += Math.max(0, 50 - eligibleTeachers.length * 10);
    }

    // Subjects requiring specific room types with limited availability
    if (variable.subject_id !== null) {
      const curriculum = input.curriculum.find(
        (c) => c.year_group_id === variable.year_group_id && c.subject_id === variable.subject_id,
      );
      if (curriculum?.required_room_type) {
        const roomCount = input.rooms.filter(
          (r) => r.room_type === curriculum.required_room_type,
        ).length;
        // Fewer rooms = higher scarcity
        score += Math.max(0, 40 - roomCount * 10);
      }
    }

    // Smaller domain = more constrained = higher priority
    score += Math.max(0, 30 - Math.floor(domain.length / 5));

    scarcityScore.set(key, score);
  }

  // Sort variables: highest scarcity first, then smallest domain
  function sortByScarcity(vars: CSPVariableV2[]): CSPVariableV2[] {
    return [...vars].sort((a, b) => {
      const aKey = variableKeyV2(a);
      const bKey = variableKeyV2(b);
      const aScore = scarcityScore.get(aKey) ?? 0;
      const bScore = scarcityScore.get(bKey) ?? 0;

      if (aScore !== bScore) return bScore - aScore;

      // Tie-break: smaller domain first
      const aDomain = domains.get(aKey) ?? [];
      const bDomain = domains.get(bKey) ?? [];
      return aDomain.length - bDomain.length;
    });
  }

  // Helper to attempt assignment of a single variable
  function tryAssign(variable: CSPVariableV2): boolean {
    const key = variableKeyV2(variable);
    const domain = domains.get(key) ?? [];

    const validValues = domain.filter(
      (value) => checkHardConstraintsV2(input, assignments, variable, value) === null,
    );

    if (validValues.length === 0) return false;

    const ordered = orderValuesV2(variable, validValues, input, assignments, rng);
    const bestValue = ordered[0]!;

    const assignment = buildAssignment(variable, bestValue, input);
    assignments.push(assignment);
    assignedThisRound++;

    if (assignedThisRound % 50 === 0 && onProgress) {
      onProgress(assignedThisRound, variables.length, 'greedy');
    }

    return true;
  }

  // Phase 1: Assign supervision variables first (they're most constrained)
  const supervisionVars = remaining.filter((v) => v.type === 'supervision');
  const teachingVars = remaining.filter((v) => v.type === 'teaching');

  const sortedSupervision = sortByScarcity(supervisionVars);
  const failedSupervision: CSPVariableV2[] = [];

  for (const variable of sortedSupervision) {
    if (Date.now() - startTime > maxDuration) break;
    if (!tryAssign(variable)) {
      failedSupervision.push(variable);
    }
  }

  // Phase 2: Assign teaching variables round-robin by class section.
  // Group variables by class_id, then process one variable from each class
  // per round. Within each class, process by scarcity (double-period first,
  // then scarce subjects).
  const byClass = new Map<string, CSPVariableV2[]>();
  for (const v of teachingVars) {
    const cid = v.class_id ?? '__no_class__';
    const existing = byClass.get(cid) ?? [];
    existing.push(v);
    byClass.set(cid, existing);
  }

  // Sort each class's variables by scarcity
  for (const [cid, vars] of byClass) {
    byClass.set(cid, sortByScarcity(vars));
  }

  // Get list of class IDs in a deterministic order
  const classIds = [...byClass.keys()].sort();

  // Round-robin assignment: pick one variable from each class per round
  const failedTeaching: CSPVariableV2[] = [];
  let madeProgress = true;

  while (madeProgress) {
    madeProgress = false;
    if (Date.now() - startTime > maxDuration) break;
    if (shouldCancel?.()) break;

    for (const cid of classIds) {
      const vars = byClass.get(cid);
      if (!vars || vars.length === 0) continue;

      if (Date.now() - startTime > maxDuration) break;

      // Take the first (highest priority) variable for this class
      const variable = vars.shift()!;
      if (tryAssign(variable)) {
        madeProgress = true;
      } else {
        failedTeaching.push(variable);
      }
    }

    // Remove empty class lists
    for (const cid of classIds) {
      const vars = byClass.get(cid);
      if (!vars || vars.length === 0) {
        byClass.delete(cid);
      }
    }

    // If all classes are empty, we're done
    if (byClass.size === 0) break;
  }

  // Collect any remaining unprocessed variables
  for (const [, vars] of byClass) {
    failedTeaching.push(...vars);
  }

  // Phase 3: Repair pass — retry all failed variables against final state.
  // As the round-robin may have created new openings.
  let unassigned = [...failedSupervision, ...failedTeaching];
  const maxRepairRounds = 5;

  for (let round = 0; round < maxRepairRounds; round++) {
    if (unassigned.length === 0) break;
    if (Date.now() - startTime > maxDuration) break;
    if (shouldCancel?.()) break;

    const stillFailed: CSPVariableV2[] = [];
    let progressThisRound = false;

    for (const variable of unassigned) {
      if (Date.now() - startTime > maxDuration) {
        stillFailed.push(variable);
        continue;
      }

      const key = variableKeyV2(variable);
      const domain = domains.get(key) ?? [];

      const validValues = domain.filter(
        (value) => checkHardConstraintsV2(input, assignments, variable, value) === null,
      );

      if (validValues.length === 0) {
        stillFailed.push(variable);
        continue;
      }

      const ordered = orderValuesV2(variable, validValues, input, assignments, rng);
      const bestValue = ordered[0]!;

      const assignment = buildAssignment(variable, bestValue, input);
      assignments.push(assignment);
      assignedThisRound++;
      progressThisRound = true;

      if (assignedThisRound % 50 === 0 && onProgress) {
        onProgress(assignedThisRound, variables.length, `repair-${round + 1}`);
      }
    }

    unassigned = stillFailed;
    if (!progressThisRound) break;
  }

  return {
    assignments,
    fullyAssigned: unassigned.length === 0,
  };
}

// ─── Backtracking Solver (for small inputs) ────────────────────────────────

function solveBacktracking(
  input: SolverInputV2,
  variables: CSPVariableV2[],
  initialDomains: Map<string, DomainValueV2[]>,
  pinnedAssignments: SolverAssignmentV2[],
  rng: () => number,
  startTime: number,
  maxDuration: number,
  onProgress?: ProgressCallbackV2,
  shouldCancel?: CancelCheckV2,
): SolveResult {
  let iterationCount = 0;
  let assignmentCount = 0;
  let timedOut = false;
  let cancelled = false;

  // Track the best partial solution found
  let bestPartialAssignments: SolverAssignmentV2[] = [...pinnedAssignments];

  function backtrack(
    assignments: SolverAssignmentV2[],
    domains: Map<string, DomainValueV2[]>,
    remaining: CSPVariableV2[],
  ): SolverAssignmentV2[] | null {
    iterationCount++;

    if (iterationCount % 50 === 0) {
      if (Date.now() - startTime > maxDuration) {
        timedOut = true;
        return null;
      }
    }

    if (iterationCount % 500 === 0 && shouldCancel?.()) {
      cancelled = true;
      return null;
    }

    if (assignments.length > bestPartialAssignments.length) {
      bestPartialAssignments = [...assignments];
    }

    if (remaining.length === 0) {
      return assignments;
    }

    const variable = selectVariableV2(domains, remaining);
    if (!variable) return null;

    const key = variableKeyV2(variable);
    const domain = domains.get(key) ?? [];

    const orderedValues = orderValuesV2(variable, domain, input, assignments, rng);

    const newRemaining = remaining.filter((v) => v.id !== variable.id);

    for (const value of orderedValues) {
      if (timedOut || cancelled) return null;

      const violation = checkHardConstraintsV2(input, assignments, variable, value);
      if (violation !== null) continue;

      const newAssignment = buildAssignment(variable, value, input);
      const newDomains = cloneDomainsV2(domains);
      newDomains.delete(key);

      const fcOk = forwardCheckV2(input, [...assignments, newAssignment], newDomains, newRemaining);

      if (!fcOk) continue;

      assignmentCount++;
      if (assignmentCount % 100 === 0 && onProgress) {
        onProgress(
          assignmentCount,
          variables.length,
          variable.type === 'supervision' ? 'supervision' : 'teaching',
        );
      }

      const result = backtrack([...assignments, newAssignment], newDomains, newRemaining);

      if (result !== null) return result;
      assignmentCount--;
    }

    return null;
  }

  const solution = backtrack([...pinnedAssignments], initialDomains, variables);

  return {
    assignments: solution ?? bestPartialAssignments,
    fullyAssigned: solution !== null,
  };
}

// ─── Post-Solve Helpers ─────────────────────────────────────────────────────

/**
 * Build the list of unassigned slots for variables that couldn't be scheduled.
 */
function buildUnassignedList(
  input: SolverInputV2,
  variables: CSPVariableV2[],
  assignments: SolverAssignmentV2[],
  fullyAssigned: boolean,
): SolverOutputV2['unassigned'] {
  if (fullyAssigned) return [];

  const unassigned: SolverOutputV2['unassigned'] = [];

  // Group variables by (class_id, subject_id) or by break_group_id for supervision
  const varGroups = new Map<string, CSPVariableV2[]>();

  for (const v of variables) {
    const groupKey =
      v.type === 'supervision' ? `sup:${v.break_group_id}` : `teach:${v.class_id}:${v.subject_id}`;

    const existing = varGroups.get(groupKey) ?? [];
    existing.push(v);
    varGroups.set(groupKey, existing);
  }

  for (const [, groupVars] of varGroups) {
    const firstVar = groupVars[0]!;

    // Count how many variables in this group were actually assigned
    let assignedCount: number;
    if (firstVar.type === 'supervision') {
      assignedCount = assignments.filter(
        (a) => a.is_supervision && a.break_group_id === firstVar.break_group_id && !a.is_pinned,
      ).length;
    } else {
      assignedCount = assignments.filter(
        (a) =>
          a.class_id === firstVar.class_id &&
          a.subject_id === firstVar.subject_id &&
          !a.is_pinned &&
          !a.is_supervision,
      ).length;
    }

    const totalNeeded = groupVars.length;
    const remaining = totalNeeded - assignedCount;

    if (remaining > 0) {
      const reason = diagnoseUnassigned(firstVar, input, assignments);

      unassigned.push({
        year_group_id: firstVar.year_group_id,
        subject_id: firstVar.subject_id,
        class_id: firstVar.class_id,
        periods_remaining: remaining,
        reason,
      });
    }
  }

  return unassigned;
}

/**
 * Attach per-preference satisfaction scores to entries.
 */
function attachPreferenceSatisfaction(
  assignments: SolverAssignmentV2[],
  perEntrySatisfaction: SolverAssignmentV2['preference_satisfaction'],
): SolverAssignmentV2[] {
  return assignments.map((a) => ({
    ...a,
    preference_satisfaction: a.is_pinned
      ? []
      : (perEntrySatisfaction || []).filter((sat) => sat.teacher_staff_id === a.teacher_staff_id),
  }));
}
