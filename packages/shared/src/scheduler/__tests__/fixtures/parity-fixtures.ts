/**
 * CP-SAT regression fixtures — three scale tiers + four adversarial cases.
 * (Originally Stage 5 parity fixtures; legacy solver retired in Stage 8.)
 *
 * Each builder returns a fully-formed ``SolverInputV2`` so the regression
 * harness (``cp-sat-regression.test.ts``) can hand the same byte-identical
 * payload to the CP-SAT sidecar (``POST /solve``) with no further
 * transformation.
 *
 * Builders are deterministic — no ``Math.random`` calls. A seeded
 * ``mulberry32`` produces the synthetic teacher / curriculum
 * permutations needed for the larger tiers; same dimensions in →
 * same JSON out.
 */

import type {
  CurriculumEntry,
  PeriodSlotV2,
  RoomInfoV2,
  SolverInputV2,
  SolverSettingsV2,
  TeacherInputV2,
  YearGroupInput,
} from '../../types-v2';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTeachingGrid(weekdays: number, periodsPerDay: number): PeriodSlotV2[] {
  const grid: PeriodSlotV2[] = [];
  for (let weekday = 0; weekday < weekdays; weekday++) {
    for (let period = 0; period < periodsPerDay; period++) {
      const startMinutes = 8 * 60 + period * 60;
      const endMinutes = startMinutes + 45;
      grid.push({
        weekday,
        period_order: period,
        start_time: `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`,
        end_time: `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`,
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      });
    }
  }
  return grid;
}

function defaultSettings(seed = 0, maxSeconds = 30): SolverSettingsV2 {
  return {
    max_solver_duration_seconds: maxSeconds,
    preference_weights: { low: 1, medium: 3, high: 5 },
    global_soft_weights: {
      even_subject_spread: 1,
      minimise_teacher_gaps: 1,
      room_consistency: 1,
      workload_balance: 1,
      break_duty_balance: 1,
    },
    solver_seed: seed,
  };
}

function pickK<T>(rng: () => number, items: readonly T[], k: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < k && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]!);
  }
  return out;
}

// ─── Tier 1: tiny smoke fixture ─────────────────────────────────────────────

export function buildTier1Tiny(): SolverInputV2 {
  // 3 classes (one year group), 5 teachers, 3 subjects, 20 periods (4×5).
  const grid = buildTeachingGrid(4, 5);
  const subjects = [
    { id: 'maths', name: 'Maths' },
    { id: 'english', name: 'English' },
    { id: 'science', name: 'Science' },
  ];

  const yearGroups: YearGroupInput[] = [
    {
      year_group_id: 'yg-1',
      year_group_name: 'Year 1',
      sections: [
        { class_id: 'class-A', class_name: 'Y1-A', student_count: 24 },
        { class_id: 'class-B', class_name: 'Y1-B', student_count: 24 },
        { class_id: 'class-C', class_name: 'Y1-C', student_count: 24 },
      ],
      period_grid: grid,
    },
  ];

  const curriculum: CurriculumEntry[] = subjects.map((s) => ({
    year_group_id: 'yg-1',
    subject_id: s.id,
    subject_name: s.name,
    min_periods_per_week: 4,
    max_periods_per_day: 2,
    preferred_periods_per_week: null,
    requires_double_period: false,
    double_period_count: null,
    required_room_type: null,
    preferred_room_id: null,
    class_id: null,
  }));

  const teachers: TeacherInputV2[] = [];
  for (let i = 0; i < 5; i++) {
    const subjectsForT = subjects.slice(0, 2 + (i % 2)).map((s) => s.id);
    teachers.push({
      staff_profile_id: `t-${i}`,
      name: `Teacher ${i}`,
      competencies: subjectsForT.map((sid) => ({
        subject_id: sid,
        year_group_id: 'yg-1',
        class_id: null,
      })),
      availability: [],
      preferences: [],
      max_periods_per_week: 18,
      max_periods_per_day: 5,
      max_supervision_duties_per_week: null,
    });
  }

  const rooms: RoomInfoV2[] = [
    { room_id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: true },
    { room_id: 'room-2', room_type: 'classroom', capacity: 30, is_exclusive: true },
    { room_id: 'room-3', room_type: 'classroom', capacity: 30, is_exclusive: true },
  ];

  return {
    year_groups: yearGroups,
    curriculum,
    teachers,
    rooms,
    room_closures: [],
    break_groups: [],
    pinned_entries: [],
    student_overlaps: [],
    settings: defaultSettings(0, 10),
  };
}

// ─── Tier 2: stress-a baseline ──────────────────────────────────────────────

export function buildTier2StressABaseline(): SolverInputV2 {
  // 6 year groups, 10 sections (Y1–Y3 are pairs, Y4–Y6 are singletons + extra),
  // 20 teachers, 66 curriculum entries (11 subjects per year group on average),
  // 40 periods (5×8). Mirrors the documented Wave 1 stress-a shape.
  const rng = mulberry32(0xa1);
  const grid = buildTeachingGrid(5, 8);

  const subjectsAll = [
    'maths',
    'english',
    'science',
    'history',
    'geography',
    'art',
    'music',
    'pe',
    'ict',
    'religion',
    'languages',
  ];
  const subjectName = (id: string) => id[0]!.toUpperCase() + id.slice(1);

  const yearGroups: YearGroupInput[] = [];
  let classCounter = 0;
  for (let yg = 0; yg < 6; yg++) {
    const sectionCount = yg < 4 ? 2 : 1;
    const sections: YearGroupInput['sections'] = [];
    for (let s = 0; s < sectionCount; s++) {
      sections.push({
        class_id: `class-${classCounter}`,
        class_name: `Y${yg + 1}-${String.fromCharCode(65 + s)}`,
        student_count: 24,
      });
      classCounter++;
    }
    yearGroups.push({
      year_group_id: `yg-${yg}`,
      year_group_name: `Year ${yg + 1}`,
      sections,
      period_grid: grid,
    });
  }
  // Ensures we hit the documented 10 classes (4 yg × 2 + 2 yg × 1 = 10).

  // 11 subjects × 6 year groups = 66 curriculum entries. Periods/week vary
  // by subject importance (maths/english 5; sciences 4; everything else 2-3).
  const curriculum: CurriculumEntry[] = [];
  for (let yg = 0; yg < 6; yg++) {
    for (const subjectId of subjectsAll) {
      const min =
        subjectId === 'maths' || subjectId === 'english'
          ? 5
          : subjectId === 'science'
            ? 4
            : 2 + ((yg + subjectId.length) % 2);
      curriculum.push({
        year_group_id: `yg-${yg}`,
        subject_id: subjectId,
        subject_name: subjectName(subjectId),
        min_periods_per_week: min,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: subjectId === 'science' ? 'lab' : null,
        preferred_room_id: null,
        class_id: null,
      });
    }
  }

  // 20 teachers, each competent for 1–3 subjects, mostly across all year groups.
  const teachers: TeacherInputV2[] = [];
  for (let i = 0; i < 20; i++) {
    const k = 1 + Math.floor(rng() * 3);
    const chosen = pickK(rng, subjectsAll, k);
    const yearGroupIds = yearGroups.map((y) => y.year_group_id);
    const competencies = [];
    for (const subjectId of chosen) {
      for (const ygId of yearGroupIds) {
        competencies.push({
          subject_id: subjectId,
          year_group_id: ygId,
          class_id: null,
        });
      }
    }
    teachers.push({
      staff_profile_id: `t-${i}`,
      name: `Teacher ${i}`,
      competencies,
      availability: [],
      preferences: [],
      max_periods_per_week: 22,
      max_periods_per_day: 6,
      max_supervision_duties_per_week: null,
    });
  }

  const rooms: RoomInfoV2[] = [];
  for (let i = 0; i < 12; i++) {
    rooms.push({
      room_id: `room-c${i}`,
      room_type: 'classroom',
      capacity: 28,
      is_exclusive: true,
    });
  }
  for (let i = 0; i < 3; i++) {
    rooms.push({
      room_id: `room-l${i}`,
      room_type: 'lab',
      capacity: 24,
      is_exclusive: true,
    });
  }

  return {
    year_groups: yearGroups,
    curriculum,
    teachers,
    rooms,
    room_closures: [],
    break_groups: [],
    pinned_entries: [],
    student_overlaps: [],
    settings: defaultSettings(0, 30),
  };
}

// ─── Tier 2 + supervision: Stage 9 carryover §3 ───────────────────────────
//
// Same 6-year-group / 10-section / 20-teacher / 11-subject shape as
// Tier 2 baseline, plus morning-break + lunch supervision slots and a
// single break group that requires 4 yard supervisors at each. The
// parity harness uses this to confirm CP-SAT honours supervision
// assignment without over-subscribing teachers on duty — a dimension
// absent from the original 7 parity fixtures.

export function buildTier2WithSupervision(): SolverInputV2 {
  const rng = mulberry32(0xa1 ^ 0x5000);

  // 5 days × 10 period cells: P0 teaching, P1 teaching, P2 teaching,
  // P3 morning-break (yard), P4 teaching, P5 teaching, P6 lunch-break
  // (yard), P7 teaching, P8 teaching, P9 teaching.
  const grid: PeriodSlotV2[] = [];
  for (let weekday = 0; weekday < 5; weekday++) {
    const layout: Array<{
      order: number;
      startMin: number;
      durMin: number;
      kind: 'teach' | 'morning-break' | 'lunch-break';
    }> = [
      { order: 0, startMin: 8 * 60, durMin: 45, kind: 'teach' },
      { order: 1, startMin: 8 * 60 + 45, durMin: 45, kind: 'teach' },
      { order: 2, startMin: 9 * 60 + 30, durMin: 45, kind: 'teach' },
      { order: 3, startMin: 10 * 60 + 15, durMin: 20, kind: 'morning-break' },
      { order: 4, startMin: 10 * 60 + 35, durMin: 45, kind: 'teach' },
      { order: 5, startMin: 11 * 60 + 20, durMin: 45, kind: 'teach' },
      { order: 6, startMin: 12 * 60 + 5, durMin: 30, kind: 'lunch-break' },
      { order: 7, startMin: 12 * 60 + 35, durMin: 45, kind: 'teach' },
      { order: 8, startMin: 13 * 60 + 20, durMin: 45, kind: 'teach' },
      { order: 9, startMin: 14 * 60 + 5, durMin: 45, kind: 'teach' },
    ];
    for (const s of layout) {
      const endMin = s.startMin + s.durMin;
      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      grid.push({
        weekday,
        period_order: s.order,
        start_time: fmt(s.startMin),
        end_time: fmt(endMin),
        period_type: s.kind === 'teach' ? 'teaching' : 'break_supervision',
        supervision_mode: s.kind === 'teach' ? 'none' : 'yard',
        break_group_id: s.kind === 'teach' ? null : 'bg-primary',
      });
    }
  }

  const subjectsAll = [
    'maths',
    'english',
    'science',
    'history',
    'geography',
    'art',
    'music',
    'pe',
    'ict',
    'religion',
    'languages',
  ];
  const subjectName = (id: string) => id[0]!.toUpperCase() + id.slice(1);

  const yearGroups: YearGroupInput[] = [];
  let classCounter = 0;
  for (let yg = 0; yg < 6; yg++) {
    const sectionCount = yg < 4 ? 2 : 1;
    const sections: YearGroupInput['sections'] = [];
    for (let s = 0; s < sectionCount; s++) {
      sections.push({
        class_id: `class-${classCounter}`,
        class_name: `Y${yg + 1}-${String.fromCharCode(65 + s)}`,
        student_count: 24,
      });
      classCounter++;
    }
    yearGroups.push({
      year_group_id: `yg-${yg}`,
      year_group_name: `Year ${yg + 1}`,
      sections,
      period_grid: grid,
    });
  }

  const curriculum: CurriculumEntry[] = [];
  for (let yg = 0; yg < 6; yg++) {
    for (const subjectId of subjectsAll) {
      const min =
        subjectId === 'maths' || subjectId === 'english'
          ? 5
          : subjectId === 'science'
            ? 4
            : 2 + ((yg + subjectId.length) % 2);
      curriculum.push({
        year_group_id: `yg-${yg}`,
        subject_id: subjectId,
        subject_name: subjectName(subjectId),
        min_periods_per_week: min,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: subjectId === 'science' ? 'lab' : null,
        preferred_room_id: null,
        class_id: null,
      });
    }
  }

  const teachers: TeacherInputV2[] = [];
  for (let i = 0; i < 20; i++) {
    const k = 1 + Math.floor(rng() * 3);
    const chosen = pickK(rng, subjectsAll, k);
    const yearGroupIds = yearGroups.map((y) => y.year_group_id);
    const competencies = [];
    for (const subjectId of chosen) {
      for (const ygId of yearGroupIds) {
        competencies.push({
          subject_id: subjectId,
          year_group_id: ygId,
          class_id: null,
        });
      }
    }
    teachers.push({
      staff_profile_id: `t-${i}`,
      name: `Teacher ${i}`,
      competencies,
      availability: [],
      preferences: [],
      max_periods_per_week: 22,
      max_periods_per_day: 6,
      max_supervision_duties_per_week: 4,
    });
  }

  const rooms: RoomInfoV2[] = [];
  for (let i = 0; i < 12; i++) {
    rooms.push({
      room_id: `room-c${i}`,
      room_type: 'classroom',
      capacity: 28,
      is_exclusive: true,
    });
  }
  for (let i = 0; i < 3; i++) {
    rooms.push({
      room_id: `room-l${i}`,
      room_type: 'lab',
      capacity: 24,
      is_exclusive: true,
    });
  }

  // Supervision demand is computed per physical break slot, and each of
  // the 6 year groups carries its own copy of the shared grid's 2 break
  // cells × 5 weekdays = 10 physical break slots. Total 60 break slots ×
  // required_supervisor_count. With `required_supervisor_count = 1` the
  // demand is 60 duties/week, covered by 20 teachers × 4 duties/week =
  // 80 supply (75 % saturation — exercises the supervision modelling
  // cleanly without CP-SAT proving INFEASIBLE on the deterministic
  // single-worker search).
  const breakGroups = [
    {
      break_group_id: 'bg-primary',
      name: 'Primary Break',
      year_group_ids: yearGroups.map((y) => y.year_group_id),
      required_supervisor_count: 1,
    },
  ];

  return {
    year_groups: yearGroups,
    curriculum,
    teachers,
    rooms,
    room_closures: [],
    break_groups: breakGroups,
    pinned_entries: [],
    student_overlaps: [],
    settings: defaultSettings(0, 45),
  };
}

// ─── Tier 3: realistic Irish secondary ──────────────────────────────────────

export function buildTier3IrishSecondary(): SolverInputV2 {
  // 9 year groups, 30 classes (Y1-Y3 = 3 sections, Y4-Y6 = 3, Y7-Y9 = 4),
  // 60 teachers, ~200 curriculum entries, 45 periods (5×9).
  const rng = mulberry32(0xb2);
  const grid = buildTeachingGrid(5, 9);

  const subjectsCore = ['maths', 'english', 'irish', 'history', 'geography', 'religion', 'pe'];
  const subjectsLab = ['science_biology', 'science_chemistry', 'science_physics'];
  const subjectsSpec = [
    'art',
    'music',
    'ict',
    'home_economics',
    'business',
    'french',
    'german',
    'spanish',
  ];
  const subjectsAll = [...subjectsCore, ...subjectsLab, ...subjectsSpec];
  const subjectName = (id: string) =>
    id
      .split('_')
      .map((s) => s[0]!.toUpperCase() + s.slice(1))
      .join(' ');

  const yearGroups: YearGroupInput[] = [];
  let classCounter = 0;
  for (let yg = 0; yg < 9; yg++) {
    const sectionCount = yg < 6 ? 3 : 4;
    const sections: YearGroupInput['sections'] = [];
    for (let s = 0; s < sectionCount; s++) {
      sections.push({
        class_id: `class-${classCounter}`,
        class_name: `Y${yg + 1}-${String.fromCharCode(65 + s)}`,
        student_count: 26,
      });
      classCounter++;
    }
    yearGroups.push({
      year_group_id: `yg-${yg}`,
      year_group_name: `Year ${yg + 1}`,
      sections,
      period_grid: grid,
    });
  }

  // Curriculum: cores everywhere (5/wk for maths+english+irish; 3-4 for the rest),
  // sciences only in Y4+, specialisations only in Y7+.
  const curriculum: CurriculumEntry[] = [];
  for (let yg = 0; yg < 9; yg++) {
    for (const subjectId of subjectsCore) {
      curriculum.push({
        year_group_id: `yg-${yg}`,
        subject_id: subjectId,
        subject_name: subjectName(subjectId),
        min_periods_per_week:
          subjectId === 'maths' || subjectId === 'english' || subjectId === 'irish' ? 5 : 3,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
        class_id: null,
      });
    }
    if (yg >= 3) {
      for (const subjectId of subjectsLab) {
        curriculum.push({
          year_group_id: `yg-${yg}`,
          subject_id: subjectId,
          subject_name: subjectName(subjectId),
          min_periods_per_week: 3,
          max_periods_per_day: 2,
          preferred_periods_per_week: null,
          requires_double_period: false,
          double_period_count: null,
          required_room_type: 'lab',
          preferred_room_id: null,
          class_id: null,
        });
      }
    }
    if (yg >= 6) {
      for (const subjectId of subjectsSpec.slice(0, 4)) {
        curriculum.push({
          year_group_id: `yg-${yg}`,
          subject_id: subjectId,
          subject_name: subjectName(subjectId),
          min_periods_per_week: 2,
          max_periods_per_day: 1,
          preferred_periods_per_week: null,
          requires_double_period: false,
          double_period_count: null,
          required_room_type: null,
          preferred_room_id: null,
          class_id: null,
        });
      }
    }
  }

  // 60 teachers, each spec for 1-2 subjects.
  const teachers: TeacherInputV2[] = [];
  for (let i = 0; i < 60; i++) {
    const k = 1 + Math.floor(rng() * 2);
    const chosen = pickK(rng, subjectsAll, k);
    const competencies = [];
    for (const subjectId of chosen) {
      // Each teacher covers 4 random year groups for their specialty.
      const ygPool = yearGroups.map((y) => y.year_group_id);
      const ygChosen = pickK(rng, ygPool, 4);
      for (const ygId of ygChosen) {
        competencies.push({
          subject_id: subjectId,
          year_group_id: ygId,
          class_id: null,
        });
      }
    }
    teachers.push({
      staff_profile_id: `t-${i}`,
      name: `Teacher ${i}`,
      competencies,
      availability: [],
      preferences: [],
      max_periods_per_week: 22,
      max_periods_per_day: 6,
      max_supervision_duties_per_week: null,
    });
  }

  const rooms: RoomInfoV2[] = [];
  for (let i = 0; i < 28; i++) {
    rooms.push({
      room_id: `room-c${i}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: true,
    });
  }
  for (let i = 0; i < 5; i++) {
    rooms.push({
      room_id: `room-l${i}`,
      room_type: 'lab',
      capacity: 24,
      is_exclusive: true,
    });
  }

  return {
    year_groups: yearGroups,
    curriculum,
    teachers,
    rooms,
    room_closures: [],
    break_groups: [],
    pinned_entries: [],
    student_overlaps: [],
    settings: defaultSettings(0, 60),
  };
}

// ─── Adversarial fixtures ───────────────────────────────────────────────────

export function buildAdvOverDemand(): SolverInputV2 {
  // 1 class, 1 teacher, 5 teaching slots/week, demand for 8 periods.
  // Both backends should leave 3 in unassigned with a clear reason.
  const grid = buildTeachingGrid(5, 1);
  return {
    year_groups: [
      {
        year_group_id: 'yg-1',
        year_group_name: 'Year 1',
        sections: [{ class_id: 'class-A', class_name: 'Y1-A', student_count: 20 }],
        period_grid: grid,
      },
    ],
    curriculum: [
      {
        year_group_id: 'yg-1',
        subject_id: 'maths',
        subject_name: 'Maths',
        min_periods_per_week: 8,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
        class_id: null,
      },
    ],
    teachers: [
      {
        staff_profile_id: 't1',
        name: 'T1',
        competencies: [{ subject_id: 'maths', year_group_id: 'yg-1', class_id: null }],
        availability: [],
        preferences: [],
        max_periods_per_week: null,
        max_periods_per_day: null,
        max_supervision_duties_per_week: null,
      },
    ],
    rooms: [{ room_id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: true }],
    room_closures: [],
    break_groups: [],
    pinned_entries: [],
    student_overlaps: [],
    settings: defaultSettings(0, 10),
  };
}

export function buildAdvPinConflict(): SolverInputV2 {
  // Two pinned entries that double-book teacher t1 at the same time.
  // The legacy solver treats these as input data (no validation),
  // and the CP-SAT side mirrors that. The parity test asserts both
  // backends pass them through verbatim — the conflict is the orchestration
  // layer's problem to surface upstream of solver invocation.
  const grid = buildTeachingGrid(2, 2);
  return {
    year_groups: [
      {
        year_group_id: 'yg-1',
        year_group_name: 'Year 1',
        sections: [
          { class_id: 'class-A', class_name: 'Y1-A', student_count: 20 },
          { class_id: 'class-B', class_name: 'Y1-B', student_count: 20 },
        ],
        period_grid: grid,
      },
    ],
    curriculum: [
      {
        year_group_id: 'yg-1',
        subject_id: 'maths',
        subject_name: 'Maths',
        min_periods_per_week: 1,
        max_periods_per_day: 1,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
        class_id: null,
      },
    ],
    teachers: [
      {
        staff_profile_id: 't1',
        name: 'T1',
        competencies: [{ subject_id: 'maths', year_group_id: 'yg-1', class_id: null }],
        availability: [],
        preferences: [],
        max_periods_per_week: null,
        max_periods_per_day: null,
        max_supervision_duties_per_week: null,
      },
    ],
    rooms: [{ room_id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: true }],
    room_closures: [],
    break_groups: [],
    pinned_entries: [
      {
        schedule_id: 'pin-1',
        class_id: 'class-A',
        subject_id: 'maths',
        year_group_id: 'yg-1',
        room_id: 'room-1',
        teacher_staff_id: 't1',
        weekday: 0,
        period_order: 0,
      },
      {
        schedule_id: 'pin-2',
        class_id: 'class-B',
        subject_id: 'maths',
        year_group_id: 'yg-1',
        room_id: 'room-1',
        teacher_staff_id: 't1',
        weekday: 0,
        period_order: 0,
      },
    ],
    student_overlaps: [],
    settings: defaultSettings(0, 5),
  };
}

export function buildAdvNoSolution(): SolverInputV2 {
  // 'lab' subject required, but no lab room exists. Every lesson should
  // come back unassigned with a clear reason on both backends.
  const grid = buildTeachingGrid(3, 3);
  return {
    year_groups: [
      {
        year_group_id: 'yg-1',
        year_group_name: 'Year 1',
        sections: [{ class_id: 'class-A', class_name: 'Y1-A', student_count: 20 }],
        period_grid: grid,
      },
    ],
    curriculum: [
      {
        year_group_id: 'yg-1',
        subject_id: 'science',
        subject_name: 'Science',
        min_periods_per_week: 4,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: 'lab',
        preferred_room_id: null,
        class_id: null,
      },
    ],
    teachers: [
      {
        staff_profile_id: 't1',
        name: 'T1',
        competencies: [{ subject_id: 'science', year_group_id: 'yg-1', class_id: null }],
        availability: [],
        preferences: [],
        max_periods_per_week: null,
        max_periods_per_day: null,
        max_supervision_duties_per_week: null,
      },
    ],
    rooms: [
      // Only a classroom — no lab.
      { room_id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: true },
    ],
    room_closures: [],
    break_groups: [],
    pinned_entries: [],
    student_overlaps: [],
    settings: defaultSettings(0, 5),
  };
}

export function buildAdvAllPinned(): SolverInputV2 {
  // Every (class, subject, period) is pinned — solver has nothing to add.
  // Both backends should return the pin set untouched in <1 s.
  const grid = buildTeachingGrid(2, 2);
  const pinned = [];
  let scheduleId = 0;
  for (let weekday = 0; weekday < 2; weekday++) {
    for (let period = 0; period < 2; period++) {
      pinned.push({
        schedule_id: `pin-${scheduleId++}`,
        class_id: 'class-A',
        subject_id: 'maths',
        year_group_id: 'yg-1',
        room_id: 'room-1',
        teacher_staff_id: 't1',
        weekday,
        period_order: period,
      });
    }
  }
  return {
    year_groups: [
      {
        year_group_id: 'yg-1',
        year_group_name: 'Year 1',
        sections: [{ class_id: 'class-A', class_name: 'Y1-A', student_count: 20 }],
        period_grid: grid,
      },
    ],
    curriculum: [
      {
        year_group_id: 'yg-1',
        subject_id: 'maths',
        subject_name: 'Maths',
        min_periods_per_week: 4,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
        class_id: null,
      },
    ],
    teachers: [
      {
        staff_profile_id: 't1',
        name: 'T1',
        competencies: [{ subject_id: 'maths', year_group_id: 'yg-1', class_id: null }],
        availability: [],
        preferences: [],
        max_periods_per_week: null,
        max_periods_per_day: null,
        max_supervision_duties_per_week: null,
      },
    ],
    rooms: [{ room_id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: true }],
    room_closures: [],
    break_groups: [],
    pinned_entries: pinned,
    student_overlaps: [],
    settings: defaultSettings(0, 5),
  };
}

// ─── Stage 9.5.1 §B: realistic-density supervision fixtures ─────────────────
//
// Real Irish / UAE secondary schools have ~2-3 break periods per day and
// supervision is shared across multiple zones (yard, canteen, corridors,
// library, bus stop). Typical roster: 1-3 supervisors per zone per break,
// rotated across the week. Each teacher takes 1-3 duties/week.
//
// The shape uses ``required_supervisor_count`` on a single break_group to
// model "N supervisors needed simultaneously across N zones" — this is the
// schema's only way to express N>1 supervisors at the same physical break
// slot. Two break_groups instead would require two grid cells per break,
// which doesn't reflect the real layout.
//
// Supply / demand math is documented inline so a future change can re-verify:
// supply must stay >= demand × 1.1 (10% slack) or the fixture is
// infeasible-by-design and the harness should reduce the demand, NOT the
// solver behaviour.

export function buildTier3SupervisionRealisticMedium(): SolverInputV2 {
  // 5 days × 7 cells/day = 35 cells. 4 teaching + 3 break (morning,
  // lunch, afternoon). 1 year-group with 20 classes (sections). Goal:
  // CP-SAT places 100% of teaching + 100% of supervision with no
  // over-subscription, balanced break_duty.
  const rng = mulberry32(0xb1 ^ 0x5301);

  const grid: PeriodSlotV2[] = [];
  for (let weekday = 0; weekday < 5; weekday++) {
    const layout: Array<{
      order: number;
      startMin: number;
      durMin: number;
      kind: 'teach' | 'morning-break' | 'lunch-break' | 'afternoon-break';
    }> = [
      { order: 0, startMin: 8 * 60, durMin: 50, kind: 'teach' },
      { order: 1, startMin: 8 * 60 + 50, durMin: 50, kind: 'teach' },
      { order: 2, startMin: 9 * 60 + 40, durMin: 20, kind: 'morning-break' },
      { order: 3, startMin: 10 * 60, durMin: 50, kind: 'teach' },
      { order: 4, startMin: 10 * 60 + 50, durMin: 30, kind: 'lunch-break' },
      { order: 5, startMin: 11 * 60 + 20, durMin: 50, kind: 'teach' },
      { order: 6, startMin: 12 * 60 + 10, durMin: 15, kind: 'afternoon-break' },
    ];
    for (const s of layout) {
      const endMin = s.startMin + s.durMin;
      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      grid.push({
        weekday,
        period_order: s.order,
        start_time: fmt(s.startMin),
        end_time: fmt(endMin),
        period_type: s.kind === 'teach' ? 'teaching' : 'break_supervision',
        supervision_mode: s.kind === 'teach' ? 'none' : 'yard',
        break_group_id: s.kind === 'teach' ? null : 'bg-primary',
      });
    }
  }

  // 1 year-group, 20 classes, 4 teaching periods/day × 5 days = 20 slots.
  // 10 lessons/class/week leaves 50% slack.
  const sections = Array.from({ length: 20 }, (_, i) => ({
    class_id: `med-class-${i}`,
    class_name: `Y10-${String.fromCharCode(65 + i)}`,
    student_count: 22,
  }));
  const yearGroups: YearGroupInput[] = [
    {
      year_group_id: 'yg-med',
      year_group_name: 'Year 10',
      sections,
      period_grid: grid,
    },
  ];

  // 4 subjects, 2-3 periods/week each → 10 lessons/class/week × 20 classes = 200.
  const subjects = ['maths', 'english', 'science', 'humanities'];
  const curriculum: CurriculumEntry[] = subjects.map((sid, i) => ({
    year_group_id: 'yg-med',
    subject_id: sid,
    subject_name: sid[0]!.toUpperCase() + sid.slice(1),
    min_periods_per_week: i === 0 ? 3 : i === 1 ? 3 : 2,
    max_periods_per_day: 1,
    preferred_periods_per_week: null,
    requires_double_period: false,
    double_period_count: null,
    required_room_type: null,
    preferred_room_id: null,
    class_id: null,
  }));

  // 20 teachers, every teacher competent in every subject. Teaching
  // demand 200, capacity per teacher 22, supply 440 — 45% teaching
  // saturation. Supervision cap 4/week, supply 80 vs demand 60 = 33% slack.
  const teachers: TeacherInputV2[] = [];
  for (let i = 0; i < 20; i++) {
    const k = 1 + Math.floor(rng() * 3);
    const chosen = pickK(rng, subjects, Math.min(k, subjects.length));
    teachers.push({
      staff_profile_id: `med-t-${i}`,
      name: `Med Teacher ${i}`,
      competencies: chosen.map((sid) => ({
        subject_id: sid,
        year_group_id: 'yg-med',
        class_id: null,
      })),
      availability: [],
      preferences: [],
      max_periods_per_week: 22,
      max_periods_per_day: 5,
      max_supervision_duties_per_week: 4,
    });
  }

  const rooms: RoomInfoV2[] = [];
  for (let i = 0; i < 22; i++) {
    rooms.push({
      room_id: `med-r-${i}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: true,
    });
  }

  // SUPERVISION DEMAND: 1 yg × 15 break-cells (3/day × 5 days) ×
  // required_supervisor_count = 4. 60 supervisor-duties/week.
  // SUPPLY: 20 × 4 = 80. Slack = 33%.
  const breakGroups = [
    {
      break_group_id: 'bg-primary',
      name: 'Primary Break (4 zones)',
      year_group_ids: ['yg-med'],
      required_supervisor_count: 4,
    },
  ];

  return {
    year_groups: yearGroups,
    curriculum,
    teachers,
    rooms,
    room_closures: [],
    break_groups: breakGroups,
    pinned_entries: [],
    student_overlaps: [],
    // 120s budget — empirically the supervision constraint with
    // ``required_supervisor_count = 4`` on a single break_group needs
    // ~60-90s of search time before CP-SAT finds a feasible solution
    // that hits 100% supervision. With 60s the greedy fallback (which
    // doesn't model supervision) returns and supervision is dropped.
    // Early-stop will halt earlier when convergence is detected.
    settings: defaultSettings(0, 120),
  };
}

export function buildTier3SupervisionRealisticLarge(): SolverInputV2 {
  // 5 days × 7 cells/day = 35 cells. 4 teaching + 3 break.
  // 1 year-group with 60 classes (sections). 600 lessons. 9-zone
  // supervision (135 duties) under tight supply (16% slack).
  const rng = mulberry32(0xb2 ^ 0x5302);

  const grid: PeriodSlotV2[] = [];
  for (let weekday = 0; weekday < 5; weekday++) {
    const layout: Array<{
      order: number;
      startMin: number;
      durMin: number;
      kind: 'teach' | 'morning-break' | 'lunch-break' | 'afternoon-break';
    }> = [
      { order: 0, startMin: 8 * 60, durMin: 50, kind: 'teach' },
      { order: 1, startMin: 8 * 60 + 50, durMin: 50, kind: 'teach' },
      { order: 2, startMin: 9 * 60 + 40, durMin: 20, kind: 'morning-break' },
      { order: 3, startMin: 10 * 60, durMin: 50, kind: 'teach' },
      { order: 4, startMin: 10 * 60 + 50, durMin: 30, kind: 'lunch-break' },
      { order: 5, startMin: 11 * 60 + 20, durMin: 50, kind: 'teach' },
      { order: 6, startMin: 12 * 60 + 10, durMin: 15, kind: 'afternoon-break' },
    ];
    for (const s of layout) {
      const endMin = s.startMin + s.durMin;
      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      grid.push({
        weekday,
        period_order: s.order,
        start_time: fmt(s.startMin),
        end_time: fmt(endMin),
        period_type: s.kind === 'teach' ? 'teaching' : 'break_supervision',
        supervision_mode: s.kind === 'teach' ? 'none' : 'yard',
        break_group_id: s.kind === 'teach' ? null : 'bg-large',
      });
    }
  }

  // 60 classes × 10 lessons each = 600 teaching demand. 4 teaching slots/day
  // × 5 days = 20 slots/class/week, 50% saturation per class.
  const sections = Array.from({ length: 60 }, (_, i) => ({
    class_id: `lrg-class-${i}`,
    class_name: `LCL-${i}`,
    student_count: 24,
  }));
  const yearGroups: YearGroupInput[] = [
    {
      year_group_id: 'yg-lrg',
      year_group_name: 'Large School',
      sections,
      period_grid: grid,
    },
  ];

  const subjects = ['maths', 'english', 'science', 'humanities'];
  const curriculum: CurriculumEntry[] = subjects.map((sid, i) => ({
    year_group_id: 'yg-lrg',
    subject_id: sid,
    subject_name: sid[0]!.toUpperCase() + sid.slice(1),
    min_periods_per_week: i === 0 ? 3 : i === 1 ? 3 : 2,
    max_periods_per_day: 1,
    preferred_periods_per_week: null,
    requires_double_period: false,
    double_period_count: null,
    required_room_type: null,
    preferred_room_id: null,
    class_id: null,
  }));

  // 60 teachers; teaching demand 600 / supply (60 × 22) = 45% saturation.
  // SUPERVISION SUPPLY (deviates from spec to keep fixture feasible):
  //   60 % at cap 3 = 36 × 3 = 108
  //   40 % at cap 2 = 24 × 2 =  48
  //                   ──────────
  //                            156   (vs spec's "60% at 2, 40% at 1" = 96)
  // The spec's numbers (96 supply vs 135 demand = 71% saturation) are
  // infeasible by design. Per the stage doc's "if something goes wrong"
  // guidance: bump supply until supply >= demand × 1.1. Final ratio:
  // 156 / 135 = 1.156 → 16% slack, comfortably above the 10% threshold.
  const teachers: TeacherInputV2[] = [];
  for (let i = 0; i < 60; i++) {
    const k = 1 + Math.floor(rng() * 3);
    const chosen = pickK(rng, subjects, Math.min(k, subjects.length));
    const supervisionCap = i < 36 ? 3 : 2;
    teachers.push({
      staff_profile_id: `lrg-t-${i}`,
      name: `Lrg Teacher ${i}`,
      competencies: chosen.map((sid) => ({
        subject_id: sid,
        year_group_id: 'yg-lrg',
        class_id: null,
      })),
      availability: [],
      preferences: [],
      max_periods_per_week: 22,
      max_periods_per_day: 6,
      max_supervision_duties_per_week: supervisionCap,
    });
  }

  const rooms: RoomInfoV2[] = [];
  for (let i = 0; i < 65; i++) {
    rooms.push({
      room_id: `lrg-r-${i}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: true,
    });
  }

  // SUPERVISION DEMAND: 1 yg × 15 break-cells × 9 zones = 135.
  const breakGroups = [
    {
      break_group_id: 'bg-large',
      name: 'Primary Break (9 zones)',
      year_group_ids: ['yg-lrg'],
      required_supervisor_count: 9,
    },
  ];

  return {
    year_groups: yearGroups,
    curriculum,
    teachers,
    rooms,
    room_closures: [],
    break_groups: breakGroups,
    pinned_entries: [],
    student_overlaps: [],
    // 240s budget for the tighter supply / 9-zone fixture. Same reasoning
    // as the medium variant — supervision-heavy problems need real search
    // time. Early-stop will halt earlier when convergence is detected.
    settings: defaultSettings(0, 240),
  };
}

// ─── Stage 9.5.2 tier-4 CI addition ────────────────────────────────────────
//
// Tier-4 is a 50-class / 80-teacher / ~1100-lesson fixture. Full-budget
// runs happen via ``benchmark_scale.py`` during Stage 9.5.2 measurements;
// for CI we only want a smoke-sized run (60 s budget) so the solver-py
// CI job stays under its 15-min timeout. We defer to the real generator
// in ``tier-4-5-6-generators.ts`` and only override the solver budget
// here. Tier-5 and tier-6 are intentionally excluded from CI — the spec
// treats them as nightly / on-demand.

import { buildTier4IrishSecondaryLarge } from './tier-4-5-6-generators';

function buildTier4CiSmoke(): SolverInputV2 {
  const full = buildTier4IrishSecondaryLarge(0);
  // Shorter budget for CI; the measurement matrix runs separately.
  full.settings.max_solver_duration_seconds = 60;
  return full;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export interface ParityFixture {
  name: string;
  category: 'tier' | 'adversarial';
  build: () => SolverInputV2;
}

export const PARITY_FIXTURES: ParityFixture[] = [
  { name: 'tier-1-tiny', category: 'tier', build: buildTier1Tiny },
  { name: 'tier-2-stress-a-baseline', category: 'tier', build: buildTier2StressABaseline },
  { name: 'tier-2-with-supervision', category: 'tier', build: buildTier2WithSupervision },
  { name: 'tier-3-irish-secondary', category: 'tier', build: buildTier3IrishSecondary },
  {
    name: 'tier-3-supervision-realistic-medium',
    category: 'tier',
    build: buildTier3SupervisionRealisticMedium,
  },
  {
    name: 'tier-3-supervision-realistic-large',
    category: 'tier',
    build: buildTier3SupervisionRealisticLarge,
  },
  // Stage 9.5.2 addition: scale-proof tier-4 at a CI-sized budget.
  { name: 'tier-4-irish-secondary-large-ci', category: 'tier', build: buildTier4CiSmoke },
  { name: 'adv-over-demand', category: 'adversarial', build: buildAdvOverDemand },
  { name: 'adv-pin-conflict', category: 'adversarial', build: buildAdvPinConflict },
  { name: 'adv-no-solution', category: 'adversarial', build: buildAdvNoSolution },
  { name: 'adv-all-pinned', category: 'adversarial', build: buildAdvAllPinned },
];
