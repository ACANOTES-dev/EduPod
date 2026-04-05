/* eslint-disable import/order -- jest.mock must precede mocked imports */

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_A = 'ff000000-0000-0000-0000-00000000000a';
const STAFF_B = 'ff000000-0000-0000-0000-00000000000b';
const STAFF_C = 'ff000000-0000-0000-0000-00000000000c';
const YEAR_ID = 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy';

// ─── RLS Mock ──────────────────────────────────────────────────────────────

const mockRlsTx = {
  staffProfile: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  schedule: {
    count: jest.fn(),
  },
  schedulePeriodTemplate: {
    findMany: jest.fn(),
  },
  teacherAbsence: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  substitutionRecord: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Import after mock ─────────────────────────────────────────────────────

import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { WorkloadAggregateService } from './workload-aggregate.service';
import type { AcademicPeriodRow, ScheduleRow } from './workload-data.service';
import { WorkloadDataService } from './workload-data.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

const ACADEMIC_YEAR = {
  id: YEAR_ID,
  start_date: new Date('2025-09-01'),
  end_date: new Date('2026-06-30'),
};

const CURRENT_PERIOD: AcademicPeriodRow = {
  id: 'period-1',
  start_date: new Date('2026-01-05'),
  end_date: new Date('2026-03-31'),
};

const PREVIOUS_PERIOD: AcademicPeriodRow = {
  id: 'period-0',
  start_date: new Date('2025-09-01'),
  end_date: new Date('2025-12-20'),
};

const makeScheduleRow = (weekday: number, periodOrder: number): ScheduleRow => ({
  id: `sched-${weekday}-${periodOrder}`,
  weekday,
  period_order: null,
  room_id: 'room-a',
  schedule_period_template: {
    schedule_period_type: 'teaching',
    period_name: `P${periodOrder}`,
    period_order: periodOrder,
  },
  class_entity: { name: 'Maths 8A' },
});

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('WorkloadAggregateService', () => {
  let service: WorkloadAggregateService;
  let mockDataService: {
    getActiveAcademicYear: jest.Mock;
    getCurrentPeriod: jest.Mock;
    getPreviousPeriod: jest.Mock;
    getWellbeingThresholds: jest.Mock;
    countCoversInRange: jest.Mock;
    getTeacherSchedules: jest.Mock;
    computeSchoolAverageCovers: jest.Mock;
  };

  beforeEach(async () => {
    mockDataService = {
      getActiveAcademicYear: jest.fn().mockResolvedValue(ACADEMIC_YEAR),
      getCurrentPeriod: jest.fn().mockResolvedValue(CURRENT_PERIOD),
      getPreviousPeriod: jest.fn().mockResolvedValue(null),
      getWellbeingThresholds: jest.fn().mockResolvedValue({
        workload_high_threshold_periods: 22,
        workload_high_threshold_covers: 8,
      }),
      countCoversInRange: jest.fn().mockResolvedValue(3),
      getTeacherSchedules: jest.fn().mockResolvedValue([]),
      computeSchoolAverageCovers: jest.fn().mockResolvedValue(4),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const method of Object.values(model)) {
        (method as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkloadAggregateService,
        { provide: PrismaService, useValue: {} },
        { provide: WorkloadDataService, useValue: mockDataService },
      ],
    }).compile();

    service = module.get<WorkloadAggregateService>(WorkloadAggregateService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // getAggregateWorkloadSummary
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadAggregateService — getAggregateWorkloadSummary', () => {
    it('should return empty state when no active academic year', async () => {
      mockDataService.getActiveAcademicYear.mockResolvedValue(null);

      const result = await service.getAggregateWorkloadSummary(TENANT_ID);

      expect(result.average_teaching_periods).toBe(0);
      expect(result.range.min).toBe(0);
      expect(result.trend).toBeNull();
    });

    it('should compute over-allocated counts above threshold', async () => {
      mockRlsTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_A }, { id: STAFF_B }]);
      // Staff A: 25 teaching periods (above 22 threshold)
      // Staff B: 18 teaching periods (below threshold)
      mockRlsTx.schedule.count.mockResolvedValueOnce(25).mockResolvedValueOnce(18);

      const result = await service.getAggregateWorkloadSummary(TENANT_ID);

      expect(result.over_allocated_periods_count).toBe(1);
      expect(result.average_teaching_periods).toBeCloseTo(21.5, 1);
    });

    it('should track over-allocated covers when current period exists', async () => {
      mockRlsTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_A }, { id: STAFF_B }]);
      mockRlsTx.schedule.count.mockResolvedValueOnce(20).mockResolvedValueOnce(20);
      // Staff A: 10 covers (above 8 threshold), Staff B: 5 covers (below)
      mockDataService.countCoversInRange.mockResolvedValueOnce(10).mockResolvedValueOnce(5);

      const result = await service.getAggregateWorkloadSummary(TENANT_ID);

      expect(result.over_allocated_covers_count).toBe(1);
      expect(result.average_cover_duties).toBeCloseTo(7.5, 1);
    });

    it('should push 0 covers when no current period', async () => {
      mockDataService.getCurrentPeriod.mockResolvedValue(null);
      mockRlsTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_A }]);
      mockRlsTx.schedule.count.mockResolvedValue(20);

      const result = await service.getAggregateWorkloadSummary(TENANT_ID);

      expect(result.average_cover_duties).toBe(0);
      expect(result.over_allocated_covers_count).toBe(0);
    });

    it('should compute trend when previous period exists and staff > 0', async () => {
      mockDataService.getPreviousPeriod.mockResolvedValue(PREVIOUS_PERIOD);
      mockRlsTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_A }]);
      mockRlsTx.schedule.count.mockResolvedValue(20);
      // Current period covers
      mockDataService.countCoversInRange
        .mockResolvedValueOnce(5) // current covers for staff A
        .mockResolvedValueOnce(3); // previous covers for staff A

      const result = await service.getAggregateWorkloadSummary(TENANT_ID);

      expect(result.trend).not.toBeNull();
      expect(result.trend!.previous_average_periods).toBe(20);
      expect(result.trend!.previous_average_covers).toBe(3);
    });

    it('should not compute trend when no previous period', async () => {
      mockDataService.getPreviousPeriod.mockResolvedValue(null);
      mockRlsTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_A }]);
      mockRlsTx.schedule.count.mockResolvedValue(20);

      const result = await service.getAggregateWorkloadSummary(TENANT_ID);

      expect(result.trend).toBeNull();
    });

    it('should not compute trend when allStaff is empty', async () => {
      mockDataService.getPreviousPeriod.mockResolvedValue(PREVIOUS_PERIOD);
      mockRlsTx.staffProfile.findMany.mockResolvedValue([]);

      const result = await service.getAggregateWorkloadSummary(TENANT_ID);

      expect(result.trend).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getCoverFairness
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadAggregateService — getCoverFairness', () => {
    it('should return empty state when no active academic year', async () => {
      mockDataService.getActiveAcademicYear.mockResolvedValue(null);

      const result = await service.getCoverFairness(TENANT_ID);

      expect(result.distribution).toEqual([]);
      expect(result.gini_coefficient).toBe(0);
    });

    it('should return empty state when no current period', async () => {
      mockDataService.getCurrentPeriod.mockResolvedValue(null);

      const result = await service.getCoverFairness(TENANT_ID);

      expect(result.distribution).toEqual([]);
    });

    it('should compute gini and distribution from cover counts', async () => {
      mockRlsTx.staffProfile.findMany.mockResolvedValue([
        { id: STAFF_A },
        { id: STAFF_B },
        { id: STAFF_C },
      ]);
      mockDataService.countCoversInRange
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5);

      const result = await service.getCoverFairness(TENANT_ID);

      expect(result.gini_coefficient).toBeGreaterThan(0);
      expect(result.range.min).toBe(2);
      expect(result.range.max).toBe(5);
      // Distribution: 2 covers -> 2 staff, 5 covers -> 1 staff
      expect(result.distribution).toEqual([
        { cover_count: 2, staff_count: 2 },
        { cover_count: 5, staff_count: 1 },
      ]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getAggregateTimetableQuality
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadAggregateService — getAggregateTimetableQuality', () => {
    it('should return empty state when no active academic year', async () => {
      mockDataService.getActiveAcademicYear.mockResolvedValue(null);

      const result = await service.getAggregateTimetableQuality(TENANT_ID);

      expect(result.consecutive_periods.mean).toBe(0);
      expect(result.split_timetable_pct).toBe(0);
    });

    it('should skip staff with no schedules', async () => {
      mockRlsTx.schedulePeriodTemplate.findMany.mockResolvedValue([
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
      ]);
      mockRlsTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_A }, { id: STAFF_B }]);
      // Staff A has schedules, Staff B has none
      mockDataService.getTeacherSchedules
        .mockResolvedValueOnce([makeScheduleRow(1, 1), makeScheduleRow(1, 2)])
        .mockResolvedValueOnce([]);

      const result = await service.getAggregateTimetableQuality(TENANT_ID);

      // Only Staff A counted, so mean = max consecutive for 1 staff
      expect(result.consecutive_periods.mean).toBe(2);
    });

    it('should compute split_timetable_pct correctly', async () => {
      mockRlsTx.schedulePeriodTemplate.findMany.mockResolvedValue([
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 5 },
      ]);
      mockRlsTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_A }, { id: STAFF_B }]);
      // Staff A: split timetable (period 1 and 5 on same day)
      mockDataService.getTeacherSchedules
        .mockResolvedValueOnce([makeScheduleRow(1, 1), makeScheduleRow(1, 5)])
        .mockResolvedValueOnce([makeScheduleRow(1, 1), makeScheduleRow(1, 2)]);

      const result = await service.getAggregateTimetableQuality(TENANT_ID);

      // 1 split out of 2 staff = 50%
      expect(result.split_timetable_pct).toBe(50);
    });

    it('should return 0 split_timetable_pct when staffWithSchedules is 0', async () => {
      mockRlsTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockRlsTx.staffProfile.findMany.mockResolvedValue([{ id: STAFF_A }]);
      mockDataService.getTeacherSchedules.mockResolvedValue([]);

      const result = await service.getAggregateTimetableQuality(TENANT_ID);

      expect(result.split_timetable_pct).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getAbsenceTrends
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadAggregateService — getAbsenceTrends', () => {
    it('should return empty state when no active academic year', async () => {
      mockDataService.getActiveAcademicYear.mockResolvedValue(null);

      const result = await service.getAbsenceTrends(TENANT_ID);

      expect(result.monthly_rates).toEqual([]);
      expect(result.term_comparison).toBeNull();
    });

    it('should return empty state when staff count is 0', async () => {
      mockRlsTx.staffProfile.count.mockResolvedValue(0);

      const result = await service.getAbsenceTrends(TENANT_ID);

      expect(result.monthly_rates).toEqual([]);
    });

    it('should compute monthly rates and day-of-week pattern', async () => {
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue([
        { absence_date: new Date('2026-01-06') }, // Tuesday
        { absence_date: new Date('2026-01-07') }, // Wednesday
        { absence_date: new Date('2026-01-06') }, // Tuesday again
        { absence_date: new Date('2026-02-03') }, // Monday
      ]);

      const result = await service.getAbsenceTrends(TENANT_ID);

      expect(result.monthly_rates).toHaveLength(2);
      expect(result.monthly_rates[0]!.month).toBe('2026-01');
      expect(result.monthly_rates[0]!.rate).toBe(0.3); // 3/10
      expect(result.monthly_rates[1]!.month).toBe('2026-02');

      expect(result.day_of_week_pattern.length).toBeGreaterThan(0);
    });

    it('should include term comparison when current period exists', async () => {
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue([]);
      mockRlsTx.teacherAbsence.count.mockResolvedValueOnce(5); // current term absences

      const result = await service.getAbsenceTrends(TENANT_ID);

      expect(result.term_comparison).not.toBeNull();
      expect(result.term_comparison!.current).toBe(0.5); // 5/10
    });

    it('should include previous rate in term comparison when previous period exists', async () => {
      mockDataService.getPreviousPeriod.mockResolvedValue(PREVIOUS_PERIOD);
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue([]);
      mockRlsTx.teacherAbsence.count
        .mockResolvedValueOnce(5) // current term
        .mockResolvedValueOnce(3); // previous term

      const result = await service.getAbsenceTrends(TENANT_ID);

      expect(result.term_comparison!.previous).toBe(0.3);
    });

    it('should set previous rate to null when no previous period', async () => {
      mockDataService.getPreviousPeriod.mockResolvedValue(null);
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue([]);
      mockRlsTx.teacherAbsence.count.mockResolvedValue(5);

      const result = await service.getAbsenceTrends(TENANT_ID);

      expect(result.term_comparison!.previous).toBeNull();
    });

    it('should set term_comparison to null when no current period', async () => {
      mockDataService.getCurrentPeriod.mockResolvedValue(null);
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue([]);

      const result = await service.getAbsenceTrends(TENANT_ID);

      expect(result.term_comparison).toBeNull();
    });

    it('should set seasonal_pattern to null when < 12 months of data', async () => {
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue([
        { absence_date: new Date('2026-01-06') },
      ]);

      const result = await service.getAbsenceTrends(TENANT_ID);

      expect(result.seasonal_pattern).toBeNull();
    });

    it('should compute seasonal_pattern when >= 12 months of data', async () => {
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      // Generate absences spanning 12 months
      const absences = Array.from({ length: 12 }, (_, i) => ({
        absence_date: new Date(2025, i, 15),
      }));
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue(absences);
      mockRlsTx.teacherAbsence.count.mockResolvedValue(2);

      const result = await service.getAbsenceTrends(TENANT_ID);

      expect(result.seasonal_pattern).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getSubstitutionPressure
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadAggregateService — getSubstitutionPressure', () => {
    it('should return empty state when no active academic year', async () => {
      mockDataService.getActiveAcademicYear.mockResolvedValue(null);

      const result = await service.getSubstitutionPressure(TENANT_ID);

      expect(result.composite_score).toBe(0.3);
      expect(result.assessment).toBe('Low');
    });

    it('should return empty state when staff count is 0', async () => {
      mockRlsTx.staffProfile.count.mockResolvedValue(0);

      const result = await service.getSubstitutionPressure(TENANT_ID);

      expect(result.composite_score).toBe(0.3);
    });

    it('should return empty state when no current period', async () => {
      mockDataService.getCurrentPeriod.mockResolvedValue(null);
      mockRlsTx.staffProfile.count.mockResolvedValue(10);

      const result = await service.getSubstitutionPressure(TENANT_ID);

      expect(result.composite_score).toBe(0.3);
    });

    it('should compute substitution pressure metrics correctly', async () => {
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      mockRlsTx.teacherAbsence.count.mockResolvedValue(20); // current period absences
      mockRlsTx.substitutionRecord.count.mockResolvedValue(15); // current period subs
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue([
        { absence_date: new Date('2026-01-06') },
      ]);
      mockRlsTx.substitutionRecord.findMany.mockResolvedValue([
        { created_at: new Date('2026-01-06') },
      ]);

      const result = await service.getSubstitutionPressure(TENANT_ID);

      expect(result.absence_rate).toBeGreaterThan(0);
      expect(result.cover_difficulty).toBe(0.75); // 15/20
      expect(result.unfilled_rate).toBe(0.25); // (20-15)/20
      expect(result.assessment).toBeDefined();
      expect(result.trend.length).toBeGreaterThan(0);
    });

    it('edge: should handle zero absences (no division by zero)', async () => {
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      mockRlsTx.teacherAbsence.count.mockResolvedValue(0); // no absences
      mockRlsTx.substitutionRecord.count.mockResolvedValue(0);
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue([]);
      mockRlsTx.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.getSubstitutionPressure(TENANT_ID);

      expect(result.absence_rate).toBe(0);
      expect(result.cover_difficulty).toBe(0);
      expect(result.unfilled_rate).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getCorrelation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadAggregateService — getCorrelation', () => {
    it('should return accumulating status with 0 data points when no absences', async () => {
      mockRlsTx.teacherAbsence.findFirst.mockResolvedValue(null);

      const result = await service.getCorrelation(TENANT_ID);

      expect(result.status).toBe('accumulating');
      if (result.status === 'accumulating') {
        expect(result.dataPoints).toBe(0);
        expect(result.requiredDataPoints).toBe(12);
        expect(result.message).toContain('No absence data yet');
      }
    });

    it('should return accumulating status when < 12 months of data', async () => {
      // Earliest absence is 6 months ago
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      mockRlsTx.teacherAbsence.findFirst.mockResolvedValue({
        absence_date: sixMonthsAgo,
      });
      mockRlsTx.staffProfile.count.mockResolvedValue(10);

      const result = await service.getCorrelation(TENANT_ID);

      expect(result.status).toBe('accumulating');
      if (result.status === 'accumulating') {
        expect(result.dataPoints).toBe(6);
        expect(result.message).toContain('6 month(s)');
      }
    });

    it('should return available status when >= 12 months of data', async () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setMonth(twoYearsAgo.getMonth() - 24);
      mockRlsTx.teacherAbsence.findFirst.mockResolvedValue({
        absence_date: twoYearsAgo,
      });
      mockRlsTx.staffProfile.count.mockResolvedValue(10);
      mockRlsTx.teacherAbsence.findMany.mockResolvedValue([
        { absence_date: new Date('2025-01-10') },
        { absence_date: new Date('2025-06-10') },
      ]);
      mockRlsTx.substitutionRecord.findMany.mockResolvedValue([
        { created_at: new Date('2025-01-10') },
      ]);

      const result = await service.getCorrelation(TENANT_ID);

      expect(result.status).toBe('available');
      if (result.status === 'available') {
        expect(result.series.length).toBeGreaterThan(0);
        expect(result.trendDescription).toBeDefined();
        expect(result.disclaimer).toContain('does not prove');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // computeAllAggregateMetrics
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadAggregateService — computeAllAggregateMetrics', () => {
    it('should compute and return all 6 aggregate metric types', async () => {
      // Return empty states to keep the test simple
      mockDataService.getActiveAcademicYear.mockResolvedValue(null);

      const result = await service.computeAllAggregateMetrics(TENANT_ID);

      expect(result.workloadSummary).toBeDefined();
      expect(result.coverFairness).toBeDefined();
      expect(result.timetableQuality).toBeDefined();
      expect(result.absenceTrends).toBeDefined();
      expect(result.substitutionPressure).toBeDefined();
      expect(result.correlation).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getSchoolAverageCovers
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadAggregateService — getSchoolAverageCovers', () => {
    it('should return 0 when no active academic year', async () => {
      mockDataService.getActiveAcademicYear.mockResolvedValue(null);

      const result = await service.getSchoolAverageCovers(TENANT_ID);

      expect(result).toBe(0);
    });

    it('should return 0 when no current period', async () => {
      mockDataService.getCurrentPeriod.mockResolvedValue(null);

      const result = await service.getSchoolAverageCovers(TENANT_ID);

      expect(result).toBe(0);
    });

    it('should delegate to dataService.computeSchoolAverageCovers when period exists', async () => {
      mockDataService.computeSchoolAverageCovers.mockResolvedValue(5.5);

      const result = await service.getSchoolAverageCovers(TENANT_ID);

      expect(result).toBe(5.5);
      expect(mockDataService.computeSchoolAverageCovers).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        CURRENT_PERIOD.start_date,
        CURRENT_PERIOD.end_date,
      );
    });
  });
});
