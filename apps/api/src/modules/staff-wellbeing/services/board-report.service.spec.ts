import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { BoardReportService } from './board-report.service';
import { WorkloadCacheService } from './workload-cache.service';
import { WorkloadComputeService } from './workload-compute.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_WORKLOAD_SUMMARY = {
  average_teaching_periods: 20,
  range: { min: 14, max: 26, p25: 17, p50: 20, p75: 23 },
  over_allocated_periods_count: 3,
  average_cover_duties: 4.5,
  over_allocated_covers_count: 2,
  trend: null,
};

const MOCK_COVER_FAIRNESS = {
  distribution: [{ cover_count: 3, staff_count: 5 }, { cover_count: 6, staff_count: 3 }],
  gini_coefficient: 0.18,
  range: { min: 1, max: 9, median: 4 },
  assessment: 'Moderate concentration' as const,
};

const MOCK_TIMETABLE_QUALITY = {
  consecutive_periods: { mean: 3.2, median: 3, range: { min: 1, max: 5 } },
  free_period_clumping: { mean: 2.5, median: 2, range: { min: 0, max: 5 } },
  split_timetable_pct: 0.15,
  room_changes: { mean: 1.8, median: 2, range: { min: 0, max: 4 } },
  trend: null,
};

const MOCK_ABSENCE_TRENDS = {
  monthly_rates: [{ month: '2026-01', rate: 0.04 }, { month: '2026-02', rate: 0.05 }],
  day_of_week_pattern: [
    { weekday: 1, rate: 0.06 },
    { weekday: 2, rate: 0.03 },
    { weekday: 3, rate: 0.04 },
    { weekday: 4, rate: 0.03 },
    { weekday: 5, rate: 0.05 },
  ],
  term_comparison: { current: 0.04, previous: 0.05 },
  seasonal_pattern: null,
};

const MOCK_SUBSTITUTION_PRESSURE_IMPROVING = {
  absence_rate: 0.04,
  cover_difficulty: 0.6,
  unfilled_rate: 0.1,
  composite_score: 0.35,
  trend: [
    { month: '2025-10', score: 10 },
    { month: '2025-11', score: 9 },
    { month: '2025-12', score: 8 },
    { month: '2026-01', score: 5 },
    { month: '2026-02', score: 4 },
    { month: '2026-03', score: 3 },
  ],
  assessment: 'Moderate' as const,
};

const MOCK_SUBSTITUTION_PRESSURE_WORSENING = {
  ...MOCK_SUBSTITUTION_PRESSURE_IMPROVING,
  trend: [
    { month: '2025-10', score: 3 },
    { month: '2025-11', score: 4 },
    { month: '2025-12', score: 5 },
    { month: '2026-01', score: 8 },
    { month: '2026-02', score: 9 },
    { month: '2026-03', score: 10 },
  ],
};

const MOCK_CORRELATION_ACCUMULATING = {
  status: 'accumulating' as const,
  dataPoints: 4,
  requiredDataPoints: 12 as const,
  projectedAvailableDate: '2027-01-01',
  message: "Building your school's picture: 4 of 12 months collected.",
};

const MOCK_CORRELATION_AVAILABLE = {
  status: 'available' as const,
  dataPoints: 14,
  series: [{ month: '2025-01', coverPressure: 0.5, absenceRate: 0.04 }],
  trendDescription: 'Months with higher cover duty loads were followed by higher staff absence.',
  disclaimer: 'This shows patterns that occurred together. It does not prove that one caused the other.',
};

const MOCK_CORRELATION_ZERO = {
  status: 'accumulating' as const,
  dataPoints: 0,
  requiredDataPoints: 12 as const,
  projectedAvailableDate: '2027-03-01',
  message: 'No data yet.',
};

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockTx = {
  academicYear: { findFirst: jest.fn() },
  academicPeriod: { findFirst: jest.fn() },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
    ),
  }),
}));

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('BoardReportService', () => {
  let service: BoardReportService;
  let mockComputeService: {
    getAggregateWorkloadSummary: jest.Mock;
    getCoverFairness: jest.Mock;
    getAggregateTimetableQuality: jest.Mock;
    getAbsenceTrends: jest.Mock;
    getSubstitutionPressure: jest.Mock;
    getCorrelation: jest.Mock;
  };
  let mockCacheService: {
    getCachedAggregate: jest.Mock;
    setCachedAggregate: jest.Mock;
  };
  let mockPrisma: Record<string, unknown>;

  beforeEach(async () => {
    mockComputeService = {
      getAggregateWorkloadSummary: jest.fn().mockResolvedValue(MOCK_WORKLOAD_SUMMARY),
      getCoverFairness: jest.fn().mockResolvedValue(MOCK_COVER_FAIRNESS),
      getAggregateTimetableQuality: jest.fn().mockResolvedValue(MOCK_TIMETABLE_QUALITY),
      getAbsenceTrends: jest.fn().mockResolvedValue(MOCK_ABSENCE_TRENDS),
      getSubstitutionPressure: jest.fn().mockResolvedValue(MOCK_SUBSTITUTION_PRESSURE_IMPROVING),
      getCorrelation: jest.fn().mockResolvedValue(MOCK_CORRELATION_ACCUMULATING),
    };

    mockCacheService = {
      getCachedAggregate: jest.fn().mockResolvedValue(null),
      setCachedAggregate: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {};

    // Default academic context
    mockTx.academicYear.findFirst.mockResolvedValue({ id: 'year-1', name: '2025-2026' });
    mockTx.academicPeriod.findFirst.mockResolvedValue({ name: 'Term 2' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorkloadComputeService, useValue: mockComputeService },
        { provide: WorkloadCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<BoardReportService>(BoardReportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Report Compilation ─────────────────────────────────────────────────

  describe('generateTermlySummary', () => {
    it('should return a compiled report with all sections populated', async () => {
      const result = await service.generateTermlySummary(TENANT_ID);

      expect(result.workload_distribution).toBeDefined();
      expect(result.cover_fairness).toBeDefined();
      expect(result.timetable_quality).toBeDefined();
      expect(result.substitution_pressure).toBeDefined();
      expect(result.absence_pattern).toBeDefined();
      expect(result.generated_at).toBeDefined();
      expect(result.term_name).toBe('Term 2');
      expect(result.academic_year_name).toBe('2025-2026');
    });

    it('should use cached aggregate data when available', async () => {
      mockCacheService.getCachedAggregate
        .mockResolvedValueOnce(MOCK_WORKLOAD_SUMMARY)  // workload-summary cached
        .mockResolvedValueOnce(MOCK_COVER_FAIRNESS)    // cover-fairness cached
        .mockResolvedValueOnce(null)                    // timetable-quality miss
        .mockResolvedValueOnce(null)                    // absence-trends miss
        .mockResolvedValueOnce(null)                    // substitution-pressure miss
        .mockResolvedValueOnce(null);                   // correlation miss

      await service.generateTermlySummary(TENANT_ID);

      expect(mockComputeService.getAggregateWorkloadSummary).not.toHaveBeenCalled();
      expect(mockComputeService.getCoverFairness).not.toHaveBeenCalled();
      expect(mockComputeService.getAggregateTimetableQuality).toHaveBeenCalled();
      expect(mockComputeService.getAbsenceTrends).toHaveBeenCalled();
    });

    it('should compute on cache miss and cache the result', async () => {
      await service.generateTermlySummary(TENANT_ID);

      // All 6 metrics computed (all cache miss)
      expect(mockComputeService.getAggregateWorkloadSummary).toHaveBeenCalledWith(TENANT_ID);
      expect(mockComputeService.getCoverFairness).toHaveBeenCalledWith(TENANT_ID);
      // All 6 cached after compute
      expect(mockCacheService.setCachedAggregate).toHaveBeenCalledTimes(6);
    });

    // ─── Correlation Insight ────────────────────────────────────────────

    it('should set correlation_insight to null when 0 data points', async () => {
      mockComputeService.getCorrelation.mockResolvedValue(MOCK_CORRELATION_ZERO);

      const result = await service.generateTermlySummary(TENANT_ID);

      expect(result.correlation_insight).toBeNull();
    });

    it('should set correlation_insight.status to accumulating when < 12 months', async () => {
      mockComputeService.getCorrelation.mockResolvedValue(MOCK_CORRELATION_ACCUMULATING);

      const result = await service.generateTermlySummary(TENANT_ID);

      expect(result.correlation_insight).not.toBeNull();
      expect(result.correlation_insight!.status).toBe('accumulating');
      expect(result.correlation_insight!.summary).toContain('4 of 12');
    });

    it('should set correlation_insight.status to available when >= 12 months', async () => {
      mockComputeService.getCorrelation.mockResolvedValue(MOCK_CORRELATION_AVAILABLE);

      const result = await service.generateTermlySummary(TENANT_ID);

      expect(result.correlation_insight).not.toBeNull();
      expect(result.correlation_insight!.status).toBe('available');
    });

    // ─── Trend Direction ────────────────────────────────────────────────

    it('should compute trend_direction as improving when pressure is decreasing', async () => {
      mockComputeService.getSubstitutionPressure.mockResolvedValue(
        MOCK_SUBSTITUTION_PRESSURE_IMPROVING,
      );

      const result = await service.generateTermlySummary(TENANT_ID);

      expect(result.substitution_pressure.trend_direction).toBe('improving');
    });

    it('should compute trend_direction as worsening when pressure is increasing', async () => {
      mockComputeService.getSubstitutionPressure.mockResolvedValue(
        MOCK_SUBSTITUTION_PRESSURE_WORSENING,
      );

      const result = await service.generateTermlySummary(TENANT_ID);

      expect(result.substitution_pressure.trend_direction).toBe('worsening');
    });

    // ─── Absence Patterns ───────────────────────────────────────────────

    it('should correctly identify the weekday with highest absence', async () => {
      const result = await service.generateTermlySummary(TENANT_ID);

      // weekday 1 (Monday) has rate 0.06 — highest
      expect(result.absence_pattern.highest_day).toBe('Monday');
    });

    // ─── Error Handling ─────────────────────────────────────────────────

    it('should throw NotFoundException when no active academic year', async () => {
      mockTx.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.generateTermlySummary(TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    // ─── Privacy ────────────────────────────────────────────────────────

    it('should contain no individual staff identifiers', async () => {
      const result = await service.generateTermlySummary(TENANT_ID);
      const serialised = JSON.stringify(result);

      // No UUIDs that could be staff identifiers
      expect(serialised).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
      );
    });
  });
});
