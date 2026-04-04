import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB,
  StuckNotificationAlertProcessor,
  type StuckNotificationAlertPayload,
} from './stuck-notification-alert.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const REPORTER_USER_ID = '22222222-2222-2222-2222-222222222222';
const INCIDENT_ID = '33333333-3333-3333-3333-333333333333';
const INCIDENT_NUMBER = 'BH-202604-0001';

function buildJob(
  name: string,
  data: Partial<StuckNotificationAlertPayload> = {},
): Job<StuckNotificationAlertPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<StuckNotificationAlertPayload>;
}

function buildMockTx(overrides?: {
  incidents?: Array<{
    id: string;
    incident_number: string;
    reported_by_id: string;
    created_at: Date;
  }>;
  existingAlert?: { id: string } | null;
}) {
  const incidents = overrides?.incidents ?? [];
  const existingAlert = overrides?.existingAlert ?? null;

  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourIncident: {
      findMany: jest.fn().mockResolvedValue(incidents),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(existingAlert),
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

describe('StuckNotificationAlertProcessor', () => {
  const NOW = new Date('2026-04-04T09:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new StuckNotificationAlertProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.behaviourIncident.findMany).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const tx = buildMockTx();
    const processor = new StuckNotificationAlertProcessor(buildMockPrisma(tx));

    await expect(
      processor.process(buildJob(BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');
  });

  it('should create alert for incident pending >24h with no prior alert', async () => {
    const createdAt = new Date('2026-04-02T08:00:00.000Z'); // ~49 hours ago
    const tx = buildMockTx({
      incidents: [
        {
          id: INCIDENT_ID,
          incident_number: INCIDENT_NUMBER,
          reported_by_id: REPORTER_USER_ID,
          created_at: createdAt,
        },
      ],
      existingAlert: null,
    });
    const processor = new StuckNotificationAlertProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB));

    expect(tx.behaviourIncident.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        parent_notification_status: 'pending',
        created_at: { lt: expect.any(Date) },
        status: 'active',
      },
      select: {
        id: true,
        incident_number: true,
        reported_by_id: true,
        created_at: true,
      },
    });

    expect(tx.notification.create).toHaveBeenCalledWith({
      data: {
        tenant_id: TENANT_ID,
        recipient_user_id: REPORTER_USER_ID,
        channel: 'in_app',
        template_key: 'behaviour_stuck_parent_notification',
        locale: 'en',
        status: 'delivered',
        delivered_at: NOW,
        source_entity_type: 'behaviour_stuck_notification',
        source_entity_id: INCIDENT_ID,
        payload_json: {
          incident_id: INCIDENT_ID,
          incident_number: INCIDENT_NUMBER,
          hours_pending: 49,
        },
      },
    });
  });

  it('should skip incident pending >24h with prior alert (idempotency)', async () => {
    const createdAt = new Date('2026-04-02T08:00:00.000Z');
    const tx = buildMockTx({
      incidents: [
        {
          id: INCIDENT_ID,
          incident_number: INCIDENT_NUMBER,
          reported_by_id: REPORTER_USER_ID,
          created_at: createdAt,
        },
      ],
      existingAlert: { id: 'existing-alert-id' },
    });
    const processor = new StuckNotificationAlertProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB));

    expect(tx.notification.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        source_entity_type: 'behaviour_stuck_notification',
        source_entity_id: INCIDENT_ID,
      },
      select: { id: true },
    });
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('should skip when no stuck incidents are found (<24h or not active)', async () => {
    const tx = buildMockTx({ incidents: [] });
    const processor = new StuckNotificationAlertProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB));

    expect(tx.behaviourIncident.findMany).toHaveBeenCalled();
    expect(tx.notification.findFirst).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});
