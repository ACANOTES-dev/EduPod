import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  ADMISSIONS_AUTO_EXPIRY_JOB,
  AdmissionsAutoExpiryProcessor,
  type AdmissionsAutoExpiryPayload,
} from './admissions-auto-expiry.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPLICATION_ID = '22222222-2222-2222-2222-222222222222';

function buildJob(
  name: string,
  data: Partial<AdmissionsAutoExpiryPayload> = {},
): Job<AdmissionsAutoExpiryPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<AdmissionsAutoExpiryPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    application: {
      findMany: jest.fn().mockResolvedValue([
        {
          application_number: 'APP-001',
          id: APPLICATION_ID,
        },
      ]),
      update: jest.fn().mockResolvedValue({ id: APPLICATION_ID }),
    },
    applicationNote: {
      create: jest.fn().mockResolvedValue({ id: 'note-id' }),
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

describe('AdmissionsAutoExpiryProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new AdmissionsAutoExpiryProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('admissions:other-job'));

    expect(tx.application.findMany).not.toHaveBeenCalled();
  });

  it('should expire overdue draft applications and add an internal note', async () => {
    const tx = buildMockTx();
    const processor = new AdmissionsAutoExpiryProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(ADMISSIONS_AUTO_EXPIRY_JOB));

    expect(tx.application.update).toHaveBeenCalledWith({
      data: {
        reviewed_at: new Date('2026-04-01T12:00:00.000Z'),
        status: 'withdrawn',
      },
      where: { id: APPLICATION_ID },
    });
    expect(tx.applicationNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        application_id: APPLICATION_ID,
        author_user_id: '00000000-0000-0000-0000-000000000000',
        is_internal: true,
        tenant_id: TENANT_ID,
      }),
    });
  });

  it('should skip cleanly when no applications have expired', async () => {
    const tx = buildMockTx();
    tx.application.findMany.mockResolvedValue([]);
    const processor = new AdmissionsAutoExpiryProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(ADMISSIONS_AUTO_EXPIRY_JOB));

    expect(tx.application.update).not.toHaveBeenCalled();
    expect(tx.applicationNote.create).not.toHaveBeenCalled();
  });
});
