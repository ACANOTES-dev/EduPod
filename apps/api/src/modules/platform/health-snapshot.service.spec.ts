import { Test, TestingModule } from '@nestjs/testing';

import { HealthService, type FullHealthResult } from '../health/health.service';
import { PrismaService } from '../prisma/prisma.service';

import { HealthSnapshotService } from './health-snapshot.service';
import { RedisPubSubService } from './redis-pubsub.service';

const HEALTHY_RESULT: FullHealthResult = {
  status: 'healthy',
  timestamp: '2026-05-15T10:00:00.000Z',
  uptime: 120,
  checks: {
    postgresql: { status: 'up', latency_ms: 2 },
    redis: { status: 'up', latency_ms: 1 },
    meilisearch: { status: 'up', latency_ms: 8 },
    bullmq: {
      status: 'up',
      stuck_jobs: 0,
      alerts: [],
      queues: {
        notifications: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
        behaviour: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
        finance: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
        payroll: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
        pastoral: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
      },
    },
    disk: { status: 'up', free_gb: 45.2, total_gb: 80 },
    pgbouncer: {
      status: 'not_configured',
      latency_ms: 0,
      active_client_connections: null,
      waiting_client_connections: null,
      max_client_connections: null,
      utilization_percent: null,
      alert: null,
    },
    redis_memory: {
      status: 'up',
      used_memory_bytes: 1024,
      maxmemory_bytes: 2048,
      utilization_percent: 50,
      alert: null,
    },
  },
};

const DEGRADED_RESULT: FullHealthResult = {
  ...HEALTHY_RESULT,
  status: 'degraded',
  timestamp: '2026-05-15T10:01:00.000Z',
  checks: {
    ...HEALTHY_RESULT.checks,
    meilisearch: { status: 'down', latency_ms: 0 },
  },
};

function buildMockPrisma() {
  return {
    platformHealthSnapshot: {
      count: jest.fn<Promise<number>, [unknown]>(),
      create: jest.fn<Promise<unknown>, [unknown]>(),
      deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      findMany: jest.fn<Promise<unknown[]>, [unknown]>(),
    },
  };
}

describe('HealthSnapshotService', () => {
  let service: HealthSnapshotService;
  let mockHealthService: { check: jest.Mock<Promise<FullHealthResult>, []> };
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedisPubSub: { publish: jest.Mock<Promise<void>, [string, Record<string, unknown>]> };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T10:00:00.000Z'));

    mockHealthService = {
      check: jest.fn<Promise<FullHealthResult>, []>().mockResolvedValue(HEALTHY_RESULT),
    };
    mockPrisma = buildMockPrisma();
    mockPrisma.platformHealthSnapshot.create.mockResolvedValue({});
    mockPrisma.platformHealthSnapshot.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.platformHealthSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.platformHealthSnapshot.count.mockResolvedValue(0);
    mockRedisPubSub = {
      publish: jest.fn<Promise<void>, [string, Record<string, unknown>]>().mockResolvedValue(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthSnapshotService,
        { provide: HealthService, useValue: mockHealthService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisPubSubService, useValue: mockRedisPubSub },
      ],
    }).compile();

    service = module.get<HealthSnapshotService>(HealthSnapshotService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('persists a health snapshot and publishes the latest snapshot', async () => {
    await service.takeSnapshot();

    expect(mockRedisPubSub.publish).toHaveBeenCalledWith('platform:health', {
      type: 'snapshot',
      status: 'healthy',
      timestamp: HEALTHY_RESULT.timestamp,
      uptime: HEALTHY_RESULT.uptime,
      checks: HEALTHY_RESULT.checks,
    });
    expect(mockPrisma.platformHealthSnapshot.create).toHaveBeenCalledWith({
      data: {
        status: 'healthy',
        checks: HEALTHY_RESULT.checks,
        uptime: HEALTHY_RESULT.uptime,
      },
    });
  });

  it('publishes a state change when status transitions', async () => {
    mockHealthService.check
      .mockResolvedValueOnce(HEALTHY_RESULT)
      .mockResolvedValueOnce(DEGRADED_RESULT);

    await service.takeSnapshot();
    await service.takeSnapshot();

    expect(mockRedisPubSub.publish).toHaveBeenCalledWith('platform:health', {
      type: 'state_change',
      previous_status: 'healthy',
      current_status: 'degraded',
      timestamp: DEGRADED_RESULT.timestamp,
      checks: DEGRADED_RESULT.checks,
    });
  });

  it('cleans up snapshots older than seven days', async () => {
    mockPrisma.platformHealthSnapshot.deleteMany.mockResolvedValueOnce({ count: 2 });

    await expect(service.cleanupOldSnapshots()).resolves.toBe(2);

    expect(mockPrisma.platformHealthSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { created_at: { lt: new Date('2026-05-08T10:00:00.000Z') } },
    });
  });

  it('does not throw when a snapshot check fails', async () => {
    mockHealthService.check.mockRejectedValueOnce(new Error('health check failed'));

    await expect(service.takeSnapshot()).resolves.toBeUndefined();
    expect(mockPrisma.platformHealthSnapshot.create).not.toHaveBeenCalled();
  });

  it('still persists a snapshot when pub/sub publish fails', async () => {
    mockRedisPubSub.publish.mockRejectedValueOnce(new Error('redis down'));

    await expect(service.takeSnapshot()).resolves.toBeUndefined();

    expect(mockPrisma.platformHealthSnapshot.create).toHaveBeenCalledWith({
      data: {
        status: 'healthy',
        checks: HEALTHY_RESULT.checks,
        uptime: HEALTHY_RESULT.uptime,
      },
    });
  });

  it('returns history inside the requested window', async () => {
    const snapshot = {
      id: 'snapshot-1',
      status: 'healthy',
      checks: HEALTHY_RESULT.checks,
      uptime: 120,
      created_at: new Date('2026-05-15T09:59:00.000Z'),
    };
    mockPrisma.platformHealthSnapshot.findMany.mockResolvedValueOnce([snapshot]);
    mockPrisma.platformHealthSnapshot.count.mockResolvedValueOnce(1);

    await expect(service.getHistory(24)).resolves.toEqual({
      data: [snapshot],
      meta: { total: 1 },
    });

    expect(mockPrisma.platformHealthSnapshot.findMany).toHaveBeenCalledWith({
      where: { created_at: { gte: new Date('2026-05-14T10:00:00.000Z') } },
      orderBy: { created_at: 'desc' },
      take: 1440,
    });
  });
});
