import { Job, Queue } from 'bullmq';

import {
  CANCEL_EVENT_JOB,
  type CancelEventPayload,
  CancelEventProcessor,
} from './cancel-event.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const EVENT_ID = '22222222-2222-2222-2222-222222222222';
const PARTICIPANT_ID = '33333333-3333-3333-3333-333333333333';
const INVOICE_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = '55555555-5555-5555-5555-555555555555';
const SLOT_ID = '66666666-6666-6666-6666-666666666666';
const BOOKING_ID = '77777777-7777-7777-7777-777777777777';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    conferenceBooking: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    conferenceTimeSlot: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    engagementEvent: {
      findFirst: jest.fn().mockResolvedValue({
        event_type: 'parent_conference',
        id: EVENT_ID,
        participants: [
          {
            id: PARTICIPANT_ID,
            invoice_id: INVOICE_ID,
            payment_status: 'pending',
            student: {
              household: {
                household_parents: [
                  {
                    parent: { user_id: USER_ID },
                  },
                ],
              },
            },
            student_id: 'student-1',
          },
        ],
        time_slots: [
          {
            booking: { id: BOOKING_ID },
            id: SLOT_ID,
            status: 'booked',
          },
        ],
        title: 'Parent Conference',
      }),
    },
    engagementEventParticipant: {
      update: jest.fn().mockResolvedValue({ id: PARTICIPANT_ID }),
    },
    invoice: {
      update: jest.fn().mockResolvedValue({ id: INVOICE_ID }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
  };
}

function buildJob(
  name: string = CANCEL_EVENT_JOB,
  data: Partial<CancelEventPayload> = {},
): Job<CancelEventPayload> {
  return {
    data: {
      event_id: EVENT_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<CancelEventPayload>;
}

describe('CancelEventProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new CancelEventProcessor(
      buildMockPrisma(mockTx) as never,
      { add: jest.fn() } as unknown as Queue,
    );

    await processor.process(buildJob('engagement:other-job'));

    expect(mockTx.engagementEvent.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new CancelEventProcessor(
      buildMockPrisma(mockTx) as never,
      { add: jest.fn() } as unknown as Queue,
    );

    await expect(processor.process(buildJob(CANCEL_EVENT_JOB, { tenant_id: '' }))).rejects.toThrow(
      'Job rejected: missing tenant_id',
    );
  });

  it('should withdraw participants, void unpaid invoices, release conference bookings, and enqueue notifications', async () => {
    const mockTx = buildMockTx();
    const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const processor = new CancelEventProcessor(
      buildMockPrisma(mockTx) as never,
      mockQueue as never,
    );

    await processor.process(buildJob());

    expect(mockTx.invoice.update).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: { status: 'void' },
    });
    expect(mockTx.engagementEventParticipant.update).toHaveBeenCalledWith({
      where: { id: PARTICIPANT_ID },
      data: {
        status: 'withdrawn',
        withdrawn_at: expect.any(Date),
      },
    });
    expect(mockTx.conferenceBooking.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: [BOOKING_ID] },
        tenant_id: TENANT_ID,
      },
    });
    expect(mockTx.conferenceTimeSlot.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [SLOT_ID] },
        tenant_id: TENANT_ID,
      },
      data: { status: 'cancelled' },
    });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'notifications:dispatch',
      {
        tenant_id: TENANT_ID,
        type: 'event_cancelled',
        event_id: EVENT_ID,
        event_title: 'Parent Conference',
        recipient_user_ids: [USER_ID],
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  });
});
