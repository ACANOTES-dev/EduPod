import type {
  SolverInputV2,
  SolverAssignmentV2,
  ValidationResult,
  ConstraintViolation,
  ConstraintTier,
  PeriodSlotV2,
} from './types-v2';

// ─── Adjacent Break Info ────────────────────────────────────────────────────

interface AdjacentBreak {
  slot: PeriodSlotV2;
  direction: 'before' | 'after';
}

function findAdjacentBreaks(
  periodGrid: PeriodSlotV2[],
  weekday: number,
  periodOrder: number,
): AdjacentBreak[] {
  const result: AdjacentBreak[] = [];
  const daySlots = periodGrid
    .filter((p) => p.weekday === weekday)
    .sort((a, b) => a.period_order - b.period_order);

  const currentIdx = daySlots.findIndex((s) => s.period_order === periodOrder);
  if (currentIdx === -1) return result;

  const nextSlot = daySlots[currentIdx + 1];
  if (nextSlot && nextSlot.supervision_mode === 'classroom_previous') {
    result.push({ slot: nextSlot, direction: 'after' });
  }

  const prevSlot = daySlots[currentIdx - 1];
  if (prevSlot && prevSlot.supervision_mode === 'classroom_next') {
    result.push({ slot: prevSlot, direction: 'before' });
  }

  return result;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function getYearGroupGrid(input: SolverInputV2, yearGroupId: string): PeriodSlotV2[] {
  const yg = input.year_groups.find((y) => y.year_group_id === yearGroupId);
  return yg?.period_grid ?? [];
}

function getSlot(
  grid: PeriodSlotV2[],
  weekday: number,
  periodOrder: number,
): PeriodSlotV2 | undefined {
  return grid.find((p) => p.weekday === weekday && p.period_order === periodOrder);
}

function cellKey(yearGroupId: string, weekday: number, periodOrder: number): string {
  return `${yearGroupId}:${weekday}:${periodOrder}`;
}

function makeViolation(
  tier: ConstraintTier,
  category: string,
  message: string,
  cells: ConstraintViolation['cells'],
  related?: ConstraintViolation['related_entities'],
): ConstraintViolation {
  return {
    tier,
    category,
    message,
    cells,
    related_entities: related,
  };
}

// ─── Tier 1 Checks ──────────────────────────────────────────────────────────

/**
 * Tier 1 (Immutable): Teacher double-bookings.
 * A teacher cannot be in two places at the same time. Period.
 */
function checkTier1TeacherDoubleBooking(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Group by teacher + weekday
  const byTeacherDay = new Map<string, SolverAssignmentV2[]>();
  for (const a of assignments) {
    if (!a.teacher_staff_id) continue;
    const key = `${a.teacher_staff_id}:${a.weekday}`;
    const existing = byTeacherDay.get(key) ?? [];
    existing.push(a);
    byTeacherDay.set(key, existing);
  }

  // Deduplicate: track already-flagged pairs
  const flagged = new Set<string>();

  for (const [, dayAssignments] of byTeacherDay) {
    for (let i = 0; i < dayAssignments.length; i++) {
      for (let j = i + 1; j < dayAssignments.length; j++) {
        const a = dayAssignments[i]!;
        const b = dayAssignments[j]!;

        const aGrid = getYearGroupGrid(input, a.year_group_id);
        const bGrid = getYearGroupGrid(input, b.year_group_id);
        const aSlot = getSlot(aGrid, a.weekday, a.period_order);
        const bSlot = getSlot(bGrid, b.weekday, b.period_order);

        if (!aSlot || !bSlot) continue;

        // Time overlap
        if (aSlot.start_time < bSlot.end_time && bSlot.start_time < aSlot.end_time) {
          const pairKey = [
            `${a.year_group_id}:${a.weekday}:${a.period_order}`,
            `${b.year_group_id}:${b.weekday}:${b.period_order}`,
          ]
            .sort()
            .join('|');

          if (!flagged.has(pairKey)) {
            flagged.add(pairKey);
            const teacher = input.teachers.find((t) => t.staff_profile_id === a.teacher_staff_id);
            violations.push(
              makeViolation(
                1,
                'teacher_double_booking',
                `${teacher?.name ?? a.teacher_staff_id} is double-booked at ${aSlot.start_time}-${aSlot.end_time} on weekday ${a.weekday}`,
                [
                  {
                    year_group_id: a.year_group_id,
                    weekday: a.weekday,
                    period_order: a.period_order,
                  },
                  {
                    year_group_id: b.year_group_id,
                    weekday: b.weekday,
                    period_order: b.period_order,
                  },
                ],
                {
                  teacher_staff_id: a.teacher_staff_id ?? undefined,
                  teacher_name: teacher?.name,
                },
              ),
            );
          }
        }
      }
    }
  }

  return violations;
}

// ─── Tier 2 Checks ──────────────────────────────────────────────────────────

function checkTier2TeacherAvailability(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const a of assignments) {
    if (!a.teacher_staff_id) continue;

    const teacher = input.teachers.find((t) => t.staff_profile_id === a.teacher_staff_id);
    if (!teacher || teacher.availability.length === 0) continue;

    const grid = getYearGroupGrid(input, a.year_group_id);
    const slot = getSlot(grid, a.weekday, a.period_order);
    if (!slot) continue;

    // Determine effective time range including adjacent classroom breaks
    let effectiveStart = slot.start_time;
    let effectiveEnd = slot.end_time;

    if (!a.is_supervision) {
      const adjacentBreaks = findAdjacentBreaks(grid, a.weekday, a.period_order);
      for (const ab of adjacentBreaks) {
        if (ab.direction === 'before' && ab.slot.start_time < effectiveStart) {
          effectiveStart = ab.slot.start_time;
        }
        if (ab.direction === 'after' && ab.slot.end_time > effectiveEnd) {
          effectiveEnd = ab.slot.end_time;
        }
      }
    }

    const dayAvail = teacher.availability.filter((av) => av.weekday === a.weekday);
    if (dayAvail.length === 0) {
      violations.push(
        makeViolation(
          2,
          'teacher_availability',
          `${teacher.name} has no availability on weekday ${a.weekday}`,
          [
            {
              year_group_id: a.year_group_id,
              weekday: a.weekday,
              period_order: a.period_order,
            },
          ],
          {
            teacher_staff_id: a.teacher_staff_id ?? undefined,
            teacher_name: teacher.name,
          },
        ),
      );
      continue;
    }

    const covered = dayAvail.some((av) => av.from <= effectiveStart && av.to >= effectiveEnd);
    if (!covered) {
      violations.push(
        makeViolation(
          2,
          'teacher_availability',
          `${teacher.name} is not available for ${effectiveStart}-${effectiveEnd} on weekday ${a.weekday}`,
          [
            {
              year_group_id: a.year_group_id,
              weekday: a.weekday,
              period_order: a.period_order,
            },
          ],
          {
            teacher_staff_id: a.teacher_staff_id ?? undefined,
            teacher_name: teacher.name,
          },
        ),
      );
    }
  }

  return violations;
}

function checkTier2TeacherCompetency(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const a of assignments) {
    if (!a.teacher_staff_id || !a.subject_id || a.is_supervision) continue;

    const teacher = input.teachers.find((t) => t.staff_profile_id === a.teacher_staff_id);
    if (!teacher) continue;

    const hasCompetency = teacher.competencies.some(
      (c) => c.subject_id === a.subject_id && c.year_group_id === a.year_group_id,
    );

    if (!hasCompetency) {
      const curriculum = input.curriculum.find(
        (c) => c.year_group_id === a.year_group_id && c.subject_id === a.subject_id,
      );
      violations.push(
        makeViolation(
          2,
          'teacher_competency',
          `${teacher.name} lacks competency for ${curriculum?.subject_name ?? a.subject_id} in year group ${a.year_group_id}`,
          [
            {
              year_group_id: a.year_group_id,
              weekday: a.weekday,
              period_order: a.period_order,
            },
          ],
          {
            teacher_staff_id: a.teacher_staff_id ?? undefined,
            teacher_name: teacher.name,
            subject_id: a.subject_id ?? undefined,
            subject_name: curriculum?.subject_name,
          },
        ),
      );
    }
  }

  return violations;
}

function checkTier2SubjectMinFrequency(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const curriculum of input.curriculum) {
    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    for (const section of yg.sections) {
      const count = assignments.filter(
        (a) =>
          a.class_id === section.class_id &&
          a.subject_id === curriculum.subject_id &&
          !a.is_supervision,
      ).length;

      if (count < curriculum.min_periods_per_week) {
        // Flag all cells where this subject IS assigned (to highlight them)
        const cells = assignments
          .filter(
            (a) =>
              a.class_id === section.class_id &&
              a.subject_id === curriculum.subject_id &&
              !a.is_supervision,
          )
          .map((a) => ({
            year_group_id: a.year_group_id,
            weekday: a.weekday,
            period_order: a.period_order,
          }));

        violations.push(
          makeViolation(
            2,
            'subject_min_frequency',
            `${curriculum.subject_name} for ${section.class_name} has ${count}/${curriculum.min_periods_per_week} required periods`,
            cells.length > 0
              ? cells
              : [{ year_group_id: curriculum.year_group_id, weekday: 0, period_order: 0 }],
            {
              subject_id: curriculum.subject_id,
              subject_name: curriculum.subject_name,
              class_id: section.class_id,
            },
          ),
        );
      }
    }
  }

  return violations;
}

function checkTier2SubjectMaxPerDay(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const curriculum of input.curriculum) {
    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    for (const section of yg.sections) {
      for (let weekday = 0; weekday < 7; weekday++) {
        const dayEntries = assignments.filter(
          (a) =>
            a.class_id === section.class_id &&
            a.subject_id === curriculum.subject_id &&
            a.weekday === weekday &&
            !a.is_supervision,
        );

        if (dayEntries.length > curriculum.max_periods_per_day) {
          violations.push(
            makeViolation(
              2,
              'subject_max_per_day',
              `${curriculum.subject_name} for ${section.class_name} has ${dayEntries.length} periods on weekday ${weekday}, exceeding max of ${curriculum.max_periods_per_day}`,
              dayEntries.map((a) => ({
                year_group_id: a.year_group_id,
                weekday: a.weekday,
                period_order: a.period_order,
              })),
              {
                subject_id: curriculum.subject_id,
                subject_name: curriculum.subject_name,
                class_id: section.class_id,
              },
            ),
          );
        }
      }
    }
  }

  return violations;
}

function checkTier2TeacherDailyLoad(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const teacher of input.teachers) {
    if (teacher.max_periods_per_day === null) continue;

    for (let weekday = 0; weekday < 7; weekday++) {
      const dayEntries = assignments.filter(
        (a) =>
          a.teacher_staff_id === teacher.staff_profile_id &&
          a.weekday === weekday &&
          !a.is_supervision,
      );

      if (dayEntries.length > teacher.max_periods_per_day) {
        violations.push(
          makeViolation(
            2,
            'teacher_daily_load',
            `${teacher.name} has ${dayEntries.length} teaching periods on weekday ${weekday}, exceeding daily limit of ${teacher.max_periods_per_day}`,
            dayEntries.map((a) => ({
              year_group_id: a.year_group_id,
              weekday: a.weekday,
              period_order: a.period_order,
            })),
            {
              teacher_staff_id: teacher.staff_profile_id,
              teacher_name: teacher.name,
            },
          ),
        );
      }
    }
  }

  return violations;
}

function checkTier2TeacherWeeklyLoad(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const teacher of input.teachers) {
    if (teacher.max_periods_per_week === null) continue;

    const weeklyEntries = assignments.filter(
      (a) => a.teacher_staff_id === teacher.staff_profile_id && !a.is_supervision,
    );

    if (weeklyEntries.length > teacher.max_periods_per_week) {
      violations.push(
        makeViolation(
          2,
          'teacher_weekly_load',
          `${teacher.name} has ${weeklyEntries.length} teaching periods this week, exceeding weekly limit of ${teacher.max_periods_per_week}`,
          weeklyEntries.slice(0, 5).map((a) => ({
            year_group_id: a.year_group_id,
            weekday: a.weekday,
            period_order: a.period_order,
          })),
          {
            teacher_staff_id: teacher.staff_profile_id,
            teacher_name: teacher.name,
          },
        ),
      );
    }
  }

  return violations;
}

function checkTier2RoomDoubleBooking(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const flagged = new Set<string>();

  // Group by room + weekday
  const byRoomDay = new Map<string, SolverAssignmentV2[]>();
  for (const a of assignments) {
    if (!a.room_id) continue;
    const key = `${a.room_id}:${a.weekday}`;
    const existing = byRoomDay.get(key) ?? [];
    existing.push(a);
    byRoomDay.set(key, existing);
  }

  for (const [, dayAssignments] of byRoomDay) {
    for (let i = 0; i < dayAssignments.length; i++) {
      for (let j = i + 1; j < dayAssignments.length; j++) {
        const a = dayAssignments[i]!;
        const b = dayAssignments[j]!;

        const room = input.rooms.find((r) => r.room_id === a.room_id);
        if (!room || !room.is_exclusive) continue;

        const aGrid = getYearGroupGrid(input, a.year_group_id);
        const bGrid = getYearGroupGrid(input, b.year_group_id);
        const aSlot = getSlot(aGrid, a.weekday, a.period_order);
        const bSlot = getSlot(bGrid, b.weekday, b.period_order);

        if (!aSlot || !bSlot) continue;

        if (aSlot.start_time < bSlot.end_time && bSlot.start_time < aSlot.end_time) {
          const pairKey = [
            `${a.year_group_id}:${a.weekday}:${a.period_order}`,
            `${b.year_group_id}:${b.weekday}:${b.period_order}`,
          ]
            .sort()
            .join('|');

          if (!flagged.has(pairKey)) {
            flagged.add(pairKey);
            violations.push(
              makeViolation(
                2,
                'room_double_booking',
                `Room ${a.room_id} is double-booked at weekday ${a.weekday} period ${a.period_order}`,
                [
                  {
                    year_group_id: a.year_group_id,
                    weekday: a.weekday,
                    period_order: a.period_order,
                  },
                  {
                    year_group_id: b.year_group_id,
                    weekday: b.weekday,
                    period_order: b.period_order,
                  },
                ],
                { room_id: a.room_id ?? undefined },
              ),
            );
          }
        }
      }
    }
  }

  return violations;
}

function checkTier2RoomTypeMismatch(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const a of assignments) {
    if (!a.room_id || !a.subject_id || a.is_supervision) continue;

    const curriculum = input.curriculum.find(
      (c) => c.year_group_id === a.year_group_id && c.subject_id === a.subject_id,
    );
    if (!curriculum || !curriculum.required_room_type) continue;

    const room = input.rooms.find((r) => r.room_id === a.room_id);
    if (!room) continue;

    if (room.room_type !== curriculum.required_room_type) {
      violations.push(
        makeViolation(
          2,
          'room_type_mismatch',
          `${curriculum.subject_name} requires a ${curriculum.required_room_type} but is assigned to ${room.room_type} (${a.room_id})`,
          [
            {
              year_group_id: a.year_group_id,
              weekday: a.weekday,
              period_order: a.period_order,
            },
          ],
          {
            room_id: a.room_id ?? undefined,
            subject_id: a.subject_id ?? undefined,
            subject_name: curriculum.subject_name,
          },
        ),
      );
    }
  }

  return violations;
}

function checkTier2BreakSupervisionUnderstaffed(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const bg of input.break_groups) {
    // Collect unique yard break slots for this break group
    const breakSlots = new Map<
      string,
      { weekday: number; periodOrder: number; yearGroupId: string }
    >();

    for (const yg of input.year_groups) {
      for (const slot of yg.period_grid) {
        if (slot.supervision_mode === 'yard' && slot.break_group_id === bg.break_group_id) {
          const key = `${slot.weekday}:${slot.period_order}`;
          if (!breakSlots.has(key)) {
            breakSlots.set(key, {
              weekday: slot.weekday,
              periodOrder: slot.period_order,
              yearGroupId: yg.year_group_id,
            });
          }
        }
      }
    }

    for (const [, slotInfo] of breakSlots) {
      const supervisors = assignments.filter(
        (a) =>
          a.is_supervision &&
          a.break_group_id === bg.break_group_id &&
          a.weekday === slotInfo.weekday &&
          a.period_order === slotInfo.periodOrder,
      );

      if (supervisors.length < bg.required_supervisor_count) {
        violations.push(
          makeViolation(
            2,
            'break_supervision_understaffed',
            `${bg.name} on weekday ${slotInfo.weekday} has ${supervisors.length}/${bg.required_supervisor_count} required supervisors`,
            [
              {
                year_group_id: slotInfo.yearGroupId,
                weekday: slotInfo.weekday,
                period_order: slotInfo.periodOrder,
              },
            ],
            { break_group_id: bg.break_group_id },
          ),
        );
      }
    }
  }

  return violations;
}

function checkTier2ClassroomBreakTeacherMissing(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const yg of input.year_groups) {
    const classroomBreaks = yg.period_grid.filter(
      (p) => p.supervision_mode === 'classroom_previous' || p.supervision_mode === 'classroom_next',
    );

    for (const breakSlot of classroomBreaks) {
      for (const section of yg.sections) {
        // Determine which teaching period is responsible
        const daySlots = yg.period_grid
          .filter((p) => p.weekday === breakSlot.weekday)
          .sort((a, b) => a.period_order - b.period_order);

        const breakIdx = daySlots.findIndex((s) => s.period_order === breakSlot.period_order);
        if (breakIdx === -1) continue;

        let adjacentTeachingSlot: PeriodSlotV2 | undefined;

        if (breakSlot.supervision_mode === 'classroom_previous') {
          // Previous teacher stays — look backwards for teaching slot
          for (let k = breakIdx - 1; k >= 0; k--) {
            if (daySlots[k]!.period_type === 'teaching') {
              adjacentTeachingSlot = daySlots[k]!;
              break;
            }
          }
        } else {
          // classroom_next — next teacher arrives early
          for (let k = breakIdx + 1; k < daySlots.length; k++) {
            if (daySlots[k]!.period_type === 'teaching') {
              adjacentTeachingSlot = daySlots[k]!;
              break;
            }
          }
        }

        if (!adjacentTeachingSlot) {
          // No adjacent teaching period — this is a violation
          violations.push(
            makeViolation(
              2,
              'classroom_break_teacher_missing',
              `Classroom break at ${breakSlot.start_time}-${breakSlot.end_time} on weekday ${breakSlot.weekday} for ${section.class_name} has no adjacent teaching period`,
              [
                {
                  year_group_id: yg.year_group_id,
                  weekday: breakSlot.weekday,
                  period_order: breakSlot.period_order,
                },
              ],
              { class_id: section.class_id },
            ),
          );
          continue;
        }

        // Check that someone is assigned to the adjacent teaching slot
        const adjacentAssignment = assignments.find(
          (a) =>
            a.class_id === section.class_id &&
            a.weekday === breakSlot.weekday &&
            a.period_order === adjacentTeachingSlot!.period_order &&
            !a.is_supervision,
        );

        if (!adjacentAssignment || !adjacentAssignment.teacher_staff_id) {
          violations.push(
            makeViolation(
              2,
              'classroom_break_teacher_missing',
              `Classroom break at ${breakSlot.start_time}-${breakSlot.end_time} on weekday ${breakSlot.weekday} for ${section.class_name} has no supervising teacher (adjacent slot unassigned)`,
              [
                {
                  year_group_id: yg.year_group_id,
                  weekday: breakSlot.weekday,
                  period_order: breakSlot.period_order,
                },
              ],
              { class_id: section.class_id },
            ),
          );
        }
      }
    }
  }

  return violations;
}

function checkTier2StudentOverlap(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const flagged = new Set<string>();

  for (const overlap of input.student_overlaps) {
    const aAssignments = assignments.filter(
      (a) => a.class_id === overlap.class_id_a && !a.is_supervision,
    );
    const bAssignments = assignments.filter(
      (a) => a.class_id === overlap.class_id_b && !a.is_supervision,
    );

    for (const a of aAssignments) {
      for (const b of bAssignments) {
        if (a.weekday !== b.weekday) continue;

        const aGrid = getYearGroupGrid(input, a.year_group_id);
        const bGrid = getYearGroupGrid(input, b.year_group_id);
        const aSlot = getSlot(aGrid, a.weekday, a.period_order);
        const bSlot = getSlot(bGrid, b.weekday, b.period_order);

        if (!aSlot || !bSlot) continue;

        if (aSlot.start_time < bSlot.end_time && bSlot.start_time < aSlot.end_time) {
          const pairKey = [
            `${a.class_id}:${a.weekday}:${a.period_order}`,
            `${b.class_id}:${b.weekday}:${b.period_order}`,
          ]
            .sort()
            .join('|');

          if (!flagged.has(pairKey)) {
            flagged.add(pairKey);
            violations.push(
              makeViolation(
                2,
                'student_overlap',
                `Classes ${overlap.class_id_a} and ${overlap.class_id_b} share students and overlap at weekday ${a.weekday}`,
                [
                  {
                    year_group_id: a.year_group_id,
                    weekday: a.weekday,
                    period_order: a.period_order,
                  },
                  {
                    year_group_id: b.year_group_id,
                    weekday: b.weekday,
                    period_order: b.period_order,
                  },
                ],
                {
                  class_id: overlap.class_id_a,
                },
              ),
            );
          }
        }
      }
    }
  }

  return violations;
}

function checkTier2MaxConsecutive(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const curriculum of input.curriculum) {
    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    const maxConsecutive = curriculum.max_periods_per_day;

    for (const section of yg.sections) {
      for (let weekday = 0; weekday < 7; weekday++) {
        const dayEntries = assignments
          .filter(
            (a) =>
              a.class_id === section.class_id &&
              a.subject_id === curriculum.subject_id &&
              a.weekday === weekday &&
              !a.is_supervision,
          )
          .map((a) => a.period_order)
          .sort((a, b) => a - b);

        if (dayEntries.length <= maxConsecutive) continue;

        // Build teaching slot order
        const teachingSlots = yg.period_grid
          .filter((p) => p.weekday === weekday && p.period_type === 'teaching')
          .map((p) => p.period_order)
          .sort((a, b) => a - b);

        let maxRun = 1;
        let currentRun = 1;

        for (let i = 1; i < dayEntries.length; i++) {
          const prevIdx = teachingSlots.indexOf(dayEntries[i - 1]!);
          const currIdx = teachingSlots.indexOf(dayEntries[i]!);

          if (prevIdx !== -1 && currIdx !== -1 && currIdx === prevIdx + 1) {
            currentRun++;
            if (currentRun > maxRun) maxRun = currentRun;
          } else {
            currentRun = 1;
          }
        }

        if (maxRun > maxConsecutive) {
          violations.push(
            makeViolation(
              2,
              'max_consecutive_exceeded',
              `${curriculum.subject_name} for ${section.class_name} has ${maxRun} consecutive periods on weekday ${weekday}, exceeding max of ${maxConsecutive}`,
              dayEntries.map((po) => ({
                year_group_id: curriculum.year_group_id,
                weekday,
                period_order: po,
              })),
              {
                subject_id: curriculum.subject_id,
                subject_name: curriculum.subject_name,
                class_id: section.class_id,
              },
            ),
          );
        }
      }
    }
  }

  return violations;
}

function checkTier2MinConsecutive(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const curriculum of input.curriculum) {
    if (!curriculum.requires_double_period) continue;

    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    for (const section of yg.sections) {
      for (let weekday = 0; weekday < 7; weekday++) {
        const dayEntries = assignments
          .filter(
            (a) =>
              a.class_id === section.class_id &&
              a.subject_id === curriculum.subject_id &&
              a.weekday === weekday &&
              !a.is_supervision,
          )
          .map((a) => a.period_order)
          .sort((a, b) => a - b);

        if (dayEntries.length < 2) continue;

        // Build teaching slot sequences (broken by yard breaks)
        const daySlots = yg.period_grid
          .filter((p) => p.weekday === weekday)
          .sort((a, b) => a.period_order - b.period_order);

        const teachingSlotSequences: number[][] = [];
        let currentSeq: number[] = [];

        for (const s of daySlots) {
          if (s.period_type === 'teaching') {
            currentSeq.push(s.period_order);
          } else if (
            s.supervision_mode === 'classroom_previous' ||
            s.supervision_mode === 'classroom_next'
          ) {
            continue; // classroom breaks don't break consecutiveness
          } else {
            if (currentSeq.length > 0) {
              teachingSlotSequences.push(currentSeq);
              currentSeq = [];
            }
          }
        }
        if (currentSeq.length > 0) {
          teachingSlotSequences.push(currentSeq);
        }

        // Check for isolated periods
        for (const order of dayEntries) {
          let hasAdjacentPair = false;

          for (const seq of teachingSlotSequences) {
            const idx = seq.indexOf(order);
            if (idx === -1) continue;

            if (idx > 0 && dayEntries.includes(seq[idx - 1]!)) {
              hasAdjacentPair = true;
              break;
            }
            if (idx < seq.length - 1 && dayEntries.includes(seq[idx + 1]!)) {
              hasAdjacentPair = true;
              break;
            }
          }

          if (!hasAdjacentPair) {
            violations.push(
              makeViolation(
                2,
                'min_consecutive_violated',
                `${curriculum.subject_name} for ${section.class_name} has an isolated period at weekday ${weekday} period ${order}, violating double-period requirement`,
                [
                  {
                    year_group_id: curriculum.year_group_id,
                    weekday,
                    period_order: order,
                  },
                ],
                {
                  subject_id: curriculum.subject_id,
                  subject_name: curriculum.subject_name,
                  class_id: section.class_id,
                },
              ),
            );
            break; // one violation per day is enough
          }
        }
      }
    }
  }

  return violations;
}

// ─── Tier 3 Checks ──────────────────────────────────────────────────────────

function checkTier3TeacherTimeSlotPreferences(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const teacher of input.teachers) {
    const timePrefs = teacher.preferences.filter((p) => p.preference_type === 'time_slot');

    for (const pref of timePrefs) {
      const payload = pref.preference_payload as {
        weekday?: number;
        period_order?: number;
        preferred?: boolean;
      };

      const wantsSlot = payload.preferred !== false;

      const teacherAssignments = assignments.filter(
        (a) => a.teacher_staff_id === teacher.staff_profile_id,
      );

      const matching = teacherAssignments.filter((a) => {
        if (payload.weekday !== undefined && a.weekday !== payload.weekday) {
          return false;
        }
        if (payload.period_order !== undefined && a.period_order !== payload.period_order) {
          return false;
        }
        return true;
      });

      const satisfied = wantsSlot ? matching.length > 0 : matching.length === 0;

      if (!satisfied) {
        const cells = wantsSlot
          ? [
              {
                year_group_id: teacherAssignments[0]?.year_group_id ?? '',
                weekday: payload.weekday ?? 0,
                period_order: payload.period_order ?? 0,
              },
            ]
          : matching.map((a) => ({
              year_group_id: a.year_group_id,
              weekday: a.weekday,
              period_order: a.period_order,
            }));

        violations.push(
          makeViolation(
            3,
            'teacher_time_slot_preference',
            `${teacher.name}'s time slot preference not honoured`,
            cells,
            {
              teacher_staff_id: teacher.staff_profile_id,
              teacher_name: teacher.name,
            },
          ),
        );
      }
    }
  }

  return violations;
}

function checkTier3SubjectPreferredFrequency(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const curriculum of input.curriculum) {
    if (
      curriculum.preferred_periods_per_week === null ||
      curriculum.preferred_periods_per_week <= curriculum.min_periods_per_week
    ) {
      continue;
    }

    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    for (const section of yg.sections) {
      const count = assignments.filter(
        (a) =>
          a.class_id === section.class_id &&
          a.subject_id === curriculum.subject_id &&
          !a.is_supervision,
      ).length;

      if (
        count >= curriculum.min_periods_per_week &&
        count < curriculum.preferred_periods_per_week
      ) {
        violations.push(
          makeViolation(
            3,
            'subject_preferred_frequency',
            `${curriculum.subject_name} for ${section.class_name} has ${count} periods, below preferred ${curriculum.preferred_periods_per_week}`,
            [
              {
                year_group_id: curriculum.year_group_id,
                weekday: 0,
                period_order: 0,
              },
            ],
            {
              subject_id: curriculum.subject_id,
              subject_name: curriculum.subject_name,
              class_id: section.class_id,
            },
          ),
        );
      }
    }
  }

  return violations;
}

function checkTier3EvenSubjectSpread(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const SPREAD_THRESHOLD = 0.5;

  for (const curriculum of input.curriculum) {
    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    for (const section of yg.sections) {
      const sectionAssignments = assignments.filter(
        (a) =>
          a.class_id === section.class_id &&
          a.subject_id === curriculum.subject_id &&
          !a.is_supervision,
      );

      if (sectionAssignments.length <= 1) continue;

      const dayCounts = new Map<number, number>();
      for (const a of sectionAssignments) {
        dayCounts.set(a.weekday, (dayCounts.get(a.weekday) ?? 0) + 1);
      }

      const counts = Array.from(dayCounts.values());
      const n = sectionAssignments.length;
      const k = counts.length;
      const mean = n / k;
      const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / k;
      const maxVariance = Math.pow(n, 2);
      const spreadScore = maxVariance === 0 ? 1 : Math.max(0, 1 - variance / maxVariance);

      if (spreadScore < SPREAD_THRESHOLD) {
        violations.push(
          makeViolation(
            3,
            'even_subject_spread',
            `${curriculum.subject_name} for ${section.class_name} is clustered (spread score: ${spreadScore.toFixed(2)})`,
            sectionAssignments.map((a) => ({
              year_group_id: a.year_group_id,
              weekday: a.weekday,
              period_order: a.period_order,
            })),
            {
              subject_id: curriculum.subject_id,
              subject_name: curriculum.subject_name,
              class_id: section.class_id,
            },
          ),
        );
      }
    }
  }

  return violations;
}

function checkTier3TeacherGaps(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const GAP_THRESHOLD = 0.5;

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

    let totalGaps = 0;
    let maxPossibleGaps = 0;

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

    if (maxPossibleGaps > 0) {
      const gapScore = Math.max(0, 1 - totalGaps / maxPossibleGaps);
      if (gapScore < GAP_THRESHOLD) {
        violations.push(
          makeViolation(
            3,
            'teacher_gaps',
            `${teacher.name} has excessive gaps between classes (gap score: ${gapScore.toFixed(2)})`,
            teacherAssignments.slice(0, 3).map((a) => ({
              year_group_id: a.year_group_id,
              weekday: a.weekday,
              period_order: a.period_order,
            })),
            {
              teacher_staff_id: teacher.staff_profile_id,
              teacher_name: teacher.name,
            },
          ),
        );
      }
    }
  }

  return violations;
}

function checkTier3WorkloadImbalance(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (input.teachers.length <= 1) return violations;

  const counts = input.teachers.map(
    (t) =>
      assignments.filter((a) => a.teacher_staff_id === t.staff_profile_id && !a.is_supervision)
        .length,
  );

  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
  if (mean === 0) return violations;

  const variance = counts.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  if (cv > 0.5) {
    violations.push(
      makeViolation(
        3,
        'workload_imbalance',
        `Teaching workload is imbalanced across teachers (CV: ${cv.toFixed(2)})`,
        [],
      ),
    );
  }

  return violations;
}

function checkTier3BreakDutyImbalance(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  const supervisionAssignments = assignments.filter((a) => a.is_supervision);
  if (supervisionAssignments.length === 0) return violations;

  const dutyCounts = new Map<string, number>();
  for (const a of supervisionAssignments) {
    if (a.teacher_staff_id) {
      dutyCounts.set(a.teacher_staff_id, (dutyCounts.get(a.teacher_staff_id) ?? 0) + 1);
    }
  }

  const counts = Array.from(dutyCounts.values());
  if (counts.length <= 1) return violations;

  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
  if (mean === 0) return violations;

  const variance = counts.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  if (cv > 0.5) {
    violations.push(
      makeViolation(
        3,
        'break_duty_imbalance',
        `Break supervision duties are imbalanced across teachers (CV: ${cv.toFixed(2)})`,
        [],
      ),
    );
  }

  return violations;
}

function checkTier3RoomNotPreferred(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const curriculum of input.curriculum) {
    if (!curriculum.preferred_room_id) continue;

    const yg = input.year_groups.find((y) => y.year_group_id === curriculum.year_group_id);
    if (!yg) continue;

    for (const section of yg.sections) {
      const sectionAssignments = assignments.filter(
        (a) =>
          a.class_id === section.class_id &&
          a.subject_id === curriculum.subject_id &&
          !a.is_supervision,
      );

      for (const a of sectionAssignments) {
        if (a.room_id !== null && a.room_id !== curriculum.preferred_room_id) {
          violations.push(
            makeViolation(
              3,
              'room_not_preferred',
              `${curriculum.subject_name} for ${section.class_name} is not in preferred room ${curriculum.preferred_room_id}`,
              [
                {
                  year_group_id: a.year_group_id,
                  weekday: a.weekday,
                  period_order: a.period_order,
                },
              ],
              {
                room_id: a.room_id ?? undefined,
                subject_id: curriculum.subject_id,
                subject_name: curriculum.subject_name,
                class_id: section.class_id,
              },
            ),
          );
        }
      }
    }
  }

  return violations;
}

// ─── Health Score ────────────────────────────────────────────────────────────

function computeHealthScore(tier1Count: number, tier2Count: number, tier3Count: number): number {
  const raw = 100 - tier1Count * 20 - tier2Count * 5 - tier3Count * 1;
  return Math.max(0, Math.min(100, raw));
}

// ─── Cell Violation Map ──────────────────────────────────────────────────────

function buildCellViolationMap(
  violations: ConstraintViolation[],
): Record<string, ConstraintViolation[]> {
  const map: Record<string, ConstraintViolation[]> = {};

  for (const v of violations) {
    for (const cell of v.cells) {
      const key = cellKey(cell.year_group_id, cell.weekday, cell.period_order);
      if (!map[key]) {
        map[key] = [];
      }
      map[key]!.push(v);
    }
  }

  return map;
}

// ─── Main Validation Function ────────────────────────────────────────────────

/**
 * Validate a complete schedule against all constraints.
 * Returns violations categorized by tier (1/2/3) with cell coordinates.
 *
 * Tier 1 (Immutable -- blocks save): teacher double-booking only
 * Tier 2 (Hard -- requires acknowledgement): availability, subject freq, load limits, etc.
 * Tier 3 (Soft -- informational): preferences, balance, spread
 */
export function validateSchedule(
  input: SolverInputV2,
  assignments: SolverAssignmentV2[],
): ValidationResult {
  const violations: ConstraintViolation[] = [];

  // ── Tier 1 ──
  violations.push(...checkTier1TeacherDoubleBooking(input, assignments));

  // ── Tier 2 ──
  violations.push(...checkTier2TeacherAvailability(input, assignments));
  violations.push(...checkTier2TeacherCompetency(input, assignments));
  violations.push(...checkTier2SubjectMinFrequency(input, assignments));
  violations.push(...checkTier2SubjectMaxPerDay(input, assignments));
  violations.push(...checkTier2TeacherDailyLoad(input, assignments));
  violations.push(...checkTier2TeacherWeeklyLoad(input, assignments));
  violations.push(...checkTier2RoomDoubleBooking(input, assignments));
  violations.push(...checkTier2RoomTypeMismatch(input, assignments));
  violations.push(...checkTier2BreakSupervisionUnderstaffed(input, assignments));
  violations.push(...checkTier2ClassroomBreakTeacherMissing(input, assignments));
  violations.push(...checkTier2StudentOverlap(input, assignments));
  violations.push(...checkTier2MaxConsecutive(input, assignments));
  violations.push(...checkTier2MinConsecutive(input, assignments));

  // ── Tier 3 ──
  violations.push(...checkTier3TeacherTimeSlotPreferences(input, assignments));
  violations.push(...checkTier3SubjectPreferredFrequency(input, assignments));
  violations.push(...checkTier3EvenSubjectSpread(input, assignments));
  violations.push(...checkTier3TeacherGaps(input, assignments));
  violations.push(...checkTier3WorkloadImbalance(input, assignments));
  violations.push(...checkTier3BreakDutyImbalance(input, assignments));
  violations.push(...checkTier3RoomNotPreferred(input, assignments));

  // ── Summary ──
  const tier1 = violations.filter((v) => v.tier === 1).length;
  const tier2 = violations.filter((v) => v.tier === 2).length;
  const tier3 = violations.filter((v) => v.tier === 3).length;

  return {
    violations,
    health_score: computeHealthScore(tier1, tier2, tier3),
    summary: { tier1, tier2, tier3 },
    cell_violations: buildCellViolationMap(violations),
  };
}
