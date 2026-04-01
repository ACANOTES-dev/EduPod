import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { HOMEWORK_DIGEST_JOB } from '../homework/digest-homework.processor';

import {
  BEHAVIOUR_CRON_DISPATCH_DAILY_JOB,
  BehaviourCronDispatchProcessor,
} from './cron-dispatch.processor';
import { BEHAVIOUR_DETECT_PATTERNS_JOB } from './detect-patterns.processor';
import { BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB } from './digest-notifications.processor';

const FIRST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SECOND_TENANT_ID = '22222222-2222-2222-2222-222222222222';

function buildJob(name: string): Job {
  return {
    data: {},
    name,
  } as Job;
}

function buildMockPrisma() {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([
        { id: FIRST_TENANT_ID, timezone: 'UTC' },
        { id: SECOND_TENANT_ID, timezone: 'UTC' },
      ]),
    },
    tenantModule: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({ id: 'homework-enabled' })
        .mockResolvedValueOnce(null),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          behaviour: {
            parent_notification_digest_time: '05:00',
          },
        },
      }),
    },
  } as unknown as PrismaClient;
}

function buildQueueMock() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'queued-job-id' }),
  };
}

describe('BehaviourCronDispatchProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T05:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const behaviourQueue = buildQueueMock();
    const homeworkQueue = buildQueueMock();
    const notificationsQueue = buildQueueMock();
    const processor = new BehaviourCronDispatchProcessor(
      buildMockPrisma(),
      behaviourQueue as never,
      homeworkQueue as never,
      notificationsQueue as never,
    );

    await processor.process(buildJob('behaviour:other-job'));

    expect(behaviourQueue.add).not.toHaveBeenCalled();
    expect(homeworkQueue.add).not.toHaveBeenCalled();
    expect(notificationsQueue.add).not.toHaveBeenCalled();
  });

  it('should enqueue tenant-scoped daily jobs without leaking tenant identifiers across iterations', async () => {
    const behaviourQueue = buildQueueMock();
    const homeworkQueue = buildQueueMock();
    const notificationsQueue = buildQueueMock();
    const processor = new BehaviourCronDispatchProcessor(
      buildMockPrisma(),
      behaviourQueue as never,
      homeworkQueue as never,
      notificationsQueue as never,
    );

    await processor.process(buildJob(BEHAVIOUR_CRON_DISPATCH_DAILY_JOB));

    expect(behaviourQueue.add).toHaveBeenCalledWith(
      BEHAVIOUR_DETECT_PATTERNS_JOB,
      { tenant_id: FIRST_TENANT_ID },
      { jobId: `daily:${BEHAVIOUR_DETECT_PATTERNS_JOB}:${FIRST_TENANT_ID}` },
    );
    expect(behaviourQueue.add).toHaveBeenCalledWith(
      BEHAVIOUR_DETECT_PATTERNS_JOB,
      { tenant_id: SECOND_TENANT_ID },
      { jobId: `daily:${BEHAVIOUR_DETECT_PATTERNS_JOB}:${SECOND_TENANT_ID}` },
    );
    expect(notificationsQueue.add).toHaveBeenCalledWith(
      BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB,
      { tenant_id: FIRST_TENANT_ID },
      { jobId: `daily:${BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB}:${FIRST_TENANT_ID}` },
    );
    expect(notificationsQueue.add).toHaveBeenCalledWith(
      BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB,
      { tenant_id: SECOND_TENANT_ID },
      { jobId: `daily:${BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB}:${SECOND_TENANT_ID}` },
    );
    expect(homeworkQueue.add).toHaveBeenCalledTimes(1);
    expect(homeworkQueue.add).toHaveBeenCalledWith(
      HOMEWORK_DIGEST_JOB,
      { tenant_id: FIRST_TENANT_ID },
      { jobId: `daily:${HOMEWORK_DIGEST_JOB}:${FIRST_TENANT_ID}` },
    );
  });
});
