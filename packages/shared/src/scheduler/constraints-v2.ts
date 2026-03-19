import type {
  SolverInputV2,
  SolverAssignmentV2,
  CSPVariableV2,
  DomainValueV2,
  PeriodSlotV2,
} from './types-v2';

// ─── Adjacent Break Info ────────────────────────────────────────────────────

/** Describes a classroom break adjacent to a teaching period */
export interface AdjacentBreak {
  /** The break slot from the period grid */
  slot: PeriodSlotV2;
  /** Whether the break is before ('classroom_next') or after ('classroom_previous') the teaching period */
  direction: 'before' | 'after';
}

/**
 * Find classroom breaks adjacent to a given teaching period in a year group's grid.
 *
 * - A `classroom_previous` break comes AFTER a teaching period: the previous teacher stays.
 *   From the teaching period's perspective, this break is "after" it.
 * - A `classroom_next` break comes BEFORE a teaching period: the next teacher arrives early.
 *   From the teaching period's perspective, this break is "before" it.
 */
export function findAdjacentBreaks(
  periodGrid: PeriodSlotV2[],
  weekday: number,
  periodOrder: number,
): AdjacentBreak[] {
  const result: AdjacentBreak[] = [];

  // Get all slots for this weekday, sorted by period_order
  const daySlots = periodGrid
    .filter((p) => p.weekday === weekday)
    .sort((a, b) => a.period_order - b.period_order);

  const currentIdx = daySlots.findIndex((s) => s.period_order === periodOrder);
  if (currentIdx === -1) return result;

  // Check the NEXT slot: if it's a classroom_previous break, the current teacher stays
  const nextSlot = daySlots[currentIdx + 1];
  if (nextSlot && nextSlot.supervision_mode === 'classroom_previous') {
    result.push({ slot: nextSlot, direction: 'after' });
  }

  // Check the PREVIOUS slot: if it's a classroom_next break, the current teacher arrives early
  const prevSlot = daySlots[currentIdx - 1];
  if (prevSlot && prevSlot.supervision_mode === 'classroom_next') {
    result.push({ slot: prevSlot, direction: 'before' });
  }

  return result;
}

// ─── Helper Utilities ───────────────────────────────────────────────────────

/**
 * Find the year group's period grid from the input.
 */
function getYearGroupGrid(
  input: SolverInputV2,
  yearGroupId: string,
): PeriodSlotV2[] {
  const yg = input.year_groups.find((y) => y.year_group_id === yearGroupId);
  return yg?.period_grid ?? [];
}

/**
 * Check if a teacher has any assignment at a given time range across ALL year groups.
 * Used for break time overlap checking.
 */
function isTeacherBookedDuringTime(
  teacherId: string,
  weekday: number,
  startTime: string,
  endTime: string,
  assignments: SolverAssignmentV2[],
  input: SolverInputV2,
  excludeClassId?: string | null,
): boolean {
  for (const a of assignments) {
    if (a.teacher_staff_id !== teacherId) continue;
    if (a.weekday !== weekday) continue;
    if (excludeClassId != null && a.class_id === excludeClassId) continue;

    // Find the slot times for this assignment from its year group grid
    const grid = getYearGroupGrid(input, a.year_group_id);
    const slot = grid.find(
      (p) => p.weekday === weekday && p.period_order === a.period_order,
    );
    if (!slot) continue;

    // Check time overlap: two intervals [s1, e1) and [s2, e2) overlap if s1 < e2 && s2 < e1
    if (slot.start_time < endTime && startTime < slot.end_time) {
      return true;
    }
  }
  return false;
}

// ─── Hard Constraint Checkers ───────────────────────────────────────────────

/**
 * Check teacher double-booking across ALL year groups.
 * A teacher assigned to one slot (weekday, period_order) cannot teach another class
 * at overlapping times in any year group.
 *
 * Because different year groups may have different period grids with different times
 * at the same period_order, we check by actual time overlap, not just by period_order.
 */
export function checkTeacherDoubleBookingV2(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  teacherId: string,
  weekday: number,
  periodOrder: number,
  yearGroupId: string,
  excludeClassId?: string | null,
): string | null {
  // Find the time range for the proposed assignment
  const grid = getYearGroupGrid(input, yearGroupId);
  const proposedSlot = grid.find(
    (p) => p.weekday === weekday && p.period_order === periodOrder,
  );
  if (!proposedSlot) return null;

  const proposedStart = proposedSlot.start_time;
  const proposedEnd = proposedSlot.end_time;

  for (const a of assignments) {
    if (a.teacher_staff_id !== teacherId) continue;
    if (a.weekday !== weekday) continue;
    if (excludeClassId != null && a.class_id === excludeClassId) continue;

    // Get the time range for this existing assignment from its year group grid
    const aGrid = getYearGroupGrid(input, a.year_group_id);
    const aSlot = aGrid.find(
      (p) => p.weekday === weekday && p.period_order === a.period_order,
    );
    if (!aSlot) continue;

    // Time overlap check
    if (aSlot.start_time < proposedEnd && proposedStart < aSlot.end_time) {
      return `Teacher ${teacherId} is already assigned at weekday=${weekday}, period=${a.period_order} (${aSlot.start_time}-${aSlot.end_time}) which overlaps with proposed period=${periodOrder} (${proposedStart}-${proposedEnd})`;
    }
  }

  return null;
}

/**
 * Check that a teacher has a competency entry for the given subject+year_group combination.
 */
export function checkTeacherCompetency(
  input: SolverInputV2,
  teacherId: string,
  subjectId: string | null,
  yearGroupId: string,
): string | null {
  // Supervision assignments don't require competency
  if (subjectId === null) return null;

  const teacher = input.teachers.find(
    (t) => t.staff_profile_id === teacherId,
  );
  if (!teacher) {
    return `Teacher ${teacherId} not found in input`;
  }

  const hasCompetency = teacher.competencies.some(
    (c) => c.subject_id === subjectId && c.year_group_id === yearGroupId,
  );

  if (!hasCompetency) {
    return `Teacher ${teacherId} lacks competency for subject=${subjectId} in year_group=${yearGroupId}`;
  }

  return null;
}

/**
 * Check teacher availability for a given time slot, including extended availability
 * for classroom breaks.
 *
 * When a teaching period is adjacent to a classroom break, the teacher's required
 * availability window extends to cover the break time as well.
 */
export function checkTeacherAvailabilityV2(
  input: SolverInputV2,
  teacherId: string,
  weekday: number,
  periodOrder: number,
  yearGroupId: string,
): string | null {
  const teacher = input.teachers.find(
    (t) => t.staff_profile_id === teacherId,
  );
  if (!teacher) return `Teacher ${teacherId} not found in input`;

  // No availability rows means fully available
  if (teacher.availability.length === 0) return null;

  const grid = getYearGroupGrid(input, yearGroupId);
  const slot = grid.find(
    (p) => p.weekday === weekday && p.period_order === periodOrder,
  );
  if (!slot) return `Period slot (weekday=${weekday}, period_order=${periodOrder}) not found`;

  // Determine the effective time range including adjacent classroom breaks
  let effectiveStart = slot.start_time;
  let effectiveEnd = slot.end_time;

  const adjacentBreaks = findAdjacentBreaks(grid, weekday, periodOrder);
  for (const ab of adjacentBreaks) {
    if (ab.direction === 'before' && ab.slot.start_time < effectiveStart) {
      effectiveStart = ab.slot.start_time;
    }
    if (ab.direction === 'after' && ab.slot.end_time > effectiveEnd) {
      effectiveEnd = ab.slot.end_time;
    }
  }

  // Check if any availability window covers the effective range
  const dayAvailability = teacher.availability.filter(
    (a) => a.weekday === weekday,
  );

  if (dayAvailability.length === 0) {
    return `Teacher ${teacherId} has no availability on weekday ${weekday}`;
  }

  const covered = dayAvailability.some(
    (a) => a.from <= effectiveStart && a.to >= effectiveEnd,
  );

  if (!covered) {
    return `Teacher ${teacherId} is not available for effective range ${effectiveStart}-${effectiveEnd} on weekday ${weekday}`;
  }

  return null;
}

/**
 * Check that a class section does not already have an assignment at the same
 * weekday + period_order. A class can only have one subject assigned per slot.
 */
export function checkClassSlotConflictV2(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  classId: string | null,
  weekday: number,
  periodOrder: number,
  yearGroupId: string,
): string | null {
  if (classId === null) return null;

  // Find the time range for the proposed slot
  const grid = getYearGroupGrid(input, yearGroupId);
  const proposedSlot = grid.find(
    (p) => p.weekday === weekday && p.period_order === periodOrder,
  );
  if (!proposedSlot) return null;

  for (const a of assignments) {
    if (a.class_id !== classId) continue;
    if (a.weekday !== weekday) continue;
    if (a.is_supervision) continue;

    // Get the time range for the existing assignment
    const aGrid = getYearGroupGrid(input, a.year_group_id);
    const aSlot = aGrid.find(
      (p) => p.weekday === weekday && p.period_order === a.period_order,
    );
    if (!aSlot) continue;

    // Time overlap check
    if (aSlot.start_time < proposedSlot.end_time && proposedSlot.start_time < aSlot.end_time) {
      return `Class ${classId} already has an assignment at weekday=${weekday}, period=${a.period_order} (${aSlot.start_time}-${aSlot.end_time}) which overlaps with proposed period=${periodOrder}`;
    }
  }

  return null;
}

/**
 * Check that a subject does not exceed max_periods_per_day for a given class section
 * on a single weekday.
 *
 * Note: max_periods_per_day is per class section, not per year group.
 */
export function checkSubjectMaxPerDay(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  subjectId: string | null,
  yearGroupId: string,
  weekday: number,
  classId: string | null,
): string | null {
  if (subjectId === null) return null;
  if (classId === null) return null;

  const curriculum = input.curriculum.find(
    (c) => c.year_group_id === yearGroupId && c.subject_id === subjectId,
  );
  if (!curriculum) return null;

  const maxPerDay = curriculum.max_periods_per_day;

  // Count existing assignments for this subject + class section on this weekday
  const existingCount = assignments.filter(
    (a) =>
      a.subject_id === subjectId &&
      a.weekday === weekday &&
      a.class_id === classId,
  ).length;

  // The proposed assignment adds 1 more
  const newCount = existingCount + 1;

  if (newCount > maxPerDay) {
    return `Subject ${subjectId} would have ${newCount} periods on weekday ${weekday} for class=${classId}, exceeding max of ${maxPerDay}`;
  }

  return null;
}

/**
 * Check that a teacher does not exceed their daily teaching load limit.
 */
export function checkTeacherDailyLoad(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  teacherId: string,
  weekday: number,
): string | null {
  const teacher = input.teachers.find(
    (t) => t.staff_profile_id === teacherId,
  );
  if (!teacher || teacher.max_periods_per_day === null) return null;

  const dailyCount = assignments.filter(
    (a) =>
      a.teacher_staff_id === teacherId &&
      a.weekday === weekday &&
      !a.is_supervision,
  ).length;

  // The proposed assignment adds 1 more
  if (dailyCount + 1 > teacher.max_periods_per_day) {
    return `Teacher ${teacherId} would have ${dailyCount + 1} teaching periods on weekday ${weekday}, exceeding daily limit of ${teacher.max_periods_per_day}`;
  }

  return null;
}

/**
 * Check that a teacher does not exceed their weekly teaching load limit.
 */
export function checkTeacherWeeklyLoad(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  teacherId: string,
): string | null {
  const teacher = input.teachers.find(
    (t) => t.staff_profile_id === teacherId,
  );
  if (!teacher || teacher.max_periods_per_week === null) return null;

  const weeklyCount = assignments.filter(
    (a) => a.teacher_staff_id === teacherId && !a.is_supervision,
  ).length;

  if (weeklyCount + 1 > teacher.max_periods_per_week) {
    return `Teacher ${teacherId} would have ${weeklyCount + 1} teaching periods this week, exceeding weekly limit of ${teacher.max_periods_per_week}`;
  }

  return null;
}

/**
 * Check room conflict — same as v1 logic.
 * Exclusive rooms can't be double-booked.
 * Non-exclusive rooms: check cumulative capacity.
 */
export function checkRoomConflictV2(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  roomId: string | null,
  weekday: number,
  periodOrder: number,
  yearGroupId: string,
  classId: string | null,
): string | null {
  if (roomId === null) return null;

  const room = input.rooms.find((r) => r.room_id === roomId);
  if (!room) return null;

  // Find all other assignments using this room at the same time
  // Because different year groups can have different period grids,
  // we compare by time overlap (not just period_order)
  const grid = getYearGroupGrid(input, yearGroupId);
  const proposedSlot = grid.find(
    (p) => p.weekday === weekday && p.period_order === periodOrder,
  );
  if (!proposedSlot) return null;

  const conflicting: SolverAssignmentV2[] = [];

  for (const a of assignments) {
    if (a.room_id !== roomId) continue;
    if (a.weekday !== weekday) continue;
    if (a.class_id === classId && classId !== null) continue;

    // Get the time of this existing assignment
    const aGrid = getYearGroupGrid(input, a.year_group_id);
    const aSlot = aGrid.find(
      (p) => p.weekday === weekday && p.period_order === a.period_order,
    );
    if (!aSlot) continue;

    // Time overlap check
    if (aSlot.start_time < proposedSlot.end_time && proposedSlot.start_time < aSlot.end_time) {
      conflicting.push(a);
    }
  }

  if (room.is_exclusive && conflicting.length > 0) {
    return `Room ${roomId} is exclusive and already booked at weekday=${weekday}, period=${periodOrder}`;
  }

  if (!room.is_exclusive && room.capacity !== null && conflicting.length > 0) {
    // Get student counts
    const yg = input.year_groups.find((y) => y.year_group_id === yearGroupId);
    const section = yg?.sections.find((s) => s.class_id === classId);
    let totalStudents = section?.student_count ?? 0;

    for (const a of conflicting) {
      const aYg = input.year_groups.find((y) => y.year_group_id === a.year_group_id);
      const aSection = aYg?.sections.find((s) => s.class_id === a.class_id);
      totalStudents += aSection?.student_count ?? 0;
    }

    if (totalStudents > room.capacity) {
      return `Room ${roomId} capacity ${room.capacity} exceeded: total students would be ${totalStudents}`;
    }
  }

  return null;
}

/**
 * Check classroom break adjacency constraint.
 *
 * When a teacher is assigned to a teaching period adjacent to a classroom break:
 * - They must not be double-booked during the break time
 * - (Availability is already handled by checkTeacherAvailabilityV2)
 */
export function checkClassroomBreakAdjacency(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  teacherId: string,
  weekday: number,
  periodOrder: number,
  yearGroupId: string,
  classId: string | null,
): string | null {
  const grid = getYearGroupGrid(input, yearGroupId);
  const adjacentBreaks = findAdjacentBreaks(grid, weekday, periodOrder);

  if (adjacentBreaks.length === 0) return null;

  for (const ab of adjacentBreaks) {
    const breakStart = ab.slot.start_time;
    const breakEnd = ab.slot.end_time;

    // Check if teacher is booked elsewhere during the break time
    if (
      isTeacherBookedDuringTime(
        teacherId,
        weekday,
        breakStart,
        breakEnd,
        assignments,
        input,
        classId,
      )
    ) {
      return `Teacher ${teacherId} is double-booked during classroom break ${breakStart}-${breakEnd} on weekday ${weekday} (adjacent to period ${periodOrder})`;
    }
  }

  return null;
}

/**
 * Check that a yard break group does not already have its required supervisor count filled.
 * Used for supervision variables.
 */
export function checkBreakSupervisionStaffing(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  breakGroupId: string,
  weekday: number,
  periodOrder: number,
): string | null {
  const breakGroup = input.break_groups.find(
    (bg) => bg.break_group_id === breakGroupId,
  );
  if (!breakGroup) return null;

  // Count existing supervision assignments for this break group + slot
  const currentCount = assignments.filter(
    (a) =>
      a.is_supervision &&
      a.break_group_id === breakGroupId &&
      a.weekday === weekday &&
      a.period_order === periodOrder,
  ).length;

  if (currentCount >= breakGroup.required_supervisor_count) {
    return `Break group ${breakGroupId} already has ${currentCount}/${breakGroup.required_supervisor_count} supervisors at weekday=${weekday}, period=${periodOrder}`;
  }

  return null;
}

/**
 * Check that a teacher does not exceed their weekly yard supervision duty cap.
 */
export function checkBreakDutyWeeklyCap(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  teacherId: string,
): string | null {
  const teacher = input.teachers.find(
    (t) => t.staff_profile_id === teacherId,
  );
  if (!teacher || teacher.max_supervision_duties_per_week === null) return null;

  const currentDuties = assignments.filter(
    (a) => a.teacher_staff_id === teacherId && a.is_supervision,
  ).length;

  if (currentDuties + 1 > teacher.max_supervision_duties_per_week) {
    return `Teacher ${teacherId} would have ${currentDuties + 1} supervision duties, exceeding weekly cap of ${teacher.max_supervision_duties_per_week}`;
  }

  return null;
}

/**
 * Check student overlap — classes sharing students can't be in the same slot.
 * Same logic as v1 but adapted for v2 types.
 */
export function checkStudentOverlapV2(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  classId: string | null,
  weekday: number,
  periodOrder: number,
  yearGroupId: string,
): string | null {
  if (classId === null) return null;

  const overlappingClasses = new Set<string>();
  for (const overlap of input.student_overlaps) {
    if (overlap.class_id_a === classId) {
      overlappingClasses.add(overlap.class_id_b);
    } else if (overlap.class_id_b === classId) {
      overlappingClasses.add(overlap.class_id_a);
    }
  }

  if (overlappingClasses.size === 0) return null;

  // Check by time overlap (different year groups may have different period grids)
  const grid = getYearGroupGrid(input, yearGroupId);
  const proposedSlot = grid.find(
    (p) => p.weekday === weekday && p.period_order === periodOrder,
  );
  if (!proposedSlot) return null;

  for (const a of assignments) {
    if (a.weekday !== weekday) continue;
    if (a.class_id === null || !overlappingClasses.has(a.class_id)) continue;

    const aGrid = getYearGroupGrid(input, a.year_group_id);
    const aSlot = aGrid.find(
      (p) => p.weekday === weekday && p.period_order === a.period_order,
    );
    if (!aSlot) continue;

    // Time overlap check
    if (aSlot.start_time < proposedSlot.end_time && proposedSlot.start_time < aSlot.end_time) {
      return `Class ${classId} shares students with class ${a.class_id}, which is assigned at overlapping time on weekday=${weekday}`;
    }
  }

  return null;
}

/**
 * Check that assigning this subject at this period would not exceed max consecutive
 * teaching slots for the same subject in the same class section on the same day.
 */
export function checkMaxConsecutiveV2(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  classId: string | null,
  subjectId: string | null,
  weekday: number,
  periodOrder: number,
  yearGroupId: string,
  maxConsecutive: number,
): string | null {
  if (classId === null || subjectId === null) return null;
  if (maxConsecutive <= 0) return null;

  const grid = getYearGroupGrid(input, yearGroupId);

  // Get all period orders for this subject+class on this weekday (existing + proposed)
  const existingOrders = assignments
    .filter(
      (a) =>
        a.class_id === classId &&
        a.subject_id === subjectId &&
        a.weekday === weekday,
    )
    .map((a) => a.period_order);

  const allOrders = [...new Set([...existingOrders, periodOrder])].sort(
    (a, b) => a - b,
  );

  if (allOrders.length <= maxConsecutive) return null;

  // Build list of teaching slot period_orders for this day, in order
  const teachingSlots = grid
    .filter((p) => p.weekday === weekday && p.period_type === 'teaching')
    .map((p) => p.period_order)
    .sort((a, b) => a - b);

  // Find the longest consecutive run
  let maxRun = 1;
  let currentRun = 1;

  for (let i = 1; i < allOrders.length; i++) {
    const prev = allOrders[i - 1]!;
    const curr = allOrders[i]!;

    const prevIdx = teachingSlots.indexOf(prev);
    const currIdx = teachingSlots.indexOf(curr);

    if (prevIdx !== -1 && currIdx !== -1 && currIdx === prevIdx + 1) {
      currentRun++;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 1;
    }
  }

  if (maxRun > maxConsecutive) {
    return `Subject ${subjectId} for class ${classId} would have ${maxRun} consecutive periods on weekday ${weekday}, exceeding max of ${maxConsecutive}`;
  }

  return null;
}

/**
 * Check minimum consecutive periods (double-period enforcement).
 *
 * When requires_double_period is true, periods of this subject on the same day
 * for the same class section must form blocks of at least 2 consecutive slots.
 * A single isolated period is a violation.
 *
 * This is checked by looking at the proposed state: if after adding this period,
 * any period for this subject+class on this day would be isolated (not adjacent
 * to another period of the same subject+class), it's a potential violation.
 *
 * NOTE: We only flag a violation when the total count for this day is >= 2 and
 * there exist isolated periods. A single period alone may be acceptable if more
 * will be added later (during search). We rely on post-solve validation for
 * the final check; during solving, we only block placements that create
 * provably-isolated periods when enough periods exist to form pairs.
 */
export function checkMinConsecutive(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
  classId: string | null,
  subjectId: string | null,
  weekday: number,
  periodOrder: number,
  yearGroupId: string,
): string | null {
  if (classId === null || subjectId === null) return null;

  // Look up curriculum to see if double periods are required
  const curriculum = input.curriculum.find(
    (c) => c.year_group_id === yearGroupId && c.subject_id === subjectId,
  );
  if (!curriculum || !curriculum.requires_double_period) return null;

  const grid = getYearGroupGrid(input, yearGroupId);

  // Get all period orders for this subject+class on this weekday (existing + proposed)
  const existingOrders = assignments
    .filter(
      (a) =>
        a.class_id === classId &&
        a.subject_id === subjectId &&
        a.weekday === weekday,
    )
    .map((a) => a.period_order);

  const allOrders = [...new Set([...existingOrders, periodOrder])].sort(
    (a, b) => a - b,
  );

  // If only 1 period on this day, don't flag yet — more may be added
  if (allOrders.length < 2) return null;

  // Build teaching slot adjacency — two teaching slots are consecutive if
  // they are adjacent in the teaching slot ordering (ignoring classroom breaks
  // between them, which don't break consecutiveness for double periods,
  // but yard breaks DO break consecutiveness)
  const daySlots = grid
    .filter((p) => p.weekday === weekday)
    .sort((a, b) => a.period_order - b.period_order);

  // Build a list of consecutive teaching slot groups, broken by yard breaks
  const teachingSlotSequences: number[][] = [];
  let currentSequence: number[] = [];

  for (const s of daySlots) {
    if (s.period_type === 'teaching') {
      currentSequence.push(s.period_order);
    } else if (
      s.supervision_mode === 'classroom_previous' ||
      s.supervision_mode === 'classroom_next'
    ) {
      // Classroom breaks don't break consecutiveness
      continue;
    } else {
      // Yard breaks, assembly, free, etc. break consecutiveness
      if (currentSequence.length > 0) {
        teachingSlotSequences.push(currentSequence);
        currentSequence = [];
      }
    }
  }
  if (currentSequence.length > 0) {
    teachingSlotSequences.push(currentSequence);
  }

  // Check if any period in allOrders is isolated (has no adjacent same-subject period)
  // within the teaching slot sequences
  for (const order of allOrders) {
    let hasAdjacentPair = false;

    for (const seq of teachingSlotSequences) {
      const idx = seq.indexOf(order);
      if (idx === -1) continue;

      // Check if the previous or next teaching slot in this sequence also has this subject
      if (idx > 0 && allOrders.includes(seq[idx - 1]!)) {
        hasAdjacentPair = true;
        break;
      }
      if (idx < seq.length - 1 && allOrders.includes(seq[idx + 1]!)) {
        hasAdjacentPair = true;
        break;
      }
    }

    if (!hasAdjacentPair && allOrders.length >= 2) {
      return `Subject ${subjectId} for class ${classId} has an isolated period at period_order=${order} on weekday ${weekday}, violating double-period requirement`;
    }
  }

  return null;
}

// ─── Master Constraint Function ─────────────────────────────────────────────

/**
 * Run all applicable hard constraints for a given variable + value combination.
 * Returns null if all constraints pass, or a string describing the first violation.
 */
export function checkHardConstraintsV2(
  input: SolverInputV2,
  currentAssignments: SolverAssignmentV2[],
  variable: CSPVariableV2,
  value: DomainValueV2,
): string | null {
  const { weekday, period_order, teacher_staff_id, room_id } = value;
  const {
    class_id,
    year_group_id,
    subject_id,
    type: variableType,
    break_group_id,
  } = variable;

  // ── Shared constraints (both teaching and supervision) ──

  // 1. Teacher double-booking across all year groups
  const doubleBooking = checkTeacherDoubleBookingV2(
    input,
    currentAssignments,
    teacher_staff_id,
    weekday,
    period_order,
    year_group_id,
    class_id,
  );
  if (doubleBooking) return doubleBooking;

  // 2. Teacher availability (includes classroom break extension for teaching)
  const availability = checkTeacherAvailabilityV2(
    input,
    teacher_staff_id,
    weekday,
    period_order,
    year_group_id,
  );
  if (availability) return availability;

  // ── Teaching-specific constraints ──
  if (variableType === 'teaching') {
    // 2b. Class section slot conflict — a class can't have two assignments
    //     at the same time (same weekday + overlapping period)
    const classConflict = checkClassSlotConflictV2(
      input,
      currentAssignments,
      class_id,
      weekday,
      period_order,
      year_group_id,
    );
    if (classConflict) return classConflict;

    // 3. Teacher competency
    const competency = checkTeacherCompetency(
      input,
      teacher_staff_id,
      subject_id,
      year_group_id,
    );
    if (competency) return competency;

    // 4. Subject max per day (per class section)
    const subjectMax = checkSubjectMaxPerDay(
      input,
      currentAssignments,
      subject_id,
      year_group_id,
      weekday,
      class_id,
    );
    if (subjectMax) return subjectMax;

    // 5. Teacher daily load
    const dailyLoad = checkTeacherDailyLoad(
      input,
      currentAssignments,
      teacher_staff_id,
      weekday,
    );
    if (dailyLoad) return dailyLoad;

    // 6. Teacher weekly load
    const weeklyLoad = checkTeacherWeeklyLoad(
      input,
      currentAssignments,
      teacher_staff_id,
    );
    if (weeklyLoad) return weeklyLoad;

    // 7. Room conflict
    const roomConflict = checkRoomConflictV2(
      input,
      currentAssignments,
      room_id,
      weekday,
      period_order,
      year_group_id,
      class_id,
    );
    if (roomConflict) return roomConflict;

    // 8. Classroom break adjacency (teacher must not be double-booked during break)
    const breakAdj = checkClassroomBreakAdjacency(
      input,
      currentAssignments,
      teacher_staff_id,
      weekday,
      period_order,
      year_group_id,
      class_id,
    );
    if (breakAdj) return breakAdj;

    // 9. Student overlap
    const studentOverlap = checkStudentOverlapV2(
      input,
      currentAssignments,
      class_id,
      weekday,
      period_order,
      year_group_id,
    );
    if (studentOverlap) return studentOverlap;

    // 10. Max consecutive
    // Use max_periods_per_day as a proxy for max consecutive (same as v1 pattern)
    const curriculum = input.curriculum.find(
      (c) => c.year_group_id === year_group_id && c.subject_id === subject_id,
    );
    const maxConsecutive = curriculum?.max_periods_per_day ?? 0;
    if (maxConsecutive > 0) {
      const consecutiveViolation = checkMaxConsecutiveV2(
        input,
        currentAssignments,
        class_id,
        subject_id,
        weekday,
        period_order,
        year_group_id,
        maxConsecutive,
      );
      if (consecutiveViolation) return consecutiveViolation;
    }

    // 11. Min consecutive (double-period enforcement)
    const minConsViolation = checkMinConsecutive(
      input,
      currentAssignments,
      class_id,
      subject_id,
      weekday,
      period_order,
      year_group_id,
    );
    if (minConsViolation) return minConsViolation;
  }

  // ── Supervision-specific constraints ──
  if (variableType === 'supervision' && break_group_id !== null) {
    // 12. Break supervision staffing
    const staffing = checkBreakSupervisionStaffing(
      input,
      currentAssignments,
      break_group_id,
      weekday,
      period_order,
    );
    if (staffing) return staffing;

    // 13. Break duty weekly cap
    const dutyCap = checkBreakDutyWeeklyCap(
      input,
      currentAssignments,
      teacher_staff_id,
    );
    if (dutyCap) return dutyCap;
  }

  return null;
}
