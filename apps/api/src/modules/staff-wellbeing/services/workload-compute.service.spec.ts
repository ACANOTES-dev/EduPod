/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID_1 = '11111111-1111-1111-1111-111111111111';
const STAFF_ID_2 = '22222222-2222-2222-2222-222222222222';
const STAFF_ID_3 = '33333333-3333-3333-3333-333333333333';
const STAFF_ID_4 = '44444444-4444-4444-4444-444444444444';
const STAFF_ID_5 = '55555555-5555-5555-5555-555555555555';
const ACAD_YEAR_ID = 'aaaa0000-0000-0000-0000-000000000001';
const PERIOD_ID = 'bbbb0000-0000-0000-0000-000000000001';
const PREV_PERIOD_ID = 'bbbb0000-0000-0000-0000-000000000002';
const ROOM_A = 'rrrr0000-0000-0000-0000-00000000000a';
const ROOM_B = 'rrrr0000-0000-0000-0000-00000000000b';
const ROOM_C = 'rrrr0000-0000-0000-0000-00000000000c';

// ─── Mock TX ─────────────────────────────────────────────────────────────────

interface MockTxType {
  schedule: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  substitutionRecord: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  schedulePeriodTemplate: {
    findMany: jest.Mock;
  };
  teacherAbsence: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
  };
  staffProfile: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  academicYear: {
    findFirst: jest.Mock;
  };
  academicPeriod: {
    findFirst: jest.Mock;
  };
  tenantSetting: {
    findFirst: jest.Mock;
  };
}

const mockTx: MockTxType = {
  schedule: { findMany: jest.fn(), count: jest.fn() },
  substitutionRecord: { findMany: jest.fn(), count: jest.fn() },
  schedulePeriodTemplate: { findMany: jest.fn() },
  teacherAbsence: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  staffProfile: { findMany: jest.fn(), count: jest.fn() },
  academicYear: { findFirst: jest.fn() },
  academicPeriod: { findFirst: jest.fn() },
  tenantSetting: { findFirst: jest.fn() },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

import { WorkloadAggregateService } from './workload-aggregate.service';
import { WorkloadComputeService } from './workload-compute.service';
import { WorkloadDataService } from './workload-data.service';
import { WorkloadMetricsService } from './workload-metrics.service';
import { WorkloadPersonalService } from './workload-personal.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeSchedule = (
  overrides: Partial<{
    id: string;
    weekday: number;
    period_order: number | null;
    room_id: string | null;
    schedule_period_template: {
      schedule_period_type: string;
      period_name: string;
      period_order: number;
    } | null;
    class_entity: { name: string } | null;
  }> = {},
) => ({
  id: overrides.id ?? 'sched-1',
  weekday: overrides.weekday ?? 1,
  period_order: overrides.period_order ?? null,
  room_id: overrides.room_id ?? ROOM_A,
  schedule_period_template: overrides.schedule_period_template ?? {
    schedule_period_type: 'teaching',
    period_name: 'Period 1',
    period_order: 1,
  },
  class_entity: overrides.class_entity ?? { name: 'Maths 8A' },
});

const makeAcademicYear = () => ({
  id: ACAD_YEAR_ID,
  start_date: new Date('2025-09-01'),
  end_date: new Date('2026-06-30'),
});

const makeCurrentPeriod = () => ({
  id: PERIOD_ID,
  start_date: new Date('2026-01-05'),
  end_date: new Date('2026-03-27'),
});

const makePreviousPeriod = () => ({
  id: PREV_PERIOD_ID,
  start_date: new Date('2025-09-01'),
  end_date: new Date('2025-12-19'),
});

const defaultWellbeingSettings = () => ({
  settings: {
    staff_wellbeing: {
      workload_high_threshold_periods: 22,
      workload_high_threshold_covers: 8,
    },
  },
});

/** Set up standard academic year + period mocks for a test */
const setupAcademicContext = () => {
  mockTx.academicYear.findFirst.mockResolvedValue(makeAcademicYear());

  // Current period on first call, previous period on second
  let periodCallCount = 0;
  mockTx.academicPeriod.findFirst.mockImplementation(() => {
    periodCallCount++;
    if (periodCallCount === 1) return Promise.resolve(makeCurrentPeriod());
    if (periodCallCount === 2) return Promise.resolve(makePreviousPeriod());
    return Promise.resolve(null);
  });

  mockTx.tenantSetting.findFirst.mockResolvedValue(defaultWellbeingSettings());
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('WorkloadComputeService', () => {
  let service: WorkloadComputeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkloadDataService,
        WorkloadMetricsService,
        WorkloadPersonalService,
        WorkloadAggregateService,
        WorkloadComputeService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<WorkloadComputeService>(WorkloadComputeService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Teaching period count
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Teaching period count', () => {
    it('should return correct teaching period count from Schedule data', async () => {
      setupAcademicContext();

      // 5 teaching schedules for this staff member
      const schedules = [
        makeSchedule({
          id: 's1',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          id: 's2',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          id: 's3',
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          id: 's4',
          weekday: 3,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          id: 's5',
          weekday: 4,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ];

      // schedule.findMany (teaching period filter)
      mockTx.schedule.findMany.mockResolvedValue(schedules);
      // substitutionRecord.count (covers this term)
      mockTx.substitutionRecord.count.mockResolvedValue(3);
      // school average covers: needs staffProfile.findMany + covers for each
      mockTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_ID_1 }, { id: STAFF_ID_2 }]);

      const result = await service.getPersonalWorkloadSummary(TENANT_ID, STAFF_ID_1);

      expect(result.teaching_periods_per_week).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Cover duty count
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cover duty count', () => {
    it('should return correct cover count from SubstitutionRecord data', async () => {
      setupAcademicContext();

      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.substitutionRecord.count.mockResolvedValue(7);
      mockTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_ID_1 }]);

      const result = await service.getPersonalWorkloadSummary(TENANT_ID, STAFF_ID_1);

      expect(result.cover_duties_this_term).toBe(7);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Consecutive period detection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Consecutive period detection', () => {
    it('should correctly identify 3 consecutive periods', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
      ];

      const result = WorkloadComputeService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(3);
    });

    it('should correctly identify 4 consecutive periods', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P4',
            period_order: 4,
          },
        }),
      ];

      const result = WorkloadComputeService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(4);
    });

    it('should correctly identify 5+ consecutive periods', () => {
      const schedules = [
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P4',
            period_order: 4,
          },
        }),
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P5',
            period_order: 5,
          },
        }),
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P6',
            period_order: 6,
          },
        }),
      ];

      const result = WorkloadComputeService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(6);
    });

    it('should detect non-consecutive periods as separate runs', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P5',
            period_order: 5,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P6',
            period_order: 6,
          },
        }),
      ];

      const result = WorkloadComputeService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(2);
    });

    it('should compute average across days', () => {
      const schedules = [
        // Monday: 3 consecutive
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
        // Tuesday: 1 period (consecutive = 1)
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ];

      const result = WorkloadComputeService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(3);
      expect(result.average).toBe(2); // (3+1)/2
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Free period distribution
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Free period distribution', () => {
    it('should score even distribution higher than clumped', () => {
      // Even: 1 free period per day
      const evenDist = [
        { weekday: 1, free_count: 1 },
        { weekday: 2, free_count: 1 },
        { weekday: 3, free_count: 1 },
        { weekday: 4, free_count: 1 },
        { weekday: 5, free_count: 1 },
      ];

      // Clumped: all free on one day
      const clumpedDist = [
        { weekday: 1, free_count: 5 },
        { weekday: 2, free_count: 0 },
        { weekday: 3, free_count: 0 },
        { weekday: 4, free_count: 0 },
        { weekday: 5, free_count: 0 },
      ];

      const evenScore = WorkloadComputeService.scoreFreeDistribution(evenDist);
      const clumpedScore = WorkloadComputeService.scoreFreeDistribution(clumpedDist);

      expect(evenScore).toBeGreaterThan(clumpedScore);
      expect(evenScore).toBe(100); // perfect distribution
    });

    it('should compute free counts per weekday', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
      ];

      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
        { weekday: 1, period_order: 3 },
        { weekday: 2, period_order: 1 },
        { weekday: 2, period_order: 2 },
      ];

      const result = WorkloadComputeService.computeFreeDistribution(schedules, templates);

      // Monday: 3 template slots - 2 assigned = 1 free
      const monday = result.find((r) => r.weekday === 1);
      expect(monday?.free_count).toBe(1);

      // Tuesday: 2 template slots - 0 assigned = 2 free
      const tuesday = result.find((r) => r.weekday === 2);
      expect(tuesday?.free_count).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Split timetable detection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Split timetable detection', () => {
    it('should detect a morning/afternoon gap pattern', () => {
      const schedules = [
        // Morning periods
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        // Afternoon period after gap of 2+ free
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P6',
            period_order: 6,
          },
        }),
      ];

      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
        { weekday: 1, period_order: 3 },
        { weekday: 1, period_order: 4 },
        { weekday: 1, period_order: 5 },
        { weekday: 1, period_order: 6 },
      ];

      const result = WorkloadComputeService.computeSplitDays(schedules, templates);
      expect(result).toBe(1);
    });

    it('should not flag consecutive periods as split', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
      ];

      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
        { weekday: 1, period_order: 3 },
      ];

      const result = WorkloadComputeService.computeSplitDays(schedules, templates);
      expect(result).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Room change count
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Room change count', () => {
    it('should count distinct rooms per day minus 1', () => {
      const schedules = [
        // Monday: 3 different rooms = 2 room changes
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_B,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_C,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
        // Tuesday: 1 room = 0 room changes
        makeSchedule({
          weekday: 2,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 2,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
      ];

      const result = WorkloadComputeService.computeRoomChanges(schedules);
      expect(result.max).toBe(2);
      expect(result.average).toBe(1); // (2 + 0) / 2
    });

    it('should return 0 for no room_ids', () => {
      const schedules = [
        makeSchedule({ weekday: 1, room_id: null }),
        makeSchedule({ weekday: 2, room_id: null }),
      ];

      const result = WorkloadComputeService.computeRoomChanges(schedules);
      expect(result.max).toBe(0);
      expect(result.average).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Gini coefficient — perfect equality
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Gini coefficient (perfect equality)', () => {
    it('should return 0.0 for [5, 5, 5, 5, 5]', () => {
      const gini = WorkloadComputeService.computeGiniCoefficient([5, 5, 5, 5, 5]);
      expect(gini).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Gini coefficient — perfect inequality
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Gini coefficient (perfect inequality)', () => {
    it('should return close to 1.0 for [0, 0, 0, 0, 25]', () => {
      const gini = WorkloadComputeService.computeGiniCoefficient([0, 0, 0, 0, 25]);
      expect(gini).toBeGreaterThan(0.7);
      expect(gini).toBeLessThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Gini coefficient — moderate
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Gini coefficient (moderate)', () => {
    it('should return approximately 0.2 for typical school distribution', () => {
      // Typical school: covers spread reasonably but not perfectly
      const gini = WorkloadComputeService.computeGiniCoefficient([2, 3, 4, 5, 6]);
      expect(gini).toBeGreaterThan(0.1);
      expect(gini).toBeLessThan(0.35);
    });

    it('should return 0 for all-zero covers', () => {
      const gini = WorkloadComputeService.computeGiniCoefficient([0, 0, 0, 0, 0]);
      expect(gini).toBe(0);
    });

    it('should return 0 for empty array', () => {
      const gini = WorkloadComputeService.computeGiniCoefficient([]);
      expect(gini).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Timetable quality composite
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Timetable quality composite', () => {
    it('should produce correct weighted score from known components', () => {
      // Good timetable: spread across days, no long consecutive runs, no splits, same room
      const schedules = [
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 2,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 2,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 3,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 3,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
      ];

      const score = WorkloadComputeService.computeTimetableCompositeScore(schedules);

      // 2 consecutive per day, same room, even distribution, no splits
      // Consecutive: max=2 -> 100
      // Room: 0 changes -> 100
      // No splits -> 100
      // Even distribution -> 100
      // Composite = 100*0.3 + 100*0.3 + 100*0.2 + 100*0.2 = 100
      expect(score).toBe(100);
      expect(WorkloadComputeService.qualityLabel(score)).toBe('Good');
    });

    it('should produce a lower score for a bad timetable', () => {
      // Bad: 6 consecutive on one day, different rooms
      const schedules = [
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_B,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_C,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P4',
            period_order: 4,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_B,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P5',
            period_order: 5,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_C,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P6',
            period_order: 6,
          },
        }),
      ];

      const score = WorkloadComputeService.computeTimetableCompositeScore(schedules);

      // 6 consecutive -> 0 score for that component
      // 3 rooms -> room_changes avg = 2 -> 100 - 50 = 50
      expect(score).toBeLessThanOrEqual(60);
      expect(WorkloadComputeService.qualityLabel(score)).toBe('Moderate');
    });

    it('should return 100 for empty schedules', () => {
      const score = WorkloadComputeService.computeTimetableCompositeScore([]);
      expect(score).toBe(100);
    });

    it('should label 80+ as Good, 60-79 as Moderate, <60 as Needs attention', () => {
      expect(WorkloadComputeService.qualityLabel(95)).toBe('Good');
      expect(WorkloadComputeService.qualityLabel(80)).toBe('Good');
      expect(WorkloadComputeService.qualityLabel(70)).toBe('Moderate');
      expect(WorkloadComputeService.qualityLabel(60)).toBe('Moderate');
      expect(WorkloadComputeService.qualityLabel(59)).toBe('Needs attention');
      expect(WorkloadComputeService.qualityLabel(0)).toBe('Needs attention');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Substitution pressure index
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Substitution pressure index', () => {
    it('should compute correct composite from known inputs', async () => {
      setupAcademicContext();

      mockTx.staffProfile.count.mockResolvedValue(20);

      // 10 absences in current period
      mockTx.teacherAbsence.count.mockResolvedValue(10);
      // 8 substitution records
      mockTx.substitutionRecord.count.mockResolvedValue(8);

      // For trend
      mockTx.teacherAbsence.findMany.mockResolvedValue([
        { absence_date: new Date('2026-01-15') },
        { absence_date: new Date('2026-02-10') },
      ]);
      mockTx.substitutionRecord.findMany.mockResolvedValue([
        { created_at: new Date('2026-01-15') },
        { created_at: new Date('2026-02-10') },
      ]);

      const result = await service.getSubstitutionPressure(TENANT_ID);

      // absence_rate = 10 / 20 / schoolDays(Jan5 - Mar27)
      expect(result.absence_rate).toBeGreaterThanOrEqual(0);
      // cover_difficulty = 8 / 10 = 0.8
      expect(result.cover_difficulty).toBe(0.8);
      // unfilled = (10-8)/10 = 0.2
      expect(result.unfilled_rate).toBe(0.2);
      expect(typeof result.composite_score).toBe('number');
      expect(['Low', 'Moderate', 'High', 'Critical']).toContain(result.assessment);
    });

    it('should assess pressure thresholds correctly', () => {
      expect(WorkloadComputeService.pressureAssessment(0.1)).toBe('Low');
      expect(WorkloadComputeService.pressureAssessment(0.24)).toBe('Low');
      expect(WorkloadComputeService.pressureAssessment(0.25)).toBe('Moderate');
      expect(WorkloadComputeService.pressureAssessment(0.49)).toBe('Moderate');
      expect(WorkloadComputeService.pressureAssessment(0.5)).toBe('High');
      expect(WorkloadComputeService.pressureAssessment(0.74)).toBe('High');
      expect(WorkloadComputeService.pressureAssessment(0.75)).toBe('Critical');
      expect(WorkloadComputeService.pressureAssessment(1.0)).toBe('Critical');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. Correlation (< 12 months) — accumulating
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Correlation (< 12 months)', () => {
    it('should return accumulating state with correct count and projected date', async () => {
      // Only 5 months of data
      const fiveMonthsAgo = new Date();
      fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);

      mockTx.teacherAbsence.findFirst.mockResolvedValue({
        absence_date: fiveMonthsAgo,
      });
      mockTx.staffProfile.count.mockResolvedValue(10);

      const result = await service.getCorrelation(TENANT_ID);

      expect(result.status).toBe('accumulating');
      if (result.status === 'accumulating') {
        expect(result.dataPoints).toBe(5);
        expect(result.requiredDataPoints).toBe(12);
        expect(result.projectedAvailableDate).toBeTruthy();
        expect(result.message).toContain('5');
        expect(result.message).toContain('7');
      }
    });

    it('should return accumulating with 0 data points if no absences exist', async () => {
      mockTx.teacherAbsence.findFirst.mockResolvedValue(null);

      const result = await service.getCorrelation(TENANT_ID);

      expect(result.status).toBe('accumulating');
      if (result.status === 'accumulating') {
        expect(result.dataPoints).toBe(0);
        expect(result.message).toContain('No absence data');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. Correlation (>= 12 months)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Correlation (>= 12 months)', () => {
    it('should return series data with disclaimer', async () => {
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

      mockTx.teacherAbsence.findFirst.mockResolvedValue({
        absence_date: thirteenMonthsAgo,
      });
      mockTx.staffProfile.count.mockResolvedValue(10);

      // Generate 13 months of absence data
      const absences: { absence_date: Date }[] = [];
      const subs: { created_at: Date }[] = [];
      for (let i = 0; i < 13; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        absences.push({ absence_date: d });
        subs.push({ created_at: d });
      }

      mockTx.teacherAbsence.findMany.mockResolvedValue(absences);
      mockTx.substitutionRecord.findMany.mockResolvedValue(subs);

      const result = await service.getCorrelation(TENANT_ID);

      expect(result.status).toBe('available');
      if (result.status === 'available') {
        expect(result.series.length).toBeGreaterThan(0);
        expect(result.disclaimer).toContain('does not prove');
        expect(result.trendDescription).toBeTruthy();
        expect(result.dataPoints).toBeGreaterThan(0);

        // Verify series shape
        const item = result.series[0];
        expect(item).toHaveProperty('month');
        expect(item).toHaveProperty('coverPressure');
        expect(item).toHaveProperty('absenceRate');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. Over-allocated count
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Over-allocated count', () => {
    it('should count staff exceeding period threshold', async () => {
      setupAcademicContext();

      mockTx.staffProfile.findMany.mockResolvedValue([
        { id: STAFF_ID_1 },
        { id: STAFF_ID_2 },
        { id: STAFF_ID_3 },
      ]);

      // Staff 1: 25 periods (over 22 threshold), Staff 2: 20, Staff 3: 24 (over)
      let countCall = 0;
      mockTx.schedule.count.mockImplementation(() => {
        countCall++;
        if (countCall === 1) return Promise.resolve(25);
        if (countCall === 2) return Promise.resolve(20);
        if (countCall === 3) return Promise.resolve(24);
        return Promise.resolve(0);
      });

      // Covers: Staff 1: 9 (over 8), Staff 2: 5, Staff 3: 10 (over 8)
      let coverCall = 0;
      mockTx.substitutionRecord.count.mockImplementation(() => {
        coverCall++;
        if (coverCall === 1) return Promise.resolve(9);
        if (coverCall === 2) return Promise.resolve(5);
        if (coverCall === 3) return Promise.resolve(10);
        // Previous period calls
        return Promise.resolve(0);
      });

      const result = await service.getAggregateWorkloadSummary(TENANT_ID);

      expect(result.over_allocated_periods_count).toBe(2); // Staff 1 and Staff 3
      expect(result.over_allocated_covers_count).toBe(2); // Staff 1 and Staff 3
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. Cover fairness assessment
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cover fairness assessment', () => {
    it('should return "Well distributed" for Gini < 0.15', () => {
      expect(WorkloadComputeService.giniAssessment(0)).toBe('Well distributed');
      expect(WorkloadComputeService.giniAssessment(0.1)).toBe('Well distributed');
      expect(WorkloadComputeService.giniAssessment(0.14)).toBe('Well distributed');
    });

    it('should return "Moderate concentration" for Gini 0.15-0.30', () => {
      expect(WorkloadComputeService.giniAssessment(0.15)).toBe('Moderate concentration');
      expect(WorkloadComputeService.giniAssessment(0.22)).toBe('Moderate concentration');
      expect(WorkloadComputeService.giniAssessment(0.3)).toBe('Moderate concentration');
    });

    it('should return "Significant concentration" for Gini > 0.30', () => {
      expect(WorkloadComputeService.giniAssessment(0.31)).toBe(
        'Significant concentration \u2014 review recommended',
      );
      expect(WorkloadComputeService.giniAssessment(0.8)).toBe(
        'Significant concentration \u2014 review recommended',
      );
    });

    it('should produce correct distribution and range via getCoverFairness', async () => {
      setupAcademicContext();

      mockTx.staffProfile.findMany.mockResolvedValue([
        { id: STAFF_ID_1 },
        { id: STAFF_ID_2 },
        { id: STAFF_ID_3 },
        { id: STAFF_ID_4 },
        { id: STAFF_ID_5 },
      ]);

      // All have 5 covers = perfect equality
      mockTx.substitutionRecord.count.mockResolvedValue(5);

      const result = await service.getCoverFairness(TENANT_ID);

      expect(result.gini_coefficient).toBe(0);
      expect(result.assessment).toBe('Well distributed');
      expect(result.range.min).toBe(5);
      expect(result.range.max).toBe(5);
      expect(result.range.median).toBe(5);
      expect(result.distribution).toEqual([{ cover_count: 5, staff_count: 5 }]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 16. Personal endpoint isolation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Personal endpoint isolation', () => {
    it('should return only the specified staff data', async () => {
      setupAcademicContext();

      // Staff 1's schedules specifically
      const staff1Schedules = [
        makeSchedule({
          id: 's1',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          id: 's2',
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ];

      mockTx.schedule.findMany.mockResolvedValue(staff1Schedules);
      mockTx.substitutionRecord.count.mockResolvedValue(3);
      mockTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_ID_1 }, { id: STAFF_ID_2 }]);

      const result = await service.getPersonalWorkloadSummary(TENANT_ID, STAFF_ID_1);

      // Verify the query was called with the correct staff ID
      expect(mockTx.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teacher_staff_id: STAFF_ID_1,
          }),
        }),
      );

      expect(result.teaching_periods_per_week).toBe(2);
      expect(result.cover_duties_this_term).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 17. computeAllAggregateMetrics returns all 6 metric types
  // ═══════════════════════════════════════════════════════════════════════════

  describe('computeAllAggregateMetrics', () => {
    it('should return all 6 metric types', async () => {
      // Set up mocks for all aggregate methods
      setupAcademicContext();

      // Minimal staff
      mockTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_ID_1 }]);
      mockTx.staffProfile.count.mockResolvedValue(1);

      // Schedules
      mockTx.schedule.findMany.mockResolvedValue([
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ]);
      mockTx.schedule.count.mockResolvedValue(5);

      // Substitutions
      mockTx.substitutionRecord.count.mockResolvedValue(2);
      mockTx.substitutionRecord.findMany.mockResolvedValue([
        { created_at: new Date('2026-01-15') },
      ]);

      // Absences
      mockTx.teacherAbsence.count.mockResolvedValue(3);
      mockTx.teacherAbsence.findMany.mockResolvedValue([
        { absence_date: new Date('2026-01-10') },
        { absence_date: new Date('2026-02-15') },
      ]);
      mockTx.teacherAbsence.findFirst.mockResolvedValue({
        absence_date: new Date('2025-01-01'),
      });

      // Templates
      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
      ]);

      // Tenant settings
      mockTx.tenantSetting.findFirst.mockResolvedValue(defaultWellbeingSettings());

      // Academic context for each parallel call
      mockTx.academicYear.findFirst.mockResolvedValue(makeAcademicYear());
      mockTx.academicPeriod.findFirst.mockImplementation(() =>
        Promise.resolve(makeCurrentPeriod()),
      );

      const result = await service.computeAllAggregateMetrics(TENANT_ID);

      expect(result).toHaveProperty('workloadSummary');
      expect(result).toHaveProperty('coverFairness');
      expect(result).toHaveProperty('timetableQuality');
      expect(result).toHaveProperty('absenceTrends');
      expect(result).toHaveProperty('substitutionPressure');
      expect(result).toHaveProperty('correlation');

      // Verify types
      expect(typeof result.workloadSummary.average_teaching_periods).toBe('number');
      expect(typeof result.coverFairness.gini_coefficient).toBe('number');
      expect(typeof result.timetableQuality.split_timetable_pct).toBe('number');
      expect(Array.isArray(result.absenceTrends.monthly_rates)).toBe(true);
      expect(typeof result.substitutionPressure.composite_score).toBe('number');
      expect(['accumulating', 'available']).toContain(result.correlation.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Static helper edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Static helpers', () => {
    describe('mean', () => {
      it('should return 0 for empty array', () => {
        expect(WorkloadComputeService.mean([])).toBe(0);
      });

      it('should compute correct mean', () => {
        expect(WorkloadComputeService.mean([2, 4, 6])).toBe(4);
      });
    });

    describe('median', () => {
      it('should return 0 for empty array', () => {
        expect(WorkloadComputeService.median([])).toBe(0);
      });

      it('should return middle value for odd-length sorted array', () => {
        expect(WorkloadComputeService.median([1, 3, 5])).toBe(3);
      });

      it('should return average of two middle values for even-length sorted array', () => {
        expect(WorkloadComputeService.median([1, 3, 5, 7])).toBe(4);
      });
    });

    describe('percentileRange', () => {
      it('should return zeros for empty array', () => {
        const r = WorkloadComputeService.percentileRange([]);
        expect(r).toEqual({ min: 0, max: 0, p25: 0, p50: 0, p75: 0 });
      });

      it('should compute percentiles from sorted data', () => {
        const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const r = WorkloadComputeService.percentileRange(sorted);
        expect(r.min).toBe(1);
        expect(r.max).toBe(10);
        expect(r.p50).toBeCloseTo(5.5, 1);
      });
    });

    describe('round2', () => {
      it('should round to 2 decimal places', () => {
        expect(WorkloadComputeService.round2(3.14159)).toBe(3.14);
        expect(WorkloadComputeService.round2(0)).toBe(0);
        expect(WorkloadComputeService.round2(1.006)).toBe(1.01);
      });
    });

    describe('schoolDaysBetween', () => {
      it('should count weekdays only', () => {
        // Mon Jan 5 to Fri Jan 9, 2026 = 5 weekdays
        const result = WorkloadComputeService.schoolDaysBetween(
          new Date('2026-01-05'),
          new Date('2026-01-09'),
        );
        expect(result).toBe(5);
      });

      it('should exclude weekends', () => {
        // Mon Jan 5 to Sun Jan 11, 2026 = 5 weekdays
        const result = WorkloadComputeService.schoolDaysBetween(
          new Date('2026-01-05'),
          new Date('2026-01-11'),
        );
        expect(result).toBe(5);
      });
    });

    describe('monthsBetween', () => {
      it('should compute correct months', () => {
        expect(
          WorkloadComputeService.monthsBetween(new Date('2025-01-01'), new Date('2026-03-01')),
        ).toBe(14);
      });
    });

    describe('addMonths', () => {
      it('should return correct ISO date', () => {
        const result = WorkloadComputeService.addMonths(new Date('2026-01-15T12:00:00Z'), 3);
        expect(result).toBe('2026-04-15');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Cover history (anonymisation)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getPersonalCoverHistory', () => {
    it('should anonymise original teacher as "Colleague"', async () => {
      mockTx.substitutionRecord.findMany.mockResolvedValue([
        {
          created_at: new Date('2026-02-10'),
          schedule: {
            period_order: 3,
            class_entity: { name: 'English 7B' },
            schedule_period_template: { period_name: 'Period 3', period_order: 3 },
          },
        },
      ]);
      mockTx.substitutionRecord.count.mockResolvedValue(1);

      const result = await service.getPersonalCoverHistory(TENANT_ID, STAFF_ID_1, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.original_teacher).toBe('Colleague');
      expect(result.data[0]!.period).toBe('Period 3');
      expect(result.data[0]!.subject).toBe('English 7B');
      expect(result.data[0]!.date).toBe('2026-02-10');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should handle missing template and class gracefully', async () => {
      mockTx.substitutionRecord.findMany.mockResolvedValue([
        {
          created_at: new Date('2026-03-01'),
          schedule: {
            period_order: 5,
            class_entity: null,
            schedule_period_template: null,
          },
        },
      ]);
      mockTx.substitutionRecord.count.mockResolvedValue(1);

      const result = await service.getPersonalCoverHistory(TENANT_ID, STAFF_ID_1, 1, 20);

      expect(result.data[0]!.period).toBe('Period 5');
      expect(result.data[0]!.subject).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Empty states
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Empty states (no academic year)', () => {
    it('should return empty personal summary when no academic year exists', async () => {
      mockTx.academicYear.findFirst.mockResolvedValue(null);

      const result = await service.getPersonalWorkloadSummary(TENANT_ID, STAFF_ID_1);

      expect(result.teaching_periods_per_week).toBe(0);
      expect(result.status).toBe('normal');
      expect(result.trend).toBeNull();
    });

    it('should return empty aggregate when no academic year exists', async () => {
      mockTx.academicYear.findFirst.mockResolvedValue(null);

      const result = await service.getAggregateWorkloadSummary(TENANT_ID);

      expect(result.average_teaching_periods).toBe(0);
      expect(result.over_allocated_periods_count).toBe(0);
    });

    it('should return empty timetable quality when no academic year exists', async () => {
      mockTx.academicYear.findFirst.mockResolvedValue(null);

      const result = await service.getPersonalTimetableQuality(TENANT_ID, STAFF_ID_1);

      expect(result.composite_score).toBe(100);
      expect(result.composite_label).toBe('Good');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getSchoolAverageCovers
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getSchoolAverageCovers', () => {
    it('should return 0 when no academic year', async () => {
      mockTx.academicYear.findFirst.mockResolvedValue(null);

      const result = await service.getSchoolAverageCovers(TENANT_ID);
      expect(result).toBe(0);
    });

    it('should compute average covers across all staff', async () => {
      mockTx.academicYear.findFirst.mockResolvedValue(makeAcademicYear());
      mockTx.academicPeriod.findFirst.mockResolvedValue(makeCurrentPeriod());
      mockTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_ID_1 }, { id: STAFF_ID_2 }]);

      // Staff 1: 4 covers, Staff 2: 6 covers
      let coverCallIdx = 0;
      mockTx.substitutionRecord.count.mockImplementation(() => {
        coverCallIdx++;
        return Promise.resolve(coverCallIdx === 1 ? 4 : 6);
      });

      const result = await service.getSchoolAverageCovers(TENANT_ID);
      expect(result).toBe(5); // (4+6)/2
    });
  });
});
