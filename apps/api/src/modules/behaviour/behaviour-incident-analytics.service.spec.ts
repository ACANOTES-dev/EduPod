import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  StudentReadFacade,
  AcademicReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { buildCsv, buildDateRange } from './behaviour-analytics-helpers';
import { BehaviourIncidentAnalyticsService } from './behaviour-incident-analytics.service';
import { BehaviourScopeService } from './behaviour-scope.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const PERMISSIONS = ['behaviour.view'];
const BASE_QUERY = { from: '2026-03-01', to: '2026-03-31', exposureNormalised: false };

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeMockPrisma = () => ({
  behaviourIncident: {
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourAlert: {
    count: jest.fn().mockResolvedValue(0),
  },
  behaviourCategory: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  student: {
    count: jest.fn().mockResolvedValue(0),
  },
  subject: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
});

type MockPrisma = ReturnType<typeof makeMockPrisma>;

const makeMockScope = () => ({
  getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }),
  buildScopeFilter: jest.fn().mockReturnValue({}),
});

describe('BehaviourIncidentAnalyticsService', () => {
  let service: BehaviourIncidentAnalyticsService;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        BehaviourIncidentAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourScopeService, useValue: makeMockScope() },
        { provide: StudentReadFacade, useValue: { count: mockPrisma.student.count } },
        {
          provide: AcademicReadFacade,
          useValue: { findSubjectsByIds: mockPrisma.subject.findMany },
        },
      ],
    }).compile();

    service = module.get<BehaviourIncidentAnalyticsService>(BehaviourIncidentAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getOverview ───────────────────────────────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getOverview', () => {
    it('should return overview with zero counts when no data exists', async () => {
      const result = await service.getOverview(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.total_incidents).toBe(0);
      expect(result.positive_negative_ratio).toBeNull();
      expect(result.delta_percent).toBeNull();
      expect(result.data_quality).toBeDefined();
    });

    it('should compute delta_percent from prior period comparison', async () => {
      mockPrisma.behaviourIncident.count
        .mockResolvedValueOnce(20) // totalIncidents
        .mockResolvedValueOnce(10) // priorTotal
        .mockResolvedValueOnce(3); // openFollowUps

      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { polarity: 'positive', _count: 12 },
        { polarity: 'negative', _count: 8 },
      ]);

      const result = await service.getOverview(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.total_incidents).toBe(20);
      expect(result.delta_percent).toBe(100); // (20-10)/10 * 100
      expect(result.positive_negative_ratio).toBeCloseTo(12 / 20);
      expect(result.ratio_trend).toBe('declining');
    });

    it('should classify trend as improving when delta <= -5', async () => {
      mockPrisma.behaviourIncident.count
        .mockResolvedValueOnce(9) // totalIncidents
        .mockResolvedValueOnce(10) // priorTotal
        .mockResolvedValueOnce(0); // openFollowUps

      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);

      const result = await service.getOverview(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.delta_percent).toBe(-10);
      expect(result.ratio_trend).toBe('improving');
    });

    it('should classify trend as stable when delta is between -5 and 5', async () => {
      mockPrisma.behaviourIncident.count
        .mockResolvedValueOnce(100) // totalIncidents
        .mockResolvedValueOnce(98) // priorTotal
        .mockResolvedValueOnce(0); // openFollowUps

      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);

      const result = await service.getOverview(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.ratio_trend).toBe('stable');
    });
  });

  // ─── getHeatmap ────────────────────────────────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getHeatmap', () => {
    it('should return empty cells when no incidents exist', async () => {
      const result = await service.getHeatmap(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.cells).toEqual([]);
      expect(result.data_quality.exposure_normalised).toBe(false);
    });

    it('should group incidents by weekday and period_order', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { weekday: 1, period_order: 2, polarity: 'negative', _count: 5 },
        { weekday: 1, period_order: 2, polarity: 'positive', _count: 3 },
      ]);

      const result = await service.getHeatmap(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.cells).toHaveLength(1);
      expect(result.cells[0]!.raw_count).toBe(8);
      expect(result.cells[0]!.polarity_breakdown.negative).toBe(5);
      expect(result.cells[0]!.polarity_breakdown.positive).toBe(3);
    });
  });

  // ─── getHistoricalHeatmap ──────────────────────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getHistoricalHeatmap', () => {
    it('should delegate to getHeatmap', async () => {
      const result = await service.getHistoricalHeatmap(
        TENANT_ID,
        USER_ID,
        PERMISSIONS,
        BASE_QUERY,
      );

      expect(result.cells).toBeDefined();
      expect(result.data_quality).toBeDefined();
    });
  });

  // ─── getTrends ─────────────────────────────────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getTrends', () => {
    it('should return daily granularity for ranges <= 30 days', async () => {
      const result = await service.getTrends(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.granularity).toBe('daily');
      expect(result.points).toEqual([]);
    });

    it('should bucket incidents into correct date points', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([
        { occurred_at: new Date('2026-03-10'), polarity: 'positive' },
        { occurred_at: new Date('2026-03-10'), polarity: 'negative' },
        { occurred_at: new Date('2026-03-15'), polarity: 'neutral' },
      ]);

      const result = await service.getTrends(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.points.length).toBeGreaterThanOrEqual(2);
      const march10 = result.points.find((p) => p.date === '2026-03-10');
      expect(march10?.positive).toBe(1);
      expect(march10?.negative).toBe(1);
      expect(march10?.total).toBe(2);
    });

    it('should use monthly granularity for ranges > 90 days', async () => {
      const longQuery = { from: '2025-01-01', to: '2026-03-31', exposureNormalised: false };

      const result = await service.getTrends(TENANT_ID, USER_ID, PERMISSIONS, longQuery);

      expect(result.granularity).toBe('monthly');
    });
  });

  // ─── buildIncidentWhere filters (via getCategories) ────────────────────

  describe('BehaviourIncidentAnalyticsService -- classId/yearGroupId filters', () => {
    it('should apply classId filter to incident where clause', async () => {
      const queryWithClass = { ...BASE_QUERY, classId: 'class-1' };

      await service.getCategories(TENANT_ID, USER_ID, PERMISSIONS, queryWithClass);

      expect(mockPrisma.behaviourIncident.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            participants: expect.objectContaining({
              some: expect.objectContaining({
                student: expect.objectContaining({
                  class_enrolments: { some: { class_id: 'class-1' } },
                }),
              }),
            }),
          }),
        }),
      );
    });

    it('should apply yearGroupId filter to incident where clause', async () => {
      const queryWithYearGroup = { ...BASE_QUERY, yearGroupId: 'yg-1' };

      await service.getCategories(TENANT_ID, USER_ID, PERMISSIONS, queryWithYearGroup);

      expect(mockPrisma.behaviourIncident.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            participants: expect.objectContaining({
              some: expect.objectContaining({
                student: { year_group_id: 'yg-1' },
              }),
            }),
          }),
        }),
      );
    });

    it('should apply polarity filter when provided', async () => {
      const queryWithPolarity = { ...BASE_QUERY, polarity: 'negative' as const };

      await service.getCategories(TENANT_ID, USER_ID, PERMISSIONS, queryWithPolarity);

      expect(mockPrisma.behaviourIncident.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            polarity: 'negative',
          }),
        }),
      );
    });

    it('should apply categoryId filter when provided', async () => {
      const queryWithCat = { ...BASE_QUERY, categoryId: 'cat-1' };

      await service.getCategories(TENANT_ID, USER_ID, PERMISSIONS, queryWithCat);

      expect(mockPrisma.behaviourIncident.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category_id: 'cat-1',
          }),
        }),
      );
    });

    it('should apply academicYearId and academicPeriodId filters', async () => {
      const queryWithAcademic = {
        ...BASE_QUERY,
        academicYearId: 'ay-1',
        academicPeriodId: 'ap-1',
      };

      await service.getCategories(TENANT_ID, USER_ID, PERMISSIONS, queryWithAcademic);

      expect(mockPrisma.behaviourIncident.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            academic_year_id: 'ay-1',
            academic_period_id: 'ap-1',
          }),
        }),
      );
    });
  });

  // ─── getCategories ─────────────────────────────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getCategories', () => {
    it('should return empty categories when no incidents exist', async () => {
      const result = await service.getCategories(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.categories).toEqual([]);
    });

    it('should sort categories by count descending', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { category_id: 'cat-1', _count: 5 },
        { category_id: 'cat-2', _count: 10 },
      ]);
      mockPrisma.behaviourCategory.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Minor', polarity: 'negative' },
        { id: 'cat-2', name: 'Major', polarity: 'negative' },
      ]);
      mockPrisma.student.count.mockResolvedValue(50);

      const result = await service.getCategories(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.categories).toHaveLength(2);
      expect(result.categories[0]!.category_name).toBe('Major');
      expect(result.categories[0]!.count).toBe(10);
      expect(result.categories[0]!.rate_per_100).toBe(20);
    });
  });

  // ─── getSubjects ───────────────────────────────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getSubjects', () => {
    it('should return empty when no subject-linked incidents exist', async () => {
      const result = await service.getSubjects(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.subjects).toEqual([]);
    });

    it('should sort subjects by incident count descending', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { subject_id: 'sub-1', _count: 3 },
        { subject_id: 'sub-2', _count: 7 },
      ]);
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', name: 'Maths' },
        { id: 'sub-2', name: 'English' },
      ]);

      const result = await service.getSubjects(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.subjects).toHaveLength(2);
      expect(result.subjects[0]!.subject_name).toBe('English');
      expect(result.subjects[0]!.incident_count).toBe(7);
    });

    it('should compute rate_per_100_periods when exposureNormalised=true and MV has data', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([{ subject_id: 'sub-1', _count: 5 }]);
      mockPrisma.subject.findMany.mockResolvedValue([{ id: 'sub-1', name: 'Maths' }]);
      // Exposure MV returns data
      mockPrisma.$queryRaw.mockResolvedValue([
        { subject_id: 'sub-1', total_teaching_periods: BigInt(200) },
      ]);

      const result = await service.getSubjects(TENANT_ID, USER_ID, PERMISSIONS, {
        ...BASE_QUERY,
        exposureNormalised: true,
      });

      expect(result.subjects).toHaveLength(1);
      // rate = (5/200)*10000/100 = 2.5
      expect(result.subjects[0]!.rate_per_100_periods).toBe(2.5);
      expect(result.data_quality.exposure_normalised).toBe(true);
    });

    it('should fall back to null rates when exposure MV query fails', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([{ subject_id: 'sub-1', _count: 5 }]);
      mockPrisma.subject.findMany.mockResolvedValue([{ id: 'sub-1', name: 'Maths' }]);
      mockPrisma.$queryRaw.mockRejectedValue(new Error('MV not available'));

      const result = await service.getSubjects(TENANT_ID, USER_ID, PERMISSIONS, {
        ...BASE_QUERY,
        exposureNormalised: true,
      });

      expect(result.subjects[0]!.rate_per_100_periods).toBeNull();
    });
  });

  // ─── getHeatmap — exposure normalisation ──────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getHeatmap exposure', () => {
    it('should compute rates when exposure MV returns data', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { weekday: 1, period_order: 2, polarity: 'negative', _count: 10 },
      ]);
      // Exposure MV data
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          { weekday: 1, period_order: 2, total_teaching_periods: BigInt(100) },
        ])
        .mockResolvedValueOnce([]); // checkExposureMvHasData (second call)

      const result = await service.getHeatmap(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.cells).toHaveLength(1);
      // rate = (10/100)*10000/100 = 10.0
      expect(result.cells[0]!.rate).toBe(10.0);
      expect(result.data_quality.exposure_normalised).toBe(true);
    });

    it('should handle neutral polarity in heatmap cell breakdown', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { weekday: 3, period_order: 1, polarity: 'neutral', _count: 4 },
      ]);

      const result = await service.getHeatmap(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.cells).toHaveLength(1);
      expect(result.cells[0]!.polarity_breakdown.neutral).toBe(4);
      expect(result.cells[0]!.polarity_breakdown.positive).toBe(0);
    });

    it('should handle null period_order in groupBy', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { weekday: 1, period_order: null, polarity: 'negative', _count: 2 },
      ]);

      const result = await service.getHeatmap(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.cells).toHaveLength(1);
      expect(result.cells[0]!.period_order).toBe(0);
    });
  });

  // ─── getTrends — weekly granularity ──────────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getTrends weekly', () => {
    it('should use weekly granularity for 31-90 day ranges', async () => {
      const weeklyQuery = { from: '2026-01-01', to: '2026-03-01', exposureNormalised: false };

      const result = await service.getTrends(TENANT_ID, USER_ID, PERMISSIONS, weeklyQuery);

      expect(result.granularity).toBe('weekly');
    });

    it('should bucket incidents into week-start dates', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([
        { occurred_at: new Date('2026-01-15'), polarity: 'positive' }, // Thursday -> week starts Mon 2026-01-12
        { occurred_at: new Date('2026-01-16'), polarity: 'negative' }, // Friday -> same week
      ]);

      const weeklyQuery = { from: '2026-01-01', to: '2026-03-01', exposureNormalised: false };
      const result = await service.getTrends(TENANT_ID, USER_ID, PERMISSIONS, weeklyQuery);

      expect(result.points).toHaveLength(1);
      expect(result.points[0]!.total).toBe(2);
      expect(result.points[0]!.positive).toBe(1);
      expect(result.points[0]!.negative).toBe(1);
    });
  });

  // ─── getCategories — zero students path ──────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getCategories zero students', () => {
    it('should return rate_per_100 = null when no enrolled students', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([{ category_id: 'cat-1', _count: 5 }]);
      mockPrisma.behaviourCategory.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Disruption', polarity: 'negative' },
      ]);
      mockPrisma.student.count.mockResolvedValue(0);

      const result = await service.getCategories(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]!.rate_per_100).toBeNull();
    });

    it('should handle unknown category gracefully', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { category_id: 'unknown-cat', _count: 3 },
      ]);
      mockPrisma.behaviourCategory.findMany.mockResolvedValue([]);
      mockPrisma.student.count.mockResolvedValue(100);

      const result = await service.getCategories(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.categories[0]!.category_name).toBe('Unknown');
      expect(result.categories[0]!.polarity).toBe('neutral');
    });
  });

  // ─── getOverview — exposure MV check ──────────────────────────────────

  describe('BehaviourIncidentAnalyticsService -- getOverview exposure MV', () => {
    it('should set exposure_normalised=true when MV has data', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ cnt: BigInt(5) }]);

      const result = await service.getOverview(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.data_quality.exposure_normalised).toBe(true);
    });

    it('should set exposure_normalised=false when MV query throws', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('MV missing'));

      const result = await service.getOverview(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.data_quality.exposure_normalised).toBe(false);
    });

    it('should set exposure_normalised=false when MV returns empty', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getOverview(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.data_quality.exposure_normalised).toBe(false);
    });

    it('should set exposure_normalised=false when MV count is 0', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ cnt: BigInt(0) }]);

      const result = await service.getOverview(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.data_quality.exposure_normalised).toBe(false);
    });
  });
});

// ─── Analytics Helpers (pure functions) ─────────────────────────────────────

describe('behaviour-analytics-helpers', () => {
  describe('buildDateRange', () => {
    it('should default to 30-day range when no from/to provided', () => {
      const before = new Date();
      const result = buildDateRange({ exposureNormalised: false });
      const after = new Date();

      // `to` should be approximately now
      expect(result.to.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.to.getTime()).toBeLessThanOrEqual(after.getTime());
      // `from` should be ~30 days before to
      const diff = result.to.getTime() - result.from.getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(diff).toBeCloseTo(thirtyDaysMs, -3);
    });

    it('should use provided from and to dates', () => {
      const result = buildDateRange({
        from: '2026-01-01',
        to: '2026-03-31',
        exposureNormalised: false,
      });

      expect(result.from.toISOString()).toContain('2026-01-01');
      expect(result.to.toISOString()).toContain('2026-03-31');
    });
  });

  describe('buildCsv', () => {
    it('should produce BOM-prefixed CSV with headers and rows', () => {
      const result = buildCsv(
        ['Name', 'Age'],
        [
          ['Alice', '30'],
          ['Bob', '25'],
        ],
      );

      expect(result).toMatch(/^\uFEFF/);
      expect(result).toContain('Name,Age');
      expect(result).toContain('Alice,30');
    });

    it('should escape values containing commas', () => {
      const result = buildCsv(['Desc'], [['Hello, World']]);

      expect(result).toContain('"Hello, World"');
    });

    it('should escape values containing double quotes', () => {
      const result = buildCsv(['Desc'], [['She said "hi"']]);

      expect(result).toContain('"She said ""hi"""');
    });

    it('should escape values containing newlines', () => {
      const result = buildCsv(['Desc'], [['Line1\nLine2']]);

      expect(result).toContain('"Line1\nLine2"');
    });

    it('should not escape simple values', () => {
      const result = buildCsv(['Name'], [['Alice']]);

      expect(result).toContain('Alice');
      // Alice should NOT be quoted
      expect(result).not.toContain('"Alice"');
    });
  });
});
