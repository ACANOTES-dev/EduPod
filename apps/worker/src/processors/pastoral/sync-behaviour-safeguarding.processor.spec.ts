import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  SYNC_BEHAVIOUR_SAFEGUARDING_JOB,
  SyncBehaviourSafeguardingProcessor,
  type SyncBehaviourSafeguardingPayload,
} from './sync-behaviour-safeguarding.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const CONCERN_ID = '44444444-4444-4444-4444-444444444444';
const PASTORAL_CONCERN_ID = '55555555-5555-5555-5555-555555555555';
const INCIDENT_ID = '66666666-6666-6666-6666-666666666666';

function buildJob(
  name: string,
  data: Partial<SyncBehaviourSafeguardingPayload> = {},
): Job<SyncBehaviourSafeguardingPayload> {
  return {
    data: {
      safeguarding_concern_id: CONCERN_ID,
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      ...data,
    },
    name,
  } as Job<SyncBehaviourSafeguardingPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    cpRecord: {
      create: jest.fn().mockResolvedValue({ id: 'cp-record-id' }),
    },
    pastoralConcern: {
      create: jest.fn().mockResolvedValue({ id: PASTORAL_CONCERN_ID }),
    },
    pastoralConcernVersion: {
      create: jest.fn().mockResolvedValue({ id: 'version-id' }),
    },
    pastoralEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-id' }),
    },
    safeguardingConcern: {
      findFirst: jest.fn().mockResolvedValue({
        concern_incidents: [{ incident_id: INCIDENT_ID }],
        description: 'Observed a serious concern',
        id: CONCERN_ID,
        immediate_actions_taken: 'Escalated to DLP',
        pastoral_concern_id: null,
        reported_by_id: USER_ID,
        severity: 'high_sev',
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
      }),
      update: jest.fn().mockResolvedValue({ id: CONCERN_ID }),
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

describe('SyncBehaviourSafeguardingProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new SyncBehaviourSafeguardingProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('pastoral:other-job'));

    expect(tx.safeguardingConcern.findFirst).not.toHaveBeenCalled();
  });

  it('should create pastoral records and back-link the safeguarding concern', async () => {
    const tx = buildMockTx();
    const processor = new SyncBehaviourSafeguardingProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(SYNC_BEHAVIOUR_SAFEGUARDING_JOB));

    expect(tx.pastoralConcern.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actions_taken: 'Escalated to DLP',
        behaviour_incident_id: INCIDENT_ID,
        category: 'child_protection',
        logged_by_user_id: USER_ID,
        severity: 'urgent',
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        tier: 3,
      }),
    });
    expect(tx.safeguardingConcern.update).toHaveBeenCalledWith({
      data: { pastoral_concern_id: PASTORAL_CONCERN_ID },
      where: { id: CONCERN_ID },
    });
    expect(tx.pastoralEvent.create).toHaveBeenCalledTimes(2);
  });

  it('should skip concerns that are already synced', async () => {
    const tx = buildMockTx();
    tx.safeguardingConcern.findFirst.mockResolvedValue({
      concern_incidents: [],
      description: 'Observed a serious concern',
      id: CONCERN_ID,
      immediate_actions_taken: 'Escalated to DLP',
      pastoral_concern_id: PASTORAL_CONCERN_ID,
      reported_by_id: USER_ID,
      severity: 'high_sev',
      student_id: STUDENT_ID,
      tenant_id: TENANT_ID,
    });

    const processor = new SyncBehaviourSafeguardingProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(SYNC_BEHAVIOUR_SAFEGUARDING_JOB));

    expect(tx.pastoralConcern.create).not.toHaveBeenCalled();
    expect(tx.pastoralConcernVersion.create).not.toHaveBeenCalled();
    expect(tx.cpRecord.create).not.toHaveBeenCalled();
    expect(tx.pastoralEvent.create).not.toHaveBeenCalled();
  });
});
