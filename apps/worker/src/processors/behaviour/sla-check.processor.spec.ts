import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { SLA_CHECK_JOB, SlaCheckProcessor, type SlaCheckPayload } from './sla-check.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CONCERN_ID = '22222222-2222-2222-2222-222222222222';
const ASSIGNEE_ID = '33333333-3333-3333-3333-333333333333';

function buildJob(name: string, data: Partial<SlaCheckPayload> = {}): Job<SlaCheckPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<SlaCheckPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourTask: {
      create: jest.fn().mockResolvedValue({ id: 'task-id' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
    },
    safeguardingConcern: {
      findMany: jest.fn().mockResolvedValue([
        {
          concern_number: 'SG-001',
          designated_liaison_id: ASSIGNEE_ID,
          id: CONCERN_ID,
          reported_by_id: '44444444-4444-4444-4444-444444444444',
          sla_first_response_due: new Date('2026-03-31T10:00:00.000Z'),
        },
      ]),
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

describe('SlaCheckProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new SlaCheckProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.safeguardingConcern.findMany).not.toHaveBeenCalled();
  });

  it('should create breach tasks and notify the assignee for overdue concerns', async () => {
    const tx = buildMockTx();
    const processor = new SlaCheckProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(SLA_CHECK_JOB));

    expect(tx.behaviourTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assigned_to_id: ASSIGNEE_ID,
        entity_id: CONCERN_ID,
        entity_type: 'safeguarding_concern',
        priority: 'urgent',
        task_type: 'safeguarding_action',
        tenant_id: TENANT_ID,
      }),
    });
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
  });

  it('should skip task and notification creation when an open breach task already exists', async () => {
    const tx = buildMockTx();
    tx.behaviourTask.findFirst.mockResolvedValue({ id: 'existing-task-id' });
    const processor = new SlaCheckProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(SLA_CHECK_JOB));

    expect(tx.behaviourTask.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});
