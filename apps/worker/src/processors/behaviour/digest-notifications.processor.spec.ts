import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB,
  DigestNotificationsProcessor,
  type DigestNotificationsPayload,
} from './digest-notifications.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const INCIDENT_ID = '33333333-3333-3333-3333-333333333333';
const PARENT_ID = '44444444-4444-4444-4444-444444444444';
const PARENT_USER_ID = '55555555-5555-5555-5555-555555555555';

function buildJob(
  name: string,
  data: Partial<DigestNotificationsPayload> = {},
): Job<DigestNotificationsPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<DigestNotificationsPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourGuardianRestriction: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    behaviourIncident: {
      findMany: jest.fn().mockResolvedValue([
        {
          category: { name: 'Respect' },
          context_snapshot: {
            description_template_text: 'Shared template text',
          },
          id: INCIDENT_ID,
          incident_number: 'INC-001',
          occurred_at: new Date('2026-04-01T08:00:00.000Z'),
          parent_description: null,
          parent_notification_status: 'pending',
          participants: [{ student_id: STUDENT_ID }],
          polarity: 'positive',
          retention_status: 'active',
          severity: 2,
        },
      ]),
      update: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
    },
    behaviourParentAcknowledgement: {
      create: jest.fn().mockResolvedValue({ id: 'ack-id' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
    },
    studentParent: {
      findMany: jest.fn().mockResolvedValue([
        {
          parent: {
            id: PARENT_ID,
            preferred_contact_channels: ['email'],
            status: 'active',
            user_id: PARENT_USER_ID,
          },
          student_id: STUDENT_ID,
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

describe('DigestNotificationsProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new DigestNotificationsProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.behaviourIncident.findMany).not.toHaveBeenCalled();
  });

  it('should batch acknowledgements and preferred-channel notifications per parent', async () => {
    const tx = buildMockTx();
    const processor = new DigestNotificationsProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB));

    expect(tx.behaviourParentAcknowledgement.create).toHaveBeenCalledWith({
      data: {
        channel: 'in_app',
        incident_id: INCIDENT_ID,
        parent_id: PARENT_ID,
        sent_at: expect.any(Date),
        tenant_id: TENANT_ID,
      },
    });
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    expect(tx.behaviourIncident.update).toHaveBeenCalledWith({
      data: { parent_notification_status: 'sent' },
      where: { id: INCIDENT_ID },
    });
  });

  it('should skip notification creation when a recent acknowledgement already exists', async () => {
    const tx = buildMockTx();
    tx.behaviourParentAcknowledgement.findFirst.mockResolvedValue({
      id: 'existing-ack-id',
    });
    const processor = new DigestNotificationsProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB));

    expect(tx.behaviourParentAcknowledgement.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.behaviourIncident.update).toHaveBeenCalledWith({
      data: { parent_notification_status: 'sent' },
      where: { id: INCIDENT_ID },
    });
  });

  it('should be safe to rerun the same digest payload without duplicating notifications', async () => {
    const tx = buildMockTx();
    let acknowledgementExists = false;
    tx.behaviourParentAcknowledgement.findFirst.mockImplementation(async () =>
      acknowledgementExists ? { id: 'existing-ack-id' } : null,
    );
    tx.behaviourParentAcknowledgement.create.mockImplementation(async () => {
      acknowledgementExists = true;
      return { id: 'ack-id' };
    });
    const processor = new DigestNotificationsProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB));
    await processor.process(buildJob(BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB));

    expect(tx.behaviourParentAcknowledgement.create).toHaveBeenCalledTimes(1);
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
  });
});
