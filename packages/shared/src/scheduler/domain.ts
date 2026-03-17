import type {
  SolverInput,
  SolverAssignment,
  CSPVariable,
  DomainValue,
  PeriodSlot,
} from './types';
import { checkHardConstraints } from './constraints';

/**
 * Generate CSP variables for all non-pinned classes.
 * Each class needs `periods_per_week` variables (one per period to fill).
 */
export function generateVariables(
  input: SolverInput,
  pinnedClassIds?: Set<string>,
): CSPVariable[] {
  const variables: CSPVariable[] = [];
  const pinned = pinnedClassIds ?? buildPinnedClassIds(input);

  for (const classReq of input.classes) {
    // Count how many periods are already pinned for this class
    const pinnedCount = input.pinned_entries.filter(
      (p) => p.class_id === classReq.class_id,
    ).length;

    const remaining = classReq.periods_per_week - pinnedCount;
    if (remaining <= 0) continue;

    for (let i = 0; i < remaining; i++) {
      variables.push({
        class_id: classReq.class_id,
        variable_index: i,
      });
    }
  }

  return variables;
}

/** Build the set of class IDs that are fully covered by pinned entries */
function buildPinnedClassIds(input: SolverInput): Set<string> {
  const pinned = new Set<string>();
  for (const classReq of input.classes) {
    const pinnedCount = input.pinned_entries.filter(
      (p) => p.class_id === classReq.class_id,
    ).length;
    if (pinnedCount >= classReq.periods_per_week) {
      pinned.add(classReq.class_id);
    }
  }
  return pinned;
}

/**
 * Generate initial domains for all variables.
 * Each domain = all valid (weekday, period_order, room) tuples passing basic filters.
 * Does NOT run full hard-constraint checking — that happens in forwardCheck.
 */
export function generateInitialDomains(
  input: SolverInput,
  variables: CSPVariable[],
  pinnedAssignments: SolverAssignment[],
): Map<string, DomainValue[]> {
  const domains = new Map<string, DomainValue[]>();

  for (const variable of variables) {
    const key = variableKey(variable);
    const classReq = input.classes.find(
      (c) => c.class_id === variable.class_id,
    );

    if (!classReq) {
      domains.set(key, []);
      continue;
    }

    const domain: DomainValue[] = [];

    // Find suitable slots from the period grid
    const suitableSlots = getSuitableSlots(input.period_grid, classReq.is_supervision);

    for (const slot of suitableSlots) {
      // Check teacher availability for this slot
      const teacherIds = classReq.teachers.map((t) => t.staff_profile_id);
      if (!areTeachersAvailableForSlot(teacherIds, slot, input)) continue;

      // Generate room candidates
      const roomCandidates = getRoomCandidates(classReq.required_room_type, input.rooms);

      if (roomCandidates.length === 0) {
        // No room required or no rooms exist
        domain.push({
          weekday: slot.weekday,
          period_order: slot.period_order,
          room_id: null,
        });
      } else {
        for (const roomId of roomCandidates) {
          domain.push({
            weekday: slot.weekday,
            period_order: slot.period_order,
            room_id: roomId,
          });
        }
      }
    }

    domains.set(key, domain);
  }

  return domains;
}

/** Get period slots that match the class type (teaching vs supervision) */
function getSuitableSlots(
  periodGrid: PeriodSlot[],
  isSupervision: boolean,
): PeriodSlot[] {
  if (isSupervision) {
    return periodGrid.filter(
      (p) =>
        p.period_type === 'break_supervision' ||
        p.period_type === 'lunch_duty',
    );
  }
  return periodGrid.filter((p) => p.period_type === 'teaching');
}

/** Check if all teachers are available for a given slot */
function areTeachersAvailableForSlot(
  teacherIds: string[],
  slot: PeriodSlot,
  input: SolverInput,
): boolean {
  for (const teacherId of teacherIds) {
    const teacherInfo = input.teachers.find(
      (t) => t.staff_profile_id === teacherId,
    );
    if (!teacherInfo) continue;

    // No availability rows means fully available
    if (teacherInfo.availability.length === 0) continue;

    const dayAvailability = teacherInfo.availability.filter(
      (a) => a.weekday === slot.weekday,
    );

    if (dayAvailability.length === 0) return false;

    const covered = dayAvailability.some(
      (a) => a.from <= slot.start_time && a.to >= slot.end_time,
    );

    if (!covered) return false;
  }
  return true;
}

/** Get candidate room IDs for a class given its required room type */
function getRoomCandidates(
  requiredRoomType: string | null,
  rooms: SolverInput['rooms'],
): string[] {
  if (requiredRoomType === null) {
    // Class doesn't require a specific room type — try all rooms
    return rooms.map((r) => r.room_id);
  }
  return rooms
    .filter((r) => r.room_type === requiredRoomType)
    .map((r) => r.room_id);
}

/**
 * Forward checking: after assigning a variable, reduce domains of remaining variables.
 * Returns false if any domain becomes empty (backtrack needed).
 */
export function forwardCheck(
  input: SolverInput,
  currentAssignments: SolverAssignment[],
  domains: Map<string, DomainValue[]>,
  unassignedVars: CSPVariable[],
): boolean {
  for (const variable of unassignedVars) {
    const key = variableKey(variable);
    const domain = domains.get(key);
    if (!domain) continue;

    const filtered = domain.filter(
      (value) =>
        checkHardConstraints(
          input,
          currentAssignments,
          variable,
          value,
        ) === null,
    );

    domains.set(key, filtered);

    if (filtered.length === 0) {
      return false; // Domain wipeout — must backtrack
    }
  }

  return true;
}

/** Create a unique key for a variable */
export function variableKey(v: CSPVariable): string {
  return `${v.class_id}:${v.variable_index}`;
}

/**
 * Deep-clone the domain map for backtracking.
 * Values (DomainValue[]) are arrays of plain objects — shallow copy of the array is sufficient.
 */
export function cloneDomains(
  domains: Map<string, DomainValue[]>,
): Map<string, DomainValue[]> {
  const clone = new Map<string, DomainValue[]>();
  for (const [key, values] of domains) {
    clone.set(key, [...values]);
  }
  return clone;
}
