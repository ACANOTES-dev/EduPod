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

// ─── Fixtures ────────────────────────────────────────────────────────────────

type MockQueue = {
  getActive: jest.Mock;
  getJobCounts: jest.Mock;
};
type QueueName = 'notifications' | 'behaviour' | 'finance' | 'payroll' | 'pastoral';

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

// ─── Test Suite — Branch Coverage ──────────────────────────────────────────

describe('HealthService — branch coverage', () => {
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

  // ─── Redis ping exception branch ──────────────────────────────────────────

  describe('checkRedis — exception branch', () => {
    it('should return down when redis.ping throws an exception', async () => {
      redis.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.redis.status).toBe('down');
    });
  });

  // ─── Meilisearch — exception when available is true ─────────────────────

  describe('checkMeilisearch — exception branches', () => {
    it('should return up when meilisearch is available but search throws', async () => {
      meili.available = true;
      meili.search.mockRejectedValue(new Error('Index not found'));

      const result = await service.check();

      // "up" because the connection proved it is reachable
      expect(result.checks.meilisearch.status).toBe('up');
    });
  });

  // ─── Redis memory — maxmemory is 0 (null utilization) ────────────────────

  describe('checkRedisMemory — no maxmemory branch', () => {
    it('should return null utilization when maxmemory_bytes is 0', async () => {
      redis.getMemoryInfo.mockResolvedValue({
        used_memory_bytes: 500_000,
        maxmemory_bytes: 0,
      });

      const result = await service.check();

      expect(result.checks.redis_memory.status).toBe('up');
      expect(result.checks.redis_memory.utilization_percent).toBeNull();
      expect(result.checks.redis_memory.alert).toBeNull();
    });

    it('should return null utilization when maxmemory_bytes is null', async () => {
      redis.getMemoryInfo.mockResolvedValue({
        used_memory_bytes: 500_000,
        maxmemory_bytes: null,
      });

      const result = await service.check();

      expect(result.checks.redis_memory.utilization_percent).toBeNull();
    });
  });

  // ─── Redis memory — exception branch ──────────────────────────────────────

  describe('checkRedisMemory — exception branch', () => {
    it('should return down when getMemoryInfo throws', async () => {
      redis.getMemoryInfo.mockRejectedValue(new Error('Redis unreachable'));

      const result = await service.check();

      expect(result.checks.redis_memory.status).toBe('down');
      expect(result.checks.redis_memory.used_memory_bytes).toBeNull();
      expect(result.checks.redis_memory.maxmemory_bytes).toBeNull();
    });
  });

  // ─── PgBouncer — utilization exceeds threshold ────────────────────────────

  describe('checkPgbouncer — utilization threshold alert', () => {
    it('should alert when utilization exceeds 80%', async () => {
      configValues.PGBOUNCER_ADMIN_URL = 'postgresql://postgres@127.0.0.1:6432/pgbouncer';
      mockPgQuery
        .mockResolvedValueOnce({
          rows: [{ cl_active: '45', cl_waiting: '0' }],
        })
        .mockResolvedValueOnce({
          rows: [{ key: 'max_client_conn', value: '50' }],
        });

      const result = await service.check();

      expect(result.checks.pgbouncer.status).toBe('up');
      expect(result.checks.pgbouncer.utilization_percent).toBe(90);
      expect(result.checks.pgbouncer.alert).toBe('pgbouncer:utilization>80');
    });

    it('should not alert when utilization is below threshold', async () => {
      configValues.PGBOUNCER_ADMIN_URL = 'postgresql://postgres@127.0.0.1:6432/pgbouncer';
      mockPgQuery
        .mockResolvedValueOnce({
          rows: [{ cl_active: '10', cl_waiting: '0' }],
        })
        .mockResolvedValueOnce({
          rows: [{ key: 'max_client_conn', value: '50' }],
        });

      const result = await service.check();

      expect(result.checks.pgbouncer.alert).toBeNull();
    });

    it('should return null utilization when max_client_conn is missing', async () => {
      configValues.PGBOUNCER_ADMIN_URL = 'postgresql://postgres@127.0.0.1:6432/pgbouncer';
      mockPgQuery
        .mockResolvedValueOnce({
          rows: [{ cl_active: '10', cl_waiting: '0' }],
        })
        .mockResolvedValueOnce({
          rows: [], // No config rows
        });

      const result = await service.check();

      expect(result.checks.pgbouncer.max_client_connections).toBeNull();
      expect(result.checks.pgbouncer.utilization_percent).toBeNull();
    });
  });

  // ─── PgBouncer — connection failure ─────────────────────────────────────

  describe('checkPgbouncer — down branch', () => {
    it('should return down when pgbouncer connection fails', async () => {
      configValues.PGBOUNCER_ADMIN_URL = 'postgresql://postgres@127.0.0.1:6432/pgbouncer';
      const pgModule = jest.requireMock('pg') as {
        __mock: { mockConnect: jest.Mock };
      };
      pgModule.__mock.mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.check();

      expect(result.checks.pgbouncer.status).toBe('down');
      expect(result.checks.pgbouncer.alert).toBe('pgbouncer:down');
    });
  });

  // ─── BullMQ — delayed and failed threshold alerts ────────────────────────

  describe('BullMQ — delayed and failed threshold alerts', () => {
    it('should alert when delayed jobs exceed the threshold', async () => {
      queues.notifications.getJobCounts.mockResolvedValue({
        waiting: 0,
        active: 0,
        delayed: 150,
        failed: 0,
      });

      const result = await service.check();

      expect(result.checks.bullmq.alerts).toContain('notifications:delayed>100');
    });

    it('should alert when failed jobs exceed the threshold', async () => {
      queues.payroll.getJobCounts.mockResolvedValue({
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 5,
      });

      const result = await service.check();

      expect(result.checks.bullmq.alerts).toContain('payroll:failed>2');
    });

    it('should generate multiple alerts for the same queue', async () => {
      queues.behaviour.getJobCounts.mockResolvedValue({
        waiting: 100,
        active: 0,
        delayed: 50,
        failed: 10,
      });

      const result = await service.check();

      expect(result.checks.bullmq.alerts).toContain('behaviour:waiting>50');
      expect(result.checks.bullmq.alerts).toContain('behaviour:delayed>25');
      expect(result.checks.bullmq.alerts).toContain('behaviour:failed>5');
    });
  });

  // ─── Worker — non-ok response ─────────────────────────────────────────────

  describe('checkWorker — non-ok response', () => {
    it('should return down when worker returns non-ok HTTP response', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false });

      const result = await service.getAdminDashboard();

      expect(result.worker.status).toBe('down');
    });
  });

  // ─── Worker — custom URL from config ──────────────────────────────────────

  describe('checkWorker — custom WORKER_HEALTH_URL', () => {
    it('should use custom WORKER_HEALTH_URL from config', async () => {
      configValues.WORKER_HEALTH_URL = 'http://worker:3000/healthz';

      const result = await service.getAdminDashboard();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://worker:3000/healthz',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(result.worker.url).toBe('http://worker:3000/healthz');
    });
  });

  // ─── Delivery providers — partial config branches ─────────────────────────

  describe('buildDeliveryProviders — partial config branches', () => {
    it('should report not_configured for all providers when no env vars set', async () => {
      const result = await service.getAdminDashboard();

      expect(result.delivery_providers.resend_email.status).toBe('not_configured');
      expect(result.delivery_providers.twilio_sms.status).toBe('not_configured');
      expect(result.delivery_providers.twilio_whatsapp.status).toBe('not_configured');
    });

    it('should report sms as not_configured when only SID and token are set (no FROM)', async () => {
      configValues.TWILIO_ACCOUNT_SID = 'AC123';
      configValues.TWILIO_AUTH_TOKEN = 'secret';

      const result = await service.getAdminDashboard();

      expect(result.delivery_providers.twilio_sms.status).toBe('not_configured');
      expect(result.delivery_providers.twilio_whatsapp.status).toBe('not_configured');
    });

    it('should report sms configured but whatsapp not when only SMS_FROM is set', async () => {
      configValues.TWILIO_ACCOUNT_SID = 'AC123';
      configValues.TWILIO_AUTH_TOKEN = 'secret';
      configValues.TWILIO_SMS_FROM = '+3530000001';

      const result = await service.getAdminDashboard();

      expect(result.delivery_providers.twilio_sms.status).toBe('configured');
      expect(result.delivery_providers.twilio_whatsapp.status).toBe('not_configured');
    });

    it('should report whatsapp configured but sms not when only WHATSAPP_FROM is set', async () => {
      configValues.TWILIO_ACCOUNT_SID = 'AC123';
      configValues.TWILIO_AUTH_TOKEN = 'secret';
      configValues.TWILIO_WHATSAPP_FROM = 'whatsapp:+3530000002';

      const result = await service.getAdminDashboard();

      expect(result.delivery_providers.twilio_sms.status).toBe('not_configured');
      expect(result.delivery_providers.twilio_whatsapp.status).toBe('configured');
    });
  });

  // ─── getAdminDashboard — healthy + worker down = degraded ─────────────────

  describe('getAdminDashboard — status computation branches', () => {
    it('should remain unhealthy even when worker is down if API is unhealthy', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));
      fetchMock.mockRejectedValueOnce(new Error('Worker down'));

      const result = await service.getAdminDashboard();

      expect(result.status).toBe('unhealthy');
      expect(result.alerts).toContain('worker:down');
    });

    it('should aggregate alerts from bullmq, pgbouncer, redis_memory and worker', async () => {
      queues.finance.getJobCounts.mockResolvedValue({
        waiting: 50,
        active: 0,
        delayed: 0,
        failed: 10,
      });
      redis.getMemoryInfo.mockResolvedValue({
        used_memory_bytes: 9,
        maxmemory_bytes: 10,
      });
      fetchMock.mockRejectedValueOnce(new Error('Worker down'));

      const result = await service.getAdminDashboard();

      expect(result.alerts).toContain('finance:waiting>25');
      expect(result.alerts).toContain('finance:failed>5');
      expect(result.alerts).toContain('redis_memory:utilization>80');
      expect(result.alerts).toContain('worker:down');
    });
  });

  // ─── getReadiness — both down ──────────────────────────────────────────────

  describe('getReadiness — both critical deps down', () => {
    it('should return not_ready when both PostgreSQL and Redis are down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('PG down'));
      redis.ping.mockResolvedValue(false);

      const result = await service.getReadiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.postgresql.status).toBe('down');
      expect(result.checks.redis.status).toBe('down');
    });
  });
});
