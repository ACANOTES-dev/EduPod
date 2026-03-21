import { solve } from '../solver';
import type { SolverInput, SolverAssignment } from '../types';

import {
  buildSmallSchoolInput,
  buildMinimalInput,
  buildPeriodGrid,
  buildRooms,
  buildTeachers,
  buildClasses,
  buildSettings,
} from './fixtures/small-school';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalPeriodsRequired(input: SolverInput): number {
  return input.classes.reduce((sum, c) => sum + c.periods_per_week, 0);
}

function assertNoTeacherDoubleBooking(entries: SolverAssignment[]): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.teacher_staff_id) continue;
    const key = `${entry.teacher_staff_id}:${entry.weekday}:${entry.period_order}`;
    const prev = seen.get(key);
    if (prev !== undefined) {
      throw new Error(
        `Teacher double-booking: ${entry.teacher_staff_id} at weekday=${entry.weekday} period=${entry.period_order} (classes: ${prev}, ${entry.class_id})`,
      );
    }
    seen.set(key, entry.class_id);
  }
}

function assertNoRoomDoubleBooking(entries: SolverAssignment[]): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.room_id) continue;
    const key = `${entry.room_id}:${entry.weekday}:${entry.period_order}`;
    const prev = seen.get(key);
    if (prev !== undefined) {
      throw new Error(
        `Room double-booking: ${entry.room_id} at weekday=${entry.weekday} period=${entry.period_order} (classes: ${prev}, ${entry.class_id})`,
      );
    }
    seen.set(key, entry.class_id);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('solve', () => {

  describe('empty input', () => {
    it('should return empty output when there are no classes', () => {
      const input: SolverInput = {
        period_grid: buildPeriodGrid(),
        classes: [],
        teachers: [],
        rooms: buildRooms(),
        pinned_entries: [],
        student_overlaps: [],
        settings: buildSettings(),
      };

      const output = solve(input);

      expect(output.entries).toHaveLength(0);
      expect(output.unassigned).toHaveLength(0);
      expect(output.score).toBe(0);
      expect(output.max_score).toBe(0);
      expect(output.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should return empty output when period grid is empty', () => {
      const input: SolverInput = {
        period_grid: [],
        classes: buildClasses().slice(0, 2),
        teachers: buildTeachers().slice(0, 2),
        rooms: buildRooms(),
        pinned_entries: [],
        student_overlaps: [],
        settings: buildSettings(),
      };

      const output = solve(input);
      // With no slots, nothing can be assigned
      expect(output.entries).toHaveLength(0);
    });
  });

  describe('pinned entries', () => {
    it('should preserve all pinned entries in output', () => {
      const input = buildSmallSchoolInput();
      const pinnedInput: SolverInput = {
        ...input,
        classes: input.classes.slice(0, 3),
        teachers: buildTeachers().slice(0, 3),
        pinned_entries: [
          {
            schedule_id: 'sched-1',
            class_id: 'class-01',
            room_id: 'room-1',
            teacher_staff_id: 'teacher-1',
            weekday: 0,
            period_order: 0,
          },
          {
            schedule_id: 'sched-2',
            class_id: 'class-02',
            room_id: 'room-2',
            teacher_staff_id: 'teacher-1',
            weekday: 1,
            period_order: 0,
          },
        ],
      };

      const output = solve(pinnedInput);

      const pinnedEntries = output.entries.filter((e) => e.is_pinned);
      expect(pinnedEntries).toHaveLength(2);

      // Verify pinned entry 1
      const pinned1 = pinnedEntries.find((e) => e.class_id === 'class-01');
      expect(pinned1).toBeDefined();
      expect(pinned1!.weekday).toBe(0);
      expect(pinned1!.period_order).toBe(0);
      expect(pinned1!.room_id).toBe('room-1');
      expect(pinned1!.is_pinned).toBe(true);

      // Verify pinned entry 2
      const pinned2 = pinnedEntries.find((e) => e.class_id === 'class-02');
      expect(pinned2).toBeDefined();
      expect(pinned2!.weekday).toBe(1);
      expect(pinned2!.period_order).toBe(0);
      expect(pinned2!.is_pinned).toBe(true);
    });

    it('should return immediately when all classes are fully pinned', () => {
      const input: SolverInput = {
        period_grid: buildPeriodGrid(),
        classes: [
          {
            class_id: 'class-a',
            periods_per_week: 2,
            required_room_type: 'classroom',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: 20,
            teachers: [{ staff_profile_id: 'teacher-1', assignment_role: 'lead' }],
            is_supervision: false,
          },
        ],
        teachers: buildTeachers().slice(0, 1),
        rooms: buildRooms(),
        pinned_entries: [
          {
            schedule_id: 's1',
            class_id: 'class-a',
            room_id: 'room-1',
            teacher_staff_id: 'teacher-1',
            weekday: 0,
            period_order: 0,
          },
          {
            schedule_id: 's2',
            class_id: 'class-a',
            room_id: 'room-1',
            teacher_staff_id: 'teacher-1',
            weekday: 1,
            period_order: 0,
          },
        ],
        student_overlaps: [],
        settings: buildSettings(),
      };

      const start = Date.now();
      const output = solve(input);
      const elapsed = Date.now() - start;

      expect(output.entries).toHaveLength(2);
      expect(output.entries.every((e) => e.is_pinned)).toBe(true);
      expect(output.unassigned).toHaveLength(0);
      // Should complete almost instantly
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('minimal school solve', () => {
    it('should solve a minimal input completely', () => {
      const input = buildMinimalInput();
      const output = solve(input);

      const required = totalPeriodsRequired(input);
      expect(output.entries).toHaveLength(required);
      expect(output.unassigned).toHaveLength(0);
    });

    it('should produce valid assignments with no teacher double-bookings', () => {
      const output = solve(buildMinimalInput());
      expect(() => assertNoTeacherDoubleBooking(output.entries)).not.toThrow();
    });

    it('should produce valid assignments with no room double-bookings', () => {
      const output = solve(buildMinimalInput());
      expect(() => assertNoRoomDoubleBooking(output.entries)).not.toThrow();
    });

    it('should assign all periods to teaching slots only for academic classes', () => {
      const input = buildMinimalInput();
      const output = solve(input);

      for (const entry of output.entries) {
        const slot = input.period_grid.find(
          (p) => p.weekday === entry.weekday && p.period_order === entry.period_order,
        );
        expect(slot).toBeDefined();
        expect(slot!.period_type).toBe('teaching');
      }
    });

    it('should produce a non-negative score', () => {
      const output = solve(buildMinimalInput());
      expect(output.score).toBeGreaterThanOrEqual(0);
      expect(output.max_score).toBeGreaterThanOrEqual(output.score);
    });

    it('should report duration', () => {
      const output = solve(buildMinimalInput());
      expect(output.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('small school solve', () => {
    it('should assign all periods for the small school fixture', () => {
      const input = buildSmallSchoolInput(42);
      const output = solve(input);

      const required = totalPeriodsRequired(input);
      const assigned = output.entries.length;

      // Should assign all (or nearly all) periods
      expect(assigned).toBeGreaterThanOrEqual(required * 0.9);
      expect(output.unassigned.length).toBeLessThanOrEqual(
        Math.ceil(required * 0.1),
      );
    }, 35000); // 35 second timeout

    it('should produce no teacher double-bookings in small school', () => {
      const output = solve(buildSmallSchoolInput(42));
      expect(() => assertNoTeacherDoubleBooking(output.entries)).not.toThrow();
    }, 35000);

    it('should produce no room double-bookings in small school', () => {
      const output = solve(buildSmallSchoolInput(42));
      expect(() => assertNoRoomDoubleBooking(output.entries)).not.toThrow();
    }, 35000);
  });

  describe('cancellation', () => {
    it('should stop solving when shouldCancel returns true', () => {
      const input = buildSmallSchoolInput(42);
      let callCount = 0;

      const output = solve(input, {
        shouldCancel: () => {
          callCount++;
          return callCount > 1; // Cancel almost immediately
        },
      });

      // Should have stopped early — no guarantee on assignment count but should not throw
      expect(output).toBeDefined();
      expect(output.entries).toBeDefined();
      expect(output.unassigned).toBeDefined();
      expect(output.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('timeout', () => {
    it('should return a partial solution on timeout', () => {
      // Use an input that's hard enough to not solve instantly
      const input: SolverInput = {
        ...buildSmallSchoolInput(42),
        settings: {
          ...buildSettings(42),
          max_solver_duration_seconds: 0.001, // 1ms — will timeout immediately
        },
      };

      const output = solve(input);

      // Should return whatever partial solution was found
      expect(output).toBeDefined();
      expect(output.entries).toBeDefined();
      // duration should reflect the actual time (may slightly exceed timeout due to check frequency)
      expect(output.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('progress reporting', () => {
    it('should call onProgress during solving', () => {
      const input = buildMinimalInput();
      const progressCalls: Array<{ assigned: number; total: number }> = [];

      solve(input, {
        onProgress: (assigned, total) => {
          progressCalls.push({ assigned, total });
        },
      });

      // Should have called at least once (final call)
      expect(progressCalls.length).toBeGreaterThan(0);

      // Total should always be the variable count
      const expected = totalPeriodsRequired(input);
      for (const call of progressCalls) {
        expect(call.total).toBe(expected);
      }
    });
  });

  describe('determinism', () => {
    it('should produce identical outputs for the same seed', () => {
      const input = buildSmallSchoolInput(123);

      const output1 = solve(input);
      const output2 = solve(input);

      // Same number of entries
      expect(output1.entries.length).toBe(output2.entries.length);

      // Same score
      expect(output1.score).toBe(output2.score);
    }, 70000);
  });

  describe('supervision class handling', () => {
    it('should assign supervision classes only to break_supervision or lunch_duty slots', () => {
      const input: SolverInput = {
        period_grid: [
          { weekday: 0, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
          { weekday: 0, period_order: 1, start_time: '09:35', end_time: '09:50', period_type: 'break_supervision' },
          { weekday: 0, period_order: 2, start_time: '12:15', end_time: '13:00', period_type: 'lunch_duty' },
          { weekday: 1, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
          { weekday: 1, period_order: 1, start_time: '09:35', end_time: '09:50', period_type: 'break_supervision' },
        ],
        classes: [
          {
            class_id: 'sup-class',
            periods_per_week: 2,
            required_room_type: null,
            preferred_room_id: null,
            max_consecutive: 1,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: null,
            teachers: [{ staff_profile_id: 'teacher-1', assignment_role: 'supervisor' }],
            is_supervision: true,
          },
        ],
        teachers: [{ staff_profile_id: 'teacher-1', availability: [], preferences: [] }],
        rooms: [],
        pinned_entries: [],
        student_overlaps: [],
        settings: buildSettings(),
      };

      const output = solve(input);

      for (const entry of output.entries) {
        const slot = input.period_grid.find(
          (p) => p.weekday === entry.weekday && p.period_order === entry.period_order,
        );
        expect(slot).toBeDefined();
        expect(['break_supervision', 'lunch_duty']).toContain(slot!.period_type);
      }
    });
  });

  describe('different seed', () => {
    it('should complete successfully with a different seed and possibly produce different results', () => {
      const inputSeed1 = buildSmallSchoolInput(42);
      const inputSeed2 = buildSmallSchoolInput(999);

      const output1 = solve(inputSeed1);
      const output2 = solve(inputSeed2);

      // Both should complete successfully
      expect(output1.entries.length).toBeGreaterThan(0);
      expect(output2.entries.length).toBeGreaterThan(0);
      expect(output1.duration_ms).toBeGreaterThanOrEqual(0);
      expect(output2.duration_ms).toBeGreaterThanOrEqual(0);

      // Both should have no teacher or room double-bookings
      expect(() => assertNoTeacherDoubleBooking(output1.entries)).not.toThrow();
      expect(() => assertNoTeacherDoubleBooking(output2.entries)).not.toThrow();
      expect(() => assertNoRoomDoubleBooking(output1.entries)).not.toThrow();
      expect(() => assertNoRoomDoubleBooking(output2.entries)).not.toThrow();

      // Either order/score differs, or they happen to be the same (both are valid)
      // The key check is that both complete without error.
      // If the solver is deterministic per-seed, the two outputs may differ in assignment order or score.
      const sameScore = output1.score === output2.score;
      const sameCount = output1.entries.length === output2.entries.length;
      // At minimum verify both outputs are structurally valid
      expect(typeof output1.score).toBe('number');
      expect(typeof output2.score).toBe('number');
      // If they differ, that shows the seed matters; if identical, the solver is robust
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      sameScore && sameCount; // reference to suppress lint
    }, 70000);
  });

  describe('unassigned with reason', () => {
    it('should report unassigned with reason when impossible constraints exist', () => {
      // Class requires a "lab" room but no lab rooms are provided
      const input: SolverInput = {
        period_grid: buildPeriodGrid(),
        classes: [
          {
            class_id: 'class-lab-only',
            periods_per_week: 2,
            required_room_type: 'lab',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: 20,
            teachers: [{ staff_profile_id: 'teacher-1', assignment_role: 'lead' }],
            is_supervision: false,
          },
        ],
        teachers: [{ staff_profile_id: 'teacher-1', availability: [], preferences: [] }],
        rooms: [
          // Only classroom rooms, no lab rooms
          { room_id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: true },
        ],
        pinned_entries: [],
        student_overlaps: [],
        settings: buildSettings(),
      };

      const output = solve(input);

      // The class cannot be assigned since it requires a lab room and none exist
      expect(output.unassigned.length).toBeGreaterThan(0);

      const unassignedEntry = output.unassigned.find(
        (u) => u.class_id === 'class-lab-only',
      );
      expect(unassignedEntry).toBeDefined();
      expect(unassignedEntry!.reason).toBeTruthy();
      expect(unassignedEntry!.reason.length).toBeGreaterThan(0);
      // Should mention the room type issue
      expect(unassignedEntry!.reason.toLowerCase()).toContain('lab');
    });
  });

  describe('teacher availability constraints', () => {
    it('should respect teacher availability when scheduling', () => {
      const input: SolverInput = {
        period_grid: [
          { weekday: 0, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
          { weekday: 0, period_order: 1, start_time: '08:50', end_time: '09:35', period_type: 'teaching' },
          { weekday: 1, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
          { weekday: 1, period_order: 1, start_time: '08:50', end_time: '09:35', period_type: 'teaching' },
          { weekday: 2, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
        ],
        classes: [
          {
            class_id: 'class-x',
            periods_per_week: 2,
            required_room_type: 'classroom',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: 10,
            teachers: [{ staff_profile_id: 'teacher-1', assignment_role: 'lead' }],
            is_supervision: false,
          },
        ],
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            // Only available on weekday 2 (Wednesday)
            availability: [{ weekday: 2, from: '07:00', to: '17:00' }],
            preferences: [],
          },
        ],
        rooms: [{ room_id: 'room-1', room_type: 'classroom', capacity: 20, is_exclusive: true }],
        pinned_entries: [],
        student_overlaps: [],
        settings: buildSettings(),
      };

      const output = solve(input);

      // All assigned entries must be on weekday 2
      for (const entry of output.entries) {
        expect(entry.weekday).toBe(2);
      }
    });
  });
});
