import { PrismaClient } from '@prisma/client';

import { TenantAwareJob, TenantJobPayload } from './tenant-aware-job';

// Concrete implementation for testing
class TestJob extends TenantAwareJob<TenantJobPayload> {
  public processJobCalled = false;
  public receivedData: TenantJobPayload | null = null;

  protected async processJob(
    data: TenantJobPayload,
    _tx: PrismaClient,
  ): Promise<void> {
    this.processJobCalled = true;
    this.receivedData = data;
  }
}

describe('TenantAwareJob', () => {
  let mockPrisma: {
    $transaction: jest.Mock;
  };
  let mockTx: {
    $executeRaw: jest.Mock;
  };

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    mockPrisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockTx);
      }),
    };
  });

  it('should reject job without tenant_id', async () => {
    const job = new TestJob(mockPrisma as unknown as PrismaClient);

    await expect(
      job.execute({ tenant_id: '' } as TenantJobPayload),
    ).rejects.toThrow('missing tenant_id');
  });

  it('should reject job with undefined tenant_id', async () => {
    const job = new TestJob(mockPrisma as unknown as PrismaClient);

    await expect(
      job.execute({} as TenantJobPayload),
    ).rejects.toThrow('missing tenant_id');
  });

  it('should set RLS context via SET LOCAL', async () => {
    const job = new TestJob(mockPrisma as unknown as PrismaClient);
    const tenantId = '11111111-1111-1111-1111-111111111111';

    await job.execute({ tenant_id: tenantId });

    expect(mockTx.$executeRaw).toHaveBeenCalled();
  });

  it('should call processJob within transaction', async () => {
    const job = new TestJob(mockPrisma as unknown as PrismaClient);
    const tenantId = '22222222-2222-2222-2222-222222222222';

    await job.execute({ tenant_id: tenantId });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(job.processJobCalled).toBe(true);
    expect(job.receivedData).toEqual({ tenant_id: tenantId });
  });
});
