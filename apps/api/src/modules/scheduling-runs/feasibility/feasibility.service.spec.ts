import type { SolverInputV3 } from '@school/shared/scheduler';

import { FeasibilityService } from './feasibility.service';

// ─── Minimal valid input factory ────────────────────────────────────────────

function makeInput(overrides: Partial<SolverInputV3> = {}): SolverInputV3 {
  return {
    period_slots: [
      {
        index: 0,
        year_group_id: 'yg1',
        weekday: 1,
        period_order: 1,
        start_time: '08:00',
        end_time: '08:50',
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      },
      {
        index: 1,
        year_group_id: 'yg1',
        weekday: 1,
        period_order: 2,
        start_time: '09:00',
        end_time: '09:50',
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      },
      {
        index: 2,
        year_group_id: 'yg1',
        weekday: 2,
        period_order: 1,
        start_time: '08:00',
        end_time: '08:50',
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      },
      {
        index: 3,
        year_group_id: 'yg1',
        weekday: 2,
        period_order: 2,
        start_time: '09:00',
        end_time: '09:50',
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      },
      {
        index: 4,
        year_group_id: 'yg1',
        weekday: 3,
        period_order: 1,
        start_time: '08:00',
        end_time: '08:50',
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      },
    ],
    classes: [
      {
        class_id: 'c1',
        class_name: 'Class A',
        year_group_id: 'yg1',
        year_group_name: 'Year 1',
        student_count: 25,
      },
    ],
    subjects: [{ subject_id: 's1', subject_name: 'Maths' }],
    teachers: [
      {
        staff_profile_id: 't1',
        name: 'Mr. Smith',
        competencies: [{ subject_id: 's1', year_group_id: 'yg1', class_id: null }],
        availability: [
          { weekday: 1, from: '08:00', to: '10:00' },
          { weekday: 2, from: '08:00', to: '10:00' },
          { weekday: 3, from: '08:00', to: '10:00' },
        ],
        max_periods_per_week: 25,
        max_periods_per_day: null,
        max_supervision_duties_per_week: null,
      },
    ],
    rooms: [],
    room_closures: [],
    break_groups: [],
    demand: [
      {
        class_id: 'c1',
        subject_id: 's1',
        periods_per_week: 3,
        max_per_day: null,
        required_doubles: 0,
        required_room_type: null,
      },
    ],
    preferences: {
      class_preferences: [],
      teacher_preferences: [],
      global_weights: {
        even_subject_spread: 1,
        minimise_teacher_gaps: 1,
        room_consistency: 1,
        workload_balance: 1,
        break_duty_balance: 1,
      },
      preference_weights: { low: 1, medium: 2, high: 3 },
    },
    pinned: [],
    student_overlaps: [],
    settings: { max_solver_duration_seconds: 120, solver_seed: null },
    constraint_snapshot: [],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FeasibilityService', () => {
  let service: FeasibilityService;

  beforeEach(() => {
    service = new FeasibilityService();
  });

  it('reports feasible for a well-formed input', async () => {
    const report = await service.runFeasibilitySweep('tenant-1', makeInput());
    expect(report.verdict).toBe('feasible');
    expect(report.diagnosed_blockers).toHaveLength(0);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it('check 1: flags global capacity shortfall', async () => {
    const input = makeInput({
      teachers: [
        {
          staff_profile_id: 't1',
          name: 'Mr. Smith',
          competencies: [{ subject_id: 's1', year_group_id: 'yg1', class_id: null }],
          availability: [{ weekday: 1, from: '08:00', to: '08:50' }],
          max_periods_per_week: 1,
          max_periods_per_day: null,
          max_supervision_duties_per_week: null,
        },
      ],
      demand: [
        {
          class_id: 'c1',
          subject_id: 's1',
          periods_per_week: 5,
          max_per_day: null,
          required_doubles: 0,
          required_room_type: null,
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    expect(report.verdict).toBe('infeasible');
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'global_capacity_shortfall');
    expect(blocker).toBeDefined();
    expect(blocker?.quantified_impact.blocked_periods).toBe(4);
  });

  it('check 2: flags per-subject capacity shortfall', async () => {
    const input = makeInput({
      subjects: [
        { subject_id: 's1', subject_name: 'Maths' },
        { subject_id: 's2', subject_name: 'Science' },
      ],
      demand: [
        {
          class_id: 'c1',
          subject_id: 's1',
          periods_per_week: 2,
          max_per_day: null,
          required_doubles: 0,
          required_room_type: null,
        },
        {
          class_id: 'c1',
          subject_id: 's2',
          periods_per_week: 3,
          max_per_day: null,
          required_doubles: 0,
          required_room_type: null,
        },
      ],
      // Teacher only qualified for s1, not s2
      teachers: [
        {
          staff_profile_id: 't1',
          name: 'Mr. Smith',
          competencies: [{ subject_id: 's1', year_group_id: 'yg1', class_id: null }],
          availability: [
            { weekday: 1, from: '08:00', to: '10:00' },
            { weekday: 2, from: '08:00', to: '10:00' },
            { weekday: 3, from: '08:00', to: '10:00' },
          ],
          max_periods_per_week: 25,
          max_periods_per_day: null,
          max_supervision_duties_per_week: null,
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    expect(report.verdict).toBe('infeasible');
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'subject_capacity_shortfall');
    expect(blocker).toBeDefined();
    expect(blocker?.affected.subjects?.[0]?.name).toBe('Science');
  });

  it('check 3: flags unreachable class-subject', async () => {
    const input = makeInput({
      // Teacher available only on day 4, but no slots on day 4
      teachers: [
        {
          staff_profile_id: 't1',
          name: 'Mr. Smith',
          competencies: [{ subject_id: 's1', year_group_id: 'yg1', class_id: null }],
          availability: [{ weekday: 4, from: '08:00', to: '10:00' }],
          max_periods_per_week: 25,
          max_periods_per_day: null,
          max_supervision_duties_per_week: null,
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'unreachable_class_subject');
    expect(blocker).toBeDefined();
  });

  it('check 4: flags weekly overbook', async () => {
    const input = makeInput({
      demand: [
        {
          class_id: 'c1',
          subject_id: 's1',
          periods_per_week: 10,
          max_per_day: null,
          required_doubles: 0,
          required_room_type: null,
        },
      ],
    });
    // Only 5 teaching slots available
    const report = await service.runFeasibilitySweep('tenant-1', input);
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'class_weekly_overbook');
    expect(blocker).toBeDefined();
    expect(blocker?.quantified_impact.blocked_periods).toBe(5);
  });

  // Regression: feasibility blockers used to ship with `solutions: []`, leaving the
  // UI with nothing actionable to render. Every blocker now carries at least one
  // actionable fix with a deep-link target, effort tier, and unblock estimate.
  it('every blocker ships with actionable solutions', async () => {
    const input = makeInput({
      demand: [
        {
          class_id: 'c1',
          subject_id: 's1',
          periods_per_week: 10,
          max_per_day: null,
          required_doubles: 0,
          required_room_type: null,
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    const overbook = report.diagnosed_blockers.find((b) => b.check === 'class_weekly_overbook');
    expect(overbook).toBeDefined();
    expect(overbook?.solutions.length).toBeGreaterThan(0);
    for (const sol of overbook?.solutions ?? []) {
      expect(sol.headline).toBeTruthy();
      expect(sol.detail).toBeTruthy();
      expect(sol.link.href).toMatch(/^\//);
      expect(sol.link.label).toBeTruthy();
      expect(['quick', 'medium', 'long']).toContain(sol.effort);
      expect(sol.impact.would_unblock_periods).toBeGreaterThanOrEqual(0);
    }
    // Overbook specifically should deep-link to the requirements page scoped to the class.
    const reqLink = overbook?.solutions.find((s) =>
      s.link.href.includes('/scheduling/requirements'),
    );
    expect(reqLink?.link.href).toContain('class_id=c1');
  });

  it('check 5: flags teacher pin conflict', async () => {
    const input = makeInput({
      pinned: [
        {
          schedule_id: 'sch1',
          class_id: 'c1',
          subject_id: 's1',
          period_index: 0,
          teacher_staff_id: 't1',
          room_id: null,
        },
        {
          schedule_id: 'sch2',
          class_id: 'c1',
          subject_id: 's1',
          period_index: 0,
          teacher_staff_id: 't1',
          room_id: null,
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'pin_conflict_teacher');
    expect(blocker).toBeDefined();
  });

  it('check 6: flags class pin conflict', async () => {
    const input = makeInput({
      pinned: [
        {
          schedule_id: 'sch1',
          class_id: 'c1',
          subject_id: 's1',
          period_index: 0,
          teacher_staff_id: 't1',
          room_id: null,
        },
        {
          schedule_id: 'sch2',
          class_id: 'c1',
          subject_id: 's1',
          period_index: 0,
          teacher_staff_id: null,
          room_id: null,
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'pin_conflict_class');
    expect(blocker).toBeDefined();
  });

  it('check 7: flags room pin conflict', async () => {
    const input = makeInput({
      rooms: [{ room_id: 'r1', room_type: 'classroom', capacity: 30, is_exclusive: false }],
      pinned: [
        {
          schedule_id: 'sch1',
          class_id: 'c1',
          subject_id: 's1',
          period_index: 0,
          teacher_staff_id: null,
          room_id: 'r1',
        },
        {
          schedule_id: 'sch2',
          class_id: 'c1',
          subject_id: 's1',
          period_index: 0,
          teacher_staff_id: null,
          room_id: 'r1',
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'pin_conflict_room');
    expect(blocker).toBeDefined();
  });

  it('check 8: flags room-type shortfall', async () => {
    const input = makeInput({
      rooms: [{ room_id: 'r1', room_type: 'lab', capacity: 30, is_exclusive: false }],
      demand: [
        {
          class_id: 'c1',
          subject_id: 's1',
          periods_per_week: 10,
          max_per_day: null,
          required_doubles: 0,
          required_room_type: 'lab',
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'room_type_shortfall');
    expect(blocker).toBeDefined();
  });

  it('check 9: flags infeasible double period', async () => {
    const input = makeInput({
      // Only 1 teaching slot per day — no consecutive pairs possible
      period_slots: [
        {
          index: 0,
          year_group_id: 'yg1',
          weekday: 1,
          period_order: 1,
          start_time: '08:00',
          end_time: '08:50',
          period_type: 'teaching',
          supervision_mode: 'none',
          break_group_id: null,
        },
        {
          index: 1,
          year_group_id: 'yg1',
          weekday: 2,
          period_order: 1,
          start_time: '08:00',
          end_time: '08:50',
          period_type: 'teaching',
          supervision_mode: 'none',
          break_group_id: null,
        },
        {
          index: 2,
          year_group_id: 'yg1',
          weekday: 3,
          period_order: 1,
          start_time: '08:00',
          end_time: '08:50',
          period_type: 'teaching',
          supervision_mode: 'none',
          break_group_id: null,
        },
      ],
      demand: [
        {
          class_id: 'c1',
          subject_id: 's1',
          periods_per_week: 2,
          max_per_day: null,
          required_doubles: 1,
          required_room_type: null,
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'double_period_infeasible');
    expect(blocker).toBeDefined();
  });

  it('check 10: flags per-day cap conflict', async () => {
    const input = makeInput({
      teachers: [
        {
          staff_profile_id: 't1',
          name: 'Mr. Smith',
          competencies: [{ subject_id: 's1', year_group_id: 'yg1', class_id: null }],
          availability: [{ weekday: 1, from: '08:00', to: '10:00' }],
          max_periods_per_week: 25,
          max_periods_per_day: 1,
          max_supervision_duties_per_week: null,
        },
      ],
      demand: [
        {
          class_id: 'c1',
          subject_id: 's1',
          periods_per_week: 3,
          max_per_day: null,
          required_doubles: 0,
          required_room_type: null,
        },
      ],
    });
    const report = await service.runFeasibilitySweep('tenant-1', input);
    const blocker = report.diagnosed_blockers.find((b) => b.check === 'per_day_cap_conflict');
    expect(blocker).toBeDefined();
  });

  it('performance: completes in under 50ms on a moderate input', async () => {
    const start = performance.now();
    await service.runFeasibilitySweep('tenant-1', makeInput());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
