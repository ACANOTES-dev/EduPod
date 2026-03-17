import type {
  SolverInput,
  SolverOutput,
  SolverAssignment,
  UnassignedSlot,
  CSPVariable,
  DomainValue,
  ProgressCallback,
  CancelCheck,
} from './types';
import {
  generateVariables,
  generateInitialDomains,
  forwardCheck,
  variableKey,
  cloneDomains,
} from './domain';
import { checkHardConstraints } from './constraints';
import { scorePreferences } from './preferences';
import { selectVariable, orderValues } from './heuristics';

export interface SolverOptions {
  onProgress?: ProgressCallback;
  shouldCancel?: CancelCheck;
}

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

/**
 * Convert pinned entries to SolverAssignment objects.
 */
function pinnedEntriesToAssignments(
  input: SolverInput,
): SolverAssignment[] {
  const assignments: SolverAssignment[] = [];

  for (const pinned of input.pinned_entries) {
    // Find the slot details from the period grid
    const slot = input.period_grid.find(
      (p) =>
        p.weekday === pinned.weekday &&
        p.period_order === pinned.period_order,
    );

    assignments.push({
      class_id: pinned.class_id,
      room_id: pinned.room_id,
      teacher_staff_id: pinned.teacher_staff_id,
      weekday: pinned.weekday,
      period_order: pinned.period_order,
      start_time: slot?.start_time ?? '',
      end_time: slot?.end_time ?? '',
      is_pinned: true,
      preference_satisfaction: [],
    });
  }

  return assignments;
}

/**
 * Build an assignment from a variable + domain value.
 */
function buildAssignment(
  variable: CSPVariable,
  value: DomainValue,
  input: SolverInput,
): SolverAssignment {
  const slot = input.period_grid.find(
    (p) =>
      p.weekday === value.weekday &&
      p.period_order === value.period_order,
  );

  // Find the primary teacher for this class
  const classReq = input.classes.find(
    (c) => c.class_id === variable.class_id,
  );
  const primaryTeacher = classReq?.teachers[0]?.staff_profile_id ?? null;

  return {
    class_id: variable.class_id,
    room_id: value.room_id,
    teacher_staff_id: primaryTeacher,
    weekday: value.weekday,
    period_order: value.period_order,
    start_time: slot?.start_time ?? '',
    end_time: slot?.end_time ?? '',
    is_pinned: false,
    preference_satisfaction: [],
  };
}

/**
 * Determine the reason a class variable could not be assigned.
 */
function diagnoseUnassigned(
  variable: CSPVariable,
  input: SolverInput,
  assignments: SolverAssignment[],
): string {
  const classReq = input.classes.find(
    (c) => c.class_id === variable.class_id,
  );
  if (!classReq) return 'Class not found in input';

  // Try each possible slot to find the most common reason
  const teachingSlots = input.period_grid.filter((p) =>
    classReq.is_supervision
      ? p.period_type === 'break_supervision' || p.period_type === 'lunch_duty'
      : p.period_type === 'teaching',
  );

  if (teachingSlots.length === 0) {
    return classReq.is_supervision
      ? 'No break_supervision or lunch_duty slots available'
      : 'No teaching slots available in period grid';
  }

  // Check teacher availability
  const teacherIds = classReq.teachers.map((t) => t.staff_profile_id);
  let teacherUnavailableCount = 0;

  for (const slot of teachingSlots) {
    for (const teacherId of teacherIds) {
      const teacherInfo = input.teachers.find(
        (t) => t.staff_profile_id === teacherId,
      );
      if (!teacherInfo) continue;
      if (teacherInfo.availability.length === 0) continue;

      const dayAvailability = teacherInfo.availability.filter(
        (a) => a.weekday === slot.weekday,
      );
      if (dayAvailability.length === 0) {
        teacherUnavailableCount++;
        break;
      }
      const covered = dayAvailability.some(
        (a) => a.from <= slot.start_time && a.to >= slot.end_time,
      );
      if (!covered) {
        teacherUnavailableCount++;
        break;
      }
    }
  }

  if (teacherUnavailableCount === teachingSlots.length) {
    return 'Teacher unavailable at all remaining slots';
  }

  // Check room availability
  if (classReq.required_room_type !== null) {
    const matchingRooms = input.rooms.filter(
      (r) => r.room_type === classReq.required_room_type,
    );
    if (matchingRooms.length === 0) {
      return `No room of type '${classReq.required_room_type}' available`;
    }
  }

  return 'No valid slot found due to constraint conflicts';
}

/**
 * Main solver entry point.
 * CSP with constraint propagation (forward checking) + backtracking.
 */
export function solve(input: SolverInput, options: SolverOptions = {}): SolverOutput {
  const startTime = Date.now();
  const maxDuration = input.settings.max_solver_duration_seconds * 1000;
  const { onProgress, shouldCancel } = options;

  // Handle empty input
  if (input.classes.length === 0) {
    return {
      entries: [],
      unassigned: [],
      score: 0,
      max_score: 0,
      duration_ms: Date.now() - startTime,
    };
  }

  // 1. Seeded RNG
  const _rng = mulberry32(input.settings.solver_seed ?? Date.now());

  // 2. Convert pinned entries to SolverAssignment[]
  const pinnedAssignments = pinnedEntriesToAssignments(input);

  // 3. Generate variables for non-pinned classes
  const variables = generateVariables(input);

  // 4. If no variables (all pinned), return immediately
  if (variables.length === 0) {
    const prefScore = scorePreferences(input, pinnedAssignments);
    // Attach preference satisfaction to each entry
    const entries = pinnedAssignments.map((a) => ({
      ...a,
      preference_satisfaction: [],
    }));
    return {
      entries,
      unassigned: [],
      score: prefScore.score,
      max_score: prefScore.max_score,
      duration_ms: Date.now() - startTime,
    };
  }

  // 5. Generate initial domains
  const initialDomains = generateInitialDomains(
    input,
    variables,
    pinnedAssignments,
  );

  let iterationCount = 0;
  let assignmentCount = 0;
  let timedOut = false;
  let cancelled = false;

  // Track the best partial solution found
  let bestPartialAssignments: SolverAssignment[] = [...pinnedAssignments];

  /**
   * Recursive backtracking search.
   * Returns the full list of assignments if a complete solution is found, null otherwise.
   */
  function backtrack(
    assignments: SolverAssignment[],
    domains: Map<string, DomainValue[]>,
    remaining: CSPVariable[],
  ): SolverAssignment[] | null {
    // Check termination conditions
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

    // Update best partial solution
    if (assignments.length > bestPartialAssignments.length) {
      bestPartialAssignments = [...assignments];
    }

    // Base case: all variables assigned
    if (remaining.length === 0) {
      return assignments;
    }

    // Select the variable with the smallest domain (MRV)
    const variable = selectVariable(domains, remaining, input);
    if (!variable) return null;

    const key = variableKey(variable);
    const domain = domains.get(key) ?? [];

    // Order values by preference score
    const orderedValues = orderValues(variable, domain, input, assignments);

    // Track new remaining variables (excluding selected)
    const newRemaining = remaining.filter(
      (v) => !(v.class_id === variable.class_id && v.variable_index === variable.variable_index),
    );

    for (const value of orderedValues) {
      if (timedOut || cancelled) return null;

      // Check hard constraints
      const violation = checkHardConstraints(
        input,
        assignments,
        variable,
        value,
      );
      if (violation !== null) continue;

      // Build the new assignment
      const newAssignment = buildAssignment(variable, value, input);

      // Clone domains for forward checking
      const newDomains = cloneDomains(domains);
      newDomains.delete(key); // Remove assigned variable's domain

      // Forward checking: prune domains of remaining variables
      const fcOk = forwardCheck(
        input,
        [...assignments, newAssignment],
        newDomains,
        newRemaining,
      );

      if (!fcOk) continue; // Domain wipeout — try next value

      assignmentCount++;
      if (assignmentCount % 100 === 0 && onProgress) {
        onProgress(
          assignmentCount,
          variables.length,
        );
      }

      // Recurse
      const result = backtrack(
        [...assignments, newAssignment],
        newDomains,
        newRemaining,
      );

      if (result !== null) return result;

      // Backtrack
      assignmentCount--;
    }

    return null; // No value worked for this variable
  }

  // Run the search
  const solution = backtrack(
    [...pinnedAssignments],
    initialDomains,
    variables,
  );

  const finalAssignments = solution ?? bestPartialAssignments;

  // Build unassigned list
  const unassigned = buildUnassignedList(
    input,
    variables,
    finalAssignments,
    solution !== null,
  );

  // Score the final solution
  const prefScore = scorePreferences(input, finalAssignments);

  // Attach preference satisfaction per entry
  const entries = attachPreferenceSatisfaction(
    finalAssignments,
    prefScore.per_entry_satisfaction,
  );

  // Final progress callback
  if (onProgress) {
    onProgress(
      finalAssignments.filter((a) => !a.is_pinned).length,
      variables.length,
    );
  }

  return {
    entries,
    unassigned,
    score: prefScore.score,
    max_score: prefScore.max_score,
    duration_ms: Date.now() - startTime,
  };
}

/**
 * Build the list of unassigned slots for classes that couldn't be fully scheduled.
 */
function buildUnassignedList(
  input: SolverInput,
  variables: CSPVariable[],
  assignments: SolverAssignment[],
  fullyAssigned: boolean,
): UnassignedSlot[] {
  if (fullyAssigned) return [];

  const unassigned: UnassignedSlot[] = [];

  // Group variables by class_id
  const varsByClass = new Map<string, CSPVariable[]>();
  for (const v of variables) {
    const existing = varsByClass.get(v.class_id) ?? [];
    existing.push(v);
    varsByClass.set(v.class_id, existing);
  }

  for (const [class_id, classVars] of varsByClass) {
    const assignedCount = assignments.filter(
      (a) => a.class_id === class_id && !a.is_pinned,
    ).length;

    const totalNeeded = classVars.length;
    const remaining = totalNeeded - assignedCount;

    if (remaining > 0) {
      const reason = diagnoseUnassigned(
        classVars[0]!, // use first variable for diagnosis
        input,
        assignments,
      );

      unassigned.push({
        class_id,
        periods_remaining: remaining,
        reason,
      });
    }
  }

  return unassigned;
}

/**
 * Attach the per-preference satisfaction scores to entries,
 * filtered by matching teacher so each entry only gets its own teacher's preferences.
 */
function attachPreferenceSatisfaction(
  assignments: SolverAssignment[],
  perEntrySatisfaction: SolverAssignment['preference_satisfaction'],
): SolverAssignment[] {
  return assignments.map((a) => ({
    ...a,
    preference_satisfaction: a.is_pinned
      ? []
      : (perEntrySatisfaction || []).filter(
          (sat) => sat.teacher_staff_id === a.teacher_staff_id,
        ),
  }));
}
