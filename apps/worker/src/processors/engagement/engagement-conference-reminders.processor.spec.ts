import { Job } from 'bullmq';

import {
  CONFERENCE_REMINDERS_JOB,
  EngagementConferenceRemindersProcessor,
} from './engagement-conference-reminders.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    conferenceBooking: {
      findMany: jest.fn().mockResolvedValue([
        {
          booked_by_user_id: USER_ID,
          id: 'booking-1',
          student: {
            first_name: 'Amina',
            last_name: 'OBrien',
          },
          time_slot: {
            end_time: new Date('2026-04-02T10:00:00.000Z'),
            start_time: new Date('2026-04-02T09:00:00.000Z'),
            teacher_id: 'teacher-1',
          },
        },
      ]),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
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
  };
}

function buildJob(name: string = CONFERENCE_REMINDERS_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('EngagementConferenceRemindersProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new EngagementConferenceRemindersProcessor(mockPrisma as never);

    await processor.process(buildJob('engagement:other-job'));

    expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('should iterate active tenants and continue after failures', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }, { id: TENANT_B_ID }]);
    let callCount = 0;
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: MockTx) => Promise<unknown>) => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('tenant failure');
        }
        return callback(mockTx);
      },
    );
    const processor = new EngagementConferenceRemindersProcessor(mockPrisma as never);

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should create reminders for confirmed bookings starting within the next 24 hours', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    try {
      const mockTx = buildMockTx();
      const processor = new EngagementConferenceRemindersProcessor(
        buildMockPrisma(mockTx) as never,
      );

      await processor.process(buildJob());

      expect(mockTx.conferenceBooking.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_A_ID,
          status: 'confirmed',
          time_slot: {
            start_time: {
              gte: new Date('2026-04-01T12:00:00.000Z'),
              lte: new Date('2026-04-02T12:00:00.000Z'),
            },
          },
        },
        include: {
          time_slot: true,
          student: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
      });
      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient_user_id: USER_ID,
          template_key: 'conference_reminder',
          tenant_id: TENANT_A_ID,
          payload_json: expect.objectContaining({
            booking_id: 'booking-1',
            student_name: 'Amina OBrien',
            teacher_name: 'Teacher teacher-1',
          }),
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
