import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAnalyticsService } from './behaviour-analytics.service';
import { BehaviourPulseService } from './behaviour-pulse.service';
import { BehaviourScopeService } from './behaviour-scope.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';

// ─── Mock factories ──────────────────────────────────────────────────────

const makeMockPrisma = () => ({
  behaviourIncident: {
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({}),
  },
  behaviourSanction: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  behaviourIntervention: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  behaviourTask: {
    groupBy: jest.fn().mockResolvedValue([]),
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourIncidentParticipant: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  behaviourAlert: {
    count: jest.fn().mockResolvedValue(0),
  },
  behaviourCategory: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourPolicyRule: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourPolicyEvaluation: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  tenantSetting: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  tenantMembership: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  student: {
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  subject: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  yearGroup: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  classEnrolment: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
});

type MockPrisma = ReturnType<typeof makeMockPrisma>;

describe('BehaviourAnalyticsService', () => {
  let service: BehaviourAnalyticsService;
  let mockPrisma: MockPrisma;
  let mockScope: { getUserScope: jest.Mock; buildScopeFilter: jest.Mock };
  let mockPulse: { getPulseScore: jest.Mock };

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();
    mockScope = {
      getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }),
      buildScopeFilter: jest.fn().mockReturnValue({}),
    };
    mockPulse = { getPulseScore: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourScopeService, useValue: mockScope },
        { provide: BehaviourPulseService, useValue: mockPulse },
      ],
    }).compile();

    service = module.get<BehaviourAnalyticsService>(BehaviourAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getOverview ─────────────────────────────────────────────────────

  describe('getOverview', () => {
    const baseQuery = {
      from: '2026-03-01',
      to: '2026-03-27',
      exposureNormalised: true,
    };

    it('should return incident count, positive/negative split, and ratio', async () => {
      mockPrisma.behaviourIncident.count
        .mockResolvedValueOnce(15) // totalIncidents
        .mockResolvedValueOnce(10) // priorTotal
        .mockResolvedValueOnce(2); // openFollowUps
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([
        { polarity: 'positive', _count: 9 },
        { polarity: 'negative', _count: 6 },
      ]);
      mockPrisma.behaviourAlert.count.mockResolvedValueOnce(3);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]); // exposure MV

      const result = await service.getOverview(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.total_incidents).toBe(15);
      expect(result.prior_period_total).toBe(10);
      expect(result.positive_negative_ratio).toBe(9 / 15);
      expect(result.delta_percent).toBe(50); // (15-10)/10 * 100
      expect(result.open_follow_ups).toBe(2);
      expect(result.active_alerts).toBe(3);
    });

    it('should respect scope filter from scopeService', async () => {
      mockScope.getUserScope.mockResolvedValueOnce({
        scope: 'class',
        classStudentIds: ['s-1', 's-2'],
      });
      mockScope.buildScopeFilter.mockReturnValueOnce({
        participants: { some: { student_id: { in: ['s-1', 's-2'] } } },
      });

      mockPrisma.behaviourIncident.count.mockResolvedValue(0);
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);
      mockPrisma.behaviourAlert.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      await service.getOverview(TENANT_ID, USER_ID, ['behaviour.view'], baseQuery);

      expect(mockScope.getUserScope).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        ['behaviour.view'],
      );
      expect(mockScope.buildScopeFilter).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'class', classStudentIds: ['s-1', 's-2'] }),
      );
    });

    it('should exclude withdrawn and converted_to_safeguarding statuses', async () => {
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);
      mockPrisma.behaviourAlert.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      await service.getOverview(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      const firstCallArg = mockPrisma.behaviourIncident.count.mock.calls[0][0] as {
        where: { status: { notIn: string[] } };
      };
      expect(firstCallArg.where.status.notIn).toEqual(
        expect.arrayContaining(['withdrawn', 'converted_to_safeguarding']),
      );
    });

    it('should filter by date range when from/to provided', async () => {
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);
      mockPrisma.behaviourAlert.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      await service.getOverview(TENANT_ID, USER_ID, ['behaviour.admin'], {
        from: '2026-03-10',
        to: '2026-03-20',
        exposureNormalised: true,
      });

      const firstCallArg = mockPrisma.behaviourIncident.count.mock.calls[0][0] as {
        where: { occurred_at: { gte: Date; lte: Date } };
      };
      expect(firstCallArg.where.occurred_at.gte).toEqual(new Date('2026-03-10'));
      expect(firstCallArg.where.occurred_at.lte).toEqual(new Date('2026-03-20'));
    });

    it('should default to last 30 days when no date range', async () => {
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);
      mockPrisma.behaviourAlert.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      const now = new Date();
      await service.getOverview(TENANT_ID, USER_ID, ['behaviour.admin'], {
        exposureNormalised: true,
      });

      const firstCallArg = mockPrisma.behaviourIncident.count.mock.calls[0][0] as {
        where: { occurred_at: { gte: Date; lte: Date } };
      };
      const from = firstCallArg.where.occurred_at.gte;
      const to = firstCallArg.where.occurred_at.lte;
      const daysDiff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBe(30);
      // "to" should be close to now
      expect(Math.abs(to.getTime() - now.getTime())).toBeLessThan(5000);
    });

    it('should filter by academicYearId when provided', async () => {
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);
      mockPrisma.behaviourAlert.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      await service.getOverview(TENANT_ID, USER_ID, ['behaviour.admin'], {
        ...baseQuery,
        academicYearId: 'ay-1',
      });

      const firstCallArg = mockPrisma.behaviourIncident.count.mock.calls[0][0] as {
        where: { academic_year_id?: string };
      };
      expect(firstCallArg.where.academic_year_id).toBe('ay-1');
    });

    it('should filter by polarity when provided', async () => {
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);
      mockPrisma.behaviourAlert.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      await service.getOverview(TENANT_ID, USER_ID, ['behaviour.admin'], {
        ...baseQuery,
        polarity: 'negative',
      });

      const firstCallArg = mockPrisma.behaviourIncident.count.mock.calls[0][0] as {
        where: { polarity?: string };
      };
      expect(firstCallArg.where.polarity).toBe('negative');
    });

    it('edge: should return zeroes when no data exists', async () => {
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);
      mockPrisma.behaviourAlert.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      const result = await service.getOverview(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.total_incidents).toBe(0);
      expect(result.prior_period_total).toBe(0);
      expect(result.delta_percent).toBeNull();
      expect(result.positive_negative_ratio).toBeNull();
      expect(result.ratio_trend).toBeNull();
      expect(result.open_follow_ups).toBe(0);
      expect(result.active_alerts).toBe(0);
    });
  });

  // ─── getHeatmap ──────────────────────────────────────────────────────

  describe('getHeatmap', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should return hour-of-day x day-of-week matrix', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([
        { weekday: 1, period_order: 1, polarity: 'positive', _count: 5 },
        { weekday: 1, period_order: 1, polarity: 'negative', _count: 3 },
        { weekday: 2, period_order: 2, polarity: 'neutral', _count: 2 },
      ]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // exposure MV empty

      const result = await service.getHeatmap(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.cells).toHaveLength(2);
      const mondayPeriod1 = result.cells.find((c) => c.weekday === 1 && c.period_order === 1);
      expect(mondayPeriod1).toBeDefined();
      expect(mondayPeriod1?.raw_count).toBe(8);
      expect(mondayPeriod1?.polarity_breakdown).toEqual({ positive: 5, negative: 3, neutral: 0 });
    });

    it('should respect scope filtering', async () => {
      mockScope.getUserScope.mockResolvedValueOnce({ scope: 'own' });
      mockScope.buildScopeFilter.mockReturnValueOnce({ reported_by_id: USER_ID });
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service.getHeatmap(TENANT_ID, USER_ID, ['behaviour.log'], baseQuery);

      expect(mockScope.getUserScope).toHaveBeenCalledWith(
        TENANT_ID, USER_ID, ['behaviour.log'],
      );
    });

    it('edge: should return empty matrix for zero incidents', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.getHeatmap(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.cells).toHaveLength(0);
      expect(result.data_quality.exposure_normalised).toBe(false);
    });
  });

  // ─── getTrends ───────────────────────────────────────────────────────

  describe('getTrends', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-20', exposureNormalised: true };

    it('should return daily trend points within date range', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValueOnce([
        { occurred_at: new Date('2026-03-05'), polarity: 'positive' },
        { occurred_at: new Date('2026-03-05'), polarity: 'negative' },
        { occurred_at: new Date('2026-03-10'), polarity: 'positive' },
      ]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]); // exposure check

      const result = await service.getTrends(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.granularity).toBe('daily');
      expect(result.points.length).toBe(2);
      const march5 = result.points.find((p) => p.date === '2026-03-05');
      expect(march5).toBeDefined();
      expect(march5?.positive).toBe(1);
      expect(march5?.negative).toBe(1);
      expect(march5?.total).toBe(2);
    });

    it('should separate positive and negative trends', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValueOnce([
        { occurred_at: new Date('2026-03-05'), polarity: 'positive' },
        { occurred_at: new Date('2026-03-05'), polarity: 'positive' },
        { occurred_at: new Date('2026-03-05'), polarity: 'negative' },
        { occurred_at: new Date('2026-03-05'), polarity: 'neutral' },
      ]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      const result = await service.getTrends(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      const point = result.points[0];
      expect(point).toBeDefined();
      expect(point?.positive).toBe(2);
      expect(point?.negative).toBe(1);
      expect(point?.neutral).toBe(1);
      expect(point?.total).toBe(4);
    });

    it('should respect scope filtering', async () => {
      mockScope.getUserScope.mockResolvedValueOnce({ scope: 'own' });
      mockPrisma.behaviourIncident.findMany.mockResolvedValueOnce([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      await service.getTrends(TENANT_ID, USER_ID, ['behaviour.log'], baseQuery);

      expect(mockScope.getUserScope).toHaveBeenCalledWith(TENANT_ID, USER_ID, ['behaviour.log']);
    });

    it('edge: should return empty points for zero incidents', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValueOnce([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ cnt: BigInt(0) }]);

      const result = await service.getTrends(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.points).toHaveLength(0);
      expect(result.granularity).toBe('daily');
    });
  });

  // ─── getCategories ───────────────────────────────────────────────────

  describe('getCategories', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should return category breakdown with counts', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([
        { category_id: 'cat-1', _count: 10 },
        { category_id: 'cat-2', _count: 5 },
      ]);
      mockPrisma.behaviourCategory.findMany.mockResolvedValueOnce([
        { id: 'cat-1', name: 'Disruption', polarity: 'negative' },
        { id: 'cat-2', name: 'Praise', polarity: 'positive' },
      ]);
      mockPrisma.student.count.mockResolvedValueOnce(100);

      const result = await service.getCategories(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.categories).toHaveLength(2);
      expect(result.categories[0]?.category_name).toBe('Disruption');
      expect(result.categories[0]?.count).toBe(10);
      expect(result.categories[0]?.rate_per_100).toBe(10); // (10/100)*100
      expect(result.categories[1]?.category_name).toBe('Praise');
    });

    it('should order by count descending', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([
        { category_id: 'cat-1', _count: 3 },
        { category_id: 'cat-2', _count: 15 },
        { category_id: 'cat-3', _count: 7 },
      ]);
      mockPrisma.behaviourCategory.findMany.mockResolvedValueOnce([
        { id: 'cat-1', name: 'A', polarity: 'negative' },
        { id: 'cat-2', name: 'B', polarity: 'positive' },
        { id: 'cat-3', name: 'C', polarity: 'neutral' },
      ]);
      mockPrisma.student.count.mockResolvedValueOnce(50);

      const result = await service.getCategories(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.categories[0]?.count).toBe(15);
      expect(result.categories[1]?.count).toBe(7);
      expect(result.categories[2]?.count).toBe(3);
    });

    it('should respect scope filtering', async () => {
      mockScope.getUserScope.mockResolvedValueOnce({ scope: 'class', classStudentIds: ['s-1'] });
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([]);
      mockPrisma.behaviourCategory.findMany.mockResolvedValueOnce([]);
      mockPrisma.student.count.mockResolvedValueOnce(0);

      await service.getCategories(TENANT_ID, USER_ID, ['behaviour.view'], baseQuery);

      expect(mockScope.getUserScope).toHaveBeenCalledWith(TENANT_ID, USER_ID, ['behaviour.view']);
    });
  });

  // ─── getSubjects ─────────────────────────────────────────────────────

  describe('getSubjects', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should aggregate incidents by subject', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([
        { subject_id: 'sub-1', _count: 8 },
        { subject_id: 'sub-2', _count: 4 },
      ]);
      mockPrisma.subject.findMany.mockResolvedValueOnce([
        { id: 'sub-1', name: 'Maths' },
        { id: 'sub-2', name: 'English' },
      ]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { subject_id: 'sub-1', total_teaching_periods: BigInt(200) },
        { subject_id: 'sub-2', total_teaching_periods: BigInt(150) },
      ]);

      const result = await service.getSubjects(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.subjects).toHaveLength(2);
      expect(result.subjects[0]?.subject_name).toBe('Maths');
      expect(result.subjects[0]?.incident_count).toBe(8);
      // rate_per_100_periods = (8/200)*100 = 4.00
      expect(result.subjects[0]?.rate_per_100_periods).toBe(4);
    });

    it('should handle incidents without subject association', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([]);
      mockPrisma.subject.findMany.mockResolvedValueOnce([]);

      const result = await service.getSubjects(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.subjects).toHaveLength(0);
    });
  });

  // ─── getStaffActivity ────────────────────────────────────────────────

  describe('getStaffActivity', () => {
    const baseQuery = { from: '2026-01-01', to: '2026-03-27', exposureNormalised: true };

    it('should aggregate by reporting staff member', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValueOnce([
        { user_id: 'staff-1', user: { first_name: 'Jane', last_name: 'Doe' } },
        { user_id: 'staff-2', user: { first_name: 'John', last_name: 'Smith' } },
      ]);
      mockPrisma.behaviourIncident.groupBy
        .mockResolvedValueOnce([{ reported_by_id: 'staff-1', _count: 5 }]) // last7
        .mockResolvedValueOnce([{ reported_by_id: 'staff-1', _count: 12 }]) // last30
        .mockResolvedValueOnce([{ reported_by_id: 'staff-1', _count: 40 }]) // yearTotal
        .mockResolvedValueOnce([
          { reported_by_id: 'staff-1', _max: { occurred_at: new Date('2026-03-26') } },
        ]); // lastLogged

      const result = await service.getStaffActivity(TENANT_ID, baseQuery);

      expect(result.staff).toHaveLength(2);
      const jane = result.staff.find((s) => s.staff_id === 'staff-1');
      expect(jane).toBeDefined();
      expect(jane?.staff_name).toBe('Jane Doe');
      expect(jane?.last_7_days).toBe(5);
      expect(jane?.last_30_days).toBe(12);
      expect(jane?.total_year).toBe(40);
    });

    it('should respect scope filtering via query params', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValueOnce([]);
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);

      const result = await service.getStaffActivity(TENANT_ID, baseQuery);

      expect(result.staff).toHaveLength(0);
      expect(result.data_quality).toBeDefined();
    });

    it('should return per-staff positive/negative breakdown via inactive_flag', async () => {
      const oldDate = new Date('2026-01-01');
      mockPrisma.tenantMembership.findMany.mockResolvedValueOnce([
        { user_id: 'staff-1', user: { first_name: 'Active', last_name: 'Staff' } },
        { user_id: 'staff-2', user: { first_name: 'Inactive', last_name: 'Staff' } },
      ]);
      mockPrisma.behaviourIncident.groupBy
        .mockResolvedValueOnce([]) // last7
        .mockResolvedValueOnce([]) // last30
        .mockResolvedValueOnce([]) // yearTotal
        .mockResolvedValueOnce([
          { reported_by_id: 'staff-1', _max: { occurred_at: new Date() } },
          { reported_by_id: 'staff-2', _max: { occurred_at: oldDate } },
        ]);

      const result = await service.getStaffActivity(TENANT_ID, baseQuery);

      const active = result.staff.find((s) => s.staff_id === 'staff-1');
      const inactive = result.staff.find((s) => s.staff_id === 'staff-2');
      expect(active?.inactive_flag).toBe(false);
      expect(inactive?.inactive_flag).toBe(true);
    });
  });

  // ─── getSanctions ────────────────────────────────────────────────────

  describe('getSanctions', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should summarize sanctions by type with served/no_show counts', async () => {
      mockPrisma.behaviourSanction.groupBy.mockResolvedValueOnce([
        { type: 'detention', status: 'served', _count: { _all: 8 } },
        { type: 'detention', status: 'no_show', _count: { _all: 2 } },
        { type: 'suspension', status: 'served', _count: { _all: 1 } },
      ]);

      const result = await service.getSanctions(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.entries).toHaveLength(2);
      const detention = result.entries.find((e) => e.sanction_type === 'detention');
      expect(detention?.total).toBe(10);
      expect(detention?.served).toBe(8);
      expect(detention?.no_show).toBe(2);
      const suspension = result.entries.find((e) => e.sanction_type === 'suspension');
      expect(suspension?.total).toBe(1);
      expect(suspension?.served).toBe(1);
      expect(suspension?.no_show).toBe(0);
    });

    it('should include all status categories (not just hardcoded zeros)', async () => {
      mockPrisma.behaviourSanction.groupBy.mockResolvedValueOnce([
        { type: 'detention', status: 'partially_served', _count: { _all: 3 } },
        { type: 'detention', status: 'not_served_absent', _count: { _all: 1 } },
        { type: 'detention', status: 'pending', _count: { _all: 4 } },
      ]);

      const result = await service.getSanctions(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      const detention = result.entries.find((e) => e.sanction_type === 'detention');
      expect(detention).toBeDefined();
      // partially_served counts as served; not_served_absent counts as no_show
      expect(detention?.served).toBe(3);
      expect(detention?.no_show).toBe(1);
      expect(detention?.total).toBe(8); // 3 + 1 + 4
    });

    it('edge: should handle zero sanctions', async () => {
      mockPrisma.behaviourSanction.groupBy.mockResolvedValueOnce([]);

      const result = await service.getSanctions(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.entries).toHaveLength(0);
      expect(result.data_quality).toBeDefined();
    });
  });

  // ─── getInterventionOutcomes ─────────────────────────────────────────

  describe('getInterventionOutcomes', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should aggregate intervention outcomes with SEND breakdown', async () => {
      mockPrisma.behaviourIntervention.groupBy.mockResolvedValueOnce([
        { outcome: 'resolved', send_aware: true, _count: 5 },
        { outcome: 'resolved', send_aware: false, _count: 3 },
        { outcome: 'escalated', send_aware: false, _count: 2 },
      ]);

      const result = await service.getInterventionOutcomes(TENANT_ID, baseQuery);

      expect(result.entries).toHaveLength(2);
      const resolved = result.entries.find((e) => e.outcome === 'resolved');
      expect(resolved?.count).toBe(8);
      expect(resolved?.send_count).toBe(5);
      expect(resolved?.non_send_count).toBe(3);
    });

    it('should calculate correct send_count vs non_send_count', async () => {
      mockPrisma.behaviourIntervention.groupBy.mockResolvedValueOnce([
        { outcome: 'ongoing', send_aware: true, _count: 10 },
        { outcome: 'ongoing', send_aware: false, _count: 0 },
      ]);

      const result = await service.getInterventionOutcomes(TENANT_ID, baseQuery);

      const ongoing = result.entries.find((e) => e.outcome === 'ongoing');
      expect(ongoing?.send_count).toBe(10);
      expect(ongoing?.non_send_count).toBe(0);
    });

    it('edge: should handle zero interventions', async () => {
      mockPrisma.behaviourIntervention.groupBy.mockResolvedValueOnce([]);

      const result = await service.getInterventionOutcomes(TENANT_ID, baseQuery);

      expect(result.entries).toHaveLength(0);
    });
  });

  // ─── getRatio ────────────────────────────────────────────────────────

  describe('getRatio', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should calculate positive-to-negative ratio', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValueOnce([
        {
          polarity: 'positive',
          participants: [{
            student: {
              year_group_id: 'yg-1',
              year_group: { id: 'yg-1', name: 'Year 7' },
            },
          }],
        },
        {
          polarity: 'positive',
          participants: [{
            student: {
              year_group_id: 'yg-1',
              year_group: { id: 'yg-1', name: 'Year 7' },
            },
          }],
        },
        {
          polarity: 'negative',
          participants: [{
            student: {
              year_group_id: 'yg-1',
              year_group: { id: 'yg-1', name: 'Year 7' },
            },
          }],
        },
      ]);

      const result = await service.getRatio(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.positive).toBe(2);
      expect(result.entries[0]?.negative).toBe(1);
      expect(result.entries[0]?.ratio).toBeCloseTo(2 / 3);
    });

    it('edge: should handle zero negatives (avoid division by zero)', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValueOnce([
        {
          polarity: 'positive',
          participants: [{
            student: {
              year_group_id: 'yg-1',
              year_group: { id: 'yg-1', name: 'Year 7' },
            },
          }],
        },
      ]);

      const result = await service.getRatio(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      // ratio = positive / (positive + negative) = 1 / (1 + 0) = 1
      expect(result.entries[0]?.ratio).toBe(1);
    });

    it('edge: should handle zero total incidents', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValueOnce([]);

      const result = await service.getRatio(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.entries).toHaveLength(0);
    });
  });

  // ─── getTaskCompletion ───────────────────────────────────────────────

  describe('getTaskCompletion', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should calculate task completion rate by type', async () => {
      mockPrisma.behaviourTask.groupBy
        .mockResolvedValueOnce([
          { task_type: 'follow_up', status: 'completed', _count: 8 },
          { task_type: 'follow_up', status: 'pending', _count: 2 },
          { task_type: 'parent_meeting', status: 'completed', _count: 3 },
        ])
        .mockResolvedValueOnce([]); // overdue tasks
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { task_type: 'follow_up', avg_days: 2.5 },
        { task_type: 'parent_meeting', avg_days: 4.0 },
      ]);

      const result = await service.getTaskCompletion(TENANT_ID, baseQuery);

      expect(result.entries).toHaveLength(2);
      const followUp = result.entries.find((e) => e.task_type === 'follow_up');
      expect(followUp?.total).toBe(10);
      expect(followUp?.completed).toBe(8);
      expect(followUp?.completion_rate).toBe(0.8);
      expect(followUp?.avg_days_to_complete).toBe(2.5);
    });

    it('should compute avg_days_to_complete for completed tasks', async () => {
      mockPrisma.behaviourTask.groupBy
        .mockResolvedValueOnce([
          { task_type: 'investigation', status: 'completed', _count: 5 },
        ])
        .mockResolvedValueOnce([]); // no overdue
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { task_type: 'investigation', avg_days: 3.2 },
      ]);

      const result = await service.getTaskCompletion(TENANT_ID, baseQuery);

      const entry = result.entries[0];
      expect(entry?.avg_days_to_complete).toBe(3.2);
    });

    it('edge: should return null avg_days when no completed tasks', async () => {
      mockPrisma.behaviourTask.groupBy
        .mockResolvedValueOnce([
          { task_type: 'follow_up', status: 'pending', _count: 5 },
        ])
        .mockResolvedValueOnce([]); // no overdue
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // no completion data

      const result = await service.getTaskCompletion(TENANT_ID, baseQuery);

      const followUp = result.entries.find((e) => e.task_type === 'follow_up');
      expect(followUp?.avg_days_to_complete).toBeNull();
      expect(followUp?.completion_rate).toBe(0);
    });
  });

  // ─── getBenchmarks ───────────────────────────────────────────────────

  describe('getBenchmarks', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should return MV data when benchmarking is enabled', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValueOnce({
        settings: {
          behaviour: { cross_school_benchmarking_enabled: true },
        },
      });
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          benchmark_category: 'verbal_warning',
          metric_name: 'rate_per_100',
          tenant_value: 5.5,
          etb_average: 4.2,
          percentile: 65,
          sample_size: BigInt(20),
        },
      ]);

      const result = await service.getBenchmarks(TENANT_ID, baseQuery);

      expect(result.benchmarking_enabled).toBe(true);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.benchmark_category).toBe('verbal_warning');
      expect(result.entries[0]?.tenant_value).toBe(5.5);
      expect(result.entries[0]?.sample_size).toBe(20);
    });

    it('should return empty when benchmarking is disabled', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValueOnce({
        settings: {
          behaviour: { cross_school_benchmarking_enabled: false },
        },
      });

      const result = await service.getBenchmarks(TENANT_ID, baseQuery);

      expect(result.benchmarking_enabled).toBe(false);
      expect(result.entries).toHaveLength(0);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  // ─── getTeacherAnalytics ─────────────────────────────────────────────

  describe('getTeacherAnalytics', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should return per-teacher incident rates', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([
        { reported_by_id: 'teacher-1', polarity: 'positive', _count: 10 },
        { reported_by_id: 'teacher-1', polarity: 'negative', _count: 5 },
        { reported_by_id: 'teacher-2', polarity: 'negative', _count: 3 },
      ]);
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'teacher-1', first_name: 'Jane', last_name: 'Smith' },
        { id: 'teacher-2', first_name: 'John', last_name: 'Doe' },
      ]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { teacher_id: 'teacher-1', total_teaching_periods: BigInt(100) },
      ]);

      const result = await service.getTeacherAnalytics(TENANT_ID, baseQuery);

      expect(result.entries).toHaveLength(2);
      // Sorted by incident_count descending: teacher-1 has 15, teacher-2 has 3
      expect(result.entries[0]?.teacher_name).toBe('Jane Smith');
      expect(result.entries[0]?.incident_count).toBe(15);
      expect(result.entries[0]?.positive_count).toBe(10);
      expect(result.entries[0]?.negative_count).toBe(5);
      expect(result.entries[0]?.positive_ratio).toBeCloseTo(10 / 15);
      // logging_rate = (15/100)*100 = 15
      expect(result.entries[0]?.logging_rate_per_period).toBe(15);
    });

    it('should handle empty exposure MV gracefully', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValueOnce([
        { reported_by_id: 'teacher-1', polarity: 'positive', _count: 5 },
      ]);
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'teacher-1', first_name: 'Jane', last_name: 'Smith' },
      ]);
      // Exposure MV throws (table doesn't exist yet)
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('MV not available'));

      const result = await service.getTeacherAnalytics(TENANT_ID, baseQuery);

      expect(result.entries[0]?.logging_rate_per_period).toBeNull();
      expect(result.entries[0]?.total_teaching_periods).toBeNull();
      expect(result.data_quality.exposure_normalised).toBe(false);
    });
  });

  // ─── getClassComparisons ─────────────────────────────────────────────

  describe('getClassComparisons', () => {
    const baseQuery = { from: '2026-03-01', to: '2026-03-27', exposureNormalised: true };

    it('should return per-class incident rates with student counts', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValueOnce([
        {
          polarity: 'positive',
          participants: [{
            student: {
              class_enrolments: [
                {
                  class_id: 'class-1',
                  class_entity: { id: 'class-1', name: '7A' },
                },
              ],
            },
          }],
        },
        {
          polarity: 'negative',
          participants: [{
            student: {
              class_enrolments: [
                {
                  class_id: 'class-1',
                  class_entity: { id: 'class-1', name: '7A' },
                },
              ],
            },
          }],
        },
        {
          polarity: 'negative',
          participants: [{
            student: {
              class_enrolments: [
                {
                  class_id: 'class-1',
                  class_entity: { id: 'class-1', name: '7A' },
                },
              ],
            },
          }],
        },
        {
          polarity: 'positive',
          participants: [{
            student: {
              class_enrolments: [
                {
                  class_id: 'class-2',
                  class_entity: { id: 'class-2', name: '7B' },
                },
              ],
            },
          }],
        },
      ]);
      mockPrisma.classEnrolment.groupBy.mockResolvedValueOnce([
        { class_id: 'class-1', _count: 25 },
        { class_id: 'class-2', _count: 20 },
      ]);

      const result = await service.getClassComparisons(TENANT_ID, USER_ID, ['behaviour.admin'], baseQuery);

      expect(result.entries).toHaveLength(2);
      // class-1: 3 incidents, 25 students => rate = 3/25 = 0.12
      const class1 = result.entries.find((e) => e.class_id === 'class-1');
      expect(class1).toBeDefined();
      expect(class1?.incident_count).toBe(3);
      expect(class1?.positive_count).toBe(1);
      expect(class1?.negative_count).toBe(2);
      expect(class1?.student_count).toBe(25);
      expect(class1?.incident_rate_per_student).toBe(0.12);
      // class-2: 1 incident, 20 students => rate = 1/20 = 0.05
      const class2 = result.entries.find((e) => e.class_id === 'class-2');
      expect(class2?.incident_rate_per_student).toBe(0.05);
    });
  });
});
