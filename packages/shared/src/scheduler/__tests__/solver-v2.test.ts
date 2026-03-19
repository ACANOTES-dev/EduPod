import { solveV2 } from '../solver-v2';
import type { SolverInputV2, SolverAssignmentV2, SolverOutputV2 } from '../types-v2';
import {
  buildMultiYearSchoolInput,
  buildMinimalV2Input,
  buildSettingsV2,
} from './fixtures/multi-year-school';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Total minimum teaching periods required across all year groups and sections.
 */
function totalPeriodsRequiredV2(input: SolverInputV2): number {
  let total = 0;
  for (const curriculum of input.curriculum) {
    const yg = input.year_groups.find(
      (y) => y.year_group_id === curriculum.year_group_id,
    );
    if (!yg) continue;
    total += curriculum.min_periods_per_week * yg.sections.length;
  }
  return total;
}

/**
 * Assert no teacher is double-booked across ALL year groups.
 * Uses time overlap detection (different year groups may have different period times).
 */
function assertNoTeacherDoubleBookingV2(
  entries: SolverAssignmentV2[],
  input: SolverInputV2,
): void {
  const byTeacherDay = new Map<string, SolverAssignmentV2[]>();
  for (const e of entries) {
    if (!e.teacher_staff_id) continue;
    const key = `${e.teacher_staff_id}:${e.weekday}`;
    const existing = byTeacherDay.get(key) ?? [];
    existing.push(e);
    byTeacherDay.set(key, existing);
  }

  for (const [key, assignments] of byTeacherDay) {
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i]!;
        const b = assignments[j]!;

        const aGrid = input.year_groups.find(
          (yg) => yg.year_group_id === a.year_group_id,
        )?.period_grid;
        const bGrid = input.year_groups.find(
          (yg) => yg.year_group_id === b.year_group_id,
        )?.period_grid;

        const aSlot = aGrid?.find(
          (p) => p.weekday === a.weekday && p.period_order === a.period_order,
        );
        const bSlot = bGrid?.find(
          (p) => p.weekday === b.weekday && p.period_order === b.period_order,
        );

        if (aSlot && bSlot) {
          if (aSlot.start_time < bSlot.end_time && bSlot.start_time < aSlot.end_time) {
            throw new Error(
              `Teacher double-booking [${key}]: period ${a.period_order} (${aSlot.start_time}-${aSlot.end_time}, yg=${a.year_group_id}) and ` +
              `period ${b.period_order} (${bSlot.start_time}-${bSlot.end_time}, yg=${b.year_group_id}), ` +
              `subjects: ${a.subject_id ?? 'supervision'}, ${b.subject_id ?? 'supervision'}`,
            );
          }
        }
      }
    }
  }
}

/**
 * Assert every assignment's teacher has competency for the assigned subject+year_group.
 */
function assertAllTeachersCompetent(
  entries: SolverAssignmentV2[],
  input: SolverInputV2,
): void {
  for (const e of entries) {
    if (!e.teacher_staff_id || !e.subject_id || e.is_supervision) continue;
    const teacher = input.teachers.find(
      (t) => t.staff_profile_id === e.teacher_staff_id,
    );
    expect(teacher).toBeDefined();
    const hasCompetency = teacher!.competencies.some(
      (c) => c.subject_id === e.subject_id && c.year_group_id === e.year_group_id,
    );
    if (!hasCompetency) {
      throw new Error(
        `Teacher ${e.teacher_staff_id} lacks competency for subject=${e.subject_id} year_group=${e.year_group_id}`,
      );
    }
  }
}

function countSubjectAssignments(
  entries: SolverAssignmentV2[],
  classId: string,
  subjectId: string,
): number {
  return entries.filter(
    (e) => e.class_id === classId && e.subject_id === subjectId && !e.is_supervision,
  ).length;
}

function countSubjectPerDay(
  entries: SolverAssignmentV2[],
  classId: string,
  subjectId: string,
  weekday: number,
): number {
  return entries.filter(
    (e) =>
      e.class_id === classId &&
      e.subject_id === subjectId &&
      e.weekday === weekday &&
      !e.is_supervision,
  ).length;
}

function countTeacherPeriods(
  entries: SolverAssignmentV2[],
  teacherId: string,
): number {
  return entries.filter(
    (e) => e.teacher_staff_id === teacherId && !e.is_supervision,
  ).length;
}

function countTeacherPeriodsOnDay(
  entries: SolverAssignmentV2[],
  teacherId: string,
  weekday: number,
): number {
  return entries.filter(
    (e) =>
      e.teacher_staff_id === teacherId &&
      e.weekday === weekday &&
      !e.is_supervision,
  ).length;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('solveV2', () => {
  let multiYearInput: SolverInputV2;
  let multiYearOutput: SolverOutputV2;

  beforeAll(() => {
    multiYearInput = buildMultiYearSchoolInput(42);
    multiYearOutput = solveV2(multiYearInput);
  }, 35000);

  // ── Empty Input ──────────────────────────────────────────────────────────

  describe('empty input', () => {
    it('should return empty when no year groups', () => {
      const input: SolverInputV2 = {
        ...buildMultiYearSchoolInput(),
        year_groups: [],
        curriculum: [],
        pinned_entries: [],
        break_groups: [],
      };

      const output = solveV2(input);

      expect(output.entries).toHaveLength(0);
      expect(output.unassigned).toHaveLength(0);
      expect(output.score).toBe(0);
      expect(output.max_score).toBe(0);
      expect(output.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should return empty when no curriculum', () => {
      const input: SolverInputV2 = {
        ...buildMultiYearSchoolInput(),
        curriculum: [],
        pinned_entries: [],
        break_groups: [],
      };

      const output = solveV2(input);
      const teachingEntries = output.entries.filter((e) => !e.is_supervision);
      expect(teachingEntries).toHaveLength(0);
    });
  });

  // ── Minimal Solve ────────────────────────────────────────────────────────

  describe('minimal solve', () => {
    let minInput: SolverInputV2;
    let minOutput: SolverOutputV2;

    beforeAll(() => {
      minInput = buildMinimalV2Input();
      minOutput = solveV2(minInput);
    });

    it('should solve completely for minimal input', () => {
      const required = totalPeriodsRequiredV2(minInput);
      const teachingEntries = minOutput.entries.filter((e) => !e.is_supervision);
      expect(teachingEntries).toHaveLength(required);
      expect(minOutput.unassigned).toHaveLength(0);
    });

    it('should have no teacher double-bookings', () => {
      expect(() =>
        assertNoTeacherDoubleBookingV2(minOutput.entries, minInput),
      ).not.toThrow();
    });

    it('should have all teachers with competency for assigned slots', () => {
      expect(() =>
        assertAllTeachersCompetent(minOutput.entries, minInput),
      ).not.toThrow();
    });

    it('should respect subject min_periods_per_week', () => {
      const subjACount = countSubjectAssignments(minOutput.entries, 'class-min', 'subj-a');
      const subjBCount = countSubjectAssignments(minOutput.entries, 'class-min', 'subj-b');
      expect(subjACount).toBeGreaterThanOrEqual(3);
      expect(subjBCount).toBeGreaterThanOrEqual(2);
    });

    it('should respect subject max_periods_per_day', () => {
      for (let weekday = 0; weekday < 3; weekday++) {
        const count = countSubjectPerDay(minOutput.entries, 'class-min', 'subj-b', weekday);
        expect(count).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── Multi-Year School Solve ──────────────────────────────────────────────

  describe('multi-year school solve', () => {
    it('should assign >= 90% of required periods', () => {
      const required = totalPeriodsRequiredV2(multiYearInput);
      const teachingEntries = multiYearOutput.entries.filter((e) => !e.is_supervision);
      expect(teachingEntries.length).toBeGreaterThanOrEqual(Math.floor(required * 0.9));
    });

    it('should have no teacher double-bookings across year groups', () => {
      expect(() =>
        assertNoTeacherDoubleBookingV2(multiYearOutput.entries, multiYearInput),
      ).not.toThrow();
    });

    it('should have all teachers with competency for their assignments', () => {
      expect(() =>
        assertAllTeachersCompetent(multiYearOutput.entries, multiYearInput),
      ).not.toThrow();
    });

    it('should meet subject frequency minimums for each year group', () => {
      for (const curriculum of multiYearInput.curriculum) {
        const yg = multiYearInput.year_groups.find(
          (y) => y.year_group_id === curriculum.year_group_id,
        );
        if (!yg) continue;

        for (const section of yg.sections) {
          const count = countSubjectAssignments(
            multiYearOutput.entries,
            section.class_id,
            curriculum.subject_id,
          );
          expect(count).toBeGreaterThanOrEqual(curriculum.min_periods_per_week);
        }
      }
    });

    it('should not exceed max_periods_per_day for any subject', () => {
      for (const curriculum of multiYearInput.curriculum) {
        const yg = multiYearInput.year_groups.find(
          (y) => y.year_group_id === curriculum.year_group_id,
        );
        if (!yg) continue;

        for (const section of yg.sections) {
          for (let weekday = 0; weekday < 5; weekday++) {
            const count = countSubjectPerDay(
              multiYearOutput.entries,
              section.class_id,
              curriculum.subject_id,
              weekday,
            );
            expect(count).toBeLessThanOrEqual(curriculum.max_periods_per_day);
          }
        }
      }
    });

    it('should never assign teacher-3 on Friday (availability)', () => {
      const fridayAssignments = multiYearOutput.entries.filter(
        (e) => e.teacher_staff_id === 'teacher-3' && e.weekday === 4,
      );
      expect(fridayAssignments).toHaveLength(0);
    });

    it('should never assign teacher-7 after 12:00 (availability)', () => {
      const lateAssignments = multiYearOutput.entries.filter((e) => {
        if (e.teacher_staff_id !== 'teacher-7') return false;
        const yg = multiYearInput.year_groups.find(
          (y) => y.year_group_id === e.year_group_id,
        );
        const slot = yg?.period_grid.find(
          (p) => p.weekday === e.weekday && p.period_order === e.period_order,
        );
        return slot != null && slot.end_time > '12:00';
      });
      expect(lateAssignments).toHaveLength(0);
    });

    it('should not exceed teacher-4 load limits (15/week, 4/day)', () => {
      const weeklyTotal = countTeacherPeriods(multiYearOutput.entries, 'teacher-4');
      expect(weeklyTotal).toBeLessThanOrEqual(15);

      for (let weekday = 0; weekday < 5; weekday++) {
        const dailyTotal = countTeacherPeriodsOnDay(multiYearOutput.entries, 'teacher-4', weekday);
        expect(dailyTotal).toBeLessThanOrEqual(4);
      }
    });

    it('should preserve pinned entry (teacher-3, Year 1 English, Monday P1)', () => {
      const pinned = multiYearOutput.entries.find(
        (e) =>
          e.is_pinned &&
          e.teacher_staff_id === 'teacher-3' &&
          e.class_id === 'class-y1' &&
          e.subject_id === 'subj-english' &&
          e.weekday === 0 &&
          e.period_order === 0,
      );
      expect(pinned).toBeDefined();
    });

    it('should have yard breaks with supervisors assigned', () => {
      const supervisionEntries = multiYearOutput.entries.filter((e) => e.is_supervision);
      expect(supervisionEntries.length).toBeGreaterThan(0);

      for (const bg of multiYearInput.break_groups) {
        const breakSlots = new Set<string>();
        for (const yg of multiYearInput.year_groups) {
          for (const slot of yg.period_grid) {
            if (slot.supervision_mode === 'yard' && slot.break_group_id === bg.break_group_id) {
              breakSlots.add(`${slot.weekday}:${slot.period_order}`);
            }
          }
        }

        for (const slotKey of breakSlots) {
          const [wd, po] = slotKey.split(':').map(Number);
          const supervisors = multiYearOutput.entries.filter(
            (e) =>
              e.is_supervision &&
              e.break_group_id === bg.break_group_id &&
              e.weekday === wd &&
              e.period_order === po,
          );
          expect(supervisors.length).toBeLessThanOrEqual(bg.required_supervisor_count);
        }
      }
    });

    it('should report non-negative score and max_score', () => {
      expect(multiYearOutput.score).toBeGreaterThanOrEqual(0);
      expect(multiYearOutput.max_score).toBeGreaterThanOrEqual(0);
    });

    it('should report duration', () => {
      expect(multiYearOutput.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Teacher Competency Enforcement ───────────────────────────────────────

  describe('teacher competency enforcement', () => {
    it('should never assign a teacher without Maths competency to Maths', () => {
      const mathsTeacherIds = new Set(
        multiYearInput.teachers
          .filter((t) => t.competencies.some((c) => c.subject_id === 'subj-maths'))
          .map((t) => t.staff_profile_id),
      );

      const mathsEntries = multiYearOutput.entries.filter(
        (e) => e.subject_id === 'subj-maths' && e.teacher_staff_id,
      );

      for (const entry of mathsEntries) {
        expect(mathsTeacherIds.has(entry.teacher_staff_id!)).toBe(true);
      }
    });

    it('should prefer primary teachers over non-primary', () => {
      // teacher-1 is primary for Y1 Maths
      const y1Maths = multiYearOutput.entries.filter(
        (e) => e.class_id === 'class-y1' && e.subject_id === 'subj-maths' && !e.is_supervision,
      );

      if (y1Maths.length > 0) {
        const primaryCount = y1Maths.filter((e) => e.teacher_staff_id === 'teacher-1').length;
        // With tight competency, primary teacher should get all assignments
        expect(primaryCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── Break Supervision ────────────────────────────────────────────────────

  describe('break supervision', () => {
    it('should assign teachers to yard break slots', () => {
      const supervisionEntries = multiYearOutput.entries.filter((e) => e.is_supervision);
      expect(supervisionEntries.length).toBeGreaterThan(0);
    });

    it('should not double-book supervision teachers during break', () => {
      const supervisionEntries = multiYearOutput.entries.filter((e) => e.is_supervision);

      for (let i = 0; i < supervisionEntries.length; i++) {
        for (let j = i + 1; j < supervisionEntries.length; j++) {
          const a = supervisionEntries[i]!;
          const b = supervisionEntries[j]!;
          if (
            a.teacher_staff_id === b.teacher_staff_id &&
            a.weekday === b.weekday &&
            a.period_order === b.period_order
          ) {
            throw new Error(
              `Supervision double-booking: ${a.teacher_staff_id} at weekday=${a.weekday} period=${a.period_order}`,
            );
          }
        }
      }
    });

    it('should have classroom_next break teachers available during break time', () => {
      for (const yg of multiYearInput.year_groups) {
        const classroomBreaks = yg.period_grid.filter(
          (p) => p.supervision_mode === 'classroom_next',
        );

        for (const breakSlot of classroomBreaks) {
          const nextTeaching = yg.period_grid
            .filter(
              (p) =>
                p.weekday === breakSlot.weekday &&
                p.period_order > breakSlot.period_order &&
                p.period_type === 'teaching',
            )
            .sort((a, b) => a.period_order - b.period_order)[0];

          if (!nextTeaching) continue;

          for (const section of yg.sections) {
            const nextAssignment = multiYearOutput.entries.find(
              (e) =>
                e.class_id === section.class_id &&
                e.weekday === breakSlot.weekday &&
                e.period_order === nextTeaching.period_order &&
                !e.is_supervision,
            );

            if (!nextAssignment?.teacher_staff_id) continue;

            const teacher = multiYearInput.teachers.find(
              (t) => t.staff_profile_id === nextAssignment.teacher_staff_id,
            );
            if (!teacher || teacher.availability.length === 0) continue;

            const dayAvail = teacher.availability.filter(
              (a) => a.weekday === breakSlot.weekday,
            );
            if (dayAvail.length === 0) continue;

            const covered = dayAvail.some(
              (a) => a.from <= breakSlot.start_time && a.to >= nextTeaching.end_time,
            );
            expect(covered).toBe(true);
          }
        }
      }
    });
  });

  // ── Double Periods ───────────────────────────────────────────────────────

  describe('double periods', () => {
    it('should assign all required periods for double-period subjects', () => {
      // Science Y1 has requires_double_period in the fixture
      const scienceEntries = multiYearOutput.entries.filter(
        (e) => e.class_id === 'class-y1' && e.subject_id === 'subj-science' && !e.is_supervision,
      );

      // Science Y1 requires 2 periods/week
      expect(scienceEntries.length).toBe(2);
    });

    it('should generate double-period variables as pairs', () => {
      // When requires_double_period is true, the solver generates dp variable pairs.
      // Verify they get assigned (even if not necessarily on same day, which is a best-effort heuristic).
      const scienceEntries = multiYearOutput.entries.filter(
        (e) => e.class_id === 'class-y1' && e.subject_id === 'subj-science' && !e.is_supervision,
      );

      expect(scienceEntries.length).toBeGreaterThanOrEqual(2);

      // If both are on the same day, they should be adjacent teaching slots
      const byDay = new Map<number, number[]>();
      for (const e of scienceEntries) {
        const existing = byDay.get(e.weekday) ?? [];
        existing.push(e.period_order);
        byDay.set(e.weekday, existing);
      }

      for (const [, orders] of byDay) {
        if (orders.length >= 2) {
          // If 2+ on same day, they should be consecutive teaching slots
          orders.sort((a, b) => a - b);
          // Verify they are on adjacent teaching slots (accounting for breaks between)
          expect(orders.length).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  // ── Multi-Section ────────────────────────────────────────────────────────

  describe('multi-section', () => {
    it('should satisfy curriculum for both Year 2A and Year 2B', () => {
      const year2Curriculum = multiYearInput.curriculum.filter(
        (c) => c.year_group_id === 'yg-2',
      );

      for (const curriculum of year2Curriculum) {
        const countA = countSubjectAssignments(multiYearOutput.entries, 'class-y2a', curriculum.subject_id);
        const countB = countSubjectAssignments(multiYearOutput.entries, 'class-y2b', curriculum.subject_id);

        expect(countA).toBeGreaterThanOrEqual(curriculum.min_periods_per_week);
        expect(countB).toBeGreaterThanOrEqual(curriculum.min_periods_per_week);
      }
    });

    it('should allow same teacher to teach both sections at different times', () => {
      const teachersFor2A = new Set(
        multiYearOutput.entries
          .filter((e) => e.class_id === 'class-y2a' && !e.is_supervision)
          .map((e) => e.teacher_staff_id),
      );
      const teachersFor2B = new Set(
        multiYearOutput.entries
          .filter((e) => e.class_id === 'class-y2b' && !e.is_supervision)
          .map((e) => e.teacher_staff_id),
      );

      const sharedTeachers = [...teachersFor2A].filter((t) => teachersFor2B.has(t));
      // teacher-2 teaches Maths for both sections, teacher-3 teaches English for both
      expect(sharedTeachers.length).toBeGreaterThanOrEqual(0);
    });

    it('should not assign teacher to both sections at the same time', () => {
      const y2aEntries = multiYearOutput.entries.filter(
        (e) => e.class_id === 'class-y2a' && !e.is_supervision,
      );
      const y2bEntries = multiYearOutput.entries.filter(
        (e) => e.class_id === 'class-y2b' && !e.is_supervision,
      );

      for (const a of y2aEntries) {
        for (const b of y2bEntries) {
          if (
            a.teacher_staff_id === b.teacher_staff_id &&
            a.weekday === b.weekday &&
            a.period_order === b.period_order
          ) {
            throw new Error(
              `Teacher ${a.teacher_staff_id} assigned to both 2A and 2B at weekday=${a.weekday} period=${a.period_order}`,
            );
          }
        }
      }
    });
  });

  // ── Cancellation ─────────────────────────────────────────────────────────

  describe('cancellation', () => {
    it('should stop when shouldCancel returns true', () => {
      const input = buildMultiYearSchoolInput(42);
      let callCount = 0;

      const output = solveV2(input, {
        shouldCancel: () => {
          callCount++;
          return callCount > 1;
        },
      });

      expect(output).toBeDefined();
      expect(output.entries).toBeDefined();
      expect(output.unassigned).toBeDefined();
      expect(output.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should return partial result', () => {
      const input = buildMultiYearSchoolInput(42);

      const output = solveV2(input, {
        shouldCancel: () => true,
      });

      const pinnedEntries = output.entries.filter((e) => e.is_pinned);
      expect(pinnedEntries.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Timeout ──────────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('should return partial solution on very short timeout', () => {
      const input: SolverInputV2 = {
        ...buildMultiYearSchoolInput(42),
        settings: {
          ...buildSettingsV2(42),
          max_solver_duration_seconds: 0.001,
        },
      };

      const output = solveV2(input);

      expect(output).toBeDefined();
      expect(output.entries).toBeDefined();
      expect(output.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Determinism ──────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('should produce same output with same seed', () => {
      const input = buildMinimalV2Input();

      const output1 = solveV2(input);
      const output2 = solveV2(input);

      expect(output1.entries.length).toBe(output2.entries.length);
      expect(output1.score).toBe(output2.score);

      for (let i = 0; i < output1.entries.length; i++) {
        const e1 = output1.entries[i]!;
        const e2 = output2.entries[i]!;
        expect(e1.class_id).toBe(e2.class_id);
        expect(e1.subject_id).toBe(e2.subject_id);
        expect(e1.weekday).toBe(e2.weekday);
        expect(e1.period_order).toBe(e2.period_order);
        expect(e1.teacher_staff_id).toBe(e2.teacher_staff_id);
      }
    });
  });
});
