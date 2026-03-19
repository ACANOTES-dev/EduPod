/**
 * Al-Noor International Academy — Stress Test for CSP Solver v2
 *
 * 600 students, 11 year groups, 24 class sections, 35 teachers, 15 rooms,
 * 10 subjects, tight constraints, double periods, part-time teachers,
 * room-type restrictions, pinned entries.
 *
 * Run: npx jest --testPathPattern stress-test --no-coverage
 */

import { solveV2 } from '../solver-v2';
import { validateSchedule } from '../validation';
import type {
  SolverInputV2,
  SolverOutputV2,
  YearGroupInput,
  CurriculumEntry,
  TeacherInputV2,
  RoomInfoV2,
  BreakGroupInput,
  PinnedEntryV2,
  SolverSettingsV2,
  PeriodSlotV2,
  SolverAssignmentV2,
  ValidationResult,
} from '../types-v2';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SUBJECTS = {
  maths: 'subj-maths',
  english: 'subj-english',
  arabic: 'subj-arabic',
  science: 'subj-science',
  islamic: 'subj-islamic',
  social: 'subj-social',
  pe: 'subj-pe',
  art: 'subj-art',
  it: 'subj-it',
  music: 'subj-music',
} as const;

const SUBJECT_NAMES: Record<string, string> = {
  [SUBJECTS.maths]: 'Maths',
  [SUBJECTS.english]: 'English',
  [SUBJECTS.arabic]: 'Arabic',
  [SUBJECTS.science]: 'Science',
  [SUBJECTS.islamic]: 'Islamic Studies',
  [SUBJECTS.social]: 'Social Studies',
  [SUBJECTS.pe]: 'PE',
  [SUBJECTS.art]: 'Art',
  [SUBJECTS.it]: 'IT',
  [SUBJECTS.music]: 'Music',
};

// Period times
const PERIOD_TIMES = [
  { start: '07:30', end: '08:15' }, // P1 = order 0
  { start: '08:20', end: '09:05' }, // P2 = order 1
  // Break                            // order 2
  { start: '09:20', end: '10:05' }, // P3 = order 3
  { start: '10:10', end: '10:55' }, // P4 = order 4
  { start: '11:00', end: '11:45' }, // P5 = order 5
  // Lunch                            // order 6
  { start: '12:30', end: '13:15' }, // P6 = order 7
  { start: '13:20', end: '14:05' }, // P7 = order 8
];

const BREAK_TIME = { start: '09:05', end: '09:20' }; // order 2
const LUNCH_TIME = { start: '11:45', end: '12:30' }; // order 6

// Days: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4

// ═══════════════════════════════════════════════════════════════════════════════
// PERIOD GRID BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Years 1-5: Mon-Thu 6 teaching + 1 break + 1 lunch. Fri: 4 teaching + 1 break + 1 lunch.
 * Break = classroom_next (order 2). Lunch = yard (order 6).
 * Mon-Thu teaching: P1(0), P2(1), P3(3), P4(4), P5(5), P6(7)
 * Fri teaching: P1(0), P2(1), P3(3), P4(4)
 */
function buildJuniorGrid(lunchBreakGroupId: string): PeriodSlotV2[] {
  const grid: PeriodSlotV2[] = [];
  // Mon-Thu
  for (let weekday = 0; weekday <= 3; weekday++) {
    grid.push(
      { weekday, period_order: 0, start_time: '07:30', end_time: '08:15', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 1, start_time: '08:20', end_time: '09:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 2, start_time: '09:05', end_time: '09:20', period_type: 'break_supervision', supervision_mode: 'classroom_next', break_group_id: null },
      { weekday, period_order: 3, start_time: '09:20', end_time: '10:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 4, start_time: '10:10', end_time: '10:55', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 5, start_time: '11:00', end_time: '11:45', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 6, start_time: '11:45', end_time: '12:30', period_type: 'lunch_duty', supervision_mode: 'yard', break_group_id: lunchBreakGroupId },
      { weekday, period_order: 7, start_time: '12:30', end_time: '13:15', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    );
  }
  // Fri
  grid.push(
    { weekday: 4, period_order: 0, start_time: '07:30', end_time: '08:15', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    { weekday: 4, period_order: 1, start_time: '08:20', end_time: '09:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    { weekday: 4, period_order: 2, start_time: '09:05', end_time: '09:20', period_type: 'break_supervision', supervision_mode: 'classroom_next', break_group_id: null },
    { weekday: 4, period_order: 3, start_time: '09:20', end_time: '10:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    { weekday: 4, period_order: 4, start_time: '10:10', end_time: '10:55', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    { weekday: 4, period_order: 5, start_time: '11:00', end_time: '11:45', period_type: 'lunch_duty', supervision_mode: 'yard', break_group_id: lunchBreakGroupId },
  );
  return grid;
}

/**
 * Years 6-8: Mon-Thu 7 teaching + 1 break + 1 lunch. Fri: 5 teaching + 1 break + 1 lunch.
 * Mon-Thu teaching: P1(0), P2(1), P3(3), P4(4), P5(5), P6(7), P7(8)
 * Fri teaching: P1(0), P2(1), P3(3), P4(4), P5(5)
 */
function buildMiddleGrid(lunchBreakGroupId: string): PeriodSlotV2[] {
  const grid: PeriodSlotV2[] = [];
  // Mon-Thu
  for (let weekday = 0; weekday <= 3; weekday++) {
    grid.push(
      { weekday, period_order: 0, start_time: '07:30', end_time: '08:15', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 1, start_time: '08:20', end_time: '09:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 2, start_time: '09:05', end_time: '09:20', period_type: 'break_supervision', supervision_mode: 'classroom_next', break_group_id: null },
      { weekday, period_order: 3, start_time: '09:20', end_time: '10:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 4, start_time: '10:10', end_time: '10:55', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 5, start_time: '11:00', end_time: '11:45', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 6, start_time: '11:45', end_time: '12:30', period_type: 'lunch_duty', supervision_mode: 'yard', break_group_id: lunchBreakGroupId },
      { weekday, period_order: 7, start_time: '12:30', end_time: '13:15', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 8, start_time: '13:20', end_time: '14:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    );
  }
  // Fri
  grid.push(
    { weekday: 4, period_order: 0, start_time: '07:30', end_time: '08:15', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    { weekday: 4, period_order: 1, start_time: '08:20', end_time: '09:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    { weekday: 4, period_order: 2, start_time: '09:05', end_time: '09:20', period_type: 'break_supervision', supervision_mode: 'classroom_next', break_group_id: null },
    { weekday: 4, period_order: 3, start_time: '09:20', end_time: '10:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    { weekday: 4, period_order: 4, start_time: '10:10', end_time: '10:55', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    { weekday: 4, period_order: 5, start_time: '11:00', end_time: '11:45', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    { weekday: 4, period_order: 6, start_time: '11:45', end_time: '12:30', period_type: 'lunch_duty', supervision_mode: 'yard', break_group_id: lunchBreakGroupId },
  );
  return grid;
}

/**
 * Years 9-11: Mon-Fri SAME grid. 7 teaching + 1 break (classroom_previous) + 1 lunch.
 * Teaching: P1(0), P2(1), P3(3), P4(4), P5(5), P6(7), P7(8)
 */
function buildSeniorGrid(lunchBreakGroupId: string): PeriodSlotV2[] {
  const grid: PeriodSlotV2[] = [];
  for (let weekday = 0; weekday <= 4; weekday++) {
    grid.push(
      { weekday, period_order: 0, start_time: '07:30', end_time: '08:15', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 1, start_time: '08:20', end_time: '09:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 2, start_time: '09:05', end_time: '09:20', period_type: 'break_supervision', supervision_mode: 'classroom_previous', break_group_id: null },
      { weekday, period_order: 3, start_time: '09:20', end_time: '10:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 4, start_time: '10:10', end_time: '10:55', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 5, start_time: '11:00', end_time: '11:45', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 6, start_time: '11:45', end_time: '12:30', period_type: 'lunch_duty', supervision_mode: 'yard', break_group_id: lunchBreakGroupId },
      { weekday, period_order: 7, start_time: '12:30', end_time: '13:15', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
      { weekday, period_order: 8, start_time: '13:20', end_time: '14:05', period_type: 'teaching', supervision_mode: 'none', break_group_id: null },
    );
  }
  return grid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// YEAR GROUPS (11 year groups, 24 sections)
// ═══════════════════════════════════════════════════════════════════════════════

function buildYearGroups(): YearGroupInput[] {
  const groups: YearGroupInput[] = [];

  // Years 1-5: 2 sections each (A, B) = 10 sections, Junior grid
  for (let y = 1; y <= 5; y++) {
    groups.push({
      year_group_id: `yg-${y}`,
      year_group_name: `Year ${y}`,
      sections: [
        { class_id: `class-y${y}a`, class_name: `Year ${y}A`, student_count: 25 },
        { class_id: `class-y${y}b`, class_name: `Year ${y}B`, student_count: 25 },
      ],
      period_grid: buildJuniorGrid('bg-junior'),
    });
  }

  // Years 6-8: 2 sections each = 8 sections, Middle grid
  for (let y = 6; y <= 8; y++) {
    groups.push({
      year_group_id: `yg-${y}`,
      year_group_name: `Year ${y}`,
      sections: [
        { class_id: `class-y${y}a`, class_name: `Year ${y}A`, student_count: 25 },
        { class_id: `class-y${y}b`, class_name: `Year ${y}B`, student_count: 25 },
      ],
      period_grid: buildMiddleGrid('bg-middle'),
    });
  }

  // Years 9-11: 3 sections each = 6 sections (but spec says Y10-11 have 3),
  // Actually spec: Y9 has 2, Y10-11 have 3. Let me re-read...
  // "Years 6-9 have 2 sections each (A, B) = 8 sections"
  // "Years 10-11 have 3 sections each (A, B, C) = 6 sections"
  // So Y9 is 2 sections. Let me fix:

  // Year 9: 2 sections, Senior grid
  groups.push({
    year_group_id: 'yg-9',
    year_group_name: 'Year 9',
    sections: [
      { class_id: 'class-y9a', class_name: 'Year 9A', student_count: 25 },
      { class_id: 'class-y9b', class_name: 'Year 9B', student_count: 25 },
    ],
    period_grid: buildSeniorGrid('bg-senior'),
  });

  // Years 10-11: 3 sections each, Senior grid
  for (let y = 10; y <= 11; y++) {
    groups.push({
      year_group_id: `yg-${y}`,
      year_group_name: `Year ${y}`,
      sections: [
        { class_id: `class-y${y}a`, class_name: `Year ${y}A`, student_count: 25 },
        { class_id: `class-y${y}b`, class_name: `Year ${y}B`, student_count: 25 },
        { class_id: `class-y${y}c`, class_name: `Year ${y}C`, student_count: 25 },
      ],
      period_grid: buildSeniorGrid('bg-senior'),
    });
  }

  return groups;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CURRICULUM
// ═══════════════════════════════════════════════════════════════════════════════

function buildCurriculum(): CurriculumEntry[] {
  const entries: CurriculumEntry[] = [];

  function add(
    yearGroupId: string,
    subjectId: string,
    minPerWeek: number,
    maxPerDay: number,
    requiresDouble: boolean,
    doubleCount: number | null,
    roomType: string | null,
  ) {
    entries.push({
      year_group_id: yearGroupId,
      subject_id: subjectId,
      subject_name: SUBJECT_NAMES[subjectId] ?? subjectId,
      min_periods_per_week: minPerWeek,
      max_periods_per_day: maxPerDay,
      preferred_periods_per_week: null,
      requires_double_period: requiresDouble,
      double_period_count: doubleCount,
      required_room_type: roomType,
      preferred_room_id: null,
    });
  }

  // Years 1-5: Total 26 periods each
  for (let y = 1; y <= 5; y++) {
    const ygId = `yg-${y}`;
    add(ygId, SUBJECTS.maths,    5, 2, false, null, null);
    add(ygId, SUBJECTS.english,  5, 2, false, null, null);
    add(ygId, SUBJECTS.arabic,   4, 1, false, null, null);
    add(ygId, SUBJECTS.science,  3, 2, true, 1, 'lab');   // 1 double period
    add(ygId, SUBJECTS.islamic,  2, 1, false, null, null);
    add(ygId, SUBJECTS.social,   2, 1, false, null, null);
    add(ygId, SUBJECTS.pe,       2, 1, false, null, 'gym');
    add(ygId, SUBJECTS.art,      1, 1, false, null, 'art_room');
    add(ygId, SUBJECTS.it,       1, 1, false, null, 'computer_lab');
    add(ygId, SUBJECTS.music,    1, 1, false, null, null);
  }

  // Years 6-8: Total 29 periods each
  for (let y = 6; y <= 8; y++) {
    const ygId = `yg-${y}`;
    add(ygId, SUBJECTS.maths,    5, 2, false, null, null);
    add(ygId, SUBJECTS.english,  5, 2, false, null, null);
    add(ygId, SUBJECTS.arabic,   4, 1, false, null, null);
    add(ygId, SUBJECTS.science,  4, 2, true, 2, 'lab');   // 2 double periods
    add(ygId, SUBJECTS.islamic,  2, 1, false, null, null);
    add(ygId, SUBJECTS.social,   3, 2, false, null, null);
    add(ygId, SUBJECTS.pe,       2, 1, false, null, 'gym');
    add(ygId, SUBJECTS.art,      1, 1, false, null, 'art_room');
    add(ygId, SUBJECTS.it,       2, 1, false, null, 'computer_lab');
    add(ygId, SUBJECTS.music,    1, 1, false, null, null);
  }

  // Years 9-11: Total 32 periods each
  for (let y = 9; y <= 11; y++) {
    const ygId = `yg-${y}`;
    add(ygId, SUBJECTS.maths,    6, 2, false, null, null);
    add(ygId, SUBJECTS.english,  5, 2, false, null, null);
    add(ygId, SUBJECTS.arabic,   4, 1, false, null, null);
    add(ygId, SUBJECTS.science,  5, 2, true, 2, 'lab');   // 2 double periods
    add(ygId, SUBJECTS.islamic,  2, 1, false, null, null);
    add(ygId, SUBJECTS.social,   3, 2, false, null, null);
    add(ygId, SUBJECTS.pe,       2, 1, false, null, 'gym');
    add(ygId, SUBJECTS.it,       3, 1, false, null, 'computer_lab');
    add(ygId, SUBJECTS.art,      1, 1, false, null, 'art_room');
    add(ygId, SUBJECTS.music,    1, 1, false, null, null);
  }

  return entries;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEACHERS (35)
// ═══════════════════════════════════════════════════════════════════════════════

function buildTeachers(): TeacherInputV2[] {
  const teachers: TeacherInputV2[] = [];

  // Helper to create full-week availability
  function fullWeek(): TeacherInputV2['availability'] {
    return []; // empty = fully available
  }

  // Helper: available Mon-Fri but only from/to
  function partialDay(from: string, to: string): TeacherInputV2['availability'] {
    return [0, 1, 2, 3, 4].map((weekday) => ({ weekday, from, to }));
  }

  // Helper: available all days except one
  function exceptDay(excludedDay: number): TeacherInputV2['availability'] {
    return [0, 1, 2, 3, 4]
      .filter((d) => d !== excludedDay)
      .map((weekday) => ({ weekday, from: '07:00', to: '17:00' }));
  }

  // Helper: competencies for a range of year groups
  function competenciesForYears(subjectId: string, years: number[], primaryYears: number[]): TeacherInputV2['competencies'] {
    return years.map((y) => ({
      subject_id: subjectId,
      year_group_id: `yg-${y}`,
      is_primary: primaryYears.includes(y),
    }));
  }

  // ── Maths teachers (4) ──
  teachers.push({
    staff_profile_id: 'teacher-M1',
    name: 'Mr Al-Rashid (Maths)',
    competencies: competenciesForYears(SUBJECTS.maths, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),
    availability: exceptDay(0), // NOT available on Mondays
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-M2',
    name: 'Ms Bennett (Maths)',
    competencies: competenciesForYears(SUBJECTS.maths, [6, 7, 8], [6, 7, 8]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-M3',
    name: 'Dr Hassan (Maths)',
    competencies: competenciesForYears(SUBJECTS.maths, [9, 10, 11], [9, 10, 11]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-M4',
    name: 'Ms Rodriguez (Maths)',
    competencies: competenciesForYears(SUBJECTS.maths, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], []),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // ── English teachers (4) ──
  teachers.push({
    staff_profile_id: 'teacher-E1',
    name: 'Mrs Thompson (English)',
    competencies: competenciesForYears(SUBJECTS.english, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-E2',
    name: 'Mr Davidson (English)',
    competencies: competenciesForYears(SUBJECTS.english, [6, 7, 8], [6, 7, 8]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-E3',
    name: 'Dr Williams (English)',
    competencies: competenciesForYears(SUBJECTS.english, [9, 10, 11], [9, 10, 11]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-E4',
    name: 'Ms Chen (English)',
    competencies: competenciesForYears(SUBJECTS.english, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], []),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // ── Arabic teachers (3) ──
  teachers.push({
    staff_profile_id: 'teacher-AR1',
    name: 'Ustadh Omar (Arabic)',
    competencies: competenciesForYears(SUBJECTS.arabic, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-AR2',
    name: 'Ustadha Fatima (Arabic)',
    competencies: competenciesForYears(SUBJECTS.arabic, [4, 5, 6, 7, 8], [6, 7, 8]), // Also covers Y4-5 as backup
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-AR3',
    name: 'Dr Khalid (Arabic)',
    competencies: competenciesForYears(SUBJECTS.arabic, [9, 10, 11], [9, 10, 11]),
    availability: partialDay('07:00', '13:30'), // Part-time: until 13:30 (can teach P6 but not P7)
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // ── Science teachers (3) — TIGHT ──
  teachers.push({
    staff_profile_id: 'teacher-SC1',
    name: 'Dr Patel (Science)',
    competencies: competenciesForYears(SUBJECTS.science, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-SC2',
    name: 'Dr Kim (Science)',
    competencies: competenciesForYears(SUBJECTS.science, [6, 7, 8], [6, 7, 8]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: 28, // Constrained but feasible (24 needed for Y6-8 Science)
    max_periods_per_day: 6,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-SC3',
    name: 'Prof. Ahmed (Science)',
    competencies: competenciesForYears(SUBJECTS.science, [9, 10, 11], [9, 10, 11]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // ── Islamic Studies teachers (2) ──
  teachers.push({
    staff_profile_id: 'teacher-IS1',
    name: 'Sheikh Ibrahim (Islamic)',
    competencies: competenciesForYears(SUBJECTS.islamic, [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]),
    availability: exceptDay(4), // NOT available on Fridays
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-IS2',
    name: 'Ustadha Aisha (Islamic)',
    competencies: competenciesForYears(SUBJECTS.islamic, [6, 7, 8, 9, 10, 11], [9, 10, 11]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // ── Social Studies teachers (2) ──
  teachers.push({
    staff_profile_id: 'teacher-SS1',
    name: 'Mr Garcia (Social)',
    competencies: competenciesForYears(SUBJECTS.social, [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-SS2',
    name: 'Ms O\'Brien (Social)',
    competencies: competenciesForYears(SUBJECTS.social, [6, 7, 8, 9, 10, 11], [9, 10, 11]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // ── PE teachers (3) — share the gym ──
  teachers.push({
    staff_profile_id: 'teacher-PE1',
    name: 'Coach Johnson (PE)',
    competencies: competenciesForYears(SUBJECTS.pe, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [1, 2, 3, 4]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-PE2',
    name: 'Coach Martinez (PE)',
    competencies: competenciesForYears(SUBJECTS.pe, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [5, 6, 7, 8]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-PE3',
    name: 'Coach Lee (PE)',
    competencies: competenciesForYears(SUBJECTS.pe, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [9, 10, 11]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // ── Art teachers (2) ──
  teachers.push({
    staff_profile_id: 'teacher-ART1',
    name: 'Ms Yamamoto (Art)',
    competencies: competenciesForYears(SUBJECTS.art, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [1, 2, 3, 4, 5, 6]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-ART2',
    name: 'Mr Rossi (Art)',
    competencies: competenciesForYears(SUBJECTS.art, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [7, 8, 9, 10, 11]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // ── IT teachers (2) ──
  teachers.push({
    staff_profile_id: 'teacher-IT1',
    name: 'Mr Singh (IT)',
    competencies: competenciesForYears(SUBJECTS.it, [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });
  teachers.push({
    staff_profile_id: 'teacher-IT2',
    name: 'Ms Park (IT)',
    competencies: competenciesForYears(SUBJECTS.it, [6, 7, 8, 9, 10, 11], [9, 10, 11]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // ── Music teacher (1) — SINGLE POINT OF FAILURE ──
  teachers.push({
    staff_profile_id: 'teacher-MU1',
    name: 'Mr Nakamura (Music)',
    competencies: competenciesForYears(SUBJECTS.music, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: 25,  // Max 25/week, needs 24 — very tight
    max_periods_per_day: 6,
    max_supervision_duties_per_week: null,
  });

  // ── Additional teachers to reach 35 total ──

  // Extra Maths teacher (covers Y1-8 as backup)
  teachers.push({
    staff_profile_id: 'teacher-M5',
    name: 'Ms Taylor (Maths)',
    competencies: competenciesForYears(SUBJECTS.maths, [1, 2, 3, 4, 5, 6, 7, 8], []),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // Extra English teacher (covers Y6-11 as backup)
  teachers.push({
    staff_profile_id: 'teacher-E5',
    name: 'Ms Campbell (English)',
    competencies: competenciesForYears(SUBJECTS.english, [6, 7, 8, 9, 10, 11], []),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // Extra Arabic teacher (covers Y1-5 as backup)
  teachers.push({
    staff_profile_id: 'teacher-AR4',
    name: 'Ustadh Yusuf (Arabic)',
    competencies: competenciesForYears(SUBJECTS.arabic, [1, 2, 3, 4, 5], []),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // Extra Science teacher (backup for Y1-8)
  teachers.push({
    staff_profile_id: 'teacher-SC4',
    name: 'Dr Nguyen (Science)',
    competencies: competenciesForYears(SUBJECTS.science, [1, 2, 3, 4, 5, 6, 7, 8], []),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // Extra Social Studies teacher (covers Y1-11)
  teachers.push({
    staff_profile_id: 'teacher-SS3',
    name: 'Mr Kumar (Social)',
    competencies: competenciesForYears(SUBJECTS.social, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], []),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // Extra PE teacher (backup)
  teachers.push({
    staff_profile_id: 'teacher-PE4',
    name: 'Coach Davis (PE)',
    competencies: competenciesForYears(SUBJECTS.pe, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], []),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // Generalist teacher: IT + Art (secondary, senior years)
  teachers.push({
    staff_profile_id: 'teacher-GEN1',
    name: 'Mr Wilson (IT/Art)',
    competencies: [
      ...competenciesForYears(SUBJECTS.it, [9, 10, 11], []),
      ...competenciesForYears(SUBJECTS.art, [9, 10, 11], []),
    ],
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // Generalist teacher: Islamic + Arabic (secondary, Y1-5)
  teachers.push({
    staff_profile_id: 'teacher-GEN2',
    name: 'Sheikh Ahmad (Islamic/Arabic)',
    competencies: [
      ...competenciesForYears(SUBJECTS.islamic, [1, 2, 3, 4, 5], []),
      ...competenciesForYears(SUBJECTS.arabic, [6, 7, 8, 9, 10, 11], []),
    ],
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  // Extra Maths teacher (covers Y9-11 as backup)
  teachers.push({
    staff_profile_id: 'teacher-M6',
    name: 'Dr Brown (Maths)',
    competencies: competenciesForYears(SUBJECTS.maths, [9, 10, 11], []),
    availability: fullWeek(),
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  });

  return teachers;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOMS (15)
// ═══════════════════════════════════════════════════════════════════════════════

function buildRooms(): RoomInfoV2[] {
  const rooms: RoomInfoV2[] = [];

  // 10 classrooms
  for (let i = 1; i <= 10; i++) {
    rooms.push({
      room_id: `classroom-${i}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: true,
    });
  }

  // 3 science labs (94 lab-periods needed, 3 labs * ~35 slots = 105 capacity)
  rooms.push({
    room_id: 'lab-1',
    room_type: 'lab',
    capacity: 25,
    is_exclusive: true,
  });
  rooms.push({
    room_id: 'lab-2',
    room_type: 'lab',
    capacity: 25,
    is_exclusive: true,
  });
  rooms.push({
    room_id: 'lab-3',
    room_type: 'lab',
    capacity: 25,
    is_exclusive: true,
  });

  // 2 gyms (48 PE-periods needed, 2 gyms * 35 slots = 70 capacity)
  rooms.push({
    room_id: 'gym-1',
    room_type: 'gym',
    capacity: 60,
    is_exclusive: true,
  });
  rooms.push({
    room_id: 'gym-2',
    room_type: 'gym',
    capacity: 40,
    is_exclusive: true,
  });

  // 1 art room (24 art-periods, 1 room * 35 slots = 35 capacity — OK)
  rooms.push({
    room_id: 'art-room-1',
    room_type: 'art_room',
    capacity: 30,
    is_exclusive: true,
  });

  // 2 IT labs (46 IT-periods needed, 2 labs * 35 slots = 70 capacity)
  rooms.push({
    room_id: 'it-lab-1',
    room_type: 'computer_lab',
    capacity: 30,
    is_exclusive: true,
  });
  rooms.push({
    room_id: 'it-lab-2',
    room_type: 'computer_lab',
    capacity: 30,
    is_exclusive: true,
  });

  return rooms;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BREAK GROUPS
// ═══════════════════════════════════════════════════════════════════════════════

function buildBreakGroups(): BreakGroupInput[] {
  return [
    {
      break_group_id: 'bg-junior',
      name: 'Junior Yard',
      year_group_ids: ['yg-1', 'yg-2', 'yg-3', 'yg-4', 'yg-5'],
      required_supervisor_count: 2,
    },
    {
      break_group_id: 'bg-middle',
      name: 'Middle Yard',
      year_group_ids: ['yg-6', 'yg-7', 'yg-8'],
      required_supervisor_count: 2,
    },
    {
      break_group_id: 'bg-senior',
      name: 'Senior Yard',
      year_group_ids: ['yg-9', 'yg-10', 'yg-11'],
      required_supervisor_count: 1,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PINNED ENTRIES (3)
// ═══════════════════════════════════════════════════════════════════════════════

function buildPinnedEntries(): PinnedEntryV2[] {
  return [
    // teacher-AR1 teaches Year 1A Arabic on Monday P1 in classroom-1
    {
      schedule_id: 'pinned-1',
      class_id: 'class-y1a',
      subject_id: SUBJECTS.arabic,
      year_group_id: 'yg-1',
      room_id: 'classroom-1',
      teacher_staff_id: 'teacher-AR1',
      weekday: 0,
      period_order: 0,
    },
    // teacher-M3 teaches Year 11A Maths on Wednesday P1 in classroom-8
    {
      schedule_id: 'pinned-2',
      class_id: 'class-y11a',
      subject_id: SUBJECTS.maths,
      year_group_id: 'yg-11',
      room_id: 'classroom-8',
      teacher_staff_id: 'teacher-M3',
      weekday: 2,
      period_order: 0,
    },
    // teacher-SC3 teaches Year 10A Science on Tuesday P3 in lab-1
    {
      schedule_id: 'pinned-3',
      class_id: 'class-y10a',
      subject_id: SUBJECTS.science,
      year_group_id: 'yg-10',
      room_id: 'lab-1',
      teacher_staff_id: 'teacher-SC3',
      weekday: 1,
      period_order: 3,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

function buildSettings(seed: number = 42): SolverSettingsV2 {
  return {
    max_solver_duration_seconds: 120,
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

// ═══════════════════════════════════════════════════════════════════════════════
// FULL INPUT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

function buildAlNoorInput(seed: number = 42): SolverInputV2 {
  return {
    year_groups: buildYearGroups(),
    curriculum: buildCurriculum(),
    teachers: buildTeachers(),
    rooms: buildRooms(),
    room_closures: [],
    break_groups: buildBreakGroups(),
    pinned_entries: buildPinnedEntries(),
    student_overlaps: [],
    settings: buildSettings(seed),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function totalPeriodsRequired(input: SolverInputV2): number {
  let total = 0;
  for (const c of input.curriculum) {
    const yg = input.year_groups.find((y) => y.year_group_id === c.year_group_id);
    if (!yg) continue;
    total += c.min_periods_per_week * yg.sections.length;
  }
  return total;
}

function printSubjectCoverage(input: SolverInputV2, entries: SolverAssignmentV2[]): void {
  console.log('\n=== SUBJECT COVERAGE (per year group) ===');
  console.log('Year Group   | Subject        | Required | Assigned | Coverage');
  console.log('-------------|----------------|----------|----------|--------');

  let totalRequired = 0;
  let totalAssigned = 0;

  for (const yg of input.year_groups) {
    const curriculumForYg = input.curriculum.filter(
      (c) => c.year_group_id === yg.year_group_id,
    );
    for (const c of curriculumForYg) {
      const requiredTotal = c.min_periods_per_week * yg.sections.length;
      const assignedTotal = entries.filter(
        (e) =>
          e.year_group_id === yg.year_group_id &&
          e.subject_id === c.subject_id &&
          !e.is_supervision,
      ).length;
      totalRequired += requiredTotal;
      totalAssigned += assignedTotal;
      const pct = requiredTotal > 0 ? Math.round((assignedTotal / requiredTotal) * 100) : 100;
      const flag = pct < 100 ? ' !!!' : '';
      console.log(
        `${yg.year_group_name.padEnd(13)}| ${(SUBJECT_NAMES[c.subject_id] ?? c.subject_id).padEnd(15)}| ${String(requiredTotal).padEnd(9)}| ${String(assignedTotal).padEnd(9)}| ${pct}%${flag}`,
      );
    }
  }

  console.log(`\nTotal: ${totalAssigned}/${totalRequired} (${Math.round((totalAssigned / totalRequired) * 100)}%)`);
}

function printTeacherWorkload(input: SolverInputV2, entries: SolverAssignmentV2[]): void {
  console.log('\n=== TEACHER WORKLOAD ===');
  console.log('Teacher                       | Total | Max/Day | Supervision');
  console.log('------------------------------|-------|---------|----------');

  for (const t of input.teachers) {
    const teachingEntries = entries.filter(
      (e) => e.teacher_staff_id === t.staff_profile_id && !e.is_supervision,
    );
    const supervisionEntries = entries.filter(
      (e) => e.teacher_staff_id === t.staff_profile_id && e.is_supervision,
    );

    let maxPerDay = 0;
    for (let d = 0; d <= 4; d++) {
      const dayCount = teachingEntries.filter((e) => e.weekday === d).length;
      if (dayCount > maxPerDay) maxPerDay = dayCount;
    }

    const limitStr = t.max_periods_per_week !== null ? ` (max ${t.max_periods_per_week})` : '';
    const dayLimitStr = t.max_periods_per_day !== null ? ` (max ${t.max_periods_per_day})` : '';

    console.log(
      `${t.name.padEnd(30)}| ${String(teachingEntries.length).padEnd(6)}${limitStr.padEnd(0)}| ${String(maxPerDay).padEnd(8)}${dayLimitStr.padEnd(0)}| ${supervisionEntries.length}`,
    );
  }
}

function printViolationSummary(validation: ValidationResult): void {
  console.log('\n=== CONSTRAINT VIOLATIONS ===');
  console.log(`Tier 1 (Immutable): ${validation.summary.tier1}`);
  console.log(`Tier 2 (Hard):      ${validation.summary.tier2}`);
  console.log(`Tier 3 (Soft):      ${validation.summary.tier3}`);
  console.log(`Health Score:       ${validation.health_score}/100`);

  if (validation.violations.length > 0) {
    console.log('\n--- Violations Detail ---');

    // Group by category
    const byCategory = new Map<string, number>();
    for (const v of validation.violations) {
      const key = `T${v.tier}: ${v.category}`;
      byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    }

    for (const [category, count] of [...byCategory.entries()].sort()) {
      console.log(`  ${category}: ${count}`);
    }

    // Print first 10 violations as detail
    const first10 = validation.violations.slice(0, 10);
    if (first10.length > 0) {
      console.log('\n--- First 10 Violations ---');
      for (const v of first10) {
        console.log(`  [T${v.tier}] ${v.category}: ${v.message}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Al-Noor International Academy Stress Test', () => {
  let input: SolverInputV2;
  let output: SolverOutputV2;
  let validation: ValidationResult;

  // Build and solve once before all tests
  beforeAll(() => {
    input = buildAlNoorInput(42);

    console.log('\n========================================');
    console.log('  AL-NOOR INTERNATIONAL ACADEMY');
    console.log('  Solver Stress Test');
    console.log('========================================');

    // Pre-solve diagnostics
    const requiredPeriods = totalPeriodsRequired(input);
    const totalSections = input.year_groups.reduce((sum, yg) => sum + yg.sections.length, 0);
    const totalCurriculumEntries = input.curriculum.length;

    console.log(`\nYear Groups:     ${input.year_groups.length}`);
    console.log(`Class Sections:  ${totalSections}`);
    console.log(`Curriculum Entries: ${totalCurriculumEntries}`);
    console.log(`Required Teaching Periods: ${requiredPeriods}`);
    console.log(`Teachers:        ${input.teachers.length}`);
    console.log(`Rooms:           ${input.rooms.length}`);
    console.log(`Break Groups:    ${input.break_groups.length}`);
    console.log(`Pinned Entries:  ${input.pinned_entries.length}`);
    console.log(`Timeout:         ${input.settings.max_solver_duration_seconds}s`);
    console.log('\nSolving...');

    const start = Date.now();
    output = solveV2(input, {
      onProgress: (assigned, total, phase) => {
        if (assigned % 50 === 0) {
          const elapsed = ((Date.now() - start) / 1000).toFixed(1);
          console.log(`  [${elapsed}s] ${phase}: ${assigned}/${total} assigned`);
        }
      },
    });

    const teachingEntries = output.entries.filter((e) => !e.is_supervision);
    const supervisionEntries = output.entries.filter((e) => e.is_supervision);

    console.log(`\nSolver completed in ${(output.duration_ms / 1000).toFixed(2)}s`);
    console.log(`Teaching assignments:    ${teachingEntries.length}/${requiredPeriods} (${Math.round((teachingEntries.length / requiredPeriods) * 100)}%)`);
    console.log(`Supervision assignments: ${supervisionEntries.length}`);
    console.log(`Unassigned slots:        ${output.unassigned.length}`);
    console.log(`Score:                   ${output.score}/${output.max_score}`);

    // Run validation
    validation = validateSchedule(input, output.entries);

    // Print detailed reports
    printSubjectCoverage(input, output.entries);
    printTeacherWorkload(input, output.entries);
    printViolationSummary(validation);

    // Print unassigned detail
    if (output.unassigned.length > 0) {
      console.log('\n=== UNASSIGNED SLOTS ===');
      for (const u of output.unassigned) {
        const subjectName = u.subject_id ? SUBJECT_NAMES[u.subject_id] ?? u.subject_id : 'supervision';
        console.log(`  ${u.year_group_id} | ${subjectName} | ${u.periods_remaining} remaining | ${u.reason}`);
      }
    }

    console.log('\n========================================\n');
  }, 180000); // 3 minute timeout for beforeAll

  // ── Core Assertions ──

  it('should solve within 120 seconds', () => {
    expect(output.duration_ms).toBeLessThanOrEqual(120_000);
  });

  it('should assign >= 85% of required periods', () => {
    const required = totalPeriodsRequired(input);
    const teachingEntries = output.entries.filter((e) => !e.is_supervision);
    const pct = teachingEntries.length / required;
    expect(pct).toBeGreaterThanOrEqual(0.85);
  });

  it('should have zero tier-1 violations (teacher double-booking)', () => {
    expect(validation.summary.tier1).toBe(0);
  });

  // ── Teacher Constraints ──

  it('should never assign teacher-M1 on Mondays', () => {
    const mondayAssignments = output.entries.filter(
      (e) => e.teacher_staff_id === 'teacher-M1' && e.weekday === 0,
    );
    expect(mondayAssignments).toHaveLength(0);
  });

  it('should respect teacher-SC2 weekly limit of 28', () => {
    const count = output.entries.filter(
      (e) => e.teacher_staff_id === 'teacher-SC2' && !e.is_supervision,
    ).length;
    expect(count).toBeLessThanOrEqual(28);
  });

  it('should respect teacher-SC2 daily limit of 6', () => {
    for (let d = 0; d <= 4; d++) {
      const count = output.entries.filter(
        (e) => e.teacher_staff_id === 'teacher-SC2' && e.weekday === d && !e.is_supervision,
      ).length;
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  it('should not assign teacher-AR3 after 13:30', () => {
    const lateAssignments = output.entries.filter((e) => {
      if (e.teacher_staff_id !== 'teacher-AR3') return false;
      const yg = input.year_groups.find((y) => y.year_group_id === e.year_group_id);
      const slot = yg?.period_grid.find(
        (p) => p.weekday === e.weekday && p.period_order === e.period_order,
      );
      return slot != null && slot.end_time > '13:30';
    });
    expect(lateAssignments).toHaveLength(0);
  });

  it('should not assign teacher-IS1 on Fridays', () => {
    const fridayAssignments = output.entries.filter(
      (e) => e.teacher_staff_id === 'teacher-IS1' && e.weekday === 4,
    );
    expect(fridayAssignments).toHaveLength(0);
  });

  it('should respect music teacher weekly limit of 25', () => {
    const count = output.entries.filter(
      (e) => e.teacher_staff_id === 'teacher-MU1' && !e.is_supervision,
    ).length;
    expect(count).toBeLessThanOrEqual(25);
  });

  it('should respect music teacher daily limit of 6', () => {
    for (let d = 0; d <= 4; d++) {
      const count = output.entries.filter(
        (e) => e.teacher_staff_id === 'teacher-MU1' && e.weekday === d && !e.is_supervision,
      ).length;
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  // ── Room Constraints ──

  it('should not double-book the gym at the same time', () => {
    const gymEntries = output.entries.filter((e) => e.room_id === 'gym-1');
    for (let i = 0; i < gymEntries.length; i++) {
      for (let j = i + 1; j < gymEntries.length; j++) {
        const a = gymEntries[i]!;
        const b = gymEntries[j]!;
        if (a.weekday === b.weekday) {
          const aGrid = input.year_groups.find((yg) => yg.year_group_id === a.year_group_id)?.period_grid;
          const bGrid = input.year_groups.find((yg) => yg.year_group_id === b.year_group_id)?.period_grid;
          const aSlot = aGrid?.find((p) => p.weekday === a.weekday && p.period_order === a.period_order);
          const bSlot = bGrid?.find((p) => p.weekday === b.weekday && p.period_order === b.period_order);
          if (aSlot && bSlot) {
            const overlaps = aSlot.start_time < bSlot.end_time && bSlot.start_time < aSlot.end_time;
            expect(overlaps).toBe(false);
          }
        }
      }
    }
  });

  it('should assign Science to lab rooms', () => {
    const scienceEntries = output.entries.filter(
      (e) => e.subject_id === SUBJECTS.science && !e.is_supervision && e.room_id !== null,
    );
    for (const e of scienceEntries) {
      const room = input.rooms.find((r) => r.room_id === e.room_id);
      expect(room?.room_type).toBe('lab');
    }
  });

  it('should assign PE to gym rooms', () => {
    const peEntries = output.entries.filter(
      (e) => e.subject_id === SUBJECTS.pe && !e.is_supervision && e.room_id !== null,
    );
    for (const e of peEntries) {
      const room = input.rooms.find((r) => r.room_id === e.room_id);
      expect(room?.room_type).toBe('gym');
    }
  });

  // ── Pinned Entries ──

  it('should preserve all 3 pinned entries', () => {
    const pinnedEntries = output.entries.filter((e) => e.is_pinned);
    expect(pinnedEntries.length).toBeGreaterThanOrEqual(3);

    // Pinned 1: teacher-AR1 teaches Year 1A Arabic on Monday P1
    const p1 = pinnedEntries.find(
      (e) =>
        e.teacher_staff_id === 'teacher-AR1' &&
        e.class_id === 'class-y1a' &&
        e.subject_id === SUBJECTS.arabic &&
        e.weekday === 0 &&
        e.period_order === 0,
    );
    expect(p1).toBeDefined();

    // Pinned 2: teacher-M3 teaches Year 11A Maths on Wednesday P1
    const p2 = pinnedEntries.find(
      (e) =>
        e.teacher_staff_id === 'teacher-M3' &&
        e.class_id === 'class-y11a' &&
        e.subject_id === SUBJECTS.maths &&
        e.weekday === 2 &&
        e.period_order === 0,
    );
    expect(p2).toBeDefined();

    // Pinned 3: teacher-SC3 teaches Year 10A Science on Tuesday P3 in lab-1
    const p3 = pinnedEntries.find(
      (e) =>
        e.teacher_staff_id === 'teacher-SC3' &&
        e.class_id === 'class-y10a' &&
        e.subject_id === SUBJECTS.science &&
        e.weekday === 1 &&
        e.period_order === 3,
    );
    expect(p3).toBeDefined();
  });

  // ── Competency ──

  it('should only assign teachers with competency for the subject', () => {
    const teachingEntries = output.entries.filter(
      (e) => e.teacher_staff_id && e.subject_id && !e.is_supervision,
    );
    for (const e of teachingEntries) {
      const teacher = input.teachers.find((t) => t.staff_profile_id === e.teacher_staff_id);
      const hasCompetency = teacher?.competencies.some(
        (c) => c.subject_id === e.subject_id && c.year_group_id === e.year_group_id,
      );
      expect(hasCompetency).toBe(true);
    }
  });

  // ── Subject max per day ──

  it('should not exceed max_periods_per_day for any subject in any class', () => {
    for (const c of input.curriculum) {
      const yg = input.year_groups.find((y) => y.year_group_id === c.year_group_id);
      if (!yg) continue;
      for (const section of yg.sections) {
        for (let d = 0; d <= 4; d++) {
          const dayCount = output.entries.filter(
            (e) =>
              e.class_id === section.class_id &&
              e.subject_id === c.subject_id &&
              e.weekday === d &&
              !e.is_supervision,
          ).length;
          if (dayCount > c.max_periods_per_day) {
            fail(
              `${c.subject_name} for ${section.class_name} has ${dayCount} periods on day ${d}, max is ${c.max_periods_per_day}`,
            );
          }
        }
      }
    }
  });

  // ── Solver Output Structural ──

  it('should return non-negative score', () => {
    expect(output.score).toBeGreaterThanOrEqual(0);
  });

  it('should have no null teacher assignments in teaching entries', () => {
    const teachingEntries = output.entries.filter((e) => !e.is_supervision && !e.is_pinned);
    for (const e of teachingEntries) {
      expect(e.teacher_staff_id).not.toBeNull();
    }
  });
});
