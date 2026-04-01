import * as Sentry from '@sentry/nestjs';
import { Job, Queue } from 'bullmq';

import { DLQ_MONITOR_JOB, DlqMonitorProcessor } from './dlq-monitor.processor';

jest.mock('@sentry/nestjs', () => ({
  captureMessage: jest.fn(),
}));

function buildJob(name: string): Job {
  return { data: {}, name } as Job;
}

function buildMockQueue(failedCounts: Record<string, number> = {}): Queue {
  const mockRedisClient = {};
  const mockQueueClose = jest.fn().mockResolvedValue(undefined);

  // Mock the Queue constructor to return predictable failed counts
  jest.spyOn(Queue.prototype, 'getFailedCount').mockImplementation(function (this: Queue) {
    const name = (this as unknown as { name: string }).name;
    return Promise.resolve(failedCounts[name] ?? 0);
  });
  jest.spyOn(Queue.prototype, 'close').mockImplementation(mockQueueClose);

  return {
    client: Promise.resolve(mockRedisClient),
  } as unknown as Queue;
}

describe('DlqMonitorProcessor', () => {
  let processor: DlqMonitorProcessor;
  let queue: Queue;

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should skip unrelated jobs', async () => {
    queue = buildMockQueue();
    processor = new DlqMonitorProcessor(queue);

    await processor.process(buildJob('unrelated:job'));

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('should scan all queues and report clean when no failures', async () => {
    queue = buildMockQueue();
    processor = new DlqMonitorProcessor(queue);

    await processor.process(buildJob(DLQ_MONITOR_JOB));

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('should alert via Sentry when failed jobs are found', async () => {
    queue = buildMockQueue({ behaviour: 3, notifications: 1 });
    processor = new DlqMonitorProcessor(queue);

    await processor.process(buildJob(DLQ_MONITOR_JOB));

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('DLQ alert'),
      'warning',
    );
  });
});
