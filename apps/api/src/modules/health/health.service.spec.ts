import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MeilisearchClient } from '../search/meilisearch.client';

import { HealthService } from './health.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

type MockJob = { processedOn?: number; timestamp: number };
type QueueName = 'notifications' | 'behaviour' | 'finance' | 'payroll' | 'pastoral';
type MockQueue = {
  getActive: jest.Mock;
  getJobCounts: jest.Mock;
};

function buildMockJob(startedMsAgo: number): MockJob {
  return { processedOn: Date.now() - startedMsAgo, timestamp: Date.now() - startedMsAgo };
}

function buildMockQueue(): MockQueue {
  return {
    getActive: jest.fn().mockResolvedValue([]),
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
    }),
  };
}

// ─── Describe ─────────────────────────────────────────────────────────────────

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };
  let redis: { ping: jest.Mock };
  let meili: { available: boolean; search: jest.Mock };
  let queues: Record<QueueName, MockQueue>;

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };
    redis = { ping: jest.fn() };
    meili = { available: true, search: jest.fn() };
    queues = {
      notifications: buildMockQueue(),
      behaviour: buildMockQueue(),
      finance: buildMockQueue(),
      payroll: buildMockQueue(),
      pastoral: buildMockQueue(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: MeilisearchClient, useValue: meili },
        { provide: getQueueToken('notifications'), useValue: queues.notifications },
        { provide: getQueueToken('behaviour'), useValue: queues.behaviour },
        { provide: getQueueToken('finance'), useValue: queues.finance },
        { provide: getQueueToken('payroll'), useValue: queues.payroll },
        { provide: getQueueToken('pastoral'), useValue: queues.pastoral },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── check() ──────────────────────────────────────────────────────────────

  describe('check()', () => {
    it('should return healthy when all dependencies are up', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.check();

      expect(result.status).toBe('healthy');
      expect(result.checks.postgresql.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.meilisearch.status).toBe('up');
      expect(result.checks.bullmq.status).toBe('up');
      expect(result.checks.disk.status).toBe('up');
    });

    it('should return unhealthy when postgresql is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.postgresql.status).toBe('down');
    });

    it('should return unhealthy when redis is down', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(false);
      meili.search.mockResolvedValue(null);

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should return degraded when only meilisearch is down', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.available = false;

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.meilisearch.status).toBe('down');
    });

    it('should return degraded when bullmq queue is unreachable', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);
      queues.notifications.getActive.mockRejectedValue(new Error('Redis connection lost'));

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.bullmq.status).toBe('down');
    });

    it('should include timestamp and uptime fields', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.check();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── getReadiness() ───────────────────────────────────────────────────────

  describe('getReadiness()', () => {
    it('should return healthy when all dependencies are up', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.getReadiness();

      expect(result.status).toBe('healthy');
    });

    it('should return unhealthy when postgres is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.getReadiness();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.postgresql.status).toBe('down');
    });

    it('should return unhealthy when redis is down', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(false);
      meili.search.mockResolvedValue(null);

      const result = await service.getReadiness();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should return degraded when only meilisearch is unavailable', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.available = false;

      const result = await service.getReadiness();

      expect(result.status).toBe('degraded');
      expect(result.checks.meilisearch.status).toBe('down');
    });

    it('should include latency measurements', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.getReadiness();

      expect(result.checks.postgresql.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.checks.redis.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.checks.meilisearch.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── getLiveness() ────────────────────────────────────────────────────────

  describe('getLiveness()', () => {
    it('should always return alive with a timestamp', () => {
      const result = service.getLiveness();

      expect(result.status).toBe('alive');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ─── BullMQ stuck job detection ───────────────────────────────────────────

  describe('BullMQ — stuck job detection', () => {
    it('should count jobs active longer than 5 minutes as stuck', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const SIX_MINUTES_MS = 6 * 60 * 1000;
      const ONE_MINUTE_MS = 1 * 60 * 1000;
      queues.notifications.getActive.mockResolvedValue([
        buildMockJob(SIX_MINUTES_MS), // stuck
        buildMockJob(ONE_MINUTE_MS), // not stuck
        buildMockJob(SIX_MINUTES_MS), // stuck
      ]);

      const result = await service.check();

      expect(result.checks.bullmq.status).toBe('up');
      expect(result.checks.bullmq.stuck_jobs).toBe(2);
      expect(result.checks.bullmq.queues.notifications.stuck_jobs).toBe(2);
    });

    it('should report zero stuck_jobs when queue is empty', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(0);
    });

    it('should use job.timestamp as fallback when processedOn is absent', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const SIX_MINUTES_MS = 6 * 60 * 1000;
      // Job with no processedOn — falls back to timestamp
      queues.notifications.getActive.mockResolvedValue([
        { processedOn: undefined, timestamp: Date.now() - SIX_MINUTES_MS },
      ]);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(1);
    });

    it('should degrade when queue thresholds are exceeded', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);
      queues.notifications.getJobCounts.mockResolvedValue({
        waiting: 300,
        active: 3,
        delayed: 0,
        failed: 0,
      });

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.bullmq.alerts).toContain('notifications:waiting>250');
    });
  });

  // ─── Disk check ───────────────────────────────────────────────────────────

  describe('disk check', () => {
    it('should return up status from the disk check', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue(true);
      meili.search.mockResolvedValue(null);

      const result = await service.check();

      // Disk is always 'up' — it degrades to unknown values if statfsSync
      // is unavailable, but never throws.
      expect(result.checks.disk.status).toBe('up');
      expect(typeof result.checks.disk.free_gb).toBe('number');
      expect(typeof result.checks.disk.total_gb).toBe('number');
    });
  });
});
