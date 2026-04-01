import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  SEARCH_FULL_REINDEX_JOB,
  SearchReindexProcessor,
  type SearchFullReindexPayload,
} from './search-reindex.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function buildJob(
  name: string,
  data: Partial<SearchFullReindexPayload> = {},
): Job<SearchFullReindexPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<SearchFullReindexPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    household: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    parent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffProfile: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    student: {
      findMany: jest.fn().mockResolvedValue([]),
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

describe('SearchReindexProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new SearchReindexProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('search:other-job'));

    expect(tx.student.findMany).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const processor = new SearchReindexProcessor(buildMockPrisma(buildMockTx()));

    await expect(
      processor.process(buildJob(SEARCH_FULL_REINDEX_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');
  });

  it('should query each supported entity type with tenant-scoped filters', async () => {
    const tx = buildMockTx();
    const processor = new SearchReindexProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(SEARCH_FULL_REINDEX_JOB));

    expect(tx.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { created_at: 'asc' },
        skip: 0,
        take: 200,
        where: { tenant_id: TENANT_ID },
      }),
    );
    expect(tx.parent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 200,
        where: { tenant_id: TENANT_ID },
      }),
    );
    expect(tx.staffProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 200,
        where: { tenant_id: TENANT_ID },
      }),
    );
    expect(tx.household.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 200,
        where: { tenant_id: TENANT_ID },
      }),
    );
  });
});
