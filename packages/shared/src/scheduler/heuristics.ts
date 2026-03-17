import type {
  SolverInput,
  SolverAssignment,
  CSPVariable,
  DomainValue,
} from './types';
import { variableKey } from './domain';

/**
 * MRV (Most Restricted Variable) heuristic.
 * Select the unassigned variable with the smallest remaining domain.
 * Tie-break: prefer variables for classes with higher periods_per_week.
 */
export function selectVariable(
  domains: Map<string, DomainValue[]>,
  unassignedVars: CSPVariable[],
  input: SolverInput,
): CSPVariable | null {
  if (unassignedVars.length === 0) return null;

  let best: CSPVariable | null = null;
  let bestDomainSize = Infinity;
  let bestPeriodsPerWeek = -1;

  for (const variable of unassignedVars) {
    const key = variableKey(variable);
    const domain = domains.get(key);
    const domainSize = domain ? domain.length : 0;

    const classReq = input.classes.find(
      (c) => c.class_id === variable.class_id,
    );
    const periodsPerWeek = classReq?.periods_per_week ?? 0;

    if (
      best === null ||
      domainSize < bestDomainSize ||
      (domainSize === bestDomainSize && periodsPerWeek > bestPeriodsPerWeek)
    ) {
      best = variable;
      bestDomainSize = domainSize;
      bestPeriodsPerWeek = periodsPerWeek;
    }
  }

  return best;
}

/**
 * Order domain values by preference score (highest first).
 * Values that satisfy more soft preferences are tried first.
 * Uses a lightweight scoring that doesn't require full preference computation.
 */
export function orderValues(
  variable: CSPVariable,
  domain: DomainValue[],
  input: SolverInput,
  currentAssignments: SolverAssignment[],
): DomainValue[] {
  if (domain.length <= 1) return domain;

  const classReq = input.classes.find(
    (c) => c.class_id === variable.class_id,
  );

  return [...domain].sort((a, b) => {
    const scoreA = scoreValue(a, variable.class_id, classReq ?? null, input, currentAssignments);
    const scoreB = scoreValue(b, variable.class_id, classReq ?? null, input, currentAssignments);
    return scoreB - scoreA; // Descending: best first
  });
}

/**
 * Compute a lightweight preference score for a domain value.
 * Higher is better. Used only for ordering — not the authoritative preference score.
 */
function scoreValue(
  value: DomainValue,
  class_id: string,
  classReq: SolverInput['classes'][number] | null,
  input: SolverInput,
  currentAssignments: SolverAssignment[],
): number {
  let score = 0;

  if (!classReq) return score;

  // Prefer the preferred room
  if (
    value.room_id !== null &&
    classReq.preferred_room_id !== null &&
    value.room_id === classReq.preferred_room_id
  ) {
    score += 10;
  }

  // Even spread preference: prefer days where this class has fewer assignments
  if (classReq.spread_preference === 'spread_evenly') {
    const dayCount = currentAssignments.filter(
      (a) => a.class_id === class_id && a.weekday === value.weekday,
    ).length;
    score -= dayCount * 5; // Penalise crowding on one day
  }

  // Cluster preference: prefer days where this class already has assignments
  if (classReq.spread_preference === 'cluster') {
    const dayCount = currentAssignments.filter(
      (a) => a.class_id === class_id && a.weekday === value.weekday,
    ).length;
    score += dayCount * 5; // Reward clustering
  }

  // Score teacher time-slot preferences
  for (const teacher of classReq.teachers) {
    const teacherInfo = input.teachers.find(
      (t) => t.staff_profile_id === teacher.staff_profile_id,
    );
    if (!teacherInfo) continue;

    for (const pref of teacherInfo.preferences) {
      if (pref.preference_type !== 'time_slot') continue;

      const payload = pref.preference_payload as {
        weekday?: number;
        period_order?: number;
        preferred?: boolean;
      };

      const matchesWeekday =
        payload.weekday === undefined || payload.weekday === value.weekday;
      const matchesPeriod =
        payload.period_order === undefined ||
        payload.period_order === value.period_order;

      if (matchesWeekday && matchesPeriod) {
        const weight = pref.priority === 'high' ? 8 : pref.priority === 'medium' ? 4 : 2;
        const wantsSlot = payload.preferred !== false;
        score += wantsSlot ? weight : -weight;
      }
    }
  }

  // Minimise teacher gaps: prefer slots that don't create gaps in teachers' schedule
  for (const teacher of classReq.teachers) {
    const teacherDayAssignments = currentAssignments
      .filter(
        (a) =>
          a.teacher_staff_id === teacher.staff_profile_id &&
          a.weekday === value.weekday,
      )
      .map((a) => a.period_order);

    if (teacherDayAssignments.length === 0) continue;

    const minOrder = Math.min(...teacherDayAssignments);
    const maxOrder = Math.max(...teacherDayAssignments);

    // Penalise if the new slot would create a gap
    if (
      value.period_order > minOrder &&
      value.period_order < maxOrder
    ) {
      // Slot is between existing assignments — check if it fills a gap
      const isGap = !teacherDayAssignments.includes(value.period_order);
      if (isGap) score += 3; // Filling a gap is good
    } else if (
      value.period_order === minOrder - 1 ||
      value.period_order === maxOrder + 1
    ) {
      score += 2; // Adjacent — no gap created
    }
  }

  return score;
}
