import { PrismaClient } from '@prisma/client';

import { CrossTenantSystemJob } from './cross-tenant-system-job';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const TENANT_C = '33333333-3333-3333-3333-333333333333';

// ─── Concrete test implementation ─────────────────────────────────────────────

class TestSystemJob extends CrossTenantSystemJob {
  public processedTenants: string[] = [];
  public runCalled = false;
  public shouldFailForTenant: string | null = null;

  constructor(prisma: PrismaClient) {
    super(prisma, 'TestSystemJob');
  }

  protected async runSystemJob(): Promise<void> {
    this.runCalled = true;
    await this.forEachTenant(async (tenantId) => {
      if (tenantId === this.shouldFailForTenant) {
        throw new Error(`Simulated failure for tenant ${tenantId}`);
      }
      this.processedTenants.push(tenantId);
    });
  }
}

// ─── Mock factory ──────────────────────────────────────────────────────────────

function buildMockPrisma(
  tenants: Array<{ id: string }>,
): jest.Mocked<Pick<PrismaClient, 'tenant'>> {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue(tenants),
    } as unknown as PrismaClient['tenant'],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CrossTenantSystemJob', () => {
  afterEach(() => jest.clearAllMocks());

  describe('execute', () => {
    it('should call runSystemJob', async () => {
      const mockPrisma = buildMockPrisma([]);
      const job = new TestSystemJob(mockPrisma as unknown as PrismaClient);

      await job.execute();

      expect(job.runCalled).toBe(true);
    });

    it('should NOT set any RLS context', async () => {
      // Verify there is no $transaction or $executeRaw in execute() itself.
      // The absence of these calls on the mock is the assertion.
      const mockPrisma = buildMockPrisma([]) as unknown as PrismaClient & {
        $transaction?: jest.Mock;
        $executeRaw?: jest.Mock;
      };
      mockPrisma.$transaction = jest.fn();
      mockPrisma.$executeRaw = jest.fn();

      const job = new TestSystemJob(mockPrisma as unknown as PrismaClient);
      await job.execute();

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('forEachTenant', () => {
    it('should call callback once per active tenant', async () => {
      const mockPrisma = buildMockPrisma([
        { id: TENANT_A },
        { id: TENANT_B },
        { id: TENANT_C },
      ]);
      const job = new TestSystemJob(mockPrisma as unknown as PrismaClient);

      await job.execute();

      expect(job.processedTenants).toEqual([TENANT_A, TENANT_B, TENANT_C]);
    });

    it('should query only active tenants', async () => {
      const mockPrisma = buildMockPrisma([{ id: TENANT_A }]);
      const job = new TestSystemJob(mockPrisma as unknown as PrismaClient);

      await job.execute();

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });
    });

    it('should continue processing remaining tenants when one fails', async () => {
      const mockPrisma = buildMockPrisma([
        { id: TENANT_A },
        { id: TENANT_B },
        { id: TENANT_C },
      ]);
      const job = new TestSystemJob(mockPrisma as unknown as PrismaClient);
      job.shouldFailForTenant = TENANT_B;

      await job.execute();

      // TENANT_B failed but TENANT_A and TENANT_C should still be processed
      expect(job.processedTenants).toEqual([TENANT_A, TENANT_C]);
    });

    it('should return correct processed and failed counts', async () => {
      const mockPrisma = buildMockPrisma([
        { id: TENANT_A },
        { id: TENANT_B },
        { id: TENANT_C },
      ]);

      // Access forEachTenant directly via a subclass override
      class CountingJob extends CrossTenantSystemJob {
        public counts: { processed: number; failed: number } = { processed: 0, failed: 0 };
        public failFor: string | null = null;

        constructor(prisma: PrismaClient) {
          super(prisma, 'CountingJob');
        }

        protected async runSystemJob(): Promise<void> {
          this.counts = await this.forEachTenant(async (tenantId) => {
            if (tenantId === this.failFor) {
              throw new Error('fail');
            }
          });
        }
      }

      const job = new CountingJob(mockPrisma as unknown as PrismaClient);
      job.failFor = TENANT_B;

      await job.execute();

      expect(job.counts).toEqual({ processed: 2, failed: 1 });
    });

    it('should handle zero tenants gracefully', async () => {
      const mockPrisma = buildMockPrisma([]);
      const job = new TestSystemJob(mockPrisma as unknown as PrismaClient);

      await job.execute();

      expect(job.processedTenants).toEqual([]);
    });
  });
});
