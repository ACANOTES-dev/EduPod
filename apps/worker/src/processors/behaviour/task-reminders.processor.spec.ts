import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  BEHAVIOUR_TASK_REMINDERS_JOB,
  BehaviourTaskRemindersProcessor,
  type BehaviourTaskRemindersPayload,
} from './task-reminders.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const DUE_TASK_ID = '33333333-3333-3333-3333-333333333333';
const OVERDUE_TASK_ID = '44444444-4444-4444-4444-444444444444';

function buildJob(
  name: string,
  data: Partial<BehaviourTaskRemindersPayload> = {},
): Job<BehaviourTaskRemindersPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<BehaviourTaskRemindersPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourTask: {
      findMany: jest.fn().mockImplementation(
        async (args: {
          where: {
            overdue_notified_at?: null;
            reminder_sent_at?: null;
          };
        }) => {
          if (args.where.reminder_sent_at === null) {
            return [
              {
                assigned_to_id: USER_ID,
                id: DUE_TASK_ID,
                title: 'Follow up with student',
              },
            ];
          }

          return [
            {
              assigned_to_id: USER_ID,
              id: OVERDUE_TASK_ID,
              priority: 'medium',
              task_type: 'intervention_review',
              title: 'Review intervention',
            },
          ];
        },
      ),
      update: jest.fn().mockResolvedValue({ id: 'updated-task-id' }),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
    },
  };
}

function buildMockPrisma(tx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (callback: (transactionClient: typeof tx) => Promise<void>) =>
      callback(tx),
    ),
  } as unknown as PrismaClient;
}

describe('BehaviourTaskRemindersProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new BehaviourTaskRemindersProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.behaviourTask.findMany).not.toHaveBeenCalled();
  });

  it('should send reminders, mark overdue tasks, and escalate intervention review priority', async () => {
    const tx = buildMockTx();
    const processor = new BehaviourTaskRemindersProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_TASK_REMINDERS_JOB));

    expect(tx.behaviourTask.update).toHaveBeenNthCalledWith(1, {
      data: { reminder_sent_at: new Date('2026-04-01T12:00:00.000Z') },
      where: { id: DUE_TASK_ID },
    });
    expect(tx.behaviourTask.update).toHaveBeenNthCalledWith(2, {
      data: {
        overdue_notified_at: new Date('2026-04-01T12:00:00.000Z'),
        status: 'overdue',
      },
      where: { id: OVERDUE_TASK_ID },
    });
    expect(tx.behaviourTask.update).toHaveBeenNthCalledWith(3, {
      data: { priority: 'high' },
      where: { id: OVERDUE_TASK_ID },
    });
    expect(tx.notification.create).toHaveBeenCalledTimes(4);
  });

  it('should reject jobs without tenant_id', async () => {
    const processor = new BehaviourTaskRemindersProcessor(buildMockPrisma(buildMockTx()));

    await expect(
      processor.process(buildJob(BEHAVIOUR_TASK_REMINDERS_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');
  });
});
