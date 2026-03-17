import { checkHardConstraints } from '../constraints';
import type {
  SolverInput,
  SolverAssignment,
  CSPVariable,
  DomainValue,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<SolverInput> = {}): SolverInput {
  const base: SolverInput = {
    period_grid: [
      { weekday: 0, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
      { weekday: 0, period_order: 1, start_time: '08:50', end_time: '09:35', period_type: 'teaching' },
      { weekday: 0, period_order: 2, start_time: '09:35', end_time: '09:50', period_type: 'break_supervision' },
      { weekday: 0, period_order: 3, start_time: '09:50', end_time: '10:35', period_type: 'teaching' },
      { weekday: 0, period_order: 4, start_time: '10:40', end_time: '11:25', period_type: 'teaching' },
      { weekday: 1, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
      { weekday: 1, period_order: 1, start_time: '08:50', end_time: '09:35', period_type: 'teaching' },
    ],
    classes: [
      {
        class_id: 'class-a',
        periods_per_week: 3,
        required_room_type: 'classroom',
        preferred_room_id: null,
        max_consecutive: 2,
        min_consecutive: 1,
        spread_preference: 'spread_evenly',
        student_count: 20,
        teachers: [{ staff_profile_id: 'teacher-1', assignment_role: 'lead' }],
        is_supervision: false,
      },
      {
        class_id: 'class-b',
        periods_per_week: 2,
        required_room_type: 'classroom',
        preferred_room_id: null,
        max_consecutive: 2,
        min_consecutive: 1,
        spread_preference: 'no_preference',
        student_count: 15,
        teachers: [{ staff_profile_id: 'teacher-2', assignment_role: 'lead' }],
        is_supervision: false,
      },
      {
        class_id: 'class-sup',
        periods_per_week: 1,
        required_room_type: null,
        preferred_room_id: null,
        max_consecutive: 1,
        min_consecutive: 1,
        spread_preference: 'no_preference',
        student_count: null,
        teachers: [{ staff_profile_id: 'teacher-3', assignment_role: 'supervisor' }],
        is_supervision: true,
      },
    ],
    teachers: [
      {
        staff_profile_id: 'teacher-1',
        availability: [],
        preferences: [],
      },
      {
        staff_profile_id: 'teacher-2',
        availability: [],
        preferences: [],
      },
      {
        staff_profile_id: 'teacher-3',
        availability: [],
        preferences: [],
      },
    ],
    rooms: [
      { room_id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: true },
      { room_id: 'room-2', room_type: 'classroom', capacity: 30, is_exclusive: true },
      { room_id: 'room-shared', room_type: 'resource', capacity: 50, is_exclusive: false },
    ],
    pinned_entries: [],
    student_overlaps: [],
    settings: {
      max_solver_duration_seconds: 10,
      preference_weights: { low: 1, medium: 3, high: 5 },
      global_soft_weights: { even_subject_spread: 1, minimise_teacher_gaps: 1, room_consistency: 1, workload_balance: 1 },
      solver_seed: 42,
    },
  };
  return { ...base, ...overrides };
}

function makeAssignment(overrides: Partial<SolverAssignment> = {}): SolverAssignment {
  return {
    class_id: 'class-b',
    room_id: 'room-2',
    teacher_staff_id: 'teacher-2',
    weekday: 0,
    period_order: 0,
    start_time: '08:00',
    end_time: '08:45',
    is_pinned: false,
    preference_satisfaction: [],
    ...overrides,
  };
}

function makeVariable(class_id: string, variable_index = 0): CSPVariable {
  return { class_id, variable_index };
}

function makeValue(weekday: number, period_order: number, room_id: string | null = 'room-1'): DomainValue {
  return { weekday, period_order, room_id };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('checkHardConstraints', () => {

  describe('valid assignment', () => {
    it('should return null for a completely valid assignment', () => {
      const input = makeInput();
      const result = checkHardConstraints(input, [], makeVariable('class-a'), makeValue(0, 0));
      expect(result).toBeNull();
    });
  });

  describe('teacher double-booking', () => {
    it('should detect teacher double-booking when same teacher is already assigned at that slot', () => {
      const input = makeInput();
      // class-a uses teacher-1; assign another class also using teacher-1 at the same slot
      const inputWithSharedTeacher = makeInput({
        classes: [
          ...input.classes,
          {
            class_id: 'class-c',
            periods_per_week: 1,
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
      });

      const existingAssignment = makeAssignment({
        class_id: 'class-c',
        teacher_staff_id: 'teacher-1',
        weekday: 0,
        period_order: 0,
      });

      const result = checkHardConstraints(
        inputWithSharedTeacher,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toContain('teacher-1');
      expect(result).toContain('already assigned');
    });

    it('should allow different teachers at the same slot', () => {
      const input = makeInput();
      const existingAssignment = makeAssignment({
        class_id: 'class-b',
        teacher_staff_id: 'teacher-2',
        weekday: 0,
        period_order: 0,
      });

      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toBeNull();
    });

    it('should allow the same class to be checked (no self-conflict)', () => {
      const input = makeInput();
      // class-a is being assigned to weekday=0, period=0
      // There's a different period of class-a already at weekday=1, period=0
      const existingAssignment = makeAssignment({
        class_id: 'class-a',
        teacher_staff_id: 'teacher-1',
        weekday: 1,
        period_order: 0,
      });

      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toBeNull();
    });
  });

  describe('room double-booking (exclusive)', () => {
    it('should detect exclusive room double-booking', () => {
      const input = makeInput();
      const existingAssignment = makeAssignment({
        class_id: 'class-b',
        room_id: 'room-1',
        teacher_staff_id: 'teacher-2',
        weekday: 0,
        period_order: 0,
      });

      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0, 'room-1'),
      );

      expect(result).toContain('room-1');
      expect(result).toContain('exclusive');
    });

    it('should allow a different exclusive room at the same slot', () => {
      const input = makeInput();
      const existingAssignment = makeAssignment({
        class_id: 'class-b',
        room_id: 'room-2',
        teacher_staff_id: 'teacher-2',
        weekday: 0,
        period_order: 0,
      });

      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0, 'room-1'),
      );

      expect(result).toBeNull();
    });
  });

  describe('room capacity (non-exclusive)', () => {
    it('should detect capacity overflow for non-exclusive room', () => {
      const input = makeInput({
        classes: [
          {
            class_id: 'class-a',
            periods_per_week: 3,
            required_room_type: 'resource',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: 30,
            teachers: [{ staff_profile_id: 'teacher-1', assignment_role: 'lead' }],
            is_supervision: false,
          },
          {
            class_id: 'class-b',
            periods_per_week: 2,
            required_room_type: 'resource',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: 25,
            teachers: [{ staff_profile_id: 'teacher-2', assignment_role: 'lead' }],
            is_supervision: false,
          },
        ],
      });

      // class-b (25 students) already in room-shared (capacity 50)
      const existingAssignment = makeAssignment({
        class_id: 'class-b',
        room_id: 'room-shared',
        teacher_staff_id: 'teacher-2',
        weekday: 0,
        period_order: 0,
        is_pinned: false,
      });

      // class-a (30 students) wants to join — total would be 55 > 50
      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0, 'room-shared'),
      );

      expect(result).toContain('capacity');
      expect(result).toContain('50');
    });

    it('should allow non-exclusive room when capacity is sufficient', () => {
      const input = makeInput({
        classes: [
          {
            class_id: 'class-a',
            periods_per_week: 3,
            required_room_type: 'resource',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: 15,
            teachers: [{ staff_profile_id: 'teacher-1', assignment_role: 'lead' }],
            is_supervision: false,
          },
          {
            class_id: 'class-b',
            periods_per_week: 2,
            required_room_type: 'resource',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: 20,
            teachers: [{ staff_profile_id: 'teacher-2', assignment_role: 'lead' }],
            is_supervision: false,
          },
        ],
      });

      const existingAssignment = makeAssignment({
        class_id: 'class-b',
        room_id: 'room-shared',
        teacher_staff_id: 'teacher-2',
        weekday: 0,
        period_order: 0,
        is_pinned: false,
      });

      // class-a (15) + class-b (20) = 35 < 50 — OK
      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0, 'room-shared'),
      );

      expect(result).toBeNull();
    });
  });

  describe('student overlap detection', () => {
    it('should detect student overlap when two overlapping classes are in the same slot', () => {
      const input = makeInput({
        student_overlaps: [{ class_id_a: 'class-a', class_id_b: 'class-b' }],
      });

      const existingAssignment = makeAssignment({
        class_id: 'class-b',
        room_id: 'room-2',
        teacher_staff_id: 'teacher-2',
        weekday: 0,
        period_order: 0,
      });

      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toContain('students');
      expect(result).toContain('class-b');
    });

    it('should detect student overlap regardless of which class is class_id_a or class_id_b', () => {
      const input = makeInput({
        student_overlaps: [{ class_id_a: 'class-b', class_id_b: 'class-a' }],
      });

      const existingAssignment = makeAssignment({
        class_id: 'class-b',
        teacher_staff_id: 'teacher-2',
        weekday: 0,
        period_order: 0,
      });

      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toContain('students');
    });

    it('should allow non-overlapping classes in the same slot', () => {
      const input = makeInput({
        student_overlaps: [],
      });

      const existingAssignment = makeAssignment({
        class_id: 'class-b',
        teacher_staff_id: 'teacher-2',
        weekday: 0,
        period_order: 0,
      });

      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toBeNull();
    });
  });

  describe('teacher availability enforcement', () => {
    it('should reject assignment when teacher has no availability on that weekday', () => {
      const input = makeInput({
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            // Only available Monday (weekday 0) — not Tuesday (weekday 1)
            availability: [{ weekday: 0, from: '08:00', to: '17:00' }],
            preferences: [],
          },
          {
            staff_profile_id: 'teacher-2',
            availability: [],
            preferences: [],
          },
          {
            staff_profile_id: 'teacher-3',
            availability: [],
            preferences: [],
          },
        ],
      });

      // Try to assign class-a (teacher-1) to Tuesday (weekday=1)
      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-a'),
        makeValue(1, 0),
      );

      expect(result).toContain('teacher-1');
      expect(result).toContain('weekday 1');
    });

    it('should reject assignment when teacher availability window does not cover the period', () => {
      const input = makeInput({
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            // Only available 10:00–17:00
            availability: [{ weekday: 0, from: '10:00', to: '17:00' }],
            preferences: [],
          },
          {
            staff_profile_id: 'teacher-2',
            availability: [],
            preferences: [],
          },
          {
            staff_profile_id: 'teacher-3',
            availability: [],
            preferences: [],
          },
        ],
      });

      // Period 0 is 08:00–08:45 — teacher-1 only available from 10:00
      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toContain('teacher-1');
      expect(result).toContain('not available');
    });

    it('should allow assignment when teacher availability covers the period', () => {
      const input = makeInput({
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            availability: [{ weekday: 0, from: '07:30', to: '16:00' }],
            preferences: [],
          },
          {
            staff_profile_id: 'teacher-2',
            availability: [],
            preferences: [],
          },
          {
            staff_profile_id: 'teacher-3',
            availability: [],
            preferences: [],
          },
        ],
      });

      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toBeNull();
    });

    it('should allow fully available teacher (no availability rows)', () => {
      const input = makeInput();
      // teacher-1 has no availability rows → fully available
      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toBeNull();
    });
  });

  describe('period type matching', () => {
    it('should reject academic class in a break_supervision slot', () => {
      const input = makeInput();
      // period_order=2 is break_supervision
      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-a'),
        makeValue(0, 2),
      );

      expect(result).toContain('teaching slot');
    });

    it('should allow academic class in a teaching slot', () => {
      const input = makeInput();
      // period_order=0 is teaching
      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-a'),
        makeValue(0, 0),
      );

      expect(result).toBeNull();
    });

    it('should reject supervision class in a teaching slot', () => {
      const input = makeInput();
      // class-sup is supervision; period_order=0 is teaching
      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-sup'),
        makeValue(0, 0, null),
      );

      expect(result).toContain('break_supervision or lunch_duty');
    });

    it('should allow supervision class in a break_supervision slot', () => {
      const input = makeInput();
      // period_order=2 is break_supervision
      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-sup'),
        makeValue(0, 2, null),
      );

      expect(result).toBeNull();
    });
  });

  describe('max consecutive enforcement', () => {
    it('should reject assignment that exceeds max_consecutive', () => {
      const input = makeInput();
      // class-a has max_consecutive=2
      // Already assigned to periods 0 and 1 on weekday 0
      const existingAssignments: SolverAssignment[] = [
        makeAssignment({ class_id: 'class-a', teacher_staff_id: 'teacher-1', weekday: 0, period_order: 0, room_id: 'room-1' }),
        makeAssignment({ class_id: 'class-a', teacher_staff_id: 'teacher-1', weekday: 0, period_order: 1, room_id: 'room-1' }),
      ];

      // Trying to assign period 3 (consecutive with 0,1) — would make 3 consecutive
      const result = checkHardConstraints(
        input,
        existingAssignments,
        makeVariable('class-a', 2),
        makeValue(0, 3),
      );

      expect(result).toContain('consecutive');
    });

    it('should allow assignment that does not exceed max_consecutive', () => {
      const input = makeInput();
      // class-a has max_consecutive=2
      // Only one existing period on weekday 0
      const existingAssignments: SolverAssignment[] = [
        makeAssignment({ class_id: 'class-a', teacher_staff_id: 'teacher-1', weekday: 0, period_order: 0, room_id: 'room-1' }),
      ];

      // Assigning period 1 — would make 2 consecutive, which equals max
      const result = checkHardConstraints(
        input,
        existingAssignments,
        makeVariable('class-a', 1),
        makeValue(0, 1),
      );

      expect(result).toBeNull();
    });

    it('should allow non-consecutive periods even with many on same day', () => {
      const input = makeInput({
        classes: [
          {
            class_id: 'class-a',
            periods_per_week: 4,
            required_room_type: 'classroom',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: 20,
            teachers: [{ staff_profile_id: 'teacher-1', assignment_role: 'lead' }],
            is_supervision: false,
          },
          ...makeInput().classes.slice(1),
        ],
      });

      // Periods 0 and 3 are not consecutive (break between 1 and 3 = non-teaching period 2)
      const existingAssignments: SolverAssignment[] = [
        makeAssignment({ class_id: 'class-a', teacher_staff_id: 'teacher-1', weekday: 0, period_order: 0, room_id: 'room-1' }),
      ];

      // Adding period 3 (separated from period 0 by non-teaching period 2)
      const result = checkHardConstraints(
        input,
        existingAssignments,
        makeVariable('class-a', 1),
        makeValue(0, 3),
      );

      expect(result).toBeNull();
    });
  });

  describe('room type matching', () => {
    it('should reject assignment to wrong room type', () => {
      const input = makeInput({
        rooms: [
          { room_id: 'room-lab', room_type: 'lab', capacity: 20, is_exclusive: true },
          { room_id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: true },
          { room_id: 'room-2', room_type: 'classroom', capacity: 30, is_exclusive: true },
          { room_id: 'room-shared', room_type: 'resource', capacity: 50, is_exclusive: false },
        ],
      });

      // class-a requires 'classroom', but we propose 'room-lab' which is type 'lab'
      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-a'),
        makeValue(0, 0, 'room-lab'),
      );

      expect(result).toContain('classroom');
      expect(result).toContain('lab');
    });

    it('should accept assignment to matching room type', () => {
      const input = makeInput();

      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-a'),
        makeValue(0, 0, 'room-1'), // room-1 is type 'classroom'
      );

      expect(result).toBeNull();
    });
  });

  describe('teacher double-booking with multi-teacher class', () => {
    it('should detect double-booking when one of multiple teachers is already assigned elsewhere', () => {
      // class-d has two teachers: teacher-1 and teacher-4.
      // teacher-4 is already assigned to another class at the same slot.
      const input = makeInput({
        classes: [
          ...makeInput().classes,
          {
            class_id: 'class-d',
            periods_per_week: 2,
            required_room_type: 'classroom',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'no_preference',
            student_count: 15,
            teachers: [
              { staff_profile_id: 'teacher-1', assignment_role: 'lead' },
              { staff_profile_id: 'teacher-4', assignment_role: 'assistant' },
            ],
            is_supervision: false,
          },
        ],
        teachers: [
          ...makeInput().teachers,
          {
            staff_profile_id: 'teacher-4',
            availability: [],
            preferences: [],
          },
        ],
      });

      // teacher-4 is already assigned to class-b at weekday=0, period=0
      const existingAssignment = makeAssignment({
        class_id: 'class-b',
        teacher_staff_id: 'teacher-4',
        room_id: 'room-2',
        weekday: 0,
        period_order: 0,
      });

      const result = checkHardConstraints(
        input,
        [existingAssignment],
        makeVariable('class-d'),
        makeValue(0, 0),
      );

      expect(result).not.toBeNull();
      expect(result).toContain('teacher-4');
      expect(result).toContain('already assigned');
    });
  });

  describe('teacher availability (partial coverage)', () => {
    it('should reject when teacher availability window only partially covers the period', () => {
      // Teacher available 08:00-12:00. Period is 11:30-12:30 -- end extends past availability.
      const input = makeInput({
        period_grid: [
          ...makeInput().period_grid,
          { weekday: 0, period_order: 5, start_time: '11:30', end_time: '12:30', period_type: 'teaching' },
        ],
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            availability: [{ weekday: 0, from: '08:00', to: '12:00' }],
            preferences: [],
          },
          {
            staff_profile_id: 'teacher-2',
            availability: [],
            preferences: [],
          },
          {
            staff_profile_id: 'teacher-3',
            availability: [],
            preferences: [],
          },
        ],
      });

      // Period 5 is 11:30-12:30. Teacher available until 12:00 only.
      // The period is NOT fully contained within the availability window.
      const result = checkHardConstraints(
        input,
        [],
        makeVariable('class-a'),
        makeValue(0, 5),
      );

      expect(result).not.toBeNull();
      expect(result).toContain('teacher-1');
      expect(result).toContain('not available');
    });
  });
});
