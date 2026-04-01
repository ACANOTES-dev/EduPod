import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { WorkloadCacheService } from '../services/workload-cache.service';
import { WorkloadComputeService } from '../services/workload-compute.service';

import { AggregateWorkloadController } from './aggregate-workload.controller';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_WORKLOAD_SUMMARY = {
  average_teaching_periods: 22,
  range: { min: 18, max: 26, p25: 20, p50: 22, p75: 24 },
  over_allocated_periods_count: 3,
  average_cover_duties: 4.2,
  over_allocated_covers_count: 2,
  trend: null,
};

const MOCK_COVER_FAIRNESS = {
  distribution: [
    { cover_count: 2, staff_count: 10 },
    { cover_count: 5, staff_count: 3 },
  ],
  gini_coefficient: 0.25,
  range: { min: 1, max: 8, median: 3 },
  assessment: 'Well distributed' as const,
};

const MOCK_TIMETABLE_QUALITY = {
  consecutive_periods: { mean: 2.5, median: 2, range: { min: 1, max: 5 } },
  free_period_clumping: { mean: 1.8, median: 2, range: { min: 0, max: 4 } },
  split_timetable_pct: 12.5,
  room_changes: { mean: 3.1, median: 3, range: { min: 0, max: 7 } },
  trend: null,
};

const MOCK_ABSENCE_TRENDS = {
  monthly_rates: [
    { month: '2026-01', rate: 3.2 },
    { month: '2026-02', rate: 4.1 },
  ],
  day_of_week_pattern: [
    { weekday: 0, rate: 2.1 },
    { weekday: 1, rate: 3.4 },
  ],
  term_comparison: { current: 3.5, previous: 3.2 },
  seasonal_pattern: null,
};

const MOCK_SUBSTITUTION_PRESSURE = {
  absence_rate: 4.2,
  cover_difficulty: 0.35,
  unfilled_rate: 0.08,
  composite_score: 42,
  trend: [
    { month: '2026-01', score: 38 },
    { month: '2026-02', score: 42 },
  ],
  assessment: 'Moderate' as const,
};

const MOCK_CORRELATION = {
  status: 'accumulating' as const,
  dataPoints: 5,
  requiredDataPoints: 12 as const,
  projectedAvailableDate: '2026-10-01',
  message: 'Collecting data. 7 more months needed.',
};

// ─── Metric Endpoints ────────────────────────────────────────────────────────

interface MetricEndpoint {
  name: string;
  method: keyof AggregateWorkloadController;
  metricType: string;
  computeMethod: string;
  mockData: unknown;
}

const ENDPOINTS: MetricEndpoint[] = [
  {
    name: 'workload-summary',
    method: 'getWorkloadSummary',
    metricType: 'workload-summary',
    computeMethod: 'getAggregateWorkloadSummary',
    mockData: MOCK_WORKLOAD_SUMMARY,
  },
  {
    name: 'cover-fairness',
    method: 'getCoverFairness',
    metricType: 'cover-fairness',
    computeMethod: 'getCoverFairness',
    mockData: MOCK_COVER_FAIRNESS,
  },
  {
    name: 'timetable-quality',
    method: 'getTimetableQuality',
    metricType: 'timetable-quality',
    computeMethod: 'getAggregateTimetableQuality',
    mockData: MOCK_TIMETABLE_QUALITY,
  },
  {
    name: 'absence-trends',
    method: 'getAbsenceTrends',
    metricType: 'absence-trends',
    computeMethod: 'getAbsenceTrends',
    mockData: MOCK_ABSENCE_TRENDS,
  },
  {
    name: 'substitution-pressure',
    method: 'getSubstitutionPressure',
    metricType: 'substitution-pressure',
    computeMethod: 'getSubstitutionPressure',
    mockData: MOCK_SUBSTITUTION_PRESSURE,
  },
  {
    name: 'correlation',
    method: 'getCorrelation',
    metricType: 'correlation',
    computeMethod: 'getCorrelation',
    mockData: MOCK_CORRELATION,
  },
];

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('AggregateWorkloadController', () => {
  let controller: AggregateWorkloadController;
  let mockComputeService: Record<string, jest.Mock | undefined> & {
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

  beforeEach(async () => {
    mockComputeService = {
      getAggregateWorkloadSummary: jest.fn(),
      getCoverFairness: jest.fn(),
      getAggregateTimetableQuality: jest.fn(),
      getAbsenceTrends: jest.fn(),
      getSubstitutionPressure: jest.fn(),
      getCorrelation: jest.fn(),
    };

    mockCacheService = {
      getCachedAggregate: jest.fn(),
      setCachedAggregate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AggregateWorkloadController],
      providers: [
        { provide: WorkloadComputeService, useValue: mockComputeService },
        { provide: WorkloadCacheService, useValue: mockCacheService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AggregateWorkloadController>(AggregateWorkloadController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE HIT — returns cached data for each endpoint
  // ═══════════════════════════════════════════════════════════════════════════

  describe.each(ENDPOINTS)(
    'GET /aggregate/$name — cache hit',
    ({ method, metricType, mockData }) => {
      it(`should return cached data when available`, async () => {
        mockCacheService.getCachedAggregate.mockResolvedValue(mockData);

        const result = await (controller[method] as (t: TenantContext) => Promise<unknown>)(TENANT);

        expect(result).toEqual(mockData);
        expect(mockCacheService.getCachedAggregate).toHaveBeenCalledWith(TENANT_ID, metricType);
      });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE MISS — computes and caches for each endpoint
  // ═══════════════════════════════════════════════════════════════════════════

  describe.each(ENDPOINTS)(
    'GET /aggregate/$name — cache miss',
    ({ method, metricType, computeMethod, mockData }) => {
      it(`should compute and cache when cache miss`, async () => {
        mockCacheService.getCachedAggregate.mockResolvedValue(null);
        mockComputeService[computeMethod]!.mockResolvedValue(mockData);

        const result = await (controller[method] as (t: TenantContext) => Promise<unknown>)(TENANT);

        expect(result).toEqual(mockData);
        expect(mockComputeService[computeMethod]!).toHaveBeenCalledWith(TENANT_ID);
        expect(mockCacheService.setCachedAggregate).toHaveBeenCalledWith(
          TENANT_ID,
          metricType,
          mockData,
        );
      });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // REPRESENTATIVE TESTS — verify cache-or-compute behaviour
  // ═══════════════════════════════════════════════════════════════════════════

  describe('cache-or-compute behaviour', () => {
    it('should NOT call compute service when cache hits', async () => {
      mockCacheService.getCachedAggregate.mockResolvedValue(MOCK_WORKLOAD_SUMMARY);

      await controller.getWorkloadSummary(TENANT);

      expect(mockComputeService.getAggregateWorkloadSummary).not.toHaveBeenCalled();
      expect(mockCacheService.setCachedAggregate).not.toHaveBeenCalled();
    });

    it('should call setCachedAggregate with correct metric type on cache miss', async () => {
      mockCacheService.getCachedAggregate.mockResolvedValue(null);
      mockComputeService.getCoverFairness.mockResolvedValue(MOCK_COVER_FAIRNESS);

      await controller.getCoverFairness(TENANT);

      expect(mockCacheService.setCachedAggregate).toHaveBeenCalledTimes(1);
      expect(mockCacheService.setCachedAggregate).toHaveBeenCalledWith(
        TENANT_ID,
        'cover-fairness',
        MOCK_COVER_FAIRNESS,
      );
    });
  });
});
