import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MeilisearchClient } from '../search/meilisearch.client';

import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };
  let redis: { ping: jest.Mock };
  let meili: { available: boolean; search: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };
    redis = { ping: jest.fn() };
    meili = { available: true, search: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: MeilisearchClient, useValue: meili },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('check()', () => {
    it('should return healthy when PG and Redis are up', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);

      const result = await service.check();
      expect(result).toEqual({
        status: 'ok',
        checks: { postgres: 'up', redis: 'up' },
      });
    });

    it('should return degraded when PG is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('PG connection failed'));
      redis.ping.mockResolvedValue(true);

      const result = await service.check();
      expect(result).toEqual({
        status: 'degraded',
        checks: { postgres: 'down', redis: 'up' },
      });
    });

    it('should return degraded when Redis is down', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(false);

      const result = await service.check();
      expect(result).toEqual({
        status: 'degraded',
        checks: { postgres: 'up', redis: 'down' },
      });
    });
  });

  describe('getReadiness()', () => {
    it('should return ok when all dependencies are healthy', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.getReadiness();

      expect(result.status).toBe('ok');
      expect(result.checks.postgres.status).toBe('ok');
      expect(result.checks.redis.status).toBe('ok');
      expect(result.checks.meilisearch.status).toBe('ok');
      expect(typeof result.uptime_seconds).toBe('number');
      expect(typeof result.version).toBe('string');
    });

    it('should return degraded when only meilisearch is down', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.available = false;

      const result = await service.getReadiness();

      expect(result.status).toBe('degraded');
      expect(result.checks.meilisearch.status).toBe('fail');
    });

    it('should return unhealthy when postgres is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.getReadiness();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.postgres.status).toBe('fail');
    });

    it('should return unhealthy when redis is down', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(false);
      meili.search.mockResolvedValue(null);

      const result = await service.getReadiness();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.redis.status).toBe('fail');
    });

    it('should include latency measurements', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.getReadiness();

      expect(result.checks.postgres.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.checks.redis.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.checks.meilisearch.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
