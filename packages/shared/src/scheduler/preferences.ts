import type { SolverInput, SolverAssignment } from './types';

export interface PreferenceScore {
  score: number;
  max_score: number;
  per_entry_satisfaction: Array<{
    preference_id: string;
    teacher_staff_id: string;
    satisfied: boolean;
    weight: number;
  }>;
}

/** Payload shapes for typed preferences */
interface TimeSlotPayload {
  weekday?: number;
  period_order?: number;
  preferred?: boolean; // true = prefer, false = avoid
}

interface ClassPrefPayload {
  class_id?: string;
  preferred?: boolean;
}

/**
 * Score how well a complete or partial solution satisfies soft preferences.
 */
export function scorePreferences(
  input: SolverInput,
  assignments: SolverAssignment[],
): PreferenceScore {
  const weights = input.settings.preference_weights;
  const globalWeights = input.settings.global_soft_weights;

  const perEntry: PreferenceScore['per_entry_satisfaction'] = [];
  let score = 0;
  let maxScore = 0;

  // ─── Teacher preferences ───────────────────────────────────────────────────
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
      // subject preferences: require class → subject mapping which isn't in SolverInput
      // so we skip those here (they can be evaluated externally if needed)

      if (satisfied) score += weight;

      perEntry.push({
        preference_id: pref.id,
        teacher_staff_id: teacher.staff_profile_id,
        satisfied,
        weight,
      });
    }
  }

  // ─── Global soft constraints ───────────────────────────────────────────────

  // Even subject spread: for each class, measure how evenly its periods are
  // distributed across the week
  if (globalWeights.even_subject_spread > 0) {
    const spreadScore = scoreEvenSpread(input, assignments);
    const spreadMax = globalWeights.even_subject_spread;
    score += spreadScore * spreadMax;
    maxScore += spreadMax;
  }

  // Minimise teacher gaps: penalise idle periods between first/last class per teacher per day
  if (globalWeights.minimise_teacher_gaps > 0) {
    const gapScore = scoreMinimiseGaps(input, assignments);
    const gapMax = globalWeights.minimise_teacher_gaps;
    score += gapScore * gapMax;
    maxScore += gapMax;
  }

  // Room consistency: reward using preferred_room_id
  if (globalWeights.room_consistency > 0) {
    const roomScore = scoreRoomConsistency(input, assignments);
    const roomMax = globalWeights.room_consistency;
    score += roomScore * roomMax;
    maxScore += roomMax;
  }

  // Workload balance: reward even distribution of periods across teachers
  if (globalWeights.workload_balance > 0) {
    const balanceScore = scoreWorkloadBalance(input, assignments);
    const balanceMax = globalWeights.workload_balance;
    score += balanceScore * balanceMax;
    maxScore += balanceMax;
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
  teacherAssignments: SolverAssignment[],
): boolean {
  if (!payload.class_id) return false;
  const isAssigned = teacherAssignments.some(
    (a) => a.class_id === payload.class_id,
  );
  // preferred=true → want to be assigned; preferred=false/undefined → want to avoid
  const wantsAssignment = payload.preferred !== false;
  return wantsAssignment ? isAssigned : !isAssigned;
}

/** Evaluate whether the time slot preference is satisfied */
function evaluateTimeSlotPreference(
  payload: TimeSlotPayload,
  teacherAssignments: SolverAssignment[],
): boolean {
  if (payload.weekday === undefined && payload.period_order === undefined) {
    return false;
  }

  const matchingAssignments = teacherAssignments.filter((a) => {
    if (
      payload.weekday !== undefined &&
      a.weekday !== payload.weekday
    ) {
      return false;
    }
    if (
      payload.period_order !== undefined &&
      a.period_order !== payload.period_order
    ) {
      return false;
    }
    return true;
  });

  // preferred=true → want assignments at this slot; preferred=false → avoid this slot
  const wantsSlot = payload.preferred !== false;
  if (wantsSlot) {
    return matchingAssignments.length > 0;
  } else {
    return matchingAssignments.length === 0;
  }
}

/**
 * Score how evenly each class's periods are spread across weekdays.
 * Returns a value in [0, 1]: 1 = perfectly even, 0 = all on same day.
 */
function scoreEvenSpread(
  input: SolverInput,
  assignments: SolverAssignment[],
): number {
  const classIds = input.classes.map((c) => c.class_id);
  if (classIds.length === 0) return 1;

  let totalScore = 0;
  let count = 0;

  for (const classId of classIds) {
    const classAssignments = assignments.filter(
      (a) => a.class_id === classId,
    );
    if (classAssignments.length === 0) continue;

    const classReq = input.classes.find((c) => c.class_id === classId);
    if (!classReq || classReq.spread_preference === 'cluster') {
      // Clustering is desired — invert the spread score
      count++;
      totalScore += 1 - computeSpreadScore(classAssignments);
      continue;
    }

    if (classReq.spread_preference === 'no_preference') {
      count++;
      totalScore += 1; // neutral — full score
      continue;
    }

    // spread_evenly
    count++;
    totalScore += computeSpreadScore(classAssignments);
  }

  return count === 0 ? 1 : totalScore / count;
}

/**
 * Compute a spread score for a class's assignments.
 * 1 = maximally spread (one per day), 0 = all on the same day.
 */
function computeSpreadScore(assignments: SolverAssignment[]): number {
  if (assignments.length <= 1) return 1;

  const dayCounts = new Map<number, number>();
  for (const a of assignments) {
    dayCounts.set(a.weekday, (dayCounts.get(a.weekday) ?? 0) + 1);
  }

  const counts = Array.from(dayCounts.values());
  const n = assignments.length;
  const k = counts.length; // number of distinct days used

  // Variance-based: low variance → high score
  const mean = n / k;
  const variance =
    counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / k;

  // Normalise: max variance is when all on one day → (n - mean)^2 / k
  // where k=1, mean=n, max_variance = 0... use n^2 as upper bound
  const maxVariance = Math.pow(n, 2);
  if (maxVariance === 0) return 1;

  return Math.max(0, 1 - variance / maxVariance);
}

/**
 * Score minimising teacher gaps.
 * Returns a value in [0, 1]: 1 = no gaps, 0 = maximum possible gaps.
 */
function scoreMinimiseGaps(
  input: SolverInput,
  assignments: SolverAssignment[],
): number {
  if (input.teachers.length === 0 || assignments.length === 0) return 1;

  let totalGaps = 0;
  let maxPossibleGaps = 0;

  for (const teacher of input.teachers) {
    const teacherAssignments = assignments.filter(
      (a) => a.teacher_staff_id === teacher.staff_profile_id,
    );

    // Group by weekday
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
      maxPossibleGaps += span - 1; // worst case: single gap fills all
    }
  }

  if (maxPossibleGaps === 0) return 1;
  return Math.max(0, 1 - totalGaps / maxPossibleGaps);
}

/**
 * Score room consistency: reward assigning classes to their preferred_room_id.
 * Returns a value in [0, 1].
 */
function scoreRoomConsistency(
  input: SolverInput,
  assignments: SolverAssignment[],
): number {
  const classesWithPreference = input.classes.filter(
    (c) => c.preferred_room_id !== null,
  );
  if (classesWithPreference.length === 0) return 1;

  let satisfied = 0;

  for (const classReq of classesWithPreference) {
    const classAssignments = assignments.filter(
      (a) => a.class_id === classReq.class_id,
    );
    if (classAssignments.length === 0) continue;

    const allInPreferred = classAssignments.every(
      (a) => a.room_id === classReq.preferred_room_id,
    );
    if (allInPreferred) satisfied++;
  }

  return satisfied / classesWithPreference.length;
}

/**
 * Score workload balance across teachers.
 * Returns a value in [0, 1]: 1 = perfectly balanced, 0 = maximally imbalanced.
 */
function scoreWorkloadBalance(
  input: SolverInput,
  assignments: SolverAssignment[],
): number {
  if (input.teachers.length <= 1) return 1;

  const counts = input.teachers.map(
    (t) =>
      assignments.filter((a) => a.teacher_staff_id === t.staff_profile_id)
        .length,
  );

  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
  if (mean === 0) return 1;

  const variance =
    counts.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (lower is better)
  const cv = stdDev / mean;

  // Cap at 1 to avoid negative scores, normalise so CV=0 → 1, CV>=2 → 0
  return Math.max(0, 1 - cv / 2);
}
