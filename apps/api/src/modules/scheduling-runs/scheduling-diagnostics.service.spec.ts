import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

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
      providers: [SchedulingDiagnosticsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(SchedulingDiagnosticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when run does not exist', async () => {
    mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
    await expect(service.analyse(TENANT_ID, RUN_ID)).rejects.toThrow(NotFoundException);
  });

  it('returns an empty diagnostics list when no periods are unassigned', async () => {
    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'completed',
      result_json: { entries: [], unassigned: [] },
      config_snapshot: { year_groups: [], curriculum: [], teachers: [] },
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.summary.total_unassigned_periods).toBe(0);
    expect(result.summary.can_proceed).toBe(true);
  });

  it('detects a teacher supply shortage and emits a critical diagnostic with a concrete fix', async () => {
    // 2 classes × 8 min periods/week = 16 Arabic periods needed.
    // 1 qualified teacher with cap 25 → implied 16/1 = 16 ≤ 25 → should NOT fire.
    // Make it fail: 2 classes × 40 periods/week = 80 demand, 1 teacher, 80 > 25 → critical.
    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'completed',
      result_json: {
        entries: [],
        unassigned: [
          {
            class_id: CLASS_3A,
            subject_id: SUBJ_ARABIC,
            year_group_id: YG_GRADE3,
            periods_remaining: 5,
            reason: 'No valid slot found due to constraint conflicts',
          },
          {
            class_id: CLASS_3B,
            subject_id: SUBJ_ARABIC,
            year_group_id: YG_GRADE3,
            periods_remaining: 3,
            reason: 'No valid slot found due to constraint conflicts',
          },
        ],
      },
      config_snapshot: {
        year_groups: [
          {
            year_group_id: YG_GRADE3,
            year_group_name: 'Grade 3',
            sections: [
              { class_id: CLASS_3A, class_name: '3A' },
              { class_id: CLASS_3B, class_name: '3B' },
            ],
          },
        ],
        curriculum: [
          {
            year_group_id: YG_GRADE3,
            subject_id: SUBJ_ARABIC,
            subject_name: 'Arabic',
            min_periods_per_week: 40,
            max_periods_per_day: 2,
          },
        ],
        teachers: [
          {
            staff_profile_id: T1,
            name: 'Ms Ali',
            competencies: [{ subject_id: SUBJ_ARABIC, year_group_id: YG_GRADE3, class_id: null }],
            availability: [],
            max_periods_per_week: 25,
            max_periods_per_day: 5,
          },
        ],
      },
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    const supply = result.diagnostics.find((d) => d.category === 'teacher_supply_shortage');
    expect(supply).toBeDefined();
    expect(supply!.severity).toBe('critical');
    expect(supply!.metrics?.['supply']).toBe(1);
    expect(supply!.metrics?.['demand_periods_per_week']).toBe(80);
    expect(supply!.metrics?.['additional_teachers_needed']).toBeGreaterThan(0);
    expect(supply!.affected.subject?.name).toBe('Arabic');
    expect(supply!.affected.year_group?.name).toBe('Grade 3');
    expect(supply!.affected.classes).toHaveLength(2);
    expect(supply!.solutions).toHaveLength(3);
    expect(supply!.solutions[0]?.effort).toBe('quick');
    expect(supply!.solutions[2]?.effort).toBe('long');
    expect(result.summary.total_unassigned_periods).toBe(8);
    expect(result.summary.total_unassigned_gaps).toBe(2);
    expect(result.summary.critical_issues).toBe(1);
    expect(result.summary.can_proceed).toBe(false);
  });

  it('emits a medium-severity fallback when unassigned entries do not match a specific diagnosis', async () => {
    // Plenty of supply (2 teachers for 8 periods), so no shortage diagnosis fires
    // but the 1 unassigned period still needs to be reported to the user.
    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'completed',
      result_json: {
        entries: [],
        unassigned: [
          {
            class_id: CLASS_3A,
            subject_id: SUBJ_MATH,
            year_group_id: YG_GRADE3,
            periods_remaining: 1,
            reason: 'No valid slot found due to constraint conflicts',
          },
        ],
      },
      config_snapshot: {
        year_groups: [
          {
            year_group_id: YG_GRADE3,
            year_group_name: 'Grade 3',
            sections: [{ class_id: CLASS_3A, class_name: '3A' }],
          },
        ],
        curriculum: [
          {
            year_group_id: YG_GRADE3,
            subject_id: SUBJ_MATH,
            subject_name: 'Mathematics',
            min_periods_per_week: 4,
            max_periods_per_day: 1,
          },
        ],
        teachers: [
          {
            staff_profile_id: T1,
            name: 'Mr Khan',
            competencies: [{ subject_id: SUBJ_MATH, year_group_id: YG_GRADE3, class_id: null }],
            availability: [
              { weekday: 1, from: '08:00', to: '15:00' },
              { weekday: 2, from: '08:00', to: '15:00' },
            ],
            max_periods_per_week: 25,
            max_periods_per_day: 5,
          },
          {
            staff_profile_id: T2,
            name: 'Ms Patel',
            competencies: [{ subject_id: SUBJ_MATH, year_group_id: YG_GRADE3, class_id: null }],
            availability: [
              { weekday: 1, from: '08:00', to: '15:00' },
              { weekday: 2, from: '08:00', to: '15:00' },
            ],
            max_periods_per_week: 25,
            max_periods_per_day: 5,
          },
        ],
      },
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.category).toBe('unassigned_slots');
    expect(result.diagnostics[0]?.severity).toBe('medium');
    expect(result.diagnostics[0]?.affected.subject?.name).toBe('Mathematics');
    expect(result.diagnostics[0]?.solutions).toHaveLength(3);
    expect(result.summary.medium_issues).toBe(1);
    expect(result.summary.critical_issues).toBe(0);
  });

  it('flags workload cap hits when teachers are scheduled at or beyond their cap', async () => {
    // Teacher has 20 periods scheduled, cap is 20 → hit.
    const entries = Array.from({ length: 20 }).map(() => ({
      class_id: CLASS_3A,
      subject_id: SUBJ_MATH,
      year_group_id: YG_GRADE3,
      teacher_staff_id: T1,
      weekday: 1,
      period_order: 1,
    }));

    mockPrisma.schedulingRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'completed',
      result_json: { entries, unassigned: [] },
      config_snapshot: {
        year_groups: [],
        curriculum: [],
        teachers: [
          {
            staff_profile_id: T1,
            name: 'Mrs Lynch',
            competencies: [],
            availability: [],
            max_periods_per_week: 20,
            max_periods_per_day: 5,
          },
        ],
      },
    });

    const result = await service.analyse(TENANT_ID, RUN_ID);

    const cap = result.diagnostics.find((d) => d.category === 'workload_cap_hit');
    expect(cap).toBeDefined();
    expect(cap!.severity).toBe('high');
    expect(cap!.affected.teachers?.[0]?.name).toBe('Mrs Lynch');
    expect(cap!.solutions).toHaveLength(3);
  });
});
