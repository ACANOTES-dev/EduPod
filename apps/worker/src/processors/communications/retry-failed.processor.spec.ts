import { Job, Queue } from 'bullmq';

import { DISPATCH_NOTIFICATIONS_JOB } from './dispatch-notifications.processor';
import {
  RETRY_FAILED_NOTIFICATIONS_JOB,
  RetryFailedNotificationsProcessor,
} from './retry-failed.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    notification: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function buildJob(name: string = RETRY_FAILED_NOTIFICATIONS_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('RetryFailedNotificationsProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new RetryFailedNotificationsProcessor(
      mockPrisma as never,
      { add: jest.fn() } as unknown as Queue,
    );

    await processor.process(buildJob('communications:other-job'));

    expect(mockPrisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('should skip when no notifications are eligible for retry', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const mockQueue = { add: jest.fn() };
    const processor = new RetryFailedNotificationsProcessor(
      mockPrisma as never,
      mockQueue as never,
    );

    await processor.process(buildJob());

    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reset eligible notifications by tenant and re-enqueue dispatch jobs in batches', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const notificationIds = Array.from({ length: 52 }, (_, index) => `notif-a-${index + 1}`);
    mockPrisma.notification.findMany.mockResolvedValue([
      ...notificationIds.map((id) => ({
        id,
        tenant_id: TENANT_A_ID,
        attempt_count: 1,
        max_attempts: 3,
      })),
      {
        id: 'notif-b-1',
        tenant_id: TENANT_B_ID,
        attempt_count: 2,
        max_attempts: 3,
      },
      {
        id: 'notif-skipped',
        tenant_id: TENANT_B_ID,
        attempt_count: 3,
        max_attempts: 3,
      },
    ]);
    const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const processor = new RetryFailedNotificationsProcessor(
      mockPrisma as never,
      mockQueue as never,
    );

    await processor.process(buildJob());

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mockTx.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: notificationIds }, tenant_id: TENANT_A_ID },
      data: { status: 'queued', next_retry_at: null },
    });
    expect(mockTx.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['notif-b-1'] }, tenant_id: TENANT_B_ID },
      data: { status: 'queued', next_retry_at: null },
    });
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      1,
      DISPATCH_NOTIFICATIONS_JOB,
      { tenant_id: TENANT_A_ID, notification_ids: notificationIds.slice(0, 50) },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      2,
      DISPATCH_NOTIFICATIONS_JOB,
      { tenant_id: TENANT_A_ID, notification_ids: notificationIds.slice(50) },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      3,
      DISPATCH_NOTIFICATIONS_JOB,
      { tenant_id: TENANT_B_ID, notification_ids: ['notif-b-1'] },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  });
});
