import { Test, TestingModule } from '@nestjs/testing';

import { RedisService } from '../../redis/redis.service';

import { WorkloadCacheService } from './workload-cache.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const PERSONAL_TTL = 300;
const AGGREGATE_TTL = 86_400;

// ─── Sample Data ────────────────────────────────────────────────────────────

const samplePersonalSummary = {
  coverCount: 5,
  freePeriodsUsed: 2,
  workloadScore: 72,
};

const sampleAggregateFairness = {
  giniCoefficient: 0.15,
  maxCoverCount: 12,
  minCoverCount: 0,
  meanCoverCount: 4.3,
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('WorkloadCacheService', () => {
  let service: WorkloadCacheService;
  let mockPipeline: {
    del: jest.Mock;
    set: jest.Mock;
    exec: jest.Mock;
  };
  let mockRedisClient: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    keys: jest.Mock;
    pipeline: jest.Mock;
  };
  let mockRedis: { getClient: jest.Mock };

  beforeEach(async () => {
    mockPipeline = {
      del: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    mockRedisClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      pipeline: jest.fn().mockReturnValue(mockPipeline),
    };

    mockRedis = { getClient: jest.fn().mockReturnValue(mockRedisClient) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkloadCacheService,
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<WorkloadCacheService>(WorkloadCacheService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getCachedPersonal ──────────────────────────────────────────────────

  describe('getCachedPersonal', () => {
    it('should return parsed data when cache hit', async () => {
      mockRedisClient.get.mockResolvedValue(
        JSON.stringify(samplePersonalSummary),
      );

      const result = await service.getCachedPersonal(
        TENANT_ID,
        STAFF_ID,
        'summary',
      );

      expect(result).toEqual(samplePersonalSummary);
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        `wellbeing:personal:${TENANT_ID}:${STAFF_ID}:summary`,
      );
    });

    it('should return null when cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getCachedPersonal(
        TENANT_ID,
        STAFF_ID,
        'summary',
      );

      expect(result).toBeNull();
    });

    it('should return null without throwing on cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await expect(
        service.getCachedPersonal(TENANT_ID, STAFF_ID, 'cover-history'),
      ).resolves.toBeNull();
    });
  });

  // ─── setCachedPersonal ──────────────────────────────────────────────────

  describe('setCachedPersonal', () => {
    it('should set key with correct TTL (300s)', async () => {
      await service.setCachedPersonal(
        TENANT_ID,
        STAFF_ID,
        'summary',
        samplePersonalSummary,
      );

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `wellbeing:personal:${TENANT_ID}:${STAFF_ID}:summary`,
        JSON.stringify(samplePersonalSummary),
        'EX',
        PERSONAL_TTL,
      );
    });
  });

  // ─── getCachedAggregate ─────────────────────────────────────────────────

  describe('getCachedAggregate', () => {
    it('should return parsed data when cache hit', async () => {
      mockRedisClient.get.mockResolvedValue(
        JSON.stringify(sampleAggregateFairness),
      );

      const result = await service.getCachedAggregate(
        TENANT_ID,
        'cover-fairness',
      );

      expect(result).toEqual(sampleAggregateFairness);
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        `wellbeing:aggregate:${TENANT_ID}:cover-fairness`,
      );
    });

    it('should return null when cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getCachedAggregate(
        TENANT_ID,
        'workload-summary',
      );

      expect(result).toBeNull();
    });
  });

  // ─── setCachedAggregate ─────────────────────────────────────────────────

  describe('setCachedAggregate', () => {
    it('should set key with correct TTL (86400s)', async () => {
      await service.setCachedAggregate(
        TENANT_ID,
        'cover-fairness',
        sampleAggregateFairness,
      );

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `wellbeing:aggregate:${TENANT_ID}:cover-fairness`,
        JSON.stringify(sampleAggregateFairness),
        'EX',
        AGGREGATE_TTL,
      );
    });
  });

  // ─── invalidatePersonal ─────────────────────────────────────────────────

  describe('invalidatePersonal', () => {
    it('should delete all matching keys for the staff member', async () => {
      const matchingKeys = [
        `wellbeing:personal:${TENANT_ID}:${STAFF_ID}:summary`,
        `wellbeing:personal:${TENANT_ID}:${STAFF_ID}:cover-history`,
        `wellbeing:personal:${TENANT_ID}:${STAFF_ID}:timetable-quality`,
      ];
      mockRedisClient.keys.mockResolvedValue(matchingKeys);

      await service.invalidatePersonal(TENANT_ID, STAFF_ID);

      expect(mockRedisClient.keys).toHaveBeenCalledWith(
        `wellbeing:personal:${TENANT_ID}:${STAFF_ID}:*`,
      );
      expect(mockRedisClient.pipeline).toHaveBeenCalledTimes(1);
      expect(mockPipeline.del).toHaveBeenCalledTimes(3);
      expect(mockPipeline.del).toHaveBeenCalledWith(matchingKeys[0]);
      expect(mockPipeline.del).toHaveBeenCalledWith(matchingKeys[1]);
      expect(mockPipeline.del).toHaveBeenCalledWith(matchingKeys[2]);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('should handle no matching keys gracefully', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await service.invalidatePersonal(TENANT_ID, STAFF_ID);

      expect(mockRedisClient.keys).toHaveBeenCalledWith(
        `wellbeing:personal:${TENANT_ID}:${STAFF_ID}:*`,
      );
      // Pipeline should not be created when there are no keys
      expect(mockRedisClient.pipeline).not.toHaveBeenCalled();
    });
  });

  // ─── invalidateAggregate ────────────────────────────────────────────────

  describe('invalidateAggregate', () => {
    it('should delete all matching keys for the tenant', async () => {
      const matchingKeys = [
        `wellbeing:aggregate:${TENANT_ID}:workload-summary`,
        `wellbeing:aggregate:${TENANT_ID}:cover-fairness`,
        `wellbeing:aggregate:${TENANT_ID}:timetable-quality`,
        `wellbeing:aggregate:${TENANT_ID}:absence-trends`,
      ];
      mockRedisClient.keys.mockResolvedValue(matchingKeys);

      await service.invalidateAggregate(TENANT_ID);

      expect(mockRedisClient.keys).toHaveBeenCalledWith(
        `wellbeing:aggregate:${TENANT_ID}:*`,
      );
      expect(mockRedisClient.pipeline).toHaveBeenCalledTimes(1);
      expect(mockPipeline.del).toHaveBeenCalledTimes(4);
      for (const key of matchingKeys) {
        expect(mockPipeline.del).toHaveBeenCalledWith(key);
      }
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });
  });

  // ─── setAllAggregateMetrics ─────────────────────────────────────────────

  describe('setAllAggregateMetrics', () => {
    it('should set multiple keys in a pipeline with correct TTL', async () => {
      const metrics: Record<string, unknown> = {
        'workload-summary': { totalStaff: 40, avgLoad: 0.85 },
        'cover-fairness': sampleAggregateFairness,
        'absence-trends': { weeklyRate: 0.03 },
      };

      await service.setAllAggregateMetrics(TENANT_ID, metrics);

      expect(mockRedisClient.pipeline).toHaveBeenCalledTimes(1);
      expect(mockPipeline.set).toHaveBeenCalledTimes(3);

      expect(mockPipeline.set).toHaveBeenCalledWith(
        `wellbeing:aggregate:${TENANT_ID}:workload-summary`,
        JSON.stringify({ totalStaff: 40, avgLoad: 0.85 }),
        'EX',
        AGGREGATE_TTL,
      );
      expect(mockPipeline.set).toHaveBeenCalledWith(
        `wellbeing:aggregate:${TENANT_ID}:cover-fairness`,
        JSON.stringify(sampleAggregateFairness),
        'EX',
        AGGREGATE_TTL,
      );
      expect(mockPipeline.set).toHaveBeenCalledWith(
        `wellbeing:aggregate:${TENANT_ID}:absence-trends`,
        JSON.stringify({ weeklyRate: 0.03 }),
        'EX',
        AGGREGATE_TTL,
      );

      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Key format verification ────────────────────────────────────────────

  describe('key format verification', () => {
    it('should use wellbeing:personal:{tenantId}:{staffProfileId}:{metric} pattern', async () => {
      await service.setCachedPersonal(
        TENANT_ID,
        STAFF_ID,
        'timetable-quality',
        { score: 88 },
      );

      const expectedKey = `wellbeing:personal:${TENANT_ID}:${STAFF_ID}:timetable-quality`;
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expectedKey,
        expect.any(String),
        'EX',
        PERSONAL_TTL,
      );
    });

    it('should use wellbeing:aggregate:{tenantId}:{metric} pattern', async () => {
      await service.setCachedAggregate(
        TENANT_ID,
        'substitution-pressure',
        { pressure: 0.6 },
      );

      const expectedKey = `wellbeing:aggregate:${TENANT_ID}:substitution-pressure`;
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expectedKey,
        expect.any(String),
        'EX',
        AGGREGATE_TTL,
      );
    });
  });
});
