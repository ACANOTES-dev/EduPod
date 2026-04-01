import { Job } from 'bullmq';

import { EXPIRE_PENDING_JOB, ExpirePendingProcessor } from './expire-pending.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = '33333333-3333-3333-3333-333333333333';
const PARTICIPANT_ID = '44444444-4444-4444-4444-444444444444';
const SUBMISSION_ID = '55555555-5555-5555-5555-555555555555';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    engagementEvent: {
      findMany: jest.fn().mockResolvedValue([{ id: EVENT_ID, title: 'Trip Form' }]),
    },
    engagementEventParticipant: {
      findMany: jest.fn().mockResolvedValue([{ id: PARTICIPANT_ID }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    engagementFormSubmission: {
      findMany: jest.fn().mockResolvedValue([{ id: SUBMISSION_ID }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

function buildJob(name: string = EXPIRE_PENDING_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('ExpirePendingProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ExpirePendingProcessor(mockPrisma as never);

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
    const processor = new ExpirePendingProcessor(mockPrisma as never);

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should decline pending participants and expire pending submissions past the deadline', async () => {
    const mockTx = buildMockTx();
    const processor = new ExpirePendingProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.engagementEventParticipant.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [PARTICIPANT_ID] },
        tenant_id: TENANT_A_ID,
      },
      data: {
        consent_status: 'declined',
        status: 'consent_declined',
      },
    });
    expect(mockTx.engagementFormSubmission.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [SUBMISSION_ID] },
        tenant_id: TENANT_A_ID,
      },
      data: {
        status: 'expired',
        expired_at: expect.any(Date),
      },
    });
  });
});
