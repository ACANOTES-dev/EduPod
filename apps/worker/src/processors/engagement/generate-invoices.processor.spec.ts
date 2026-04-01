import { Decimal } from '@prisma/client/runtime/library';
import { Job } from 'bullmq';

import {
  GENERATE_EVENT_INVOICES_JOB,
  type GenerateEventInvoicesPayload,
  GenerateEventInvoicesProcessor,
} from './generate-invoices.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const EVENT_ID = '22222222-2222-2222-2222-222222222222';
const PARTICIPANT_ID = '33333333-3333-3333-3333-333333333333';
const INVOICE_ID = '44444444-4444-4444-4444-444444444444';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    engagementEvent: {
      findFirst: jest.fn().mockResolvedValue({
        created_by_user_id: 'user-1',
        fee_amount: new Decimal(50),
        fee_description: 'Trip Fee',
        id: EVENT_ID,
        participants: [
          {
            id: PARTICIPANT_ID,
            student: {
              household_id: 'household-1',
              id: 'student-1',
            },
          },
        ],
        payment_deadline: new Date('2026-04-20T00:00:00.000Z'),
        title: 'School Trip',
      }),
    },
    engagementEventParticipant: {
      update: jest.fn().mockResolvedValue({ id: PARTICIPANT_ID }),
    },
    invoice: {
      create: jest.fn().mockResolvedValue({ id: INVOICE_ID }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ currency_code: 'EUR' }),
    },
    tenantSequence: {
      create: jest.fn().mockResolvedValue({}),
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
  name: string = GENERATE_EVENT_INVOICES_JOB,
  data: Partial<GenerateEventInvoicesPayload> = {},
): Job<GenerateEventInvoicesPayload> {
  return {
    data: {
      event_id: EVENT_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<GenerateEventInvoicesPayload>;
}

describe('GenerateEventInvoicesProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new GenerateEventInvoicesProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('engagement:other-job'));

    expect(mockTx.engagementEvent.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new GenerateEventInvoicesProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(GENERATE_EVENT_INVOICES_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id');
  });

  it('should skip invoice generation when the event has no fee', async () => {
    const mockTx = buildMockTx();
    mockTx.engagementEvent.findFirst.mockResolvedValue({
      created_by_user_id: 'user-1',
      fee_amount: new Decimal(0),
      id: EVENT_ID,
      participants: [],
      title: 'Free Event',
    });
    const processor = new GenerateEventInvoicesProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.invoice.create).not.toHaveBeenCalled();
  });

  it('should create invoices and link them to participants requiring payment', async () => {
    const mockTx = buildMockTx();
    const processor = new GenerateEventInvoicesProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        household_id: 'household-1',
        invoice_number: expect.stringMatching(/^EVI-\d{6}-00001$/),
        currency_code: 'EUR',
        total_amount: new Decimal(50),
      }),
    });
    expect(mockTx.engagementEventParticipant.update).toHaveBeenCalledWith({
      where: { id: PARTICIPANT_ID },
      data: {
        invoice_id: INVOICE_ID,
        payment_status: 'pending',
      },
    });
  });
});
