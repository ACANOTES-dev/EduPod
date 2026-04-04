import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('pg', () => {
  const mockConnect = jest.fn().mockResolvedValue(undefined);
  const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
  const mockEnd = jest.fn().mockResolvedValue(undefined);

  return {
    Client: jest.fn().mockImplementation(() => ({
      connect: mockConnect,
      query: mockQuery,
      end: mockEnd,
    })),
    __mock: {
      mockConnect,
      mockQuery,
      mockEnd,
    },
  };
});

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
  let redis: { ping: jest.Mock; getMemoryInfo: jest.Mock };
  let meili: { available: boolean; search: jest.Mock };
  let configValues: Record<string, string | undefined>;
  let configService: { get: jest.Mock };
  let queues: Record<QueueName, MockQueue>;
  let fetchMock: jest.Mock;
  let mockPgQuery: jest.Mock;

  beforeEach(async () => {
    const pgModule = jest.requireMock('pg') as {
      __mock: { mockConnect: jest.Mock; mockQuery: jest.Mock; mockEnd: jest.Mock };
    };
    pgModule.__mock.mockConnect.mockResolvedValue(undefined);
    pgModule.__mock.mockQuery.mockResolvedValue({ rows: [] });
    pgModule.__mock.mockEnd.mockResolvedValue(undefined);
    mockPgQuery = pgModule.__mock.mockQuery;

    prisma = { $queryRaw: jest.fn() };
    redis = { ping: jest.fn(), getMemoryInfo: jest.fn() };
    meili = { available: true, search: jest.fn() };
    configValues = {};
    configService = {
      get: jest.fn().mockImplementation((key: string) => configValues[key]),
    };
    queues = {
      notifications: buildMockQueue(),
      behaviour: buildMockQueue(),
      finance: buildMockQueue(),
      payroll: buildMockQueue(),
      pastoral: buildMockQueue(),
    };
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    Object.assign(global, { fetch: fetchMock });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: MeilisearchClient, useValue: meili },
        { provide: ConfigService, useValue: configService },
        { provide: getQueueToken('notifications'), useValue: queues.notifications },
        { provide: getQueueToken('behaviour'), useValue: queues.behaviour },
        { provide: getQueueToken('finance'), useValue: queues.finance },
        { provide: getQueueToken('payroll'), useValue: queues.payroll },
        { provide: getQueueToken('pastoral'), useValue: queues.pastoral },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);

    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue(true);
    redis.getMemoryInfo.mockResolvedValue({
      used_memory_bytes: 1_048_576,
      maxmemory_bytes: 2_097_152,
    });
    meili.search.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── check() ──────────────────────────────────────────────────────────────

  describe('check()', () => {
    it('should return healthy when dependencies are up and optional monitors are within thresholds', async () => {
      const result = await service.check();

      expect(result.status).toBe('healthy');
      expect(result.checks.postgresql.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.meilisearch.status).toBe('up');
      expect(result.checks.bullmq.status).toBe('up');
      expect(result.checks.disk.status).toBe('up');
      expect(result.checks.pgbouncer.status).toBe('not_configured');
      expect(result.checks.redis_memory.status).toBe('up');
    });

    it('should return unhealthy when postgresql is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.postgresql.status).toBe('down');
    });

    it('should return unhealthy when redis is down', async () => {
      redis.ping.mockResolvedValue(false);

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should return degraded when only meilisearch is down', async () => {
      meili.available = false;

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.meilisearch.status).toBe('down');
    });

    it('should return degraded when bullmq queue is unreachable', async () => {
      queues.notifications.getActive.mockRejectedValue(new Error('Redis connection lost'));

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.bullmq.status).toBe('down');
    });

    it('should return degraded when redis memory usage exceeds the alert threshold', async () => {
      redis.getMemoryInfo.mockResolvedValue({
        used_memory_bytes: 9,
        maxmemory_bytes: 10,
      });

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.redis_memory.utilization_percent).toBe(90);
      expect(result.checks.redis_memory.alert).toBe('redis_memory:utilization>80');
    });

    it('should surface pgbouncer metrics when the admin URL is configured', async () => {
      configValues.PGBOUNCER_ADMIN_URL = 'postgresql://postgres@127.0.0.1:6432/pgbouncer';
      mockPgQuery
        .mockResolvedValueOnce({
          rows: [
            { cl_active: '12', cl_waiting: '0' },
            { cl_active: '8', cl_waiting: '0' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ key: 'max_client_conn', value: '50' }],
        });

      const result = await service.check();

      expect(result.checks.pgbouncer.status).toBe('up');
      expect(result.checks.pgbouncer.active_client_connections).toBe(20);
      expect(result.checks.pgbouncer.max_client_connections).toBe(50);
      expect(result.checks.pgbouncer.utilization_percent).toBe(40);
    });

    it('should degrade when pgbouncer reports waiting client connections', async () => {
      configValues.PGBOUNCER_ADMIN_URL = 'postgresql://postgres@127.0.0.1:6432/pgbouncer';
      mockPgQuery
        .mockResolvedValueOnce({
          rows: [{ cl_active: '20', cl_waiting: '2' }],
        })
        .mockResolvedValueOnce({
          rows: [{ key: 'max_client_conn', value: '40' }],
        });

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.pgbouncer.alert).toBe('pgbouncer:waiting_connections>0');
    });

    it('should include timestamp and uptime fields', async () => {
      const result = await service.check();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── getReadiness() ───────────────────────────────────────────────────────

  describe('getReadiness()', () => {
    it('should return ready when both PostgreSQL and Redis are up', async () => {
      const result = await service.getReadiness();

      expect(result.status).toBe('ready');
      expect(result.checks.postgresql.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
    });

    it('should return not_ready when PostgreSQL is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const result = await service.getReadiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.postgresql.status).toBe('down');
    });

    it('should return not_ready when Redis is down', async () => {
      redis.ping.mockResolvedValue(false);

      const result = await service.getReadiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should NOT check Meilisearch', async () => {
      await service.getReadiness();

      expect(meili.search).not.toHaveBeenCalled();
    });

    it('should NOT check BullMQ queues', async () => {
      await service.getReadiness();

      expect(queues.notifications.getJobCounts).not.toHaveBeenCalled();
      expect(queues.behaviour.getJobCounts).not.toHaveBeenCalled();
    });

    it('should include latency measurements for PostgreSQL and Redis', async () => {
      const result = await service.getReadiness();

      expect(result.checks.postgresql.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.checks.redis.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should only contain postgresql and redis in checks', async () => {
      const result = await service.getReadiness();

      expect(Object.keys(result.checks)).toEqual(['postgresql', 'redis']);
    });
  });

  // ─── getAdminDashboard() ──────────────────────────────────────────────────

  describe('getAdminDashboard()', () => {
    it('should include worker health and delivery provider configuration', async () => {
      configValues.RESEND_API_KEY = 're_test';
      configValues.TWILIO_ACCOUNT_SID = 'AC123';
      configValues.TWILIO_AUTH_TOKEN = 'secret';
      configValues.TWILIO_SMS_FROM = '+3530000001';
      configValues.TWILIO_WHATSAPP_FROM = 'whatsapp:+3530000002';

      const result = await service.getAdminDashboard();

      expect(result.status).toBe('healthy');
      expect(result.worker.status).toBe('up');
      expect(result.worker.url).toBe('http://127.0.0.1:5556/health');
      expect(result.delivery_providers.resend_email.status).toBe('configured');
      expect(result.delivery_providers.twilio_sms.status).toBe('configured');
      expect(result.delivery_providers.twilio_whatsapp.status).toBe('configured');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:5556/health',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('should degrade when the worker health check fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.getAdminDashboard();

      expect(result.status).toBe('degraded');
      expect(result.worker.status).toBe('down');
      expect(result.alerts).toContain('worker:down');
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
      const SIX_MINUTES_MS = 6 * 60 * 1000;
      const ONE_MINUTE_MS = 1 * 60 * 1000;
      queues.notifications.getActive.mockResolvedValue([
        buildMockJob(SIX_MINUTES_MS),
        buildMockJob(ONE_MINUTE_MS),
        buildMockJob(SIX_MINUTES_MS),
      ]);

      const result = await service.check();

      expect(result.checks.bullmq.status).toBe('up');
      expect(result.checks.bullmq.stuck_jobs).toBe(2);
      expect(result.checks.bullmq.queues.notifications.stuck_jobs).toBe(2);
    });

    it('should use job.timestamp as fallback when processedOn is absent', async () => {
      const SIX_MINUTES_MS = 6 * 60 * 1000;
      queues.notifications.getActive.mockResolvedValue([
        { processedOn: undefined, timestamp: Date.now() - SIX_MINUTES_MS },
      ]);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(1);
    });

    it('should degrade when queue thresholds are exceeded', async () => {
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
      const result = await service.check();

      expect(result.checks.disk.status).toBe('up');
      expect(typeof result.checks.disk.free_gb).toBe('number');
      expect(typeof result.checks.disk.total_gb).toBe('number');
    });
  });
});
