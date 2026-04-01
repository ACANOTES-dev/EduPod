import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB,
  BehaviourGuardianRestrictionCheckProcessor,
  type BehaviourGuardianRestrictionCheckPayload,
} from './guardian-restriction-check.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const PARENT_ID = '33333333-3333-3333-3333-333333333333';
const SET_BY_ID = '44444444-4444-4444-4444-444444444444';
const EXPIRED_ID = '55555555-5555-5555-5555-555555555555';
const REVIEW_ID = '66666666-6666-6666-6666-666666666666';

function buildJob(
  name: string,
  data: Partial<BehaviourGuardianRestrictionCheckPayload> = {},
): Job<BehaviourGuardianRestrictionCheckPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<BehaviourGuardianRestrictionCheckPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourEntityHistory: {
      create: jest.fn().mockResolvedValue({ id: 'history-id' }),
    },
    behaviourGuardianRestriction: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: EXPIRED_ID,
            parent_id: PARENT_ID,
            student_id: STUDENT_ID,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: REVIEW_ID,
            review_date: new Date('2026-04-08T00:00:00.000Z'),
            set_by_id: SET_BY_ID,
            student: {
              first_name: 'Lina',
              last_name: 'Murphy',
            },
          },
        ]),
      update: jest.fn().mockResolvedValue({ id: EXPIRED_ID }),
    },
    behaviourTask: {
      create: jest.fn().mockResolvedValue({ id: 'task-id' }),
      findFirst: jest.fn().mockResolvedValue(null),
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

describe('BehaviourGuardianRestrictionCheckProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new BehaviourGuardianRestrictionCheckProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.behaviourGuardianRestriction.findMany).not.toHaveBeenCalled();
  });

  it('should expire outdated restrictions and create review tasks for upcoming reviews', async () => {
    const tx = buildMockTx();
    const processor = new BehaviourGuardianRestrictionCheckProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB));

    expect(tx.behaviourGuardianRestriction.update).toHaveBeenCalledWith({
      data: { status: 'expired' },
      where: { id: EXPIRED_ID },
    });
    expect(tx.behaviourEntityHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.behaviourTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assigned_to_id: SET_BY_ID,
        due_date: new Date('2026-04-08T00:00:00.000Z'),
        entity_id: REVIEW_ID,
        entity_type: 'guardian_restriction',
        status: 'pending',
        task_type: 'guardian_restriction_review',
        tenant_id: TENANT_ID,
      }),
    });
  });

  it('should skip review task creation when an open task already exists', async () => {
    const tx = buildMockTx();
    tx.behaviourTask.findFirst.mockResolvedValue({ id: 'existing-task-id' });
    const processor = new BehaviourGuardianRestrictionCheckProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB));

    expect(tx.behaviourTask.create).not.toHaveBeenCalled();
  });
});
