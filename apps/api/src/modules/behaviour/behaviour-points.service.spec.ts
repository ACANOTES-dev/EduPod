import { Test, TestingModule } from '@nestjs/testing';
import { $Enums } from '@prisma/client';

import {
  MOCK_FACADE_PROVIDERS,
  ConfigurationReadFacade,
  AcademicReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { BehaviourPointsService } from './behaviour-points.service';

/** Statuses excluded from point aggregations — must match the service. */
const EXCLUDED_STATUSES: $Enums.IncidentStatus[] = [
  'draft',
  'withdrawn',
  'converted_to_safeguarding' as $Enums.IncidentStatus,
];

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';

describe('BehaviourPointsService', () => {
  let service: BehaviourPointsService;

  let mockAggregate: jest.Mock;
  let mockTenantSettingFindFirst: jest.Mock;
  let mockAcademicYearFindFirst: jest.Mock;
  let mockAcademicPeriodFindFirst: jest.Mock;

  let mockRedisGet: jest.Mock;
  let mockRedisSet: jest.Mock;
  let mockRedisDel: jest.Mock;
  let mockRedisKeys: jest.Mock;

  beforeEach(async () => {
    mockAggregate = jest.fn();
    mockTenantSettingFindFirst = jest.fn();
    mockAcademicYearFindFirst = jest.fn();
    mockAcademicPeriodFindFirst = jest.fn();

    mockRedisGet = jest.fn();
    mockRedisSet = jest.fn();
    mockRedisDel = jest.fn();
    mockRedisKeys = jest.fn();

    const mockConfigFacade = {
      findSettingsJson: mockTenantSettingFindFirst,
    };
    const mockAcademicFacade = {
      findCurrentYear: mockAcademicYearFindFirst,
      findCurrentPeriod: mockAcademicPeriodFindFirst,
    };

    const mockPrisma = {
      behaviourIncidentParticipant: { aggregate: mockAggregate },
      tenantSetting: { findFirst: mockTenantSettingFindFirst },
      academicYear: { findFirst: mockAcademicYearFindFirst },
      academicPeriod: { findFirst: mockAcademicPeriodFindFirst },
    };

    const mockRedisClient = {
      get: mockRedisGet,
      set: mockRedisSet,
      del: mockRedisDel,
      keys: mockRedisKeys,
    };

    const mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        BehaviourPointsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
      ],
    }).compile();

    service = module.get<BehaviourPointsService>(BehaviourPointsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return sum of non-withdrawn participant points', async () => {
    // Cache miss
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    // Tenant settings: default academic_year reset
    mockTenantSettingFindFirst.mockResolvedValue(null);
    mockAcademicYearFindFirst.mockResolvedValue({ id: 'year-abc' });

    // Aggregate returns 42 points
    mockAggregate.mockResolvedValue({
      _sum: { points_awarded: 42 },
    });

    const result = await service.getStudentPoints(TENANT_ID, STUDENT_ID);

    expect(result.total).toBe(42);
    expect(result.fromCache).toBe(false);
    expect(mockAggregate).toHaveBeenCalledTimes(1);
  });

  it('should exclude participants on withdrawn incidents', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    mockTenantSettingFindFirst.mockResolvedValue(null);
    mockAcademicYearFindFirst.mockResolvedValue({ id: 'year-abc' });

    mockAggregate.mockResolvedValue({
      _sum: { points_awarded: 10 },
    });

    await service.getStudentPoints(TENANT_ID, STUDENT_ID);

    // Verify the aggregate where clause excludes withdrawn/draft/converted statuses
    const callArgs = mockAggregate.mock.calls[0][0] as {
      where: {
        incident: {
          status: { notIn: $Enums.IncidentStatus[] };
          retention_status: string;
        };
      };
    };

    expect(callArgs.where.incident.status).toEqual({
      notIn: EXCLUDED_STATUSES,
    });
    expect(callArgs.where.incident.retention_status).toBe('active');
  });

  it('should scope to academic year when points_reset_frequency = academic_year', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    // Tenant settings with academic_year reset
    mockTenantSettingFindFirst.mockResolvedValue({
      behaviour: { points_reset_frequency: 'academic_year' },
    });

    mockAcademicYearFindFirst.mockResolvedValue({ id: 'year-123' });

    mockAggregate.mockResolvedValue({
      _sum: { points_awarded: 30 },
    });

    await service.getStudentPoints(TENANT_ID, STUDENT_ID);

    // Verify the aggregate where includes academic_year_id scope
    const callArgs = mockAggregate.mock.calls[0][0] as {
      where: {
        incident: { academic_year_id: string };
      };
    };

    expect(callArgs.where.incident.academic_year_id).toBe('year-123');
  });

  it('should scope to academic period when points_reset_frequency = academic_period', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    // Tenant settings with academic_period reset
    mockTenantSettingFindFirst.mockResolvedValue({
      behaviour: { points_reset_frequency: 'academic_period' },
    });

    mockAcademicPeriodFindFirst.mockResolvedValue({ id: 'period-456' });

    mockAggregate.mockResolvedValue({
      _sum: { points_awarded: 15 },
    });

    await service.getStudentPoints(TENANT_ID, STUDENT_ID);

    // Verify the aggregate where includes academic_period_id scope
    const callArgs = mockAggregate.mock.calls[0][0] as {
      where: {
        incident: { academic_period_id: string };
      };
    };

    expect(callArgs.where.incident.academic_period_id).toBe('period-456');
  });

  it('should return points from cache when cache hit', async () => {
    // Cache hit — return '25'
    mockRedisGet.mockResolvedValue('25');

    // Tenant settings needed to build the cache key
    mockTenantSettingFindFirst.mockResolvedValue(null);
    mockAcademicYearFindFirst.mockResolvedValue({ id: 'year-abc' });

    const result = await service.getStudentPoints(TENANT_ID, STUDENT_ID);

    expect(result.total).toBe(25);
    expect(result.fromCache).toBe(true);
    // Aggregate should NOT be called on cache hit
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  it('should invalidate cache on incident withdrawal', async () => {
    const matchingKeys = [
      `behaviour:points:${TENANT_ID}:${STUDENT_ID}:year:y1`,
      `behaviour:points:${TENANT_ID}:${STUDENT_ID}:all_time`,
    ];

    mockRedisKeys.mockResolvedValue(matchingKeys);
    mockRedisDel.mockResolvedValue(2);

    await service.invalidateStudentPointsCache(TENANT_ID, STUDENT_ID);

    // Verify keys were looked up with the correct pattern
    expect(mockRedisKeys).toHaveBeenCalledWith(`behaviour:points:${TENANT_ID}:${STUDENT_ID}:*`);

    // Verify del was called with the matched keys
    expect(mockRedisDel).toHaveBeenCalledWith(...matchingKeys);
  });

  it('should skip del when no cached keys are found', async () => {
    mockRedisKeys.mockResolvedValue([]);

    await service.invalidateStudentPointsCache(TENANT_ID, STUDENT_ID);

    expect(mockRedisDel).not.toHaveBeenCalled();
  });

  // ─── resolvePointsScope — never ────────────────────────────────────────

  it('should return all_time scope when points_reset_frequency = never', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    mockTenantSettingFindFirst.mockResolvedValue({
      behaviour: { points_reset_frequency: 'never' },
    });

    mockAggregate.mockResolvedValue({
      _sum: { points_awarded: 99 },
    });

    const result = await service.getStudentPoints(TENANT_ID, STUDENT_ID);

    expect(result.total).toBe(99);
    // Verify no academic year/period filter was applied
    const callArgs = mockAggregate.mock.calls[0]![0] as {
      where: {
        incident: Record<string, unknown>;
      };
    };
    expect(callArgs.where.incident).not.toHaveProperty('academic_year_id');
    expect(callArgs.where.incident).not.toHaveProperty('academic_period_id');
  });

  // ─── resolvePointsScope — academic_period fallback ──────────────────────

  it('should fall back to academic_year scope when academic_period is not found', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    mockTenantSettingFindFirst.mockResolvedValue({
      behaviour: { points_reset_frequency: 'academic_period' },
    });
    // No active period
    mockAcademicPeriodFindFirst.mockResolvedValue(null);
    // Active year exists
    mockAcademicYearFindFirst.mockResolvedValue({ id: 'year-fallback' });

    mockAggregate.mockResolvedValue({
      _sum: { points_awarded: 20 },
    });

    await service.getStudentPoints(TENANT_ID, STUDENT_ID);

    const callArgs = mockAggregate.mock.calls[0]![0] as {
      where: { incident: Record<string, unknown> };
    };
    expect(callArgs.where.incident).toHaveProperty('academic_year_id', 'year-fallback');
  });

  // ─── resolvePointsScope — all-time fallback ─────────────────────────────

  it('should fall back to all_time when no active academic year found', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    mockTenantSettingFindFirst.mockResolvedValue(null);
    // No active year
    mockAcademicYearFindFirst.mockResolvedValue(null);

    mockAggregate.mockResolvedValue({
      _sum: { points_awarded: 5 },
    });

    await service.getStudentPoints(TENANT_ID, STUDENT_ID);

    const callArgs = mockAggregate.mock.calls[0]![0] as {
      where: { incident: Record<string, unknown> };
    };
    expect(callArgs.where.incident).not.toHaveProperty('academic_year_id');
    expect(callArgs.where.incident).not.toHaveProperty('academic_period_id');
  });

  // ─── computeStudentPointsFresh ──────────────────────────────────────────

  it('should compute fresh points without cache interaction', async () => {
    mockTenantSettingFindFirst.mockResolvedValue(null);
    mockAcademicYearFindFirst.mockResolvedValue({ id: 'year-1' });

    mockAggregate.mockResolvedValue({
      _sum: { points_awarded: 77 },
    });

    const total = await service.computeStudentPointsFresh(TENANT_ID, STUDENT_ID);

    expect(total).toBe(77);
    expect(mockRedisGet).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  // ─── computeStudentPoints — null aggregate ──────────────────────────────

  it('edge: should return 0 when aggregate sum is null', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    mockTenantSettingFindFirst.mockResolvedValue(null);
    mockAcademicYearFindFirst.mockResolvedValue({ id: 'year-1' });

    mockAggregate.mockResolvedValue({
      _sum: { points_awarded: null },
    });

    const result = await service.getStudentPoints(TENANT_ID, STUDENT_ID);
    expect(result.total).toBe(0);
  });

  // ─── getHousePoints ─────────────────────────────────────────────────────

  describe('getHousePoints', () => {
    let mockFindMany: jest.Mock;
    let mockHousePointsAggregate: jest.Mock;

    beforeEach(() => {
      mockFindMany = jest.fn();
      mockHousePointsAggregate = jest.fn();
      (service as unknown as { prisma: Record<string, unknown> }).prisma = {
        behaviourHouseMembership: { findMany: mockFindMany },
        behaviourIncidentParticipant: { aggregate: mockHousePointsAggregate },
      };
    });

    it('should return cached value on cache hit', async () => {
      mockRedisGet.mockResolvedValue('42');

      const result = await service.getHousePoints(TENANT_ID, 'house-1', 'year-1');

      expect(result.total).toBe(42);
      expect(result.fromCache).toBe(true);
    });

    it('should return 0 when no members in house', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      mockFindMany.mockResolvedValue([]);

      const result = await service.getHousePoints(TENANT_ID, 'house-1', 'year-1');

      expect(result.total).toBe(0);
      expect(result.fromCache).toBe(false);
    });

    it('should aggregate points for house members', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      mockFindMany.mockResolvedValue([{ student_id: 's-1' }, { student_id: 's-2' }]);
      mockHousePointsAggregate.mockResolvedValue({
        _sum: { points_awarded: 100 },
      });

      const result = await service.getHousePoints(TENANT_ID, 'house-1', 'year-1');

      expect(result.total).toBe(100);
      expect(result.fromCache).toBe(false);
    });

    it('edge: should return 0 when aggregate sum is null', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      mockFindMany.mockResolvedValue([{ student_id: 's-1' }]);
      mockHousePointsAggregate.mockResolvedValue({
        _sum: { points_awarded: null },
      });

      const result = await service.getHousePoints(TENANT_ID, 'house-1', 'year-1');

      expect(result.total).toBe(0);
    });
  });

  // ─── invalidateHousePointsCache ─────────────────────────────────────────

  it('should delete exact house points cache key', async () => {
    mockRedisDel.mockResolvedValue(1);

    await service.invalidateHousePointsCache(TENANT_ID, 'house-1', 'year-1');

    expect(mockRedisDel).toHaveBeenCalledWith(`behaviour:house-points:${TENANT_ID}:house-1:year-1`);
  });

  // ─── getLeaderboard ─────────────────────────────────────────────────────

  describe('getLeaderboard', () => {
    let mockGroupBy: jest.Mock;
    let mockFindByIds: jest.Mock;
    let mockMembershipFindMany: jest.Mock;

    beforeEach(() => {
      mockGroupBy = jest.fn();
      mockFindByIds = jest.fn().mockResolvedValue([]);
      mockMembershipFindMany = jest.fn().mockResolvedValue([]);
      (service as unknown as { prisma: Record<string, unknown> }).prisma = {
        behaviourIncidentParticipant: { groupBy: mockGroupBy },
        behaviourHouseMembership: { findMany: mockMembershipFindMany },
      };
      (service as unknown as { studentReadFacade: Record<string, unknown> }).studentReadFacade = {
        findByIds: mockFindByIds,
      };
    });

    it('should return empty data for empty grouped result', async () => {
      mockGroupBy.mockResolvedValue([]);

      const result = await service.getLeaderboard(TENANT_ID, {
        page: 1,
        pageSize: 10,
        scope: 'all_time',
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('should return empty data when page exceeds total', async () => {
      mockGroupBy.mockResolvedValue([{ student_id: 's-1', _sum: { points_awarded: 10 } }]);

      const result = await service.getLeaderboard(TENANT_ID, {
        page: 2,
        pageSize: 10,
        scope: 'all_time',
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(1);
    });

    it('should scope by year when scope = year', async () => {
      mockGroupBy.mockResolvedValue([]);
      mockAcademicYearFindFirst.mockResolvedValue({ id: 'year-1' });

      await service.getLeaderboard(TENANT_ID, {
        page: 1,
        pageSize: 10,
        scope: 'year',
      });

      const callArgs = mockGroupBy.mock.calls[0]![0] as {
        where: { incident: Record<string, unknown> };
      };
      expect(callArgs.where.incident).toHaveProperty('academic_year_id', 'year-1');
    });

    it('should scope by period when scope = period', async () => {
      mockGroupBy.mockResolvedValue([]);
      mockAcademicPeriodFindFirst.mockResolvedValue({ id: 'period-1' });

      await service.getLeaderboard(TENANT_ID, {
        page: 1,
        pageSize: 10,
        scope: 'period',
      });

      const callArgs = mockGroupBy.mock.calls[0]![0] as {
        where: { incident: Record<string, unknown> };
      };
      expect(callArgs.where.incident).toHaveProperty('academic_period_id', 'period-1');
    });

    it('should filter by year_group_id when provided', async () => {
      mockGroupBy.mockResolvedValue([]);

      await service.getLeaderboard(TENANT_ID, {
        page: 1,
        pageSize: 10,
        scope: 'all_time',
        year_group_id: 'yg-1',
      });

      const callArgs = mockGroupBy.mock.calls[0]![0] as {
        where: { student: Record<string, unknown> };
      };
      expect(callArgs.where.student).toEqual({ year_group_id: 'yg-1' });
    });

    it('should map student data and house memberships into leaderboard entries', async () => {
      mockGroupBy.mockResolvedValue([{ student_id: 's-1', _sum: { points_awarded: 50 } }]);
      mockFindByIds.mockResolvedValue([
        {
          id: 's-1',
          first_name: 'Alice',
          last_name: 'Smith',
          year_group: { id: 'yg-1', name: 'Year 4' },
        },
      ]);
      mockAcademicYearFindFirst.mockResolvedValue({ id: 'year-1' });
      mockMembershipFindMany.mockResolvedValue([
        { student_id: 's-1', house: { id: 'h-1', name: 'Eagles', color: '#ff0000' } },
      ]);

      const result = await service.getLeaderboard(TENANT_ID, {
        page: 1,
        pageSize: 10,
        scope: 'all_time',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          student_id: 's-1',
          first_name: 'Alice',
          last_name: 'Smith',
          total_points: 50,
          rank: 1,
          house: { id: 'h-1', name: 'Eagles', color: '#ff0000' },
        }),
      );
    });

    it('edge: should handle null student_id in grouped result', async () => {
      mockGroupBy.mockResolvedValue([{ student_id: null, _sum: { points_awarded: 5 } }]);
      mockAcademicYearFindFirst.mockResolvedValue(null);

      const result = await service.getLeaderboard(TENANT_ID, {
        page: 1,
        pageSize: 10,
        scope: 'all_time',
      });

      expect(result.data[0]!.student_id).toBe('');
      expect(result.data[0]!.house).toBeNull();
    });

    it('edge: should handle null points_awarded in grouped result', async () => {
      mockGroupBy.mockResolvedValue([{ student_id: 's-1', _sum: { points_awarded: null } }]);
      mockFindByIds.mockResolvedValue([]);
      mockAcademicYearFindFirst.mockResolvedValue(null);

      const result = await service.getLeaderboard(TENANT_ID, {
        page: 1,
        pageSize: 10,
        scope: 'all_time',
      });

      expect(result.data[0]!.total_points).toBe(0);
    });
  });

  // ─── getHouseStandings ──────────────────────────────────────────────────

  describe('getHouseStandings', () => {
    let mockHouseFindMany: jest.Mock;
    let mockMembershipFindMany: jest.Mock;
    let mockPointsGroupBy: jest.Mock;

    beforeEach(() => {
      mockHouseFindMany = jest.fn();
      mockMembershipFindMany = jest.fn();
      mockPointsGroupBy = jest.fn();
      (service as unknown as { prisma: Record<string, unknown> }).prisma = {
        behaviourHouseTeam: { findMany: mockHouseFindMany },
        behaviourHouseMembership: { findMany: mockMembershipFindMany },
        behaviourIncidentParticipant: { groupBy: mockPointsGroupBy },
      };
    });

    it('should return empty array when no houses exist', async () => {
      mockHouseFindMany.mockResolvedValue([]);

      const result = await service.getHouseStandings(TENANT_ID, 'year-1');

      expect(result).toHaveLength(0);
    });

    it('should return houses with zero points when no memberships exist', async () => {
      mockHouseFindMany.mockResolvedValue([
        { id: 'h-1', name: 'Eagles', name_ar: null, color: '#ff0', icon: null },
      ]);
      mockMembershipFindMany.mockResolvedValue([]);

      const result = await service.getHouseStandings(TENANT_ID, 'year-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.total_points).toBe(0);
      expect(result[0]!.member_count).toBe(0);
    });

    it('should aggregate points per house from student points', async () => {
      mockHouseFindMany.mockResolvedValue([
        { id: 'h-1', name: 'Eagles', name_ar: null, color: '#ff0', icon: null },
        { id: 'h-2', name: 'Hawks', name_ar: null, color: '#00f', icon: null },
      ]);
      mockMembershipFindMany.mockResolvedValue([
        { house_id: 'h-1', student_id: 's-1' },
        { house_id: 'h-1', student_id: 's-2' },
        { house_id: 'h-2', student_id: 's-3' },
      ]);
      mockPointsGroupBy.mockResolvedValue([
        { student_id: 's-1', _sum: { points_awarded: 10 } },
        { student_id: 's-2', _sum: { points_awarded: 20 } },
        { student_id: 's-3', _sum: { points_awarded: 5 } },
      ]);

      const result = await service.getHouseStandings(TENANT_ID, 'year-1');

      expect(result).toHaveLength(2);
      const eagles = result.find((h) => h.name === 'Eagles');
      expect(eagles!.total_points).toBe(30);
      expect(eagles!.member_count).toBe(2);

      const hawks = result.find((h) => h.name === 'Hawks');
      expect(hawks!.total_points).toBe(5);
      expect(hawks!.member_count).toBe(1);
    });

    it('edge: should handle students with no points returning null sum', async () => {
      mockHouseFindMany.mockResolvedValue([
        { id: 'h-1', name: 'Eagles', name_ar: null, color: '#ff0', icon: null },
      ]);
      mockMembershipFindMany.mockResolvedValue([{ house_id: 'h-1', student_id: 's-1' }]);
      mockPointsGroupBy.mockResolvedValue([{ student_id: 's-1', _sum: { points_awarded: null } }]);

      const result = await service.getHouseStandings(TENANT_ID, 'year-1');

      expect(result[0]!.total_points).toBe(0);
    });
  });
});
