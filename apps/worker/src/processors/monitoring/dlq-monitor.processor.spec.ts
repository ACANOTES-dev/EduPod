import * as Sentry from '@sentry/nestjs';
import { Job, Queue } from 'bullmq';

import { DLQ_MONITOR_JOB, DlqMonitorProcessor } from './dlq-monitor.processor';

jest.mock('@sentry/nestjs', () => ({
  captureMessage: jest.fn(),
}));

const mockFailedCounts: Record<string, number> = {};
const mockQueueClose = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => {
  const actual = jest.requireActual('bullmq');
  return {
    ...actual,
    Queue: jest.fn().mockImplementation((name: string) => ({
      close: mockQueueClose,
      getFailedCount: jest.fn().mockResolvedValue(mockFailedCounts[name] ?? 0),
      name,
    })),
  };
});

function buildJob(name: string): Job {
  return { data: {}, name } as Job;
}

function buildMockQueue(failedCounts: Record<string, number> = {}): Queue {
  for (const key of Object.keys(mockFailedCounts)) {
    delete mockFailedCounts[key];
  }
  Object.assign(mockFailedCounts, failedCounts);

  return {
    client: Promise.resolve({}),
  } as unknown as Queue;
}

describe('DlqMonitorProcessor', () => {
  let processor: DlqMonitorProcessor;
  let queue: Queue;

  afterEach(() => {
    jest.clearAllMocks();
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
