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
  duplicate: jest.fn().mockReturnThis(),
};

// ─── Mock echo job returned by Queue.getJob ─────────────────────────────────

const mockEchoJobCompleted = {
  getState: jest.fn().mockResolvedValue('completed'),
  remove: jest.fn().mockResolvedValue(undefined),
};

const mockEchoJobWaiting = {
  getState: jest.fn().mockResolvedValue('waiting'),
  remove: jest.fn().mockResolvedValue(undefined),
};

// ─── Mock dynamic Queue ─────────────────────────────────────────────────────

const mockDynamicQueueAdd = jest.fn().mockResolvedValue({});
const mockDynamicQueueClose = jest.fn().mockResolvedValue(undefined);
const mockDynamicQueueGetJob = jest.fn().mockResolvedValue(null);

jest.mock('bullmq', () => {
  const actual = jest.requireActual('bullmq');
  return {
    ...actual,
    Queue: jest.fn().mockImplementation(() => ({
      add: mockDynamicQueueAdd,
      close: mockDynamicQueueClose,
      getJob: mockDynamicQueueGetJob,
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

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('should handle echo jobs as no-op (job completion is sufficient)', async () => {
      const job = buildJob(CANARY_ECHO_JOB, {
        canary_id: 'test-id',
        source_queue: 'notifications',
      });

      // Should not throw
      await processor.process(job);
    });
  });

  // ─── Check ──────────────────────────────────────────────────────────────────

  describe('process — canary check', () => {
    it('should pass when all echo jobs are completed', async () => {
      mockDynamicQueueGetJob.mockResolvedValue(mockEchoJobCompleted);

      const job = buildJob(CANARY_CHECK_JOB, {
        canary_id: 'test-id',
        queues: ['notifications', 'payroll'],
      });

      await processor.process(job);

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      // Should clean up completed echo jobs
      expect(mockEchoJobCompleted.remove).toHaveBeenCalled();
    });

    it('should alert via Sentry when an echo job is still waiting', async () => {
      mockDynamicQueueGetJob.mockImplementation(async (jobId: string) => {
        if (jobId.includes('payroll')) return mockEchoJobWaiting;
        return mockEchoJobCompleted;
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

    it('should alert when echo job is not found (missing)', async () => {
      mockDynamicQueueGetJob.mockResolvedValue(null);

      const job = buildJob(CANARY_CHECK_JOB, {
        canary_id: 'test-id',
        queues: ['notifications'],
      });

      await processor.process(job);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('notifications'),
        'error',
      );
    });

    it('should report multiple missed queues in a single Sentry message', async () => {
      mockDynamicQueueGetJob.mockResolvedValue(mockEchoJobWaiting);

      const job = buildJob(CANARY_CHECK_JOB, {
        canary_id: 'test-id',
        queues: ['notifications', 'payroll', 'behaviour'],
      });

      await processor.process(job);

      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const message = (Sentry.captureMessage as jest.Mock).mock.calls[0]![0] as string;
      expect(message).toContain('notifications');
      expect(message).toContain('payroll');
      expect(message).toContain('behaviour');
    });

    it('should attempt cleanup of stale echo jobs', async () => {
      mockDynamicQueueGetJob.mockResolvedValue(mockEchoJobWaiting);

      const job = buildJob(CANARY_CHECK_JOB, {
        canary_id: 'test-id',
        queues: ['payroll'],
      });

      await processor.process(job);

      expect(mockEchoJobWaiting.remove).toHaveBeenCalled();
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

    it('should use deterministic jobIds for echo jobs', async () => {
      const job = buildJob(CANARY_PING_JOB);

      await processor.process(job);

      expect(mockDynamicQueueAdd).toHaveBeenCalledWith(
        CANARY_ECHO_JOB,
        expect.objectContaining({ canary_id: 'test-canary-id' }),
        expect.objectContaining({
          jobId: expect.stringContaining('canary-echo:test-canary-id:'),
          removeOnComplete: false,
        }),
      );
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
