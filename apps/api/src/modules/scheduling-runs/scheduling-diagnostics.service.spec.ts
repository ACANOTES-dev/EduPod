import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { DiagnosticsTranslatorService } from './diagnostics-i18n/translator.service';
import { SchedulingDiagnosticsService } from './scheduling-diagnostics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUN_ID = 'run-uuid-0001';
const YG_GRADE3 = 'yg-grade-3';
const SUBJ_ARABIC = 'subj-arabic';
const SUBJ_MATH = 'subj-math';
const CLASS_3A = 'class-3a';
const CLASS_3B = 'class-3b';
const T1 = 't-one';
const T2 = 't-two';

describe('SchedulingDiagnosticsService', () => {
  let service: SchedulingDiagnosticsService;
  let mockPrisma: { schedulingRun: { findFirst: jest.Mock } };

  beforeEach(async () => {
    mockPrisma = {
      schedulingRun: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingDiagnosticsService,
        DiagnosticsTranslatorService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(SchedulingDiagnosticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when run does not exist', async () => {
    mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
    await expect(service.analyse(TENANT_ID, RUN_ID)).rejects.toThrow(NotFoundException);
  });

  it('returns an empty diagnostics list when no periods are unassigned (V3)', async () => {
    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'completed',
      result_json: {
        result_schema_version: 'v3',
        solve_status: 'OPTIMAL',
        entries: [],
        unassigned: [],
        quality_metrics: {},
        objective_breakdown: [],
        hard_violations: 0,
        soft_score: 0,
        soft_max_score: 0,
        duration_ms: 100,
        constraint_snapshot: [],
        early_stop_triggered: false,
        early_stop_reason: 'not_triggered',
        time_saved_ms: 0,
      },
      config_snapshot: {
        period_slots: [],
        classes: [],
        subjects: [],
        teachers: [],
        rooms: [],
        room_closures: [],
        break_groups: [],
        demand: [],
        preferences: {
          class_preferences: [],
          teacher_preferences: [],
          global_weights: {},
          preference_weights: {},
        },
        pinned: [],
        student_overlaps: [],
        settings: { max_solver_duration_seconds: 120, solver_seed: null },
        constraint_snapshot: [],
      },
      feasibility_report: null,
      diagnostics_refined_report: null,
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.summary.total_unassigned_periods).toBe(0);
    expect(result.summary.can_proceed).toBe(true);
  });

  it('detects teacher supply shortage with V3 contract', async () => {
    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'completed',
      result_json: {
        result_schema_version: 'v3',
        solve_status: 'FEASIBLE',
        entries: [],
        unassigned: [
          {
            class_id: CLASS_3A,
            subject_id: SUBJ_ARABIC,
            year_group_id: YG_GRADE3,
            lesson_index: 0,
            reason: 'No slot',
          },
          {
            class_id: CLASS_3A,
            subject_id: SUBJ_ARABIC,
            year_group_id: YG_GRADE3,
            lesson_index: 1,
            reason: 'No slot',
          },
          {
            class_id: CLASS_3B,
            subject_id: SUBJ_ARABIC,
            year_group_id: YG_GRADE3,
            lesson_index: 0,
            reason: 'No slot',
          },
        ],
        quality_metrics: {},
        objective_breakdown: [],
        hard_violations: 0,
        soft_score: 0,
        soft_max_score: 0,
        duration_ms: 5000,
        constraint_snapshot: [],
        early_stop_triggered: false,
        early_stop_reason: 'not_triggered',
        time_saved_ms: 0,
      },
      config_snapshot: {
        period_slots: [
          {
            index: 0,
            year_group_id: YG_GRADE3,
            weekday: 1,
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
            class_id: CLASS_3A,
            class_name: '3A',
            year_group_id: YG_GRADE3,
            year_group_name: 'Grade 3',
            student_count: 25,
          },
          {
            class_id: CLASS_3B,
            class_name: '3B',
            year_group_id: YG_GRADE3,
            year_group_name: 'Grade 3',
            student_count: 25,
          },
        ],
        subjects: [{ subject_id: SUBJ_ARABIC, subject_name: 'Arabic' }],
        teachers: [
          {
            staff_profile_id: T1,
            name: 'Ms Ali',
            competencies: [{ subject_id: SUBJ_ARABIC, year_group_id: YG_GRADE3, class_id: null }],
            availability: [],
            max_periods_per_week: 2,
            max_periods_per_day: 5,
            max_supervision_duties_per_week: null,
          },
        ],
        rooms: [],
        room_closures: [],
        break_groups: [],
        demand: [
          {
            class_id: CLASS_3A,
            subject_id: SUBJ_ARABIC,
            periods_per_week: 20,
            max_per_day: 2,
            required_doubles: 0,
            required_room_type: null,
          },
          {
            class_id: CLASS_3B,
            subject_id: SUBJ_ARABIC,
            periods_per_week: 20,
            max_per_day: 2,
            required_doubles: 0,
            required_room_type: null,
          },
        ],
        preferences: {
          class_preferences: [],
          teacher_preferences: [],
          global_weights: {},
          preference_weights: {},
        },
        pinned: [],
        student_overlaps: [],
        settings: { max_solver_duration_seconds: 120, solver_seed: null },
        constraint_snapshot: [],
      },
      feasibility_report: null,
      diagnostics_refined_report: null,
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    const supply = result.diagnostics.find((d) => d.category === 'teacher_supply_shortage');
    expect(supply).toBeDefined();
    expect(supply!.severity).toBe('critical');
    expect(supply!.affected.subject?.name).toBe('Arabic');
    expect(supply!.affected.year_group?.name).toBe('Grade 3');
    expect(supply!.solutions.length).toBeGreaterThan(0);
    expect(result.summary.can_proceed).toBe(false);
  });

  it('emits medium-severity fallback for unassigned that have no specific diagnosis', async () => {
    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'completed',
      result_json: {
        result_schema_version: 'v3',
        solve_status: 'FEASIBLE',
        entries: [],
        unassigned: [
          {
            class_id: CLASS_3A,
            subject_id: SUBJ_MATH,
            year_group_id: YG_GRADE3,
            lesson_index: 0,
            reason: 'Grid saturated',
          },
        ],
        quality_metrics: {},
        objective_breakdown: [],
        hard_violations: 0,
        soft_score: 0,
        soft_max_score: 0,
        duration_ms: 100,
        constraint_snapshot: [],
        early_stop_triggered: false,
        early_stop_reason: 'not_triggered',
        time_saved_ms: 0,
      },
      config_snapshot: {
        period_slots: [
          {
            index: 0,
            year_group_id: YG_GRADE3,
            weekday: 1,
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
            class_id: CLASS_3A,
            class_name: '3A',
            year_group_id: YG_GRADE3,
            year_group_name: 'Grade 3',
            student_count: 25,
          },
        ],
        subjects: [{ subject_id: SUBJ_MATH, subject_name: 'Mathematics' }],
        teachers: [
          {
            staff_profile_id: T1,
            name: 'Mr Khan',
            competencies: [{ subject_id: SUBJ_MATH, year_group_id: YG_GRADE3, class_id: null }],
            availability: [{ weekday: 1, from: '08:00', to: '15:00' }],
            max_periods_per_week: 25,
            max_periods_per_day: 5,
            max_supervision_duties_per_week: null,
          },
          {
            staff_profile_id: T2,
            name: 'Ms Patel',
            competencies: [{ subject_id: SUBJ_MATH, year_group_id: YG_GRADE3, class_id: null }],
            availability: [{ weekday: 1, from: '08:00', to: '15:00' }],
            max_periods_per_week: 25,
            max_periods_per_day: 5,
            max_supervision_duties_per_week: null,
          },
        ],
        rooms: [],
        room_closures: [],
        break_groups: [],
        demand: [
          {
            class_id: CLASS_3A,
            subject_id: SUBJ_MATH,
            periods_per_week: 4,
            max_per_day: 1,
            required_doubles: 0,
            required_room_type: null,
          },
        ],
        preferences: {
          class_preferences: [],
          teacher_preferences: [],
          global_weights: {},
          preference_weights: {},
        },
        pinned: [],
        student_overlaps: [],
        settings: { max_solver_duration_seconds: 120, solver_seed: null },
        constraint_snapshot: [],
      },
      feasibility_report: null,
      diagnostics_refined_report: null,
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.category).toBe('unassigned_slots');
    expect(result.diagnostics[0]?.severity).toBe('medium');
    expect(result.diagnostics[0]?.affected.subject?.name).toBe('Mathematics');
  });

  it('flags workload cap hits', async () => {
    const entries = Array.from({ length: 20 }).map((_, i) => ({
      class_id: CLASS_3A,
      subject_id: SUBJ_MATH,
      year_group_id: YG_GRADE3,
      period_index: i,
      weekday: 1,
      period_order: i + 1,
      start_time: '08:00',
      end_time: '08:50',
      teacher_staff_id: T1,
      room_id: null,
      room_assignment_source: 'solver' as const,
      is_pinned: false,
      is_supervision: false,
      break_group_id: null,
      preference_satisfaction: [],
    }));

    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'completed',
      result_json: {
        result_schema_version: 'v3',
        solve_status: 'FEASIBLE',
        entries,
        unassigned: [],
        quality_metrics: {},
        objective_breakdown: [],
        hard_violations: 0,
        soft_score: 0,
        soft_max_score: 0,
        duration_ms: 100,
        constraint_snapshot: [],
        early_stop_triggered: false,
        early_stop_reason: 'not_triggered',
        time_saved_ms: 0,
      },
      config_snapshot: {
        period_slots: [],
        classes: [],
        subjects: [],
        teachers: [
          {
            staff_profile_id: T1,
            name: 'Mrs Lynch',
            competencies: [],
            availability: [],
            max_periods_per_week: 20,
            max_periods_per_day: 5,
            max_supervision_duties_per_week: null,
          },
        ],
        rooms: [],
        room_closures: [],
        break_groups: [],
        demand: [],
        preferences: {
          class_preferences: [],
          teacher_preferences: [],
          global_weights: {},
          preference_weights: {},
        },
        pinned: [],
        student_overlaps: [],
        settings: { max_solver_duration_seconds: 120, solver_seed: null },
        constraint_snapshot: [],
      },
      feasibility_report: null,
      diagnostics_refined_report: null,
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    const cap = result.diagnostics.find((d) => d.category === 'workload_cap_hit');
    expect(cap).toBeDefined();
    expect(cap!.severity).toBe('high');
    expect(cap!.affected.teachers?.[0]?.name).toBe('Mrs Lynch');
  });

  it('returns blocked diagnostics for a blocked run', async () => {
    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'blocked',
      result_json: null,
      config_snapshot: null,
      feasibility_report: {
        verdict: 'infeasible',
        checks: [{ code: 'global_capacity_shortfall', passed: false }],
        ceiling: {
          total_demand_periods: 100,
          total_qualified_teacher_periods: 50,
          slack_periods: -50,
        },
        diagnosed_blockers: [
          {
            id: 'feasibility-global-capacity',
            check: 'global_capacity_shortfall',
            severity: 'critical',
            headline: 'Not enough capacity',
            detail: '50 periods short',
            affected: {},
            quantified_impact: { blocked_periods: 50, blocked_percentage: 50 },
            solutions: [],
          },
        ],
      },
      diagnostics_refined_report: null,
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    expect(result.summary.feasibility_verdict).toBe('infeasible');
    expect(result.summary.can_proceed).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.category).toBe('global_capacity_shortfall');
  });

  it('handles legacy V2 runs gracefully', async () => {
    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'completed',
      result_json: {
        entries: [],
        unassigned: [{ periods_remaining: 3 }],
      },
      config_snapshot: {
        year_groups: [],
        curriculum: [],
        teachers: [],
      },
      feasibility_report: null,
      diagnostics_refined_report: null,
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    expect(result.summary.total_unassigned_periods).toBe(3);
    expect(result.diagnostics).toHaveLength(0);
  });
});
