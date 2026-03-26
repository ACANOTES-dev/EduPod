import { Test, TestingModule } from '@nestjs/testing';
import { $Enums } from '@prisma/client';

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
        BehaviourPointsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedisService },
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
      settings: {
        behaviour: { points_reset_frequency: 'academic_year' },
      },
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
      settings: {
        behaviour: { points_reset_frequency: 'academic_period' },
      },
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
    expect(mockRedisKeys).toHaveBeenCalledWith(
      `behaviour:points:${TENANT_ID}:${STUDENT_ID}:*`,
    );

    // Verify del was called with the matched keys
    expect(mockRedisDel).toHaveBeenCalledWith(...matchingKeys);
  });
});
