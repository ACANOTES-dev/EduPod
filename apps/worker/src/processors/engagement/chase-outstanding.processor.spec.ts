/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('@school/shared/engagement', () => ({
  engagementConfigSchema: {
    parse: jest.fn(),
  },
}));

import { engagementConfigSchema } from '@school/shared/engagement';
import { Job } from 'bullmq';

import { CHASE_OUTSTANDING_JOB, ChaseOutstandingProcessor } from './chase-outstanding.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const PARTICIPANT_ID = '33333333-3333-3333-3333-333333333333';
const SUBMISSION_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = '55555555-5555-5555-5555-555555555555';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    engagementEvent: {
      findMany: jest.fn().mockResolvedValue([
        {
          consent_deadline: new Date('2026-04-04T00:00:00.000Z'),
          id: 'event-1',
          title: 'Trip Form',
        },
      ]),
    },
    engagementEventParticipant: {
      findMany: jest.fn().mockResolvedValue([{ id: PARTICIPANT_ID, student_id: 'student-1' }]),
    },
    engagementFormSubmission: {
      findMany: jest.fn().mockResolvedValue([
        {
          event: {
            consent_deadline: new Date('2026-04-04T00:00:00.000Z'),
            id: 'event-1',
            title: 'Trip Form',
          },
          id: SUBMISSION_ID,
          student_id: 'student-1',
        },
      ]),
    },
    notification: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
    },
    student: {
      findFirst: jest.fn().mockResolvedValue({
        household: {
          household_parents: [
            {
              parent: { user_id: USER_ID },
            },
          ],
        },
      }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ id: TENANT_A_ID }]),
    },
    tenantSetting: {
      findUnique: jest.fn().mockResolvedValue({ settings: { engagement: {} } }),
    },
  };
}

function buildJob(name: string = CHASE_OUTSTANDING_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('ChaseOutstandingProcessor', () => {
  const mockParse = jest.mocked(engagementConfigSchema.parse);

  beforeEach(() => {
    mockParse.mockReturnValue({
      default_reminder_days: [3],
      max_reminders_per_form: 2,
    } as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ChaseOutstandingProcessor(mockPrisma as never);

    await processor.process(buildJob('engagement:other-job'));

    expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('should iterate active tenants and continue after a tenant failure', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }, { id: TENANT_B_ID }]);
    let callCount = 0;
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: MockTx) => Promise<unknown>) => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('tenant transaction failed');
        }
        return callback(mockTx);
      },
    );
    const processor = new ChaseOutstandingProcessor(mockPrisma as never);

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should create reminders for pending participants and form submissions approaching their deadlines', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    try {
      const mockTx = buildMockTx();
      const processor = new ChaseOutstandingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.notification.create).toHaveBeenCalledTimes(2);
      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          payload_json: expect.objectContaining({
            days_until_deadline: 3,
            student_id: 'student-1',
          }),
          recipient_user_id: USER_ID,
          source_entity_id: PARTICIPANT_ID,
          source_entity_type: 'engagement_event_participant',
          template_key: 'engagement_consent_reminder',
          tenant_id: TENANT_A_ID,
        }),
      });
      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          payload_json: expect.objectContaining({
            days_until_deadline: 3,
            submission_id: SUBMISSION_ID,
            student_id: 'student-1',
          }),
          recipient_user_id: USER_ID,
          source_entity_id: SUBMISSION_ID,
          source_entity_type: 'engagement_form_submission',
          template_key: 'engagement_form_reminder',
          tenant_id: TENANT_A_ID,
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
