import { checkHardConstraintsV2, findAdjacentBreaks } from './constraints-v2';
import type {
  SolverInputV2,
  SolverAssignmentV2,
  CSPVariableV2,
  DomainValueV2,
  TeacherInputV2,
} from './types-v2';

// ─── Variable Key ───────────────────────────────────────────────────────────

/**
 * Generate a unique string key from a CSPVariableV2.
 * Used as map keys for domain storage and lookup.
 */
export function variableKeyV2(v: CSPVariableV2): string {
  if (v.type === 'supervision') {
    // Use the variable id directly — it encodes break_group_id, weekday, period_order, and index
    return v.id;
  }
  return `teach:${v.class_id}:${v.subject_id}:${v.slot_index}`;
}

// ─── Variable Generation ────────────────────────────────────────────────────

/**
 * Generate CSP variables for the v2 solver.
 *
 * Variables are generated in this order (for MRV effectiveness):
 * 1. Supervision variables — most constrained (few eligible teachers)
 * 2. Double-period teaching variables — harder to place (must be consecutive)
 * 3. Single-period teaching variables — standard
 *
 * Pinned assignments reduce the number of variables that need to be generated.
 */
export function generateVariablesV2(
  input: SolverInputV2,
  pinnedAssignments: SolverAssignmentV2[],
): CSPVariableV2[] {
  const variables: CSPVariableV2[] = [];

  // ── 1. Supervision variables ──
  generateSupervisionVariables(input, pinnedAssignments, variables);

  // ── 2 & 3. Teaching variables (double-period first, then single) ──
  generateTeachingVariables(input, pinnedAssignments, variables);

  return variables;
}

/**
 * Generate supervision variables for yard break slots.
 *
 * For each yard break slot across all year groups, create required_supervisor_count
 * variables per (weekday, period_order, break_group). Skip any fully covered by pinned.
 */
function generateSupervisionVariables(
  input: SolverInputV2,
  pinnedAssignments: SolverAssignmentV2[],
  variables: CSPVariableV2[],
): void {
  // Collect unique yard break slots from all year groups
  // Key: "break_group_id:weekday:period_order"
  const yardBreakSlots = new Map<
    string,
    { breakGroupId: string; weekday: number; periodOrder: number; yearGroupId: string }
  >();

  for (const yg of input.year_groups) {
    for (const slot of yg.period_grid) {
      if (
        slot.supervision_mode === 'yard' &&
        slot.break_group_id !== null &&
        (slot.period_type === 'break_supervision' || slot.period_type === 'lunch_duty')
      ) {
        const key = `${slot.break_group_id}:${slot.weekday}:${slot.period_order}`;
        if (!yardBreakSlots.has(key)) {
          yardBreakSlots.set(key, {
            breakGroupId: slot.break_group_id,
            weekday: slot.weekday,
            periodOrder: slot.period_order,
            yearGroupId: yg.year_group_id,
          });
        }
      }
    }
  }

  for (const [, slotInfo] of yardBreakSlots) {
    const breakGroup = input.break_groups.find((bg) => bg.break_group_id === slotInfo.breakGroupId);
    if (!breakGroup) continue;

    // Count how many supervisors are already pinned for this slot
    const pinnedCount = pinnedAssignments.filter(
      (a) =>
        a.is_supervision &&
        a.break_group_id === slotInfo.breakGroupId &&
        a.weekday === slotInfo.weekday &&
        a.period_order === slotInfo.periodOrder,
    ).length;

    const needed = breakGroup.required_supervisor_count - pinnedCount;

    for (let i = 0; i < needed; i++) {
      variables.push({
        id: `sup:${slotInfo.breakGroupId}:${slotInfo.weekday}:${slotInfo.periodOrder}:${i}`,
        type: 'supervision',
        class_id: null,
        year_group_id: slotInfo.yearGroupId,
        subject_id: null,
        slot_index: pinnedCount + i,
        break_group_id: slotInfo.breakGroupId,
        is_double_period_start: false,
      });
    }
  }
}

/**
 * Generate teaching variables for all curriculum entries across all year group sections.
 * Double-period variables come first, then single-period variables.
 */
function generateTeachingVariables(
  input: SolverInputV2,
  pinnedAssignments: SolverAssignmentV2[],
  variables: CSPVariableV2[],
): void {
  const doubleVars: CSPVariableV2[] = [];
  const singleVars: CSPVariableV2[] = [];

  for (const curriculum of input.curriculum) {
    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    for (const section of yg.sections) {
      // Count pinned entries for this subject+section
      const pinnedCount = pinnedAssignments.filter(
        (a) =>
          a.class_id === section.class_id &&
          a.subject_id === curriculum.subject_id &&
          !a.is_supervision,
      ).length;

      const totalNeeded = curriculum.min_periods_per_week;
      const remaining = totalNeeded - pinnedCount;
      if (remaining <= 0) continue;

      // Calculate double-period variables needed
      let doublePeriodSlots = 0;
      if (curriculum.requires_double_period && curriculum.double_period_count !== null) {
        // Each double period is 2 consecutive slots, represented as 2 variables (a pair)
        // But we need to figure out how many double-period PAIRS still need to be assigned
        // after accounting for pinned entries

        // Count how many consecutive pairs are already pinned
        const pinnedOrders = pinnedAssignments
          .filter(
            (a) =>
              a.class_id === section.class_id &&
              a.subject_id === curriculum.subject_id &&
              !a.is_supervision,
          )
          .map((a) => ({ weekday: a.weekday, period_order: a.period_order }));

        // Group by weekday and find consecutive pairs
        let pinnedPairs = 0;
        const byDay = new Map<number, number[]>();
        for (const p of pinnedOrders) {
          const existing = byDay.get(p.weekday) ?? [];
          existing.push(p.period_order);
          byDay.set(p.weekday, existing);
        }

        const grid = yg.period_grid;
        for (const [weekday, orders] of byDay) {
          const sorted = orders.sort((a, b) => a - b);
          const teachingSlots = grid
            .filter((p) => p.weekday === weekday && p.period_type === 'teaching')
            .map((p) => p.period_order)
            .sort((a, b) => a - b);

          for (let i = 0; i < sorted.length - 1; i++) {
            const currIdx = teachingSlots.indexOf(sorted[i]!);
            const nextIdx = teachingSlots.indexOf(sorted[i + 1]!);
            if (currIdx !== -1 && nextIdx !== -1 && nextIdx === currIdx + 1) {
              pinnedPairs++;
              i++; // skip the next one (it's part of this pair)
            }
          }
        }

        const neededPairs = Math.max(0, curriculum.double_period_count - pinnedPairs);
        doublePeriodSlots = neededPairs * 2;

        // Generate double-period variable pairs
        let slotIdx = pinnedCount;
        for (let p = 0; p < neededPairs; p++) {
          // First slot of the pair
          doubleVars.push({
            id: `teach:${section.class_id}:${curriculum.subject_id}:dp:${p}:0`,
            type: 'teaching',
            class_id: section.class_id,
            year_group_id: curriculum.year_group_id,
            subject_id: curriculum.subject_id,
            slot_index: slotIdx,
            break_group_id: null,
            is_double_period_start: true,
          });
          slotIdx++;

          // Second slot of the pair
          doubleVars.push({
            id: `teach:${section.class_id}:${curriculum.subject_id}:dp:${p}:1`,
            type: 'teaching',
            class_id: section.class_id,
            year_group_id: curriculum.year_group_id,
            subject_id: curriculum.subject_id,
            slot_index: slotIdx,
            break_group_id: null,
            is_double_period_start: false,
          });
          slotIdx++;
        }
      }

      // Generate single-period variables for the remaining slots
      const singleNeeded = remaining - doublePeriodSlots;
      const startIdx = pinnedCount + doublePeriodSlots;

      for (let i = 0; i < singleNeeded; i++) {
        singleVars.push({
          id: `teach:${section.class_id}:${curriculum.subject_id}:s:${i}`,
          type: 'teaching',
          class_id: section.class_id,
          year_group_id: curriculum.year_group_id,
          subject_id: curriculum.subject_id,
          slot_index: startIdx + i,
          break_group_id: null,
          is_double_period_start: false,
        });
      }
    }
  }

  // Double-period variables first, then single
  variables.push(...doubleVars, ...singleVars);
}

// ─── Domain Generation ──────────────────────────────────────────────────────

/**
 * Generate initial domains for all variables.
 *
 * For each variable, the domain contains all valid assignments that pass basic filters:
 * - Teaching: (weekday, period_order, teacher, room) tuples from the year group grid
 * - Supervision: (teacher_staff_id) for eligible teachers at the break time
 */
export function generateInitialDomainsV2(
  input: SolverInputV2,
  variables: CSPVariableV2[],
  pinnedAssignments: SolverAssignmentV2[],
): Map<string, DomainValueV2[]> {
  const domains = new Map<string, DomainValueV2[]>();

  for (const variable of variables) {
    const key = variableKeyV2(variable);

    if (variable.type === 'supervision') {
      domains.set(key, generateSupervisionDomain(input, variable, pinnedAssignments));
    } else {
      domains.set(key, generateTeachingDomain(input, variable, pinnedAssignments));
    }
  }

  return domains;
}

/**
 * Generate domain values for a supervision variable.
 * Domain = all teacher_staff_ids where the teacher is eligible for yard supervision.
 */
function generateSupervisionDomain(
  input: SolverInputV2,
  variable: CSPVariableV2,
  pinnedAssignments: SolverAssignmentV2[],
): DomainValueV2[] {
  const domain: DomainValueV2[] = [];
  if (variable.break_group_id === null) return domain;

  // Find the yard break slot details from the year group grid
  const grid = input.year_groups.find(
    (yg) => yg.year_group_id === variable.year_group_id,
  )?.period_grid;
  if (!grid) return domain;

  // Find a yard break slot for this break group — we need a specific weekday+period_order
  // The variable's id encodes the weekday and period_order
  const idParts = variable.id.split(':');
  // Format: sup:breakGroupId:weekday:periodOrder:index
  const weekday = parseInt(idParts[2] ?? '0', 10);
  const periodOrder = parseInt(idParts[3] ?? '0', 10);

  const breakSlot = grid.find(
    (p) =>
      p.weekday === weekday &&
      p.period_order === periodOrder &&
      p.break_group_id === variable.break_group_id,
  );
  if (!breakSlot) return domain;

  // Already-assigned teacher IDs for this break slot (pinned + already claimed supervision)
  const assignedTeacherIds = new Set(
    pinnedAssignments
      .filter(
        (a) =>
          a.is_supervision &&
          a.break_group_id === variable.break_group_id &&
          a.weekday === weekday &&
          a.period_order === periodOrder &&
          a.teacher_staff_id !== null,
      )
      .map((a) => a.teacher_staff_id!),
  );

  for (const teacher of input.teachers) {
    // Skip if this teacher is already assigned to this specific break slot
    if (assignedTeacherIds.has(teacher.staff_profile_id)) continue;

    // Check availability at break time
    if (teacher.availability.length > 0) {
      const dayAvail = teacher.availability.filter((a) => a.weekday === weekday);
      if (dayAvail.length === 0) continue;

      const covered = dayAvail.some(
        (a) => a.from <= breakSlot.start_time && a.to >= breakSlot.end_time,
      );
      if (!covered) continue;
    }

    // Check weekly supervision cap (preliminary — not counting current search state)
    if (teacher.max_supervision_duties_per_week !== null) {
      const currentDuties = pinnedAssignments.filter(
        (a) => a.teacher_staff_id === teacher.staff_profile_id && a.is_supervision,
      ).length;
      if (currentDuties >= teacher.max_supervision_duties_per_week) continue;
    }

    domain.push({
      weekday,
      period_order: periodOrder,
      teacher_staff_id: teacher.staff_profile_id,
      room_id: null,
    });
  }

  return domain;
}

/**
 * Generate domain values for a teaching variable.
 * Domain = all (weekday, period_order, teacher, room) tuples where basic filters pass.
 */
function generateTeachingDomain(
  input: SolverInputV2,
  variable: CSPVariableV2,
  pinnedAssignments: SolverAssignmentV2[],
): DomainValueV2[] {
  const domain: DomainValueV2[] = [];

  const yg = input.year_groups.find((y) => y.year_group_id === variable.year_group_id);
  if (!yg) return domain;

  // Get teaching slots from this year group's period grid
  const teachingSlots = yg.period_grid.filter((p) => p.period_type === 'teaching');

  // Build set of pinned slot keys for this class to skip
  const pinnedSlotKeys = new Set(
    pinnedAssignments
      .filter((a) => a.class_id === variable.class_id && !a.is_supervision)
      .map((a) => `${a.weekday}:${a.period_order}`),
  );

  // Find eligible teachers: pin-first for this class, then pool fallback.
  const eligibleTeachers = getEligibleTeachers(
    input,
    variable.subject_id,
    variable.year_group_id,
    variable.class_id,
  );

  // Find eligible rooms
  const curriculum = input.curriculum.find(
    (c) => c.year_group_id === variable.year_group_id && c.subject_id === variable.subject_id,
  );
  const requiredRoomType = curriculum?.required_room_type ?? null;
  const roomCandidates = getRoomCandidates(requiredRoomType, input);

  for (const slot of teachingSlots) {
    // Skip slots already occupied by a pinned entry for this class
    if (pinnedSlotKeys.has(`${slot.weekday}:${slot.period_order}`)) continue;

    // Determine effective availability window (including adjacent classroom breaks)
    const adjacentBreaks = findAdjacentBreaks(yg.period_grid, slot.weekday, slot.period_order);
    let effectiveStart = slot.start_time;
    let effectiveEnd = slot.end_time;
    for (const ab of adjacentBreaks) {
      if (ab.direction === 'before' && ab.slot.start_time < effectiveStart) {
        effectiveStart = ab.slot.start_time;
      }
      if (ab.direction === 'after' && ab.slot.end_time > effectiveEnd) {
        effectiveEnd = ab.slot.end_time;
      }
    }

    for (const teacher of eligibleTeachers) {
      // Check teacher availability for the effective time range
      if (teacher.availability.length > 0) {
        const dayAvail = teacher.availability.filter((a) => a.weekday === slot.weekday);
        if (dayAvail.length === 0) continue;

        const covered = dayAvail.some((a) => a.from <= effectiveStart && a.to >= effectiveEnd);
        if (!covered) continue;
      }

      if (roomCandidates.length === 0) {
        // No room needed or no rooms available for required type
        if (requiredRoomType === null) {
          domain.push({
            weekday: slot.weekday,
            period_order: slot.period_order,
            teacher_staff_id: teacher.staff_profile_id,
            room_id: null,
          });
        }
        // If room type is required but no rooms match, skip (domain will be empty)
      } else {
        for (const roomId of roomCandidates) {
          domain.push({
            weekday: slot.weekday,
            period_order: slot.period_order,
            teacher_staff_id: teacher.staff_profile_id,
            room_id: roomId,
          });
        }
      }
    }
  }

  return domain;
}

/**
 * Outcome of resolving candidate teachers for a `(class, subject)` variable.
 *
 * - `pinned` — exactly one teacher is pinned to this class for this subject.
 *   The solver fixes teacher and only searches for time + room.
 * - `pool` — no pin exists; the pool of year-group-level candidates is used.
 * - `missing` — neither a pin nor any pool entry covers this `(class, subject)`.
 *   The prerequisite check should reject generation; in-solver this yields
 *   an empty domain and surfaces as unassigned.
 */
export type TeacherAssignmentResolution =
  | { mode: 'pinned'; teacher_id: string }
  | { mode: 'pool'; teacher_ids: string[] }
  | { mode: 'missing' };

/**
 * Resolve the teacher candidates for a `(class, subject)` curriculum variable.
 *
 * Two-step lookup:
 *   1. Look for a pin — a competency whose `class_id` matches the target class.
 *      If one exists, that teacher is fixed.
 *   2. Otherwise, look for pool entries — competencies with `class_id === null`
 *      for the same `(year_group, subject)`. Every matching teacher is a candidate.
 *   3. If neither, return `missing`.
 *
 * If multiple pins somehow exist for the same `(class, subject)` (shouldn't
 * happen given the unique index, but defend anyway), the first match wins and
 * the others are ignored.
 */
export function resolveTeacherCandidates(
  teachers: TeacherInputV2[],
  classId: string,
  yearGroupId: string,
  subjectId: string,
): TeacherAssignmentResolution {
  for (const t of teachers) {
    const pin = t.competencies.find(
      (c) =>
        c.class_id === classId && c.subject_id === subjectId && c.year_group_id === yearGroupId,
    );
    if (pin) {
      return { mode: 'pinned', teacher_id: t.staff_profile_id };
    }
  }

  const poolIds: string[] = [];
  for (const t of teachers) {
    const poolEntry = t.competencies.find(
      (c) => c.class_id === null && c.subject_id === subjectId && c.year_group_id === yearGroupId,
    );
    if (poolEntry) poolIds.push(t.staff_profile_id);
  }

  if (poolIds.length > 0) {
    return { mode: 'pool', teacher_ids: poolIds };
  }

  return { mode: 'missing' };
}

/**
 * Lightweight wrapper around `resolveTeacherCandidates` that just reports the
 * assignment mode. Useful for prerequisite checks and diagnostics that don't
 * need the teacher IDs.
 */
export function getTeacherAssignmentMode(
  teachers: TeacherInputV2[],
  classId: string,
  yearGroupId: string,
  subjectId: string,
): TeacherAssignmentResolution['mode'] {
  return resolveTeacherCandidates(teachers, classId, yearGroupId, subjectId).mode;
}

/**
 * Get teachers eligible to teach a variable's `(class, subject)`.
 *
 * Applies the pin-first, pool-fallback resolution from
 * `resolveTeacherCandidates` and returns the matching teacher records. For
 * supervision variables (no subject), all teachers are returned — competency
 * is not required for yard supervision.
 *
 * For teaching variables without a class_id (should not happen in v2), the
 * caller gets the union of pool candidates across all matching year-group
 * entries — safe fallback behaviour.
 */
function getEligibleTeachers(
  input: SolverInputV2,
  subjectId: string | null,
  yearGroupId: string,
  classId: string | null,
): TeacherInputV2[] {
  if (subjectId === null) return input.teachers;

  if (classId !== null) {
    const resolution = resolveTeacherCandidates(input.teachers, classId, yearGroupId, subjectId);
    if (resolution.mode === 'pinned') {
      const pinned = input.teachers.find((t) => t.staff_profile_id === resolution.teacher_id);
      return pinned ? [pinned] : [];
    }
    if (resolution.mode === 'pool') {
      const ids = new Set(resolution.teacher_ids);
      return input.teachers.filter((t) => ids.has(t.staff_profile_id));
    }
    return [];
  }

  // Defensive fallback: no class_id on the variable — treat as pool-only match.
  return input.teachers.filter((t) =>
    t.competencies.some(
      (c) => c.class_id === null && c.subject_id === subjectId && c.year_group_id === yearGroupId,
    ),
  );
}

/**
 * Get candidate room IDs matching the required room type.
 * If no room type required, returns all rooms.
 * Also filters out rooms with active closures.
 */
function getRoomCandidates(requiredRoomType: string | null, input: SolverInputV2): string[] {
  // Filter out rooms with closures
  const closedRoomIds = new Set(input.room_closures.map((rc) => rc.room_id));

  const availableRooms = input.rooms.filter((r) => !closedRoomIds.has(r.room_id));

  if (requiredRoomType === null) {
    return availableRooms.map((r) => r.room_id);
  }

  return availableRooms.filter((r) => r.room_type === requiredRoomType).map((r) => r.room_id);
}

// ─── Forward Checking ───────────────────────────────────────────────────────

/**
 * Forward checking: after assigning a variable, prune domains of remaining variables.
 * Returns false if any domain becomes empty (backtrack needed).
 */
export function forwardCheckV2(
  input: SolverInputV2,
  currentAssignments: SolverAssignmentV2[],
  domains: Map<string, DomainValueV2[]>,
  unassignedVars: CSPVariableV2[],
): boolean {
  for (const variable of unassignedVars) {
    const key = variableKeyV2(variable);
    const domain = domains.get(key);
    if (!domain) continue;

    const filtered = domain.filter(
      (value) => checkHardConstraintsV2(input, currentAssignments, variable, value) === null,
    );

    domains.set(key, filtered);

    if (filtered.length === 0) {
      return false; // Domain wipeout — must backtrack
    }
  }

  return true;
}

// ─── Domain Cloning ─────────────────────────────────────────────────────────

/**
 * Deep-clone the domain map for backtracking.
 * Values (DomainValueV2[]) are arrays of plain objects — shallow copy of the array is sufficient.
 */
export function cloneDomainsV2(
  domains: Map<string, DomainValueV2[]>,
): Map<string, DomainValueV2[]> {
  const clone = new Map<string, DomainValueV2[]>();
  for (const [key, values] of domains) {
    clone.set(key, [...values]);
  }
  return clone;
}
