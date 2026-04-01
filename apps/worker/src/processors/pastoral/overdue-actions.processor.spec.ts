import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  OVERDUE_ACTIONS_JOB,
  OverdueActionsProcessor,
  type OverdueActionsPayload,
} from './overdue-actions.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const MEETING_ACTION_ID = '44444444-4444-4444-4444-444444444444';
const INTERVENTION_ACTION_ID = '55555555-5555-5555-5555-555555555555';

function buildJob(
  name: string,
  data: Partial<OverdueActionsPayload> = {},
): Job<OverdueActionsPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      ...data,
    },
    name,
  } as Job<OverdueActionsPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    pastoralEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-id' }),
    },
    pastoralInterventionAction: {
      findMany: jest.fn().mockResolvedValue([
        {
          assigned_to_user_id: USER_ID,
          due_date: new Date('2026-03-29T00:00:00.000Z'),
          id: INTERVENTION_ACTION_ID,
          intervention: { student_id: STUDENT_ID },
        },
      ]),
      update: jest.fn().mockResolvedValue({ id: INTERVENTION_ACTION_ID }),
    },
    sstMeetingAction: {
      findMany: jest.fn().mockResolvedValue([
        {
          assigned_to_user_id: USER_ID,
          due_date: new Date('2026-03-30T00:00:00.000Z'),
          id: MEETING_ACTION_ID,
          student_id: STUDENT_ID,
        },
      ]),
      update: jest.fn().mockResolvedValue({ id: MEETING_ACTION_ID }),
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

describe('OverdueActionsProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new OverdueActionsProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('pastoral:other-job'));

    expect(tx.sstMeetingAction.findMany).not.toHaveBeenCalled();
    expect(tx.pastoralInterventionAction.findMany).not.toHaveBeenCalled();
  });

  it('should mark meeting and intervention actions overdue and write audit events', async () => {
    const tx = buildMockTx();
    const processor = new OverdueActionsProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(OVERDUE_ACTIONS_JOB));

    expect(tx.sstMeetingAction.update).toHaveBeenCalledWith({
      data: { status: 'pc_overdue' },
      where: { id: MEETING_ACTION_ID },
    });
    expect(tx.pastoralInterventionAction.update).toHaveBeenCalledWith({
      data: { status: 'pc_overdue' },
      where: { id: INTERVENTION_ACTION_ID },
    });
    expect(tx.pastoralEvent.create).toHaveBeenCalledTimes(2);
  });

  it('should reject jobs without tenant_id', async () => {
    const processor = new OverdueActionsProcessor(buildMockPrisma(buildMockTx()));

    await expect(
      processor.process(buildJob(OVERDUE_ACTIONS_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');
  });
});
