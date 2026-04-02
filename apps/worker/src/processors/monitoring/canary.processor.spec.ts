import * as Sentry from '@sentry/nestjs';
import { Job, Queue } from 'bullmq';

import {
  CANARY_CHECK_JOB,
  CANARY_ECHO_JOB,
  CANARY_PING_JOB,
  CANARY_CRITICAL_QUEUES,
} from '../../base/queue.constants';

import { CanaryProcessor } from './canary.processor';

jest.mock('@sentry/nestjs', () => ({
  captureMessage: jest.fn(),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-canary-id'),
}));

// ─── Mock Redis client ──────────────────────────────────────────────────────

const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
};

// ─── Mock Queue ─────────────────────────────────────────────────────────────

const mockDynamicQueueAdd = jest.fn().mockResolvedValue({});
const mockDynamicQueueClose = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => {
  const actual = jest.requireActual('bullmq');
  return {
    ...actual,
    Queue: jest.fn().mockImplementation(() => ({
      add: mockDynamicQueueAdd,
      close: mockDynamicQueueClose,
    })),
  };
});

function buildMockNotificationsQueue(): Queue {
  return {
    client: Promise.resolve(mockRedis),
    add: jest.fn().mockResolvedValue({}),
  } as unknown as Queue;
}

function buildJob<T = Record<string, unknown>>(name: string, data: T = {} as T): Job<T> {
  return { name, data } as Job<T>;
}

describe('CanaryProcessor', () => {
  let processor: CanaryProcessor;
  let notificationsQueue: Queue;

  beforeEach(() => {
    notificationsQueue = buildMockNotificationsQueue();
    processor = new CanaryProcessor(notificationsQueue);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Routing ────────────────────────────────────────────────────────────────

  describe('process — routing', () => {
    it('should ignore jobs with unknown names', async () => {
      await processor.process(buildJob('some:other-job'));

      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  // ─── Echo ───────────────────────────────────────────────────────────────────

  describe('process — canary echo', () => {
    it('should write ACK to Redis on echo', async () => {
      const job = buildJob(CANARY_ECHO_JOB, {
        canary_id: 'test-id',
        source_queue: 'notifications',
      });

      await processor.process(job);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'canary:ack:test-id:notifications',
        expect.any(String),
        'EX',
        600,
      );
    });

    it('should use the source_queue in the Redis key', async () => {
      const job = buildJob(CANARY_ECHO_JOB, {
        canary_id: 'abc-123',
        source_queue: 'payroll',
      });

      await processor.process(job);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'canary:ack:abc-123:payroll',
        expect.any(String),
        'EX',
        600,
      );
    });
  });

  // ─── Check ──────────────────────────────────────────────────────────────────

  describe('process — canary check', () => {
    it('should pass when all queues ACK', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('canary:ack:')) return Promise.resolve(Date.now().toString());
        if (key.startsWith('canary:pending:')) return Promise.resolve(Date.now().toString());
        return Promise.resolve(null);
      });

      const job = buildJob(CANARY_CHECK_JOB, {
        canary_id: 'test-id',
        queues: ['notifications', 'payroll'],
      });

      await processor.process(job);

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('should alert via Sentry when a queue misses its SLA', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'canary:ack:test-id:notifications')
          return Promise.resolve(Date.now().toString());
        if (key === 'canary:ack:test-id:payroll') return Promise.resolve(null); // missed
        if (key.startsWith('canary:pending:')) return Promise.resolve(Date.now().toString());
        return Promise.resolve(null);
      });

      const job = buildJob(CANARY_CHECK_JOB, {
        canary_id: 'test-id',
        queues: ['notifications', 'payroll'],
      });

      await processor.process(job);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('payroll'),
        'error',
      );
    });

    it('should not alert when pending key is also missing (expired canary)', async () => {
      // Both ack and pending are null — the canary expired, not a failure
      mockRedis.get.mockResolvedValue(null);

      const job = buildJob(CANARY_CHECK_JOB, {
        canary_id: 'test-id',
        queues: ['notifications'],
      });

      await processor.process(job);

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('should clean up Redis keys after check', async () => {
      mockRedis.get.mockResolvedValue(null);

      const queues = ['notifications', 'payroll'];
      const job = buildJob(CANARY_CHECK_JOB, {
        canary_id: 'test-id',
        queues,
      });

      await processor.process(job);

      for (const q of queues) {
        expect(mockRedis.del).toHaveBeenCalledWith(`canary:pending:test-id:${q}`);
        expect(mockRedis.del).toHaveBeenCalledWith(`canary:ack:test-id:${q}`);
      }
    });

    it('should report multiple missed queues in a single Sentry message', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        // All ACKs missing, all pending present
        if (key.startsWith('canary:ack:')) return Promise.resolve(null);
        if (key.startsWith('canary:pending:')) return Promise.resolve(Date.now().toString());
        return Promise.resolve(null);
      });

      const job = buildJob(CANARY_CHECK_JOB, {
        canary_id: 'test-id',
        queues: ['notifications', 'payroll', 'behaviour'],
      });

      await processor.process(job);

      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const message = (Sentry.captureMessage as jest.Mock).mock.calls[0][0] as string;
      expect(message).toContain('notifications');
      expect(message).toContain('payroll');
      expect(message).toContain('behaviour');
    });
  });

  // ─── Ping ───────────────────────────────────────────────────────────────────

  describe('process — canary ping', () => {
    it('should enqueue echo jobs to all critical queues', async () => {
      const job = buildJob(CANARY_PING_JOB);

      await processor.process(job);

      const criticalQueues = Object.keys(CANARY_CRITICAL_QUEUES);

      // One echo per critical queue
      expect(mockDynamicQueueAdd).toHaveBeenCalledTimes(criticalQueues.length);

      // Each dynamically created queue should be closed
      expect(mockDynamicQueueClose).toHaveBeenCalledTimes(criticalQueues.length);
    });

    it('should set pending keys in Redis for each critical queue', async () => {
      const job = buildJob(CANARY_PING_JOB);

      await processor.process(job);

      const criticalQueues = Object.keys(CANARY_CRITICAL_QUEUES);

      for (const queueName of criticalQueues) {
        expect(mockRedis.set).toHaveBeenCalledWith(
          `canary:pending:test-canary-id:${queueName}`,
          expect.any(String),
          'EX',
          expect.any(Number),
        );
      }
    });

    it('should schedule a check job with delay on the notifications queue', async () => {
      const job = buildJob(CANARY_PING_JOB);

      await processor.process(job);

      expect(notificationsQueue.add).toHaveBeenCalledWith(
        CANARY_CHECK_JOB,
        expect.objectContaining({
          canary_id: 'test-canary-id',
          queues: expect.any(Array),
        }),
        expect.objectContaining({
          delay: expect.any(Number),
          removeOnComplete: 5,
          removeOnFail: 10,
        }),
      );
    });
  });
});
