import { scorePreferences } from '../preferences';
import type {
  SolverInput,
  SolverAssignment,
  TeacherPreference,
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
      { weekday: 2, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
      { weekday: 2, period_order: 1, start_time: '08:50', end_time: '09:35', period_type: 'teaching' },
      { weekday: 3, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
      { weekday: 3, period_order: 1, start_time: '08:50', end_time: '09:35', period_type: 'teaching' },
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
    ],
    teachers: [
      {
        staff_profile_id: 'teacher-1',
        availability: [],
        preferences: [],
      },
    ],
    rooms: [
      { room_id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: true },
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
    class_id: 'class-a',
    room_id: 'room-1',
    teacher_staff_id: 'teacher-1',
    weekday: 0,
    period_order: 0,
    start_time: '08:00',
    end_time: '08:45',
    is_pinned: false,
    preference_satisfaction: [],
    ...overrides,
  };
}

function makePreference(overrides: Partial<TeacherPreference> & Pick<TeacherPreference, 'preference_type' | 'preference_payload'>): TeacherPreference {
  return {
    id: 'pref-1',
    priority: 'medium',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('scorePreferences', () => {

  describe('time slot preference (prefer)', () => {
    it('should be satisfied when teacher is assigned to preferred time slot', () => {
      const input = makeInput({
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            availability: [],
            preferences: [
              makePreference({
                id: 'pref-time-prefer',
                preference_type: 'time_slot',
                preference_payload: { weekday: 0, period_order: 0, preferred: true },
                priority: 'medium',
              }),
            ],
          },
        ],
      });

      // Teacher is assigned to weekday=0, period_order=0
      const assignments: SolverAssignment[] = [
        makeAssignment({ weekday: 0, period_order: 0 }),
      ];

      const result = scorePreferences(input, assignments);

      const entry = result.per_entry_satisfaction.find(
        (e) => e.preference_id === 'pref-time-prefer',
      );
      expect(entry).toBeDefined();
      expect(entry!.satisfied).toBe(true);
    });
  });

  describe('time slot preference (avoid)', () => {
    it('should not be satisfied when teacher is assigned to avoided weekday', () => {
      const input = makeInput({
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            availability: [],
            preferences: [
              makePreference({
                id: 'pref-time-avoid',
                preference_type: 'time_slot',
                preference_payload: { weekday: 1, preferred: false },
                priority: 'medium',
              }),
            ],
          },
        ],
      });

      // Teacher is assigned to weekday=1 (the avoided weekday)
      const assignments: SolverAssignment[] = [
        makeAssignment({ weekday: 1, period_order: 0 }),
      ];

      const result = scorePreferences(input, assignments);

      const entry = result.per_entry_satisfaction.find(
        (e) => e.preference_id === 'pref-time-avoid',
      );
      expect(entry).toBeDefined();
      expect(entry!.satisfied).toBe(false);
    });
  });

  describe('class preference (prefer)', () => {
    it('should be satisfied when teacher is assigned to preferred class', () => {
      const input = makeInput({
        classes: [
          {
            class_id: 'class-x',
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
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            availability: [],
            preferences: [
              makePreference({
                id: 'pref-class-prefer',
                preference_type: 'class_pref',
                preference_payload: { class_id: 'class-x', preferred: true },
                priority: 'medium',
              }),
            ],
          },
        ],
      });

      // Teacher is assigned to class-x
      const assignments: SolverAssignment[] = [
        makeAssignment({ class_id: 'class-x', weekday: 0, period_order: 0 }),
      ];

      const result = scorePreferences(input, assignments);

      const entry = result.per_entry_satisfaction.find(
        (e) => e.preference_id === 'pref-class-prefer',
      );
      expect(entry).toBeDefined();
      expect(entry!.satisfied).toBe(true);
    });
  });

  describe('class preference (avoid)', () => {
    it('should not be satisfied when teacher is assigned to avoided class', () => {
      const input = makeInput({
        classes: [
          {
            class_id: 'class-y',
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
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            availability: [],
            preferences: [
              makePreference({
                id: 'pref-class-avoid',
                preference_type: 'class_pref',
                preference_payload: { class_id: 'class-y', preferred: false },
                priority: 'medium',
              }),
            ],
          },
        ],
      });

      // Teacher is assigned to class-y (the avoided class)
      const assignments: SolverAssignment[] = [
        makeAssignment({ class_id: 'class-y', weekday: 0, period_order: 0 }),
      ];

      const result = scorePreferences(input, assignments);

      const entry = result.per_entry_satisfaction.find(
        (e) => e.preference_id === 'pref-class-avoid',
      );
      expect(entry).toBeDefined();
      expect(entry!.satisfied).toBe(false);
    });
  });

  describe('priority weighting', () => {
    it('should assign correct weights based on priority (high=5, low=1)', () => {
      const input = makeInput({
        teachers: [
          {
            staff_profile_id: 'teacher-1',
            availability: [],
            preferences: [
              makePreference({
                id: 'pref-high',
                preference_type: 'time_slot',
                preference_payload: { weekday: 0, preferred: true },
                priority: 'high',
              }),
              makePreference({
                id: 'pref-low',
                preference_type: 'time_slot',
                preference_payload: { weekday: 1, preferred: true },
                priority: 'low',
              }),
            ],
          },
        ],
      });

      // Both preferences are satisfied
      const assignments: SolverAssignment[] = [
        makeAssignment({ weekday: 0, period_order: 0 }),
        makeAssignment({ weekday: 1, period_order: 0 }),
      ];

      const result = scorePreferences(input, assignments);

      const highEntry = result.per_entry_satisfaction.find(
        (e) => e.preference_id === 'pref-high',
      );
      const lowEntry = result.per_entry_satisfaction.find(
        (e) => e.preference_id === 'pref-low',
      );

      expect(highEntry).toBeDefined();
      expect(lowEntry).toBeDefined();
      expect(highEntry!.weight).toBe(5);
      expect(lowEntry!.weight).toBe(1);

      // Both satisfied, so verify correct weights are used in score
      expect(highEntry!.satisfied).toBe(true);
      expect(lowEntry!.satisfied).toBe(true);
    });
  });

  describe('even spread scoring', () => {
    it('should score higher for evenly distributed periods than unevenly distributed', () => {
      // Use only the global even_subject_spread weight, disable others
      const baseSettings = {
        max_solver_duration_seconds: 10,
        preference_weights: { low: 1, medium: 3, high: 5 },
        global_soft_weights: { even_subject_spread: 10, minimise_teacher_gaps: 0, room_consistency: 0, workload_balance: 0 },
        solver_seed: 42,
      };

      const input = makeInput({
        classes: [
          {
            class_id: 'class-spread',
            periods_per_week: 4,
            required_room_type: 'classroom',
            preferred_room_id: null,
            max_consecutive: 2,
            min_consecutive: 1,
            spread_preference: 'spread_evenly',
            student_count: 20,
            teachers: [{ staff_profile_id: 'teacher-1', assignment_role: 'lead' }],
            is_supervision: false,
          },
        ],
        settings: baseSettings,
      });

      // 4 periods evenly spread: 1 per day across 4 days (perfectly even distribution)
      const evenAssignments: SolverAssignment[] = [
        makeAssignment({ class_id: 'class-spread', weekday: 0, period_order: 0 }),
        makeAssignment({ class_id: 'class-spread', weekday: 1, period_order: 0 }),
        makeAssignment({ class_id: 'class-spread', weekday: 2, period_order: 0 }),
        makeAssignment({ class_id: 'class-spread', weekday: 3, period_order: 0 }),
      ];

      // 4 periods unevenly distributed: 3 on one day + 1 on another
      const unevenAssignments: SolverAssignment[] = [
        makeAssignment({ class_id: 'class-spread', weekday: 0, period_order: 0 }),
        makeAssignment({ class_id: 'class-spread', weekday: 0, period_order: 1 }),
        makeAssignment({ class_id: 'class-spread', weekday: 0, period_order: 3 }),
        makeAssignment({ class_id: 'class-spread', weekday: 1, period_order: 0 }),
      ];

      const evenScore = scorePreferences(input, evenAssignments);
      const unevenScore = scorePreferences(input, unevenAssignments);

      // Evenly distributed periods should score higher than unevenly distributed
      expect(evenScore.score).toBeGreaterThan(unevenScore.score);
    });
  });

  describe('teacher gap minimization scoring', () => {
    it('should score higher for consecutive periods (0 gaps) than periods with gaps', () => {
      // Use only the minimise_teacher_gaps weight, disable others
      const baseSettings = {
        max_solver_duration_seconds: 10,
        preference_weights: { low: 1, medium: 3, high: 5 },
        global_soft_weights: { even_subject_spread: 0, minimise_teacher_gaps: 10, room_consistency: 0, workload_balance: 0 },
        solver_seed: 42,
      };

      const input = makeInput({
        classes: [
          {
            class_id: 'class-gap',
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
        settings: baseSettings,
      });

      // Periods 1 and 4 on same day (2 gaps: periods 2,3 are idle between them)
      const gappyAssignments: SolverAssignment[] = [
        makeAssignment({ class_id: 'class-gap', weekday: 0, period_order: 0 }),
        makeAssignment({ class_id: 'class-gap', weekday: 0, period_order: 4 }),
      ];

      // Periods 0 and 1 on same day (0 gaps: consecutive)
      const consecutiveAssignments: SolverAssignment[] = [
        makeAssignment({ class_id: 'class-gap', weekday: 0, period_order: 0 }),
        makeAssignment({ class_id: 'class-gap', weekday: 0, period_order: 1 }),
      ];

      const gappyScore = scorePreferences(input, gappyAssignments);
      const consecutiveScore = scorePreferences(input, consecutiveAssignments);

      // Consecutive periods (no gaps) should score higher
      expect(consecutiveScore.score).toBeGreaterThan(gappyScore.score);
    });
  });
});
