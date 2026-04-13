import { getTeacherAssignmentMode, resolveTeacherCandidates } from '../domain-v2';
import { solveV2 } from '../solver-v2';
import type { PeriodSlotV2, SolverInputV2, SolverSettingsV2, TeacherInputV2 } from '../types-v2';

// ─── Tiny shared fixture ─────────────────────────────────────────────────────

const YG = 'yg-2';
const CLASS_2A = 'class-2a';
const CLASS_2B = 'class-2b';
const SUBJECT_ENGLISH = 'subj-english';

function buildSettings(seed = 42): SolverSettingsV2 {
  return {
    max_solver_duration_seconds: 5,
    preference_weights: { low: 1, medium: 3, high: 5 },
    global_soft_weights: {
      even_subject_spread: 1,
      minimise_teacher_gaps: 1,
      room_consistency: 0,
      workload_balance: 1,
      break_duty_balance: 0,
    },
    solver_seed: seed,
  };
}

function buildGrid(): PeriodSlotV2[] {
  const grid: PeriodSlotV2[] = [];
  for (let weekday = 0; weekday < 5; weekday++) {
    for (let period = 0; period < 4; period++) {
      const start = `${String(8 + period).padStart(2, '0')}:00`;
      const end = `${String(8 + period).padStart(2, '0')}:45`;
      grid.push({
        weekday,
        period_order: period,
        start_time: start,
        end_time: end,
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      });
    }
  }
  return grid;
}

function buildInputWithTeachers(
  teachers: TeacherInputV2[],
  opts?: { sections?: Array<{ class_id: string; class_name: string }> },
): SolverInputV2 {
  const sections = opts?.sections ?? [
    { class_id: CLASS_2A, class_name: '2A' },
    { class_id: CLASS_2B, class_name: '2B' },
  ];
  return {
    year_groups: [
      {
        year_group_id: YG,
        year_group_name: 'Year 2',
        sections: sections.map((s) => ({ ...s, student_count: 20 })),
        period_grid: buildGrid(),
      },
    ],
    curriculum: [
      {
        year_group_id: YG,
        subject_id: SUBJECT_ENGLISH,
        subject_name: 'English',
        min_periods_per_week: 2,
        max_periods_per_day: 1,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
      },
    ],
    teachers,
    rooms: [],
    room_closures: [],
    break_groups: [],
    pinned_entries: [],
    student_overlaps: [],
    settings: buildSettings(),
  };
}

function makeTeacher(
  id: string,
  name: string,
  competencies: TeacherInputV2['competencies'],
): TeacherInputV2 {
  return {
    staff_profile_id: id,
    name,
    competencies,
    availability: [],
    preferences: [],
    max_periods_per_week: null,
    max_periods_per_day: null,
    max_supervision_duties_per_week: null,
  };
}

// ─── resolveTeacherCandidates ────────────────────────────────────────────────

describe('resolveTeacherCandidates', () => {
  it('returns pinned mode when exactly one pin matches', () => {
    const sarah = makeTeacher('sarah', 'Sarah', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: CLASS_2A },
    ]);
    const david = makeTeacher('david', 'David', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);

    const result = resolveTeacherCandidates([sarah, david], CLASS_2A, YG, SUBJECT_ENGLISH);
    expect(result).toEqual({ mode: 'pinned', teacher_id: 'sarah' });
  });

  it('returns pool mode when no pin exists but pool entries do', () => {
    const david = makeTeacher('david', 'David', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);
    const michael = makeTeacher('michael', 'Michael', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);

    const result = resolveTeacherCandidates([david, michael], CLASS_2B, YG, SUBJECT_ENGLISH);
    expect(result.mode).toBe('pool');
    if (result.mode !== 'pool') throw new Error('unreachable');
    expect(new Set(result.teacher_ids)).toEqual(new Set(['david', 'michael']));
  });

  it('returns missing when neither pin nor pool covers the (class, subject)', () => {
    const other = makeTeacher('other', 'Other', [
      { subject_id: 'different-subject', year_group_id: YG, class_id: null },
    ]);

    const result = resolveTeacherCandidates([other], CLASS_2A, YG, SUBJECT_ENGLISH);
    expect(result).toEqual({ mode: 'missing' });
  });

  it('mixed case: pin wins over pool for the pinned class', () => {
    const sarah = makeTeacher('sarah', 'Sarah', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: CLASS_2A },
    ]);
    const david = makeTeacher('david', 'David', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);

    const pinned = resolveTeacherCandidates([sarah, david], CLASS_2A, YG, SUBJECT_ENGLISH);
    expect(pinned).toEqual({ mode: 'pinned', teacher_id: 'sarah' });

    // For the other section, Sarah's pin doesn't apply, so the pool is used.
    const pool = resolveTeacherCandidates([sarah, david], CLASS_2B, YG, SUBJECT_ENGLISH);
    expect(pool).toEqual({ mode: 'pool', teacher_ids: ['david'] });
  });

  it('getTeacherAssignmentMode reports the mode without the candidate ids', () => {
    const david = makeTeacher('david', 'David', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);
    expect(getTeacherAssignmentMode([david], CLASS_2A, YG, SUBJECT_ENGLISH)).toBe('pool');
    expect(getTeacherAssignmentMode([], CLASS_2A, YG, SUBJECT_ENGLISH)).toBe('missing');
  });
});

// ─── solveV2 end-to-end assignment behaviour ─────────────────────────────────

describe('solveV2 — pin/pool behaviour', () => {
  it('pin-only: solver honours the pinned teacher for their class', () => {
    // Sarah is pinned to 2A English. No pool. Only 2A section so the pin can
    // be satisfied end-to-end.
    const sarah = makeTeacher('sarah', 'Sarah', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: CLASS_2A },
    ]);
    const input = buildInputWithTeachers([sarah], {
      sections: [{ class_id: CLASS_2A, class_name: '2A' }],
    });

    const output = solveV2(input);

    const englishEntries = output.entries.filter(
      (e) => e.class_id === CLASS_2A && e.subject_id === SUBJECT_ENGLISH,
    );
    expect(englishEntries.length).toBeGreaterThan(0);
    for (const e of englishEntries) {
      expect(e.teacher_staff_id).toBe('sarah');
    }
  });

  it('pool-only: solver picks a pool teacher for each section', () => {
    const david = makeTeacher('david', 'David', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);
    const michael = makeTeacher('michael', 'Michael', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);
    const input = buildInputWithTeachers([david, michael]);

    const output = solveV2(input);

    const poolIds = new Set(['david', 'michael']);
    for (const e of output.entries.filter((x) => x.subject_id === SUBJECT_ENGLISH)) {
      expect(e.teacher_staff_id).not.toBeNull();
      expect(poolIds.has(e.teacher_staff_id!)).toBe(true);
    }
  });

  it('mixed: pin applies to 2A; 2B draws from the pool', () => {
    const sarah = makeTeacher('sarah', 'Sarah', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: CLASS_2A },
    ]);
    const david = makeTeacher('david', 'David', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);
    const michael = makeTeacher('michael', 'Michael', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);
    const input = buildInputWithTeachers([sarah, david, michael]);

    const output = solveV2(input);

    const class2a = output.entries.filter(
      (e) => e.class_id === CLASS_2A && e.subject_id === SUBJECT_ENGLISH,
    );
    const class2b = output.entries.filter(
      (e) => e.class_id === CLASS_2B && e.subject_id === SUBJECT_ENGLISH,
    );

    expect(class2a.length).toBeGreaterThan(0);
    expect(class2b.length).toBeGreaterThan(0);

    for (const e of class2a) expect(e.teacher_staff_id).toBe('sarah');
    for (const e of class2b) {
      expect(['david', 'michael']).toContain(e.teacher_staff_id);
    }
  });

  it('missing: solver leaves 2A English unassigned when neither pin nor pool exists', () => {
    // Only an irrelevant competency exists; English on 2A is uncovered.
    const other = makeTeacher('other', 'Other', [
      { subject_id: 'different-subject', year_group_id: YG, class_id: null },
    ]);
    const input = buildInputWithTeachers([other], {
      sections: [{ class_id: CLASS_2A, class_name: '2A' }],
    });

    const output = solveV2(input);

    expect(output.entries.filter((e) => e.subject_id === SUBJECT_ENGLISH)).toHaveLength(0);
    expect(output.unassigned.length).toBeGreaterThan(0);
    const unassigned = output.unassigned.find((u) => u.subject_id === SUBJECT_ENGLISH);
    expect(unassigned).toBeDefined();
  });

  it('preference max_score does not include primary bonuses any more', () => {
    // Two identically-qualified pool teachers, no preferences — soft_preference_max
    // should be driven only by global soft weights, not by a primary-teacher bonus.
    const david = makeTeacher('david', 'David', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);
    const michael = makeTeacher('michael', 'Michael', [
      { subject_id: SUBJECT_ENGLISH, year_group_id: YG, class_id: null },
    ]);
    const input = buildInputWithTeachers([david, michael]);

    const output = solveV2(input);

    const globalMax =
      input.settings.global_soft_weights.even_subject_spread +
      input.settings.global_soft_weights.minimise_teacher_gaps +
      input.settings.global_soft_weights.room_consistency +
      input.settings.global_soft_weights.workload_balance +
      input.settings.global_soft_weights.break_duty_balance;

    // No per-teacher preferences in the fixture, so max_score == sum of global
    // soft weights. Post-Stage-2 there is no is_primary scoring to add extra.
    expect(output.max_score).toBe(globalMax);
  });
});
