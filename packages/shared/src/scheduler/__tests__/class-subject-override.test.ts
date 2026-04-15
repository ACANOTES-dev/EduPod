/**
 * SCHED-023 solver behaviour: a curriculum entry with `class_id` set
 * supersedes the year-group baseline for that class only. Other classes
 * in the year group continue to use the baseline.
 */
import { solveV2 } from '../solver-v2';
import type { SolverInputV2 } from '../types-v2';

function buildTwoClassInput(): SolverInputV2 {
  const periodGrid = [];
  for (let weekday = 0; weekday < 3; weekday++) {
    for (let period = 0; period < 4; period++) {
      periodGrid.push({
        weekday,
        period_order: period,
        start_time: `${String(8 + period).padStart(2, '0')}:00`,
        end_time: `${String(8 + period).padStart(2, '0')}:45`,
        period_type: 'teaching' as const,
        supervision_mode: 'none' as const,
        break_group_id: null,
      });
    }
  }

  return {
    year_groups: [
      {
        year_group_id: 'yg-1',
        year_group_name: 'Year 1',
        sections: [
          { class_id: 'class-A', class_name: 'Y1-A', student_count: 20 },
          { class_id: 'class-B', class_name: 'Y1-B', student_count: 20 },
        ],
        period_grid: periodGrid,
      },
    ],
    curriculum: [
      // Year-group baseline: Maths 3 periods/week for every class in yg-1
      {
        year_group_id: 'yg-1',
        subject_id: 'maths',
        subject_name: 'Maths',
        min_periods_per_week: 3,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
        class_id: null,
      },
      // Class-A override: 5 periods/week (class-B stays on the baseline 3)
      {
        year_group_id: 'yg-1',
        subject_id: 'maths',
        subject_name: 'Maths',
        min_periods_per_week: 5,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
        class_id: 'class-A',
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
      {
        staff_profile_id: 't2',
        name: 'T2',
        competencies: [{ subject_id: 'maths', year_group_id: 'yg-1', class_id: null }],
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
        even_subject_spread: 1,
        minimise_teacher_gaps: 1,
        room_consistency: 1,
        workload_balance: 1,
        break_duty_balance: 1,
      },
      solver_seed: 0,
    },
  };
}

describe('SCHED-023 class-subject override', () => {
  it('places the override periods for the overridden class and baseline periods for others', () => {
    const output = solveV2(buildTwoClassInput());
    expect(output.unassigned).toHaveLength(0);

    const mathsA = output.entries.filter(
      (e) => e.class_id === 'class-A' && e.subject_id === 'maths',
    );
    const mathsB = output.entries.filter(
      (e) => e.class_id === 'class-B' && e.subject_id === 'maths',
    );

    // Class A uses the override (5 periods/week), not the baseline (3).
    expect(mathsA).toHaveLength(5);
    // Class B still uses the baseline (3 periods/week), unaffected.
    expect(mathsB).toHaveLength(3);
  });
});
