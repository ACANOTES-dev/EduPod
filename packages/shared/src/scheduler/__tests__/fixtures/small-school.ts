import type {
  SolverInput,
  PeriodSlot,
  ClassRequirement,
  TeacherInfo,
  RoomInfo,
  SolverSettings,
} from '../../types';

/**
 * Small school fixture: 10 teachers, 20 classes, 5 rooms, ~35 teaching periods/week.
 * Monday–Friday (weekdays 0–4), 7 teaching periods per day.
 */

// ─── Period grid ─────────────────────────────────────────────────────────────
// 5 days × 7 teaching periods + 5 breaks = 40 slots total
const PERIOD_TIMES: Array<{ start: string; end: string }> = [
  { start: '08:00', end: '08:45' },
  { start: '08:50', end: '09:35' },
  { start: '09:35', end: '09:50' }, // break
  { start: '09:50', end: '10:35' },
  { start: '10:40', end: '11:25' },
  { start: '11:30', end: '12:15' },
  { start: '12:15', end: '13:00' }, // lunch
  { start: '13:00', end: '13:45' },
  { start: '13:50', end: '14:35' },
];

const PERIOD_TYPES: Array<PeriodSlot['period_type']> = [
  'teaching',       // p1
  'teaching',       // p2
  'break_supervision', // break
  'teaching',       // p3
  'teaching',       // p4
  'teaching',       // p5
  'lunch_duty',     // lunch
  'teaching',       // p6
  'teaching',       // p7
];

export function buildPeriodGrid(): PeriodSlot[] {
  const grid: PeriodSlot[] = [];
  for (let weekday = 0; weekday < 5; weekday++) {
    for (let po = 0; po < PERIOD_TIMES.length; po++) {
      const times = PERIOD_TIMES[po]!;
      grid.push({
        weekday,
        period_order: po,
        start_time: times.start,
        end_time: times.end,
        period_type: PERIOD_TYPES[po]!,
      });
    }
  }
  return grid;
}

// ─── Rooms ───────────────────────────────────────────────────────────────────
export function buildRooms(): RoomInfo[] {
  return [
    { room_id: 'room-1', room_type: 'classroom', capacity: 35, is_exclusive: true },
    { room_id: 'room-2', room_type: 'classroom', capacity: 35, is_exclusive: true },
    { room_id: 'room-3', room_type: 'classroom', capacity: 35, is_exclusive: true },
    { room_id: 'room-4', room_type: 'lab',       capacity: 25, is_exclusive: true },
    { room_id: 'room-5', room_type: 'gym',       capacity: 60, is_exclusive: true },
  ];
}

// ─── Teachers ────────────────────────────────────────────────────────────────
export function buildTeachers(): TeacherInfo[] {
  const teachers: TeacherInfo[] = [];
  for (let i = 1; i <= 10; i++) {
    teachers.push({
      staff_profile_id: `teacher-${i}`,
      availability: [], // fully available
      preferences: [],
    });
  }
  return teachers;
}

// ─── Classes ─────────────────────────────────────────────────────────────────
// 20 academic classes distributed across 10 teachers (2 classes each teacher).
// Mostly classroom, a few lab and gym.
export function buildClasses(): ClassRequirement[] {
  const defs: Array<{
    id: string;
    teacher: string;
    periods: number;
    roomType: string;
    preferred?: string;
    max_consec: number;
  }> = [
    { id: 'class-01', teacher: 'teacher-1',  periods: 5, roomType: 'classroom', preferred: 'room-1', max_consec: 3 },
    { id: 'class-02', teacher: 'teacher-1',  periods: 3, roomType: 'classroom', preferred: 'room-1', max_consec: 2 },
    { id: 'class-03', teacher: 'teacher-2',  periods: 5, roomType: 'classroom', preferred: 'room-2', max_consec: 3 },
    { id: 'class-04', teacher: 'teacher-2',  periods: 3, roomType: 'classroom', preferred: 'room-2', max_consec: 2 },
    { id: 'class-05', teacher: 'teacher-3',  periods: 5, roomType: 'classroom', preferred: 'room-3', max_consec: 3 },
    { id: 'class-06', teacher: 'teacher-3',  periods: 3, roomType: 'classroom', preferred: 'room-3', max_consec: 2 },
    { id: 'class-07', teacher: 'teacher-4',  periods: 4, roomType: 'classroom', max_consec: 3 },
    { id: 'class-08', teacher: 'teacher-4',  periods: 2, roomType: 'lab',       max_consec: 2 },
    { id: 'class-09', teacher: 'teacher-5',  periods: 4, roomType: 'classroom', max_consec: 3 },
    { id: 'class-10', teacher: 'teacher-5',  periods: 2, roomType: 'lab',       max_consec: 2 },
    { id: 'class-11', teacher: 'teacher-6',  periods: 4, roomType: 'classroom', max_consec: 3 },
    { id: 'class-12', teacher: 'teacher-6',  periods: 2, roomType: 'gym',       max_consec: 1 },
    { id: 'class-13', teacher: 'teacher-7',  periods: 4, roomType: 'classroom', max_consec: 3 },
    { id: 'class-14', teacher: 'teacher-7',  periods: 2, roomType: 'gym',       max_consec: 1 },
    { id: 'class-15', teacher: 'teacher-8',  periods: 3, roomType: 'classroom', max_consec: 2 },
    { id: 'class-16', teacher: 'teacher-8',  periods: 2, roomType: 'classroom', max_consec: 2 },
    { id: 'class-17', teacher: 'teacher-9',  periods: 3, roomType: 'classroom', max_consec: 2 },
    { id: 'class-18', teacher: 'teacher-9',  periods: 2, roomType: 'classroom', max_consec: 2 },
    { id: 'class-19', teacher: 'teacher-10', periods: 3, roomType: 'classroom', max_consec: 2 },
    { id: 'class-20', teacher: 'teacher-10', periods: 2, roomType: 'classroom', max_consec: 2 },
  ];

  return defs.map((d) => ({
    class_id: d.id,
    periods_per_week: d.periods,
    required_room_type: d.roomType,
    preferred_room_id: d.preferred ?? null,
    max_consecutive: d.max_consec,
    min_consecutive: 1,
    spread_preference: 'spread_evenly' as const,
    student_count: 20,
    teachers: [{ staff_profile_id: d.teacher, assignment_role: 'lead' }],
    is_supervision: false,
  }));
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export function buildSettings(seed = 42): SolverSettings {
  return {
    max_solver_duration_seconds: 30,
    preference_weights: { low: 1, medium: 3, high: 5 },
    global_soft_weights: {
      even_subject_spread: 5,
      minimise_teacher_gaps: 3,
      room_consistency: 4,
      workload_balance: 2,
    },
    solver_seed: seed,
  };
}

// ─── Full small-school input ───────────────────────────────────────────────────
export function buildSmallSchoolInput(seed = 42): SolverInput {
  return {
    period_grid: buildPeriodGrid(),
    classes: buildClasses(),
    teachers: buildTeachers(),
    rooms: buildRooms(),
    pinned_entries: [],
    student_overlaps: [],
    settings: buildSettings(seed),
  };
}

/**
 * A minimal input with a single class and single teacher — useful for unit tests.
 */
export function buildMinimalInput(): SolverInput {
  return {
    period_grid: [
      { weekday: 0, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
      { weekday: 0, period_order: 1, start_time: '08:50', end_time: '09:35', period_type: 'teaching' },
      { weekday: 1, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
      { weekday: 1, period_order: 1, start_time: '08:50', end_time: '09:35', period_type: 'teaching' },
      { weekday: 2, period_order: 0, start_time: '08:00', end_time: '08:45', period_type: 'teaching' },
    ],
    classes: [
      {
        class_id: 'class-a',
        periods_per_week: 3,
        required_room_type: 'classroom',
        preferred_room_id: 'room-x',
        max_consecutive: 2,
        min_consecutive: 1,
        spread_preference: 'spread_evenly',
        student_count: 20,
        teachers: [{ staff_profile_id: 'teacher-a', assignment_role: 'lead' }],
        is_supervision: false,
      },
    ],
    teachers: [
      {
        staff_profile_id: 'teacher-a',
        availability: [],
        preferences: [],
      },
    ],
    rooms: [
      { room_id: 'room-x', room_type: 'classroom', capacity: 30, is_exclusive: true },
    ],
    pinned_entries: [],
    student_overlaps: [],
    settings: buildSettings(1),
  };
}
