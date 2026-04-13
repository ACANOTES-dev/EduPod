import type {
  SolverInputV2,
  YearGroupInput,
  CurriculumEntry,
  TeacherInputV2,
  RoomInfoV2,
  BreakGroupInput,
  PinnedEntryV2,
  StudentOverlapV2,
  SolverSettingsV2,
  PeriodSlotV2,
} from '../../../scheduler/types-v2';

// ─── Period Times ────────────────────────────────────────────────────────────

/**
 * Standard day: 4 teaching + 1 short break (classroom_next) + 1 lunch (yard) = 6 periods.
 * Compact grid keeps domain sizes manageable for the CSP solver.
 */
const DAY_SLOTS: Array<{
  start: string;
  end: string;
  type: PeriodSlotV2['period_type'];
  supervisionMode: PeriodSlotV2['supervision_mode'];
}> = [
  { start: '08:00', end: '08:45', type: 'teaching', supervisionMode: 'none' }, // P1 order=0
  { start: '08:50', end: '09:35', type: 'teaching', supervisionMode: 'none' }, // P2 order=1
  { start: '09:35', end: '09:50', type: 'break_supervision', supervisionMode: 'classroom_next' }, // Short break order=2
  { start: '09:50', end: '10:35', type: 'teaching', supervisionMode: 'none' }, // P3 order=3
  { start: '10:40', end: '11:25', type: 'teaching', supervisionMode: 'none' }, // P4 order=4
  { start: '11:25', end: '12:05', type: 'lunch_duty', supervisionMode: 'yard' }, // Lunch order=5
];

/**
 * Short Friday for Year 3: 3 teaching + 1 short break + 1 lunch = 5 periods.
 */
const SHORT_FRIDAY_SLOTS: Array<{
  start: string;
  end: string;
  type: PeriodSlotV2['period_type'];
  supervisionMode: PeriodSlotV2['supervision_mode'];
}> = [
  { start: '08:00', end: '08:45', type: 'teaching', supervisionMode: 'none' },
  { start: '08:50', end: '09:35', type: 'teaching', supervisionMode: 'none' },
  { start: '09:35', end: '09:50', type: 'break_supervision', supervisionMode: 'classroom_next' },
  { start: '09:50', end: '10:35', type: 'teaching', supervisionMode: 'none' },
  { start: '10:35', end: '11:15', type: 'lunch_duty', supervisionMode: 'yard' },
];

// ─── Period Grid Builders ────────────────────────────────────────────────────

function buildWeekGrid(lunchBreakGroupId: string, numDays: number): PeriodSlotV2[] {
  const grid: PeriodSlotV2[] = [];
  for (let weekday = 0; weekday < numDays; weekday++) {
    for (let i = 0; i < DAY_SLOTS.length; i++) {
      const slot = DAY_SLOTS[i]!;
      grid.push({
        weekday,
        period_order: i,
        start_time: slot.start,
        end_time: slot.end,
        period_type: slot.type,
        supervision_mode: slot.supervisionMode,
        break_group_id: slot.type === 'lunch_duty' ? lunchBreakGroupId : null,
      });
    }
  }
  return grid;
}

function buildYear3Grid(lunchBreakGroupId: string): PeriodSlotV2[] {
  const grid: PeriodSlotV2[] = [];
  // Mon-Thu: standard day
  for (let weekday = 0; weekday < 4; weekday++) {
    for (let i = 0; i < DAY_SLOTS.length; i++) {
      const slot = DAY_SLOTS[i]!;
      grid.push({
        weekday,
        period_order: i,
        start_time: slot.start,
        end_time: slot.end,
        period_type: slot.type,
        supervision_mode: slot.supervisionMode,
        break_group_id: slot.type === 'lunch_duty' ? lunchBreakGroupId : null,
      });
    }
  }
  // Friday: short day
  for (let i = 0; i < SHORT_FRIDAY_SLOTS.length; i++) {
    const slot = SHORT_FRIDAY_SLOTS[i]!;
    grid.push({
      weekday: 4,
      period_order: i,
      start_time: slot.start,
      end_time: slot.end,
      period_type: slot.type,
      supervision_mode: slot.supervisionMode,
      break_group_id: slot.type === 'lunch_duty' ? lunchBreakGroupId : null,
    });
  }
  return grid;
}

// ─── Year Groups ─────────────────────────────────────────────────────────────

export function buildYearGroups(): YearGroupInput[] {
  return [
    {
      year_group_id: 'yg-1',
      year_group_name: 'Year 1',
      sections: [{ class_id: 'class-y1', class_name: 'Year 1', student_count: 25 }],
      period_grid: buildWeekGrid('bg-junior', 5),
    },
    {
      year_group_id: 'yg-2',
      year_group_name: 'Year 2',
      sections: [
        { class_id: 'class-y2a', class_name: 'Year 2A', student_count: 28 },
        { class_id: 'class-y2b', class_name: 'Year 2B', student_count: 26 },
      ],
      period_grid: buildWeekGrid('bg-junior', 5),
    },
    {
      year_group_id: 'yg-3',
      year_group_name: 'Year 3',
      sections: [{ class_id: 'class-y3', class_name: 'Year 3', student_count: 22 }],
      period_grid: buildYear3Grid('bg-senior'),
    },
  ];
}

// ─── Subjects ────────────────────────────────────────────────────────────────

const SUBJECTS = {
  maths: 'subj-maths',
  english: 'subj-english',
  science: 'subj-science',
  arabic: 'subj-arabic',
} as const;

// ─── Curriculum ──────────────────────────────────────────────────────────────

/**
 * Compact curriculum designed to be solvable within 30s.
 * Each subject has 1 eligible teacher (or 2 at most for multi-teacher tests).
 * Year 1: 8 periods, Year 2 (x2 sections): 5 each = 10, Year 3: 6 periods. Total: 24 teaching.
 */
export function buildCurriculum(): CurriculumEntry[] {
  return [
    // ── Year 1: 8 periods ──
    {
      year_group_id: 'yg-1',
      subject_id: SUBJECTS.maths,
      subject_name: 'Maths',
      min_periods_per_week: 3,
      max_periods_per_day: 1,
      preferred_periods_per_week: null,
      requires_double_period: false,
      double_period_count: null,
      required_room_type: null,
      preferred_room_id: null,
    },
    {
      year_group_id: 'yg-1',
      subject_id: SUBJECTS.english,
      subject_name: 'English',
      min_periods_per_week: 3,
      max_periods_per_day: 1,
      preferred_periods_per_week: null,
      requires_double_period: false,
      double_period_count: null,
      required_room_type: null,
      preferred_room_id: null,
    },
    {
      year_group_id: 'yg-1',
      subject_id: SUBJECTS.science,
      subject_name: 'Science',
      min_periods_per_week: 2,
      max_periods_per_day: 2,
      preferred_periods_per_week: null,
      requires_double_period: false,
      double_period_count: null,
      required_room_type: null,
      preferred_room_id: null,
    },

    // ── Year 2: 4 periods per section ──
    {
      year_group_id: 'yg-2',
      subject_id: SUBJECTS.maths,
      subject_name: 'Maths',
      min_periods_per_week: 2,
      max_periods_per_day: 1,
      preferred_periods_per_week: null,
      requires_double_period: false,
      double_period_count: null,
      required_room_type: null,
      preferred_room_id: null,
    },
    {
      year_group_id: 'yg-2',
      subject_id: SUBJECTS.english,
      subject_name: 'English',
      min_periods_per_week: 2,
      max_periods_per_day: 1,
      preferred_periods_per_week: null,
      requires_double_period: false,
      double_period_count: null,
      required_room_type: null,
      preferred_room_id: null,
    },

    // ── Year 3: 6 periods ──
    {
      year_group_id: 'yg-3',
      subject_id: SUBJECTS.maths,
      subject_name: 'Maths',
      min_periods_per_week: 2,
      max_periods_per_day: 2,
      preferred_periods_per_week: null,
      requires_double_period: false,
      double_period_count: null,
      required_room_type: null,
      preferred_room_id: null,
    },
    {
      year_group_id: 'yg-3',
      subject_id: SUBJECTS.english,
      subject_name: 'English',
      min_periods_per_week: 2,
      max_periods_per_day: 1,
      preferred_periods_per_week: null,
      requires_double_period: false,
      double_period_count: null,
      required_room_type: null,
      preferred_room_id: null,
    },
    {
      year_group_id: 'yg-3',
      subject_id: SUBJECTS.arabic,
      subject_name: 'Arabic',
      min_periods_per_week: 2,
      max_periods_per_day: 1,
      preferred_periods_per_week: null,
      requires_double_period: false,
      double_period_count: null,
      required_room_type: null,
      preferred_room_id: null,
    },
  ];
}

// ─── Teachers ────────────────────────────────────────────────────────────────

/**
 * 6 teachers. Each subject+year has exactly 1 eligible teacher (tight competency).
 * teacher-1 and teacher-2 both can teach Maths Y2 — tests cross-section teacher sharing.
 * teacher-3 is unavailable on Fridays. teacher-7 only available 08:00-12:00.
 */
export function buildTeachersV2(): TeacherInputV2[] {
  return [
    // teacher-1: Maths Y1 (primary)
    {
      staff_profile_id: 'teacher-1',
      name: 'Mr Adams',
      competencies: [{ subject_id: SUBJECTS.maths, year_group_id: 'yg-1', class_id: null }],
      availability: [],
      preferences: [],
      max_periods_per_week: null,
      max_periods_per_day: null,
      max_supervision_duties_per_week: null,
    },
    // teacher-2: Maths Y2 (primary)
    {
      staff_profile_id: 'teacher-2',
      name: 'Ms Baker',
      competencies: [{ subject_id: SUBJECTS.maths, year_group_id: 'yg-2', class_id: null }],
      availability: [],
      preferences: [],
      max_periods_per_week: null,
      max_periods_per_day: null,
      max_supervision_duties_per_week: null,
    },
    // teacher-3: English Y1 (primary), English Y2. Unavailable on Fridays.
    {
      staff_profile_id: 'teacher-3',
      name: 'Mrs Clarke',
      competencies: [
        { subject_id: SUBJECTS.english, year_group_id: 'yg-1', class_id: null },
        { subject_id: SUBJECTS.english, year_group_id: 'yg-2', class_id: null },
      ],
      availability: [
        { weekday: 0, from: '07:00', to: '17:00' },
        { weekday: 1, from: '07:00', to: '17:00' },
        { weekday: 2, from: '07:00', to: '17:00' },
        { weekday: 3, from: '07:00', to: '17:00' },
        // No weekday 4 (Friday) — unavailable
      ],
      preferences: [],
      max_periods_per_week: null,
      max_periods_per_day: null,
      max_supervision_duties_per_week: null,
    },
    // teacher-4: Science Y1. Load limits: max 15/week, max 4/day.
    {
      staff_profile_id: 'teacher-4',
      name: 'Dr Davis',
      competencies: [{ subject_id: SUBJECTS.science, year_group_id: 'yg-1', class_id: null }],
      availability: [],
      preferences: [],
      max_periods_per_week: 15,
      max_periods_per_day: 4,
      max_supervision_duties_per_week: null,
    },
    // teacher-5: English Y3, Arabic Y3
    {
      staff_profile_id: 'teacher-5',
      name: 'Ms Farah',
      competencies: [
        { subject_id: SUBJECTS.english, year_group_id: 'yg-3', class_id: null },
        { subject_id: SUBJECTS.arabic, year_group_id: 'yg-3', class_id: null },
      ],
      availability: [],
      preferences: [],
      max_periods_per_week: null,
      max_periods_per_day: null,
      max_supervision_duties_per_week: null,
    },
    // teacher-7: Maths Y3 (primary). Only available 08:00-12:00. Max 10 periods/week.
    {
      staff_profile_id: 'teacher-7',
      name: 'Mr Green',
      competencies: [{ subject_id: SUBJECTS.maths, year_group_id: 'yg-3', class_id: null }],
      availability: [
        { weekday: 0, from: '08:00', to: '12:00' },
        { weekday: 1, from: '08:00', to: '12:00' },
        { weekday: 2, from: '08:00', to: '12:00' },
        { weekday: 3, from: '08:00', to: '12:00' },
        { weekday: 4, from: '08:00', to: '12:00' },
      ],
      preferences: [],
      max_periods_per_week: 10,
      max_periods_per_day: null,
      max_supervision_duties_per_week: null,
    },
  ];
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

export function buildRoomsV2(): RoomInfoV2[] {
  return [];
}

// ─── Break Groups ────────────────────────────────────────────────────────────

export function buildBreakGroups(): BreakGroupInput[] {
  return [
    {
      break_group_id: 'bg-junior',
      name: 'Junior Yard',
      year_group_ids: ['yg-1', 'yg-2'],
      required_supervisor_count: 1,
    },
    {
      break_group_id: 'bg-senior',
      name: 'Senior Yard',
      year_group_ids: ['yg-3'],
      required_supervisor_count: 1,
    },
  ];
}

// ─── Pinned Entries ──────────────────────────────────────────────────────────

export function buildPinnedEntries(): PinnedEntryV2[] {
  return [
    {
      schedule_id: 'pinned-1',
      class_id: 'class-y1',
      subject_id: SUBJECTS.english,
      year_group_id: 'yg-1',
      room_id: null,
      teacher_staff_id: 'teacher-3',
      weekday: 0, // Monday
      period_order: 0, // P1
    },
  ];
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function buildSettingsV2(seed = 42): SolverSettingsV2 {
  return {
    max_solver_duration_seconds: 30,
    preference_weights: { low: 1, medium: 3, high: 5 },
    global_soft_weights: {
      even_subject_spread: 5,
      minimise_teacher_gaps: 3,
      room_consistency: 4,
      workload_balance: 2,
      break_duty_balance: 2,
    },
    solver_seed: seed,
  };
}

// ─── Full Multi-Year School Input ────────────────────────────────────────────

export function buildMultiYearSchoolInput(seed = 42): SolverInputV2 {
  return {
    year_groups: buildYearGroups(),
    curriculum: buildCurriculum(),
    teachers: buildTeachersV2(),
    rooms: buildRoomsV2(),
    room_closures: [],
    break_groups: buildBreakGroups(),
    pinned_entries: buildPinnedEntries(),
    student_overlaps: [] as StudentOverlapV2[],
    settings: buildSettingsV2(seed),
  };
}

// ─── Minimal V2 Input ────────────────────────────────────────────────────────

/**
 * A tiny fixture: 1 year group, 1 section, 2 subjects, 2 teachers, no breaks.
 * For fast unit tests.
 */
export function buildMinimalV2Input(): SolverInputV2 {
  const periodGrid: PeriodSlotV2[] = [];
  for (let weekday = 0; weekday < 3; weekday++) {
    periodGrid.push(
      {
        weekday,
        period_order: 0,
        start_time: '08:00',
        end_time: '08:45',
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      },
      {
        weekday,
        period_order: 1,
        start_time: '08:50',
        end_time: '09:35',
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      },
      {
        weekday,
        period_order: 2,
        start_time: '09:40',
        end_time: '10:25',
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      },
    );
  }

  return {
    year_groups: [
      {
        year_group_id: 'yg-min',
        year_group_name: 'Year Min',
        sections: [{ class_id: 'class-min', class_name: 'Year Min', student_count: 20 }],
        period_grid: periodGrid,
      },
    ],
    curriculum: [
      {
        year_group_id: 'yg-min',
        subject_id: 'subj-a',
        subject_name: 'Subject A',
        min_periods_per_week: 3,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
      },
      {
        year_group_id: 'yg-min',
        subject_id: 'subj-b',
        subject_name: 'Subject B',
        min_periods_per_week: 2,
        max_periods_per_day: 1,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
      },
    ],
    teachers: [
      {
        staff_profile_id: 'teacher-min-1',
        name: 'Teacher 1',
        competencies: [
          { subject_id: 'subj-a', year_group_id: 'yg-min', class_id: null },
          { subject_id: 'subj-b', year_group_id: 'yg-min', class_id: null },
        ],
        availability: [],
        preferences: [],
        max_periods_per_week: null,
        max_periods_per_day: null,
        max_supervision_duties_per_week: null,
      },
      {
        staff_profile_id: 'teacher-min-2',
        name: 'Teacher 2',
        competencies: [
          { subject_id: 'subj-a', year_group_id: 'yg-min', class_id: null },
          { subject_id: 'subj-b', year_group_id: 'yg-min', class_id: null },
        ],
        availability: [],
        preferences: [],
        max_periods_per_week: null,
        max_periods_per_day: null,
        max_supervision_duties_per_week: null,
      },
    ],
    rooms: [],
    room_closures: [],
    break_groups: [],
    pinned_entries: [],
    student_overlaps: [],
    settings: {
      max_solver_duration_seconds: 10,
      preference_weights: { low: 1, medium: 3, high: 5 },
      global_soft_weights: {
        even_subject_spread: 5,
        minimise_teacher_gaps: 3,
        room_consistency: 4,
        workload_balance: 2,
        break_duty_balance: 2,
      },
      solver_seed: 42,
    },
  };
}
