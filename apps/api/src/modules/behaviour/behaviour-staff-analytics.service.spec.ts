import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, RbacReadFacade, AuthReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourStaffAnalyticsService } from './behaviour-staff-analytics.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BASE_QUERY = { from: '2026-03-01', to: '2026-03-31', exposureNormalised: false };

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeMockPrisma = () => ({
  tenantMembership: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourIncident: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
});

type MockPrisma = ReturnType<typeof makeMockPrisma>;

describe('BehaviourStaffAnalyticsService', () => {
  let service: BehaviourStaffAnalyticsService;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();

    const mockRbacReadFacade = {
      findMembershipsWithPermissionAndUser: mockPrisma.tenantMembership.findMany,
    };
    const mockAuthReadFacade = {
      findUsersByIds: mockPrisma.user.findMany,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        BehaviourStaffAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RbacReadFacade, useValue: mockRbacReadFacade },
        { provide: AuthReadFacade, useValue: mockAuthReadFacade },
      ],
    }).compile();

    service = module.get<BehaviourStaffAnalyticsService>(BehaviourStaffAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getStaffActivity ──────────────────────────────────────────────────

  describe('BehaviourStaffAnalyticsService -- getStaffActivity', () => {
    it('should return empty staff list when no staff have behaviour.log permission', async () => {
      const result = await service.getStaffActivity(TENANT_ID, BASE_QUERY);

      expect(result.staff).toEqual([]);
      expect(result.data_quality).toBeDefined();
    });

    it('should compute activity windows and inactive flag', async () => {
      const staffMembership = {
        user_id: 'staff-1',
        user: { first_name: 'Jane', last_name: 'Teacher' },
      };
      mockPrisma.tenantMembership.findMany.mockResolvedValue([staffMembership]);

      // last7, last30, yearTotal, lastLogged
      mockPrisma.behaviourIncident.groupBy
        .mockResolvedValueOnce([{ reported_by_id: 'staff-1', _count: 3 }])
        .mockResolvedValueOnce([{ reported_by_id: 'staff-1', _count: 12 }])
        .mockResolvedValueOnce([{ reported_by_id: 'staff-1', _count: 45 }])
        .mockResolvedValueOnce([{ reported_by_id: 'staff-1', _max: { occurred_at: new Date() } }]);

      const result = await service.getStaffActivity(TENANT_ID, BASE_QUERY);

      expect(result.staff).toHaveLength(1);
      expect(result.staff[0]!.staff_name).toBe('Jane Teacher');
      expect(result.staff[0]!.last_7_days).toBe(3);
      expect(result.staff[0]!.last_30_days).toBe(12);
      expect(result.staff[0]!.total_year).toBe(45);
      expect(result.staff[0]!.inactive_flag).toBe(false);
    });

    it('should flag staff as inactive when last logged > 14 days ago', async () => {
      const staffMembership = {
        user_id: 'staff-1',
        user: { first_name: 'Old', last_name: 'Logger' },
      };
      mockPrisma.tenantMembership.findMany.mockResolvedValue([staffMembership]);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      mockPrisma.behaviourIncident.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ reported_by_id: 'staff-1', _count: 2 }])
        .mockResolvedValueOnce([
          { reported_by_id: 'staff-1', _max: { occurred_at: thirtyDaysAgo } },
        ]);

      const result = await service.getStaffActivity(TENANT_ID, BASE_QUERY);

      expect(result.staff[0]!.inactive_flag).toBe(true);
      expect(result.staff[0]!.last_7_days).toBe(0);
    });
  });

  // ─── getTeacherAnalytics ───────────────────────────────────────────────

  describe('BehaviourStaffAnalyticsService -- getTeacherAnalytics', () => {
    it('should return empty entries when no incidents exist', async () => {
      const result = await service.getTeacherAnalytics(TENANT_ID, BASE_QUERY);

      expect(result.entries).toEqual([]);
      expect(result.data_quality.exposure_normalised).toBe(false);
    });

    it('should aggregate per teacher with polarity breakdown', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { reported_by_id: 'teacher-1', polarity: 'positive', _count: 10 },
        { reported_by_id: 'teacher-1', polarity: 'negative', _count: 5 },
        { reported_by_id: 'teacher-2', polarity: 'neutral', _count: 3 },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'teacher-1', first_name: 'Alice', last_name: 'Smith' },
        { id: 'teacher-2', first_name: 'Bob', last_name: 'Jones' },
      ]);

      const result = await service.getTeacherAnalytics(TENANT_ID, BASE_QUERY);

      expect(result.entries).toHaveLength(2);
      // Sorted by incident count descending
      expect(result.entries[0]!.teacher_name).toBe('Alice Smith');
      expect(result.entries[0]!.incident_count).toBe(15);
      expect(result.entries[0]!.positive_ratio).toBeCloseTo(10 / 15);
    });

    it('should set positive_ratio to null when no positive/negative incidents', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { reported_by_id: 'teacher-1', polarity: 'neutral', _count: 5 },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'teacher-1', first_name: 'Charlie', last_name: 'Brown' },
      ]);

      const result = await service.getTeacherAnalytics(TENANT_ID, BASE_QUERY);

      expect(result.entries[0]!.positive_ratio).toBeNull();
    });

    it('should include exposure rate when MV data is available', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { reported_by_id: 'teacher-1', polarity: 'negative', _count: 10 },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'teacher-1', first_name: 'Dana', last_name: 'White' },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { teacher_id: 'teacher-1', total_teaching_periods: BigInt(200) },
      ]);

      const result = await service.getTeacherAnalytics(TENANT_ID, BASE_QUERY);

      expect(result.data_quality.exposure_normalised).toBe(true);
      expect(result.entries[0]!.logging_rate_per_period).toBe(5); // 10/200 * 100
      expect(result.entries[0]!.total_teaching_periods).toBe(200);
    });
  });
});
