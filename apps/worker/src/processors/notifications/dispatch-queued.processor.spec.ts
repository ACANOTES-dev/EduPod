import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { DISPATCH_NOTIFICATIONS_JOB } from '../communications/dispatch-notifications.processor';

import { DISPATCH_QUEUED_JOB, DispatchQueuedProcessor } from './dispatch-queued.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';

function buildJob(name: string): Job {
  return {
    data: {},
    name,
  } as Job;
}

function buildMockPrisma() {
  return {
    $transaction: jest.fn(
      async (
        callback: (tx: {
          $executeRaw: jest.Mock;
          notification: { updateMany: jest.Mock };
        }) => Promise<void>,
      ) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          notification: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        }),
    ),
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

async function setup() {
  const prisma = buildMockPrisma();
  const notificationsQueue = {
    add: jest.fn().mockResolvedValue({ id: 'queued-job-id' }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DispatchQueuedProcessor,
      { provide: 'PRISMA_CLIENT', useValue: prisma },
      {
        provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS),
        useValue: notificationsQueue,
      },
    ],
  }).compile();

  return {
    module,
    notificationsQueue,
    prisma,
    processor: module.get(DispatchQueuedProcessor),
  };
}

describe('DispatchQueuedProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const { module, notificationsQueue, prisma, processor } = await setup();

    await processor.process(buildJob('notifications:other-job'));

    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    expect(notificationsQueue.add).not.toHaveBeenCalled();
    await module.close();
  });

  it('should skip when no queued notifications are ready for dispatch', async () => {
    const { module, notificationsQueue, prisma, processor } = await setup();

    await processor.process(buildJob(DISPATCH_QUEUED_JOB));

    expect(prisma.notification.findMany).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notificationsQueue.add).not.toHaveBeenCalled();
    await module.close();
  });

  it('should group queued notifications by tenant, set tenant context, and enqueue tenant-specific dispatch batches', async () => {
    const { module, notificationsQueue, prisma, processor } = await setup();
    prisma.notification.findMany.mockResolvedValue([
      { id: 'notif-a-1', tenant_id: TENANT_A_ID },
      { id: 'notif-a-2', tenant_id: TENANT_A_ID },
      { id: 'notif-b-1', tenant_id: TENANT_B_ID },
    ]);

    await processor.process(buildJob(DISPATCH_QUEUED_JOB));

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(notificationsQueue.add).toHaveBeenNthCalledWith(
      1,
      DISPATCH_NOTIFICATIONS_JOB,
      { notification_ids: ['notif-a-1', 'notif-a-2'], tenant_id: TENANT_A_ID },
      { attempts: 3, backoff: { delay: 5000, type: 'exponential' } },
    );
    expect(notificationsQueue.add).toHaveBeenNthCalledWith(
      2,
      DISPATCH_NOTIFICATIONS_JOB,
      { notification_ids: ['notif-b-1'], tenant_id: TENANT_B_ID },
      { attempts: 3, backoff: { delay: 5000, type: 'exponential' } },
    );

    const transactionCallbacks = prisma.$transaction.mock.calls.map(
      (call) =>
        call[0] as (tx: {
          $executeRaw: jest.Mock;
          notification: { updateMany: jest.Mock };
        }) => Promise<void>,
    );
    const tenantATx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      notification: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const tenantBTx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      notification: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    await transactionCallbacks[0]?.(tenantATx);
    await transactionCallbacks[1]?.(tenantBTx);

    expect(tenantATx.notification.updateMany).toHaveBeenCalledWith({
      data: { next_retry_at: null },
      where: {
        id: { in: ['notif-a-1', 'notif-a-2'] },
        status: 'queued',
        tenant_id: TENANT_A_ID,
      },
    });
    expect(tenantBTx.notification.updateMany).toHaveBeenCalledWith({
      data: { next_retry_at: null },
      where: {
        id: { in: ['notif-b-1'] },
        status: 'queued',
        tenant_id: TENANT_B_ID,
      },
    });

    await module.close();
  });
});
