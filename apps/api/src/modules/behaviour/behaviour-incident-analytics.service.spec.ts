import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StudentReadFacade, AcademicReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

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
        { provide: AcademicReadFacade, useValue: { findSubjectsByIds: mockPrisma.subject.findMany } },
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
  });
});
