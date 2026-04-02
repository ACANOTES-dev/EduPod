import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';

import {
  BullMQCheck,
  HEALTH_CRITICAL_QUEUES,
  WorkerHealthResult,
  WorkerHealthService,
} from './worker-health.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function buildMockQueue(name: string): {
  queue: Record<string, unknown>;
  setActive: (jobs: Partial<Job>[]) => void;
  setClientError: (err: Error) => void;
  setActiveError: (err: Error) => void;
} {
  let activeJobs: Partial<Job>[] = [];
  let clientError: Error | null = null;
  let activeError: Error | null = null;

  const queue = {
    name,
    client: Promise.resolve({
      ping: jest.fn().mockResolvedValue('PONG'),
    }),
    getActive: jest.fn().mockImplementation(() => {
      if (activeError) return Promise.reject(activeError);
      return Promise.resolve(activeJobs);
    }),
  };

  return {
    queue,
    setActive: (jobs: Partial<Job>[]) => {
      activeJobs = jobs;
    },
    setClientError: (err: Error) => {
      clientError = err;
      const rejected = Promise.reject(clientError);
      rejected.catch(() => {}); // Prevent unhandled rejection in test
      queue.client = rejected;
    },
    setActiveError: (err: Error) => {
      activeError = err;
    },
  };
}

function buildMockPrisma(): Record<string, unknown> {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkerHealthService', () => {
  let service: WorkerHealthService;
  let mockPrisma: Record<string, unknown>;
  const queueMocks = new Map<
    string,
    ReturnType<typeof buildMockQueue>
  >();

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    queueMocks.clear();

    // Build a mock for each critical queue
    for (const name of HEALTH_CRITICAL_QUEUES) {
      queueMocks.set(name, buildMockQueue(name));
    }

    const providers = [
      WorkerHealthService,
      { provide: 'PRISMA_CLIENT', useValue: mockPrisma },
      ...HEALTH_CRITICAL_QUEUES.map((name) => ({
        provide: getQueueToken(name),
        useValue: queueMocks.get(name)!.queue,
      })),
    ];

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    service = module.get<WorkerHealthService>(WorkerHealthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Liveness ─────────────────────────────────────────────────────────────

  describe('getLiveness', () => {
    it('should return alive status with timestamp', () => {
      const result = service.getLiveness();
      expect(result.status).toBe('alive');
      expect(result.service).toBe('worker');
      expect(result.timestamp).toBeDefined();
    });
  });

  // ─── All healthy ──────────────────────────────────────────────────────────

  describe('check — all healthy', () => {
    it('should return healthy when all dependencies are up', async () => {
      const result: WorkerHealthResult = await service.check();

      expect(result.status).toBe('healthy');
      expect(result.service).toBe('worker');
      expect(result.checks.postgresql.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.bullmq.status).toBe('up');
    });

    it('should report each critical queue individually', async () => {
      const result = await service.check();
      const bullmq: BullMQCheck = result.checks.bullmq;

      for (const name of HEALTH_CRITICAL_QUEUES) {
        expect(bullmq.queues[name]).toBeDefined();
        expect(bullmq.queues[name]!.status).toBe('up');
        expect(bullmq.queues[name]!.stuck_jobs).toBe(0);
      }
    });

    it('should include uptime in seconds', async () => {
      const result = await service.check();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Single queue down → degraded ─────────────────────────────────────────

  describe('check — one queue down', () => {
    it('should return degraded when one critical queue is unreachable', async () => {
      const payrollMock = queueMocks.get(QUEUE_NAMES.PAYROLL)!;
      payrollMock.setActiveError(new Error('Connection refused'));

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.bullmq.status).toBe('down');
      expect(result.checks.bullmq.queues[QUEUE_NAMES.PAYROLL]!.status).toBe('down');
      // Other queues remain up
      expect(result.checks.bullmq.queues[QUEUE_NAMES.NOTIFICATIONS]!.status).toBe('up');
    });

    it('should report the downed queue while others stay up', async () => {
      const financeMock = queueMocks.get(QUEUE_NAMES.FINANCE)!;
      financeMock.setActiveError(new Error('Timeout'));

      const result = await service.check();
      const bullmq = result.checks.bullmq;

      expect(bullmq.queues[QUEUE_NAMES.FINANCE]!.status).toBe('down');

      // Verify all other queues are still up
      for (const name of HEALTH_CRITICAL_QUEUES) {
        if (name !== QUEUE_NAMES.FINANCE) {
          expect(bullmq.queues[name]!.status).toBe('up');
        }
      }
    });
  });

  // ─── PostgreSQL down → unhealthy ──────────────────────────────────────────

  describe('check — postgresql down', () => {
    it('should return unhealthy when PostgreSQL is unreachable', async () => {
      (mockPrisma.$queryRaw as jest.Mock).mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.postgresql.status).toBe('down');
    });
  });

  // ─── Redis down → unhealthy ───────────────────────────────────────────────

  describe('check — redis down', () => {
    it('should return unhealthy when Redis is unreachable', async () => {
      // Make the notifications queue's client reject (checkRedis uses this queue)
      const notifMock = queueMocks.get('notifications')!;
      notifMock.setClientError(new Error('Redis connection refused'));

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.redis.status).toBe('down');
    });
  });

  // ─── Stuck jobs ───────────────────────────────────────────────────────────

  describe('check — stuck jobs detection', () => {
    it('should aggregate stuck jobs across all queues', async () => {
      const now = Date.now();
      const sixMinutesAgo = now - 6 * 60 * 1000;

      const notifMock = queueMocks.get(QUEUE_NAMES.NOTIFICATIONS)!;
      notifMock.setActive([
        { processedOn: sixMinutesAgo, timestamp: sixMinutesAgo },
      ]);

      const payrollMock = queueMocks.get(QUEUE_NAMES.PAYROLL)!;
      payrollMock.setActive([
        { processedOn: sixMinutesAgo, timestamp: sixMinutesAgo },
        { processedOn: sixMinutesAgo, timestamp: sixMinutesAgo },
      ]);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(3);
      expect(result.checks.bullmq.queues[QUEUE_NAMES.NOTIFICATIONS]!.stuck_jobs).toBe(1);
      expect(result.checks.bullmq.queues[QUEUE_NAMES.PAYROLL]!.stuck_jobs).toBe(2);
      // Overall still up since queues are reachable
      expect(result.checks.bullmq.status).toBe('up');
    });

    it('should not count recent active jobs as stuck', async () => {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;

      const notifMock = queueMocks.get(QUEUE_NAMES.NOTIFICATIONS)!;
      notifMock.setActive([
        { processedOn: oneMinuteAgo, timestamp: oneMinuteAgo },
      ]);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(0);
      expect(result.checks.bullmq.queues[QUEUE_NAMES.NOTIFICATIONS]!.stuck_jobs).toBe(0);
    });
  });

  // ─── Multiple queues down ────────────────────────────────────────────────

  describe('check — multiple queues down', () => {
    it('should report all downed queues in details', async () => {
      const approvalsMock = queueMocks.get(QUEUE_NAMES.APPROVALS)!;
      approvalsMock.setActiveError(new Error('Connection lost'));

      const securityMock = queueMocks.get(QUEUE_NAMES.SECURITY)!;
      securityMock.setActiveError(new Error('Connection lost'));

      const schedulingMock = queueMocks.get(QUEUE_NAMES.SCHEDULING)!;
      schedulingMock.setActiveError(new Error('Connection lost'));

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.bullmq.status).toBe('down');
      expect(result.checks.bullmq.queues[QUEUE_NAMES.APPROVALS]!.status).toBe('down');
      expect(result.checks.bullmq.queues[QUEUE_NAMES.SECURITY]!.status).toBe('down');
      expect(result.checks.bullmq.queues[QUEUE_NAMES.SCHEDULING]!.status).toBe('down');
      // Remaining queues still up
      expect(result.checks.bullmq.queues[QUEUE_NAMES.FINANCE]!.status).toBe('up');
      expect(result.checks.bullmq.queues[QUEUE_NAMES.NOTIFICATIONS]!.status).toBe('up');
    });
  });
});
