import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { DISPATCH_NOTIFICATIONS_JOB } from '../communications/dispatch-notifications.processor';

import { buildEscalationJobId, ESCALATION_TIMEOUT_JOB } from './escalation-timeout.processor';
import {
  NOTIFY_CONCERN_JOB,
  NotifyConcernProcessor,
  type NotifyConcernPayload,
} from './notify-concern.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const CONCERN_ID = '33333333-3333-3333-3333-333333333333';
const AUTHOR_ID = '44444444-4444-4444-4444-444444444444';
const RECIPIENT_ID = '55555555-5555-5555-5555-555555555555';
const SECOND_RECIPIENT_ID = '66666666-6666-6666-6666-666666666666';

function buildJob(
  name: string,
  data: Partial<NotifyConcernPayload> = {},
): Job<NotifyConcernPayload> {
  return {
    data: {
      category: 'attendance',
      concern_id: CONCERN_ID,
      logged_by_user_id: AUTHOR_ID,
      severity: 'critical',
      student_id: STUDENT_ID,
      student_name: 'Lina Murphy',
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<NotifyConcernPayload>;
}

function buildMockTx() {
  let notificationCall = 0;

  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    cpAccessGrant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    membershipRole: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      create: jest.fn().mockImplementation(async (args: { data: { channel: string } }) => {
        notificationCall += 1;
        return {
          channel: args.data.channel,
          id: `notification-${notificationCall}`,
        };
      }),
    },
    pastoralConcern: {
      findFirst: jest.fn().mockResolvedValue({
        id: CONCERN_ID,
        severity: 'critical',
        student_id: STUDENT_ID,
      }),
    },
    student: {
      findFirst: jest.fn().mockResolvedValue({
        year_group_id: 'year-group-1',
      }),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          pastoral: {
            escalation: {
              critical_timeout_minutes: 45,
              urgent_timeout_minutes: 90,
            },
            notification_recipients: {
              critical: {
                fallback_roles: [],
                user_ids: [RECIPIENT_ID, RECIPIENT_ID, SECOND_RECIPIENT_ID],
              },
              routine: {
                fallback_roles: [],
                user_ids: [RECIPIENT_ID],
              },
            },
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

function buildQueueMock() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'queued-job-id' }),
  };
}

describe('NotifyConcernProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new NotifyConcernProcessor(
      buildMockPrisma(tx),
      buildQueueMock() as never,
      buildQueueMock() as never,
      buildQueueMock() as never,
    );

    await processor.process(buildJob('pastoral:other-job'));

    expect(tx.pastoralConcern.findFirst).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('should create multi-channel notifications, enqueue dispatch, escalation, and early-warning recompute for critical concerns', async () => {
    const tx = buildMockTx();
    const earlyWarningQueue = buildQueueMock();
    const notificationsQueue = buildQueueMock();
    const pastoralQueue = buildQueueMock();
    const processor = new NotifyConcernProcessor(
      buildMockPrisma(tx),
      earlyWarningQueue as never,
      notificationsQueue as never,
      pastoralQueue as never,
    );

    await processor.process(buildJob(NOTIFY_CONCERN_JOB));

    expect(tx.notification.create).toHaveBeenCalledTimes(6);
    expect(notificationsQueue.add).toHaveBeenCalledWith(
      DISPATCH_NOTIFICATIONS_JOB,
      {
        notification_ids: ['notification-2', 'notification-3', 'notification-5', 'notification-6'],
        tenant_id: TENANT_ID,
      },
      {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
      },
    );

    const escalationJobId = buildEscalationJobId(TENANT_ID, CONCERN_ID, 'critical_second_round');

    expect(pastoralQueue.add).toHaveBeenCalledWith(
      ESCALATION_TIMEOUT_JOB,
      expect.objectContaining({
        concern_id: CONCERN_ID,
        escalation_type: 'critical_second_round',
        original_severity: 'critical',
        tenant_id: TENANT_ID,
      }),
      {
        delay: 45 * 60 * 1000,
        jobId: escalationJobId,
      },
    );
    expect(earlyWarningQueue.add).toHaveBeenCalledWith(
      'early-warning:compute-student',
      {
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        trigger_event: 'critical_incident',
      },
      {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
      },
    );
  });

  it('should keep routine concerns in-app only without escalation or external dispatch', async () => {
    const tx = buildMockTx();
    const earlyWarningQueue = buildQueueMock();
    const notificationsQueue = buildQueueMock();
    const pastoralQueue = buildQueueMock();
    const processor = new NotifyConcernProcessor(
      buildMockPrisma(tx),
      earlyWarningQueue as never,
      notificationsQueue as never,
      pastoralQueue as never,
    );

    tx.pastoralConcern.findFirst.mockResolvedValue({
      id: CONCERN_ID,
      severity: 'routine',
      student_id: STUDENT_ID,
    });

    await processor.process(buildJob(NOTIFY_CONCERN_JOB, { severity: 'routine' }));

    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    expect(notificationsQueue.add).not.toHaveBeenCalled();
    expect(pastoralQueue.add).not.toHaveBeenCalled();
    expect(earlyWarningQueue.add).not.toHaveBeenCalled();
  });
});
