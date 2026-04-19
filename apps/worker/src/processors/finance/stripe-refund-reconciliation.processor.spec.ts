import { Job } from 'bullmq';

import {
  FINANCE_RECONCILE_STRIPE_REFUNDS_JOB,
  StripeRefundReconciliationProcessor,
} from './stripe-refund-reconciliation.processor';

function buildMockJob(name: string): Job {
  return { id: 'test-job', name, data: {} } as unknown as Job;
}

function buildMockPrisma(tenantFindMany = jest.fn().mockResolvedValue([])) {
  return {
    tenant: { findMany: tenantFindMany },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $executeRaw: jest.fn(),
        tenantStripeConfig: { findUnique: jest.fn().mockResolvedValue(null) },
        refund: { findMany: jest.fn().mockResolvedValue([]) },
      }),
    ),
  };
}

describe('StripeRefundReconciliationProcessor', () => {
  let processor: StripeRefundReconciliationProcessor;

  afterEach(() => jest.clearAllMocks());

  describe('process — job routing', () => {
    it('should skip jobs with a different name', async () => {
      const mockPrisma = buildMockPrisma();
      processor = new StripeRefundReconciliationProcessor(mockPrisma as never);

      await processor.process(buildMockJob('some-other-job'));

      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    });

    it('should iterate active tenants on matching job name', async () => {
      const tenantFindMany = jest.fn().mockResolvedValue([]);
      const mockPrisma = buildMockPrisma(tenantFindMany);
      processor = new StripeRefundReconciliationProcessor(mockPrisma as never);

      await processor.process(buildMockJob(FINANCE_RECONCILE_STRIPE_REFUNDS_JOB));

      expect(tenantFindMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });
    });

    it('should skip tenants without a Stripe config (not an error)', async () => {
      const tenantFindMany = jest
        .fn()
        .mockResolvedValue([{ id: '11111111-1111-1111-1111-111111111111' }]);
      const mockPrisma = buildMockPrisma(tenantFindMany);
      processor = new StripeRefundReconciliationProcessor(mockPrisma as never);

      await expect(
        processor.process(buildMockJob(FINANCE_RECONCILE_STRIPE_REFUNDS_JOB)),
      ).resolves.toBeUndefined();

      expect(tenantFindMany).toHaveBeenCalledTimes(1);
    });
  });
});
