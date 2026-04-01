import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  BEHAVIOUR_PARENT_NOTIFICATION_JOB,
  BehaviourParentNotificationProcessor,
  type BehaviourParentNotificationPayload,
} from './parent-notification.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INCIDENT_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const PARENT_ID = '44444444-4444-4444-4444-444444444444';
const PARENT_USER_ID = '55555555-5555-5555-5555-555555555555';

function buildJob(
  name: string,
  data: Partial<BehaviourParentNotificationPayload> = {},
): Job<BehaviourParentNotificationPayload> {
  return {
    data: {
      incident_id: INCIDENT_ID,
      student_ids: [STUDENT_ID],
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<BehaviourParentNotificationPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourIncident: {
      findFirst: jest.fn().mockResolvedValue({
        category: { name: 'Disruption' },
        id: INCIDENT_ID,
        incident_number: 'INC-001',
        parent_description: 'Detailed parent-safe note',
        parent_description_locked: false,
        parent_notification_status: 'pending',
        polarity: 'negative',
        severity: 4,
      }),
      update: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
    },
    behaviourParentAcknowledgement: {
      create: jest.fn().mockResolvedValue({ id: 'ack-id' }),
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
        },
      ]),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          behaviour: {
            parent_description_auto_lock_on_send: true,
            parent_notification_send_gate_severity: 3,
          },
        },
      }),
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

describe('BehaviourParentNotificationProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new BehaviourParentNotificationProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.behaviourIncident.findFirst).not.toHaveBeenCalled();
  });

  it('should create acknowledgements and notifications, then lock and mark the incident sent', async () => {
    const tx = buildMockTx();
    const processor = new BehaviourParentNotificationProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_PARENT_NOTIFICATION_JOB));

    expect(tx.behaviourParentAcknowledgement.create).toHaveBeenCalledWith({
      data: {
        incident_id: INCIDENT_ID,
        parent_id: PARENT_ID,
        sent_at: expect.any(Date),
        tenant_id: TENANT_ID,
      },
    });
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    expect(tx.behaviourIncident.update).toHaveBeenNthCalledWith(1, {
      data: { parent_description_locked: true },
      where: { id: INCIDENT_ID },
    });
    expect(tx.behaviourIncident.update).toHaveBeenNthCalledWith(2, {
      data: { parent_notification_status: 'sent' },
      where: { id: INCIDENT_ID },
    });
  });

  it('should block sends when the send gate applies and no parent description is present', async () => {
    const tx = buildMockTx();
    tx.behaviourIncident.findFirst.mockResolvedValue({
      category: { name: 'Disruption' },
      id: INCIDENT_ID,
      incident_number: 'INC-001',
      parent_description: '',
      parent_description_locked: false,
      parent_notification_status: 'pending',
      polarity: 'negative',
      severity: 4,
    });
    const processor = new BehaviourParentNotificationProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_PARENT_NOTIFICATION_JOB));

    expect(tx.behaviourParentAcknowledgement.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.behaviourIncident.update).not.toHaveBeenCalled();
  });
});
