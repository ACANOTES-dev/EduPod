import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PLATFORM_QUEUE_NAMES } from '@school/shared';

import { QueueManagementService } from './queue-management.service';

interface MockJob {
  attemptsMade: number;
  data: unknown;
  failedReason?: string;
  finishedOn?: number;
  getState: jest.Mock<Promise<string>, []>;
  id?: string;
  name: string;
  opts: { attempts?: number };
  processedOn?: number;
  progress: unknown;
  remove: jest.Mock<Promise<void>, []>;
  retry: jest.Mock<Promise<void>, [string?]>;
  returnvalue: unknown;
  stacktrace?: string[];
  timestamp: number;
}

interface MockQueue {
  clean: jest.Mock<Promise<string[]>, [number, number, string]>;
  close: jest.Mock<Promise<void>, []>;
  getJob: jest.Mock<Promise<MockJob | null>, [string]>;
  getJobCounts: jest.Mock<Promise<Record<string, number>>, string[]>;
  getJobLogs: jest.Mock<
    Promise<{ logs: string[]; count: number }>,
    [string, number, number, boolean]
  >;
  getJobs: jest.Mock<Promise<MockJob[]>, [string[], number, number, boolean]>;
  isPaused: jest.Mock<Promise<boolean>, []>;
  pause: jest.Mock<Promise<void>, []>;
  resume: jest.Mock<Promise<void>, []>;
}

const mockQueues = new Map<string, MockQueue>();

function mockBuildJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    attemptsMade: 2,
    data: { tenant_id: 'tenant-1' },
    failedReason: 'boom',
    finishedOn: 300,
    getState: jest.fn().mockResolvedValue('failed'),
    id: 'job-1',
    name: 'notifications:send',
    opts: { attempts: 3 },
    processedOn: 200,
    progress: 100,
    remove: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
    returnvalue: { ok: false },
    stacktrace: ['Error: boom'],
    timestamp: 100,
    ...overrides,
  };
}

function mockBuildQueue(): MockQueue {
  return {
    clean: jest.fn().mockResolvedValue(['job-1']),
    close: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(null),
    getJobCounts: jest.fn().mockResolvedValue({
      active: 2,
      completed: 3,
      delayed: 4,
      failed: 5,
      paused: 0,
      waiting: 1,
    }),
    getJobLogs: jest.fn().mockResolvedValue({ logs: ['attempt 1 failed'], count: 1 }),
    getJobs: jest.fn().mockResolvedValue([]),
    isPaused: jest.fn().mockResolvedValue(false),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
  };
}

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => {
    const queue = mockBuildQueue();
    mockQueues.set(name, queue);
    return queue;
  }),
}));

describe('QueueManagementService', () => {
  let service: QueueManagementService;

  beforeEach(async () => {
    mockQueues.clear();
    const module = await Test.createTestingModule({
      providers: [
        QueueManagementService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('redis://localhost:6379/0') },
        },
      ],
    }).compile();

    service = module.get(QueueManagementService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  it('returns all platform queues with counts', async () => {
    const result = await service.listQueues();

    expect(result).toHaveLength(PLATFORM_QUEUE_NAMES.length);
    expect(result[0]).toEqual(
      expect.objectContaining({
        counts: { active: 2, completed: 3, delayed: 4, failed: 5, paused: 0, waiting: 1 },
        is_paused: false,
      }),
    );
  });

  it('handles queue introspection errors gracefully', async () => {
    const notifications = mockQueues.get('notifications');
    notifications?.getJobCounts.mockRejectedValueOnce(new Error('redis down'));

    const result = await service.listQueues();
    const notificationsSummary = result.find((queue) => queue.name === 'notifications');

    expect(notificationsSummary?.counts.failed).toBe(0);
  });

  it('lists jobs with pagination and status filters', async () => {
    const job = mockBuildJob({ timestamp: 200 });
    const queue = mockQueues.get('notifications');
    queue?.getJobs.mockResolvedValueOnce([job]);

    const result = await service.listJobs('notifications', {
      order: 'desc',
      page: 2,
      pageSize: 10,
      sort: undefined,
      status: 'failed',
    });

    expect(queue?.getJobs).toHaveBeenCalledWith(['failed'], 10, 19, false);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        attempts_made: 2,
        attempts_total: 3,
        failed_reason: 'boom',
        id: 'job-1',
        status: 'failed',
      }),
    );
    expect(result.meta.total).toBe(15);
  });

  it('throws NotFoundException for unknown queues', async () => {
    await expect(
      service.listJobs('not-real', { order: 'desc', page: 1, pageSize: 20, sort: undefined }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns full job detail with logs and stacktrace', async () => {
    const job = mockBuildJob();
    const queue = mockQueues.get('notifications');
    queue?.getJob.mockResolvedValueOnce(job);

    const result = await service.getJobDetail('notifications', 'job-1');

    expect(result.stacktrace).toEqual(['Error: boom']);
    expect(result.logs).toEqual(['attempt 1 failed']);
    expect(result.return_value).toEqual({ ok: false });
  });

  it('retries a failed job', async () => {
    const job = mockBuildJob();
    const queue = mockQueues.get('notifications');
    queue?.getJob.mockResolvedValueOnce(job);

    await expect(service.retryJob('notifications', 'job-1')).resolves.toEqual({ retried: true });

    expect(job.retry).toHaveBeenCalledWith('failed');
  });

  it('rejects retry for non-failed jobs', async () => {
    const job = mockBuildJob({ getState: jest.fn().mockResolvedValue('completed') });
    const queue = mockQueues.get('notifications');
    queue?.getJob.mockResolvedValueOnce(job);

    await expect(service.retryJob('notifications', 'job-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('pauses and resumes queues', async () => {
    const queue = mockQueues.get('notifications');

    await service.pauseQueue('notifications');
    await service.resumeQueue('notifications');

    expect(queue?.pause).toHaveBeenCalledTimes(1);
    expect(queue?.resume).toHaveBeenCalledTimes(1);
  });

  it('cleans completed jobs with the requested grace period', async () => {
    const queue = mockQueues.get('notifications');

    const result = await service.cleanQueue('notifications', {
      grace_ms: 500,
      limit: 50,
      status: 'completed',
    });

    expect(result).toEqual({ cleaned: 1, job_ids: ['job-1'] });
    expect(queue?.clean).toHaveBeenCalledWith(500, 50, 'completed');
  });
});
