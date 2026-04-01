import { type PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import {
  BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB,
  NotificationReconciliationProcessor,
} from './notification-reconciliation.processor';
import { BEHAVIOUR_PARENT_NOTIFICATION_JOB } from './parent-notification.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INCIDENT_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';

function buildJob(name: string): Job {
  return { data: {}, name } as Job;
}

function buildMockPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ id: TENANT_ID }]),
    },
    behaviourIncident: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: INCIDENT_ID,
          participants: [{ student_id: STUDENT_ID }],
        },
      ]),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function buildMockQueue(): Queue {
  return { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;
}

describe('NotificationReconciliationProcessor', () => {
  let processor: NotificationReconciliationProcessor;
  let prisma: PrismaClient;
  let queue: Queue;

  beforeEach(() => {
    prisma = buildMockPrisma();
    queue = buildMockQueue();
    processor = new NotificationReconciliationProcessor(prisma, queue);
  });

  afterEach(() => jest.clearAllMocks());

  it('should skip unrelated jobs', async () => {
    await processor.process(buildJob('unrelated:job'));
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('should reconcile stale notifications and re-enqueue', async () => {
    await processor.process(buildJob(BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB));

    expect(prisma.tenant.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.behaviourIncident.findMany).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      BEHAVIOUR_PARENT_NOTIFICATION_JOB,
      expect.objectContaining({
        tenant_id: TENANT_ID,
        incident_id: INCIDENT_ID,
        student_ids: [STUDENT_ID],
      }),
    );
  });

  it('should handle no active tenants gracefully', async () => {
    prisma = buildMockPrisma({
      tenant: { findMany: jest.fn().mockResolvedValue([]) },
    });
    processor = new NotificationReconciliationProcessor(prisma, queue);

    await processor.process(buildJob(BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB));

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('should handle no stale incidents gracefully', async () => {
    prisma = buildMockPrisma({
      behaviourIncident: { findMany: jest.fn().mockResolvedValue([]) },
    });
    processor = new NotificationReconciliationProcessor(prisma, queue);

    await processor.process(buildJob(BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB));

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('should continue processing other tenants if one fails', async () => {
    const TENANT_B = '99999999-9999-9999-9999-999999999999';
    prisma = buildMockPrisma({
      tenant: {
        findMany: jest.fn().mockResolvedValue([{ id: TENANT_ID }, { id: TENANT_B }]),
      },
      behaviourIncident: {
        findMany: jest
          .fn()
          .mockRejectedValueOnce(new Error('DB error'))
          .mockResolvedValueOnce([{ id: INCIDENT_ID, participants: [{ student_id: STUDENT_ID }] }]),
      },
    });
    processor = new NotificationReconciliationProcessor(prisma, queue);

    await processor.process(buildJob(BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB));

    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
