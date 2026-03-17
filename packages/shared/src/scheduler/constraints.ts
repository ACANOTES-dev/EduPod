import type {
  SolverInput,
  SolverAssignment,
  DomainValue,
  CSPVariable,
  PeriodSlot,
} from './types';

/**
 * Check all hard constraints for a proposed assignment.
 * Returns null if valid, or a string describing the violation.
 */
export function checkHardConstraints(
  input: SolverInput,
  currentAssignments: SolverAssignment[],
  variable: CSPVariable,
  value: DomainValue,
): string | null {
  const { weekday, period_order, room_id } = value;
  const { class_id } = variable;

  // Find the class requirement for this variable
  const classReq = input.classes.find((c) => c.class_id === class_id);
  if (!classReq) {
    return `Class ${class_id} not found in input`;
  }

  // Find the period slot from the grid
  const slot = input.period_grid.find(
    (p) => p.weekday === weekday && p.period_order === period_order,
  );
  if (!slot) {
    return `Period slot (weekday=${weekday}, period_order=${period_order}) not found in period grid`;
  }

  // 1. Period type match
  // Supervision classes must go into break_supervision or lunch_duty slots
  // Academic classes must go into teaching slots
  const violation = checkPeriodTypeMatch(classReq.is_supervision, slot);
  if (violation) return violation;

  // 2. Teacher double-booking: no teacher for this class can be assigned elsewhere at same slot
  const teacherViolation = checkTeacherDoubleBooking(
    classReq.teachers.map((t) => t.staff_profile_id),
    weekday,
    period_order,
    class_id,
    currentAssignments,
  );
  if (teacherViolation) return teacherViolation;

  // 3. Teacher availability
  const availViolation = checkTeacherAvailability(
    classReq.teachers.map((t) => t.staff_profile_id),
    weekday,
    slot,
    input,
  );
  if (availViolation) return availViolation;

  // 4. Room constraints
  if (room_id !== null) {
    const room = input.rooms.find((r) => r.room_id === room_id);
    if (room) {
      // 4a. Room type match
      if (
        classReq.required_room_type !== null &&
        room.room_type !== classReq.required_room_type
      ) {
        return `Room ${room_id} type '${room.room_type}' does not match required type '${classReq.required_room_type}'`;
      }

      // 4b. Room double-booking / capacity
      const roomViolation = checkRoomConflict(
        room_id,
        weekday,
        period_order,
        classReq.student_count,
        room.is_exclusive,
        room.capacity,
        class_id,
        currentAssignments,
        input,
      );
      if (roomViolation) return roomViolation;
    }
  } else if (classReq.required_room_type !== null) {
    // No room assigned but class requires a specific type
    return `Class ${class_id} requires room type '${classReq.required_room_type}' but no room assigned`;
  }

  // 5. Student group overlap: classes sharing students cannot be in the same slot
  const overlapViolation = checkStudentOverlap(
    class_id,
    weekday,
    period_order,
    currentAssignments,
    input,
  );
  if (overlapViolation) return overlapViolation;

  // 6. Max consecutive periods for same class
  const consecutiveViolation = checkMaxConsecutive(
    class_id,
    weekday,
    period_order,
    classReq.max_consecutive,
    currentAssignments,
    input.period_grid,
  );
  if (consecutiveViolation) return consecutiveViolation;

  return null;
}

/** Ensure the period type matches the class type */
function checkPeriodTypeMatch(
  isSupervision: boolean,
  slot: PeriodSlot,
): string | null {
  if (isSupervision) {
    if (
      slot.period_type !== 'break_supervision' &&
      slot.period_type !== 'lunch_duty'
    ) {
      return `Supervision class requires break_supervision or lunch_duty slot, got '${slot.period_type}'`;
    }
  } else {
    if (slot.period_type !== 'teaching') {
      return `Academic class requires teaching slot, got '${slot.period_type}'`;
    }
  }
  return null;
}

/** Ensure no teacher of the proposed class is already booked at the same slot */
function checkTeacherDoubleBooking(
  teacherIds: string[],
  weekday: number,
  period_order: number,
  class_id: string,
  currentAssignments: SolverAssignment[],
): string | null {
  for (const assignment of currentAssignments) {
    if (
      assignment.weekday === weekday &&
      assignment.period_order === period_order &&
      assignment.class_id !== class_id &&
      assignment.teacher_staff_id !== null &&
      teacherIds.includes(assignment.teacher_staff_id)
    ) {
      return `Teacher ${assignment.teacher_staff_id} is already assigned to class ${assignment.class_id} at weekday=${weekday}, period=${period_order}`;
    }
  }
  return null;
}

/** Ensure all teachers are available during the given slot */
function checkTeacherAvailability(
  teacherIds: string[],
  weekday: number,
  slot: PeriodSlot,
  input: SolverInput,
): string | null {
  for (const teacherId of teacherIds) {
    const teacherInfo = input.teachers.find(
      (t) => t.staff_profile_id === teacherId,
    );
    if (!teacherInfo) continue;

    // No availability rows means fully available
    if (teacherInfo.availability.length === 0) continue;

    // Check if there is at least one availability window on this weekday covering the slot
    const dayAvailability = teacherInfo.availability.filter(
      (a) => a.weekday === weekday,
    );

    // If teacher has availability records but none for this weekday, they are unavailable that day
    if (dayAvailability.length === 0) {
      return `Teacher ${teacherId} has no availability on weekday ${weekday}`;
    }

    // Check if any window covers the slot (HH:mm lexicographic comparison works for 24h)
    const covered = dayAvailability.some(
      (a) => a.from <= slot.start_time && a.to >= slot.end_time,
    );

    if (!covered) {
      return `Teacher ${teacherId} is not available at ${slot.start_time}-${slot.end_time} on weekday ${weekday}`;
    }
  }
  return null;
}

/** Check room double-booking and capacity constraints */
function checkRoomConflict(
  room_id: string,
  weekday: number,
  period_order: number,
  studentCount: number | null,
  isExclusive: boolean,
  capacity: number | null,
  class_id: string,
  currentAssignments: SolverAssignment[],
  input: SolverInput,
): string | null {
  const conflictingAssignments = currentAssignments.filter(
    (a) =>
      a.room_id === room_id &&
      a.weekday === weekday &&
      a.period_order === period_order &&
      a.class_id !== class_id,
  );

  if (isExclusive) {
    if (conflictingAssignments.length > 0) {
      return `Room ${room_id} is exclusive and already booked at weekday=${weekday}, period=${period_order}`;
    }
  } else if (capacity !== null) {
    // Non-exclusive: check cumulative student count
    let totalStudents = studentCount ?? 0;
    for (const a of conflictingAssignments) {
      const otherClass = input.classes.find((c) => c.class_id === a.class_id);
      totalStudents += otherClass?.student_count ?? 0;
    }
    if (totalStudents > capacity) {
      return `Room ${room_id} capacity ${capacity} exceeded: total students would be ${totalStudents}`;
    }
  }

  return null;
}

/** Check that no overlapping student group classes share the same slot */
function checkStudentOverlap(
  class_id: string,
  weekday: number,
  period_order: number,
  currentAssignments: SolverAssignment[],
  input: SolverInput,
): string | null {
  // Find all classes that overlap with the current class
  const overlappingClasses = new Set<string>();
  for (const overlap of input.student_overlaps) {
    if (overlap.class_id_a === class_id) {
      overlappingClasses.add(overlap.class_id_b);
    } else if (overlap.class_id_b === class_id) {
      overlappingClasses.add(overlap.class_id_a);
    }
  }

  if (overlappingClasses.size === 0) return null;

  for (const assignment of currentAssignments) {
    if (
      assignment.weekday === weekday &&
      assignment.period_order === period_order &&
      overlappingClasses.has(assignment.class_id)
    ) {
      return `Class ${class_id} shares students with class ${assignment.class_id}, which is already assigned at weekday=${weekday}, period=${period_order}`;
    }
  }

  return null;
}

/**
 * Check that assigning this class at this period would not exceed max_consecutive.
 * Looks at existing assignments for the same class on the same weekday and checks
 * if adding the proposed period would create a run exceeding max_consecutive.
 */
export function checkMaxConsecutive(
  class_id: string,
  weekday: number,
  period_order: number,
  max_consecutive: number,
  currentAssignments: SolverAssignment[],
  periodGrid: SolverInput['period_grid'],
): string | null {
  if (max_consecutive <= 0) return null;

  // Get all period orders for this class on this weekday (existing + proposed)
  const existingOrders = currentAssignments
    .filter((a) => a.class_id === class_id && a.weekday === weekday)
    .map((a) => a.period_order);

  const allOrders = [...new Set([...existingOrders, period_order])].sort(
    (a, b) => a - b,
  );

  // Check if consecutive teaching periods form a run > max_consecutive
  // We need to check physical consecutive slots in the period grid
  // Two periods are consecutive if there is no non-teaching period between them
  const teachingSlots = periodGrid
    .filter((p) => p.weekday === weekday && p.period_type === 'teaching')
    .map((p) => p.period_order)
    .sort((a, b) => a - b);

  // Find the longest consecutive run in allOrders within teachingSlots
  let maxRun = 1;
  let currentRun = 1;

  for (let i = 1; i < allOrders.length; i++) {
    const prev = allOrders[i - 1]!;
    const curr = allOrders[i]!;

    // Check if prev and curr are consecutive teaching slots
    const prevIdx = teachingSlots.indexOf(prev);
    const currIdx = teachingSlots.indexOf(curr);

    if (prevIdx !== -1 && currIdx !== -1 && currIdx === prevIdx + 1) {
      currentRun++;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 1;
    }
  }

  if (maxRun > max_consecutive) {
    return `Class ${class_id} would have ${maxRun} consecutive periods on weekday ${weekday}, exceeding max of ${max_consecutive}`;
  }

  return null;
}
