import { Job } from 'bullmq';

import { OVERDUE_DETECTION_JOB, OverdueDetectionProcessor } from './overdue-detection.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INVOICE_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INVOICE_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    installment: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  };
}

function buildMockJob(name: string, data: Record<string, unknown> = {}): Job {
  return { id: 'test-job-id', name, data } as unknown as Job;
}

function buildInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID_1,
    invoice_number: 'INV-202603-001',
    status: 'issued',
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('OverdueDetectionProcessor', () => {
  let processor: OverdueDetectionProcessor;
  let mockTx: MockTx;

  beforeEach(() => {
    mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    processor = new OverdueDetectionProcessor(mockPrisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Job routing ────────────────────────────────────────────────────────

  describe('process — job routing', () => {
    it('should skip jobs with a different name', async () => {
      const job = buildMockJob('some-other-job', { tenant_id: TENANT_ID });
      await processor.process(job);

      expect(mockTx.invoice.findMany).not.toHaveBeenCalled();
    });

    it('should iterate all active tenants when tenant_id missing (cron mode)', async () => {
      const mockPrisma = buildMockPrisma(mockTx);
      (mockPrisma as unknown as { tenant: { findMany: jest.Mock } }).tenant = {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: '11111111-1111-1111-1111-111111111111' },
            { id: '22222222-2222-2222-2222-222222222222' },
          ]),
      };
      processor = new OverdueDetectionProcessor(mockPrisma as never);
      mockTx.invoice.findMany.mockResolvedValue([]);

      const job = buildMockJob(OVERDUE_DETECTION_JOB, {});
      await expect(processor.process(job)).resolves.toBeUndefined();

      // Two tenants → two invoice.findMany calls in the processJob body
      expect(mockTx.invoice.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Overdue invoice detection ────────────────────────────────────────

  describe('process — overdue invoices', () => {
    it('should find and mark overdue invoices', async () => {
      mockTx.invoice.findMany.mockResolvedValue([
        buildInvoice({ id: INVOICE_ID_1, status: 'issued' }),
        buildInvoice({
          id: INVOICE_ID_2,
          invoice_number: 'INV-202603-002',
          status: 'partially_paid',
        }),
      ]);

      const job = buildMockJob(OVERDUE_DETECTION_JOB, {
        tenant_id: TENANT_ID,
      });

      await processor.process(job);

      // Should query for issued or partially_paid invoices past due
      expect(mockTx.invoice.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          status: { in: ['issued', 'partially_paid'] },
          due_date: { lt: expect.any(Date) },
          last_overdue_notified_at: null,
        },
        select: {
          id: true,
          invoice_number: true,
          status: true,
        },
      });

      // Should update both invoices to overdue
      expect(mockTx.invoice.update).toHaveBeenCalledTimes(2);
      expect(mockTx.invoice.update).toHaveBeenCalledWith({
        where: { id: INVOICE_ID_1 },
        data: {
          status: 'overdue',
          last_overdue_notified_at: expect.any(Date),
        },
      });
      expect(mockTx.invoice.update).toHaveBeenCalledWith({
        where: { id: INVOICE_ID_2 },
        data: {
          status: 'overdue',
          last_overdue_notified_at: expect.any(Date),
        },
      });
    });

    it('should handle no overdue invoices gracefully', async () => {
      mockTx.invoice.findMany.mockResolvedValue([]);

      const job = buildMockJob(OVERDUE_DETECTION_JOB, {
        tenant_id: TENANT_ID,
      });

      await processor.process(job);

      expect(mockTx.invoice.update).not.toHaveBeenCalled();
    });
  });

  // ─── Overdue installments ─────────────────────────────────────────────

  describe('process — overdue installments', () => {
    it('should mark pending installments past due as overdue', async () => {
      mockTx.invoice.findMany.mockResolvedValue([]);
      mockTx.installment.updateMany.mockResolvedValue({ count: 4 });

      const job = buildMockJob(OVERDUE_DETECTION_JOB, {
        tenant_id: TENANT_ID,
      });

      await processor.process(job);

      expect(mockTx.installment.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          status: 'pending',
          due_date: { lt: expect.any(Date) },
        },
        data: {
          status: 'overdue',
        },
      });
    });
  });

  // ─── Custom cutoff date ───────────────────────────────────────────────

  describe('process — as_of_date override', () => {
    it('should use as_of_date when provided instead of current date', async () => {
      mockTx.invoice.findMany.mockResolvedValue([]);

      const asOfDate = '2026-01-15T00:00:00.000Z';

      const job = buildMockJob(OVERDUE_DETECTION_JOB, {
        tenant_id: TENANT_ID,
        as_of_date: asOfDate,
      });

      await processor.process(job);

      const invoiceCallArgs = mockTx.invoice.findMany.mock.calls[0][0];
      const actualCutoff = invoiceCallArgs.where.due_date.lt as Date;

      // The cutoff should match the provided as_of_date
      expect(actualCutoff.toISOString()).toBe(new Date(asOfDate).toISOString());
    });
  });

  // ─── Logging ──────────────────────────────────────────────────────────

  describe('process — logging', () => {
    it('should log the processing start message', async () => {
      mockTx.invoice.findMany.mockResolvedValue([]);

      const logSpy = jest.spyOn(processor['logger'], 'log');

      const job = buildMockJob(OVERDUE_DETECTION_JOB, {
        tenant_id: TENANT_ID,
      });

      await processor.process(job);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(OVERDUE_DETECTION_JOB));
    });
  });
});
