/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { InvoicesService } from './invoices.service';
import { RefundsService } from './refunds.service';
import { StripeService } from './stripe.service';

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID = 'user-uuid-1111';
const APPROVER_ID = 'approver-uuid-1111';
const REFUND_ID = 'ref-uuid-1111';
const PAYMENT_ID = 'pay-uuid-1111';

const mockPrisma = {
  refund: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  payment: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  paymentAllocation: {
    findMany: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
};

const mockSequenceService = {
  nextNumber: jest.fn().mockResolvedValue('REF-202603-000001'),
};

const mockInvoicesService = {
  recalculateBalance: jest.fn(),
};

const mockStripeService = {
  processRefund: jest.fn(),
};

const makeRefund = (overrides: Record<string, unknown> = {}) => ({
  id: REFUND_ID,
  tenant_id: TENANT_ID,
  payment_id: PAYMENT_ID,
  refund_reference: 'REF-202603-000001',
  amount: '200.00',
  status: 'pending_approval',
  reason: 'Duplicate payment',
  requested_by_user_id: USER_ID,
  approved_by_user_id: null,
  failure_reason: null,
  executed_at: null,
  created_at: new Date(),
  ...overrides,
});

describe('RefundsService', () => {
  let service: RefundsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: StripeService, useValue: mockStripeService },
      ],
    }).compile();

    service = module.get<RefundsService>(RefundsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated refunds with numeric amounts', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([
        {
          ...makeRefund(),
          payment: {
            id: PAYMENT_ID,
            payment_reference: 'PAY-001',
            amount: '500.00',
            household: { id: 'hh-1', household_name: 'Smith' },
          },
          requested_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
          approved_by: null,
        },
      ]);
      mockPrisma.refund.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.amount).toBe(200);
      expect(result.data[0]?.payment.amount).toBe(500);
    });

    it('should filter by status', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, status: 'pending_approval' });

      expect(mockPrisma.refund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'pending_approval' }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should create a refund request', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        status: 'posted',
        refunds: [],
        allocations: [],
      });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.refund.create.mockResolvedValue({
        ...makeRefund(),
        payment: { id: PAYMENT_ID, payment_reference: 'PAY-001', amount: '500.00' },
        requested_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
      });

      const result = (await service.create(TENANT_ID, USER_ID, {
        payment_id: PAYMENT_ID,
        amount: 200,
        reason: 'Duplicate payment',
      })) as { amount: number; status: string };

      expect(result.amount).toBe(200);
      expect(result.status).toBe('pending_approval');
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          payment_id: 'bad',
          amount: 100,
          reason: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when refund exceeds available', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        status: 'posted',
        refunds: [{ status: 'approved', amount: '400.00' }],
        allocations: [],
      });

      await expect(
        service.create(TENANT_ID, USER_ID, {
          payment_id: PAYMENT_ID,
          amount: 200,
          reason: 'Too much',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid payment status', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        status: 'refunded_full',
        refunds: [],
        allocations: [],
      });

      await expect(
        service.create(TENANT_ID, USER_ID, {
          payment_id: PAYMENT_ID,
          amount: 100,
          reason: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('should approve a pending refund', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(makeRefund());
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.approve(TENANT_ID, REFUND_ID, APPROVER_ID);

      expect(result.status).toBe('approved');
    });

    it('should throw NotFoundException when refund not found', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(null);

      await expect(service.approve(TENANT_ID, 'bad-id', APPROVER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for self-approval', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(makeRefund());

      await expect(service.approve(TENANT_ID, REFUND_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when status is not pending', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(makeRefund());
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve(TENANT_ID, REFUND_ID, APPROVER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reject', () => {
    it('should reject a pending refund', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(makeRefund());
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.reject(TENANT_ID, REFUND_ID, APPROVER_ID, 'Not valid');

      expect(result.status).toBe('rejected');
    });

    it('should throw NotFoundException when refund not found', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(null);

      await expect(service.reject(TENANT_ID, 'bad-id', APPROVER_ID, 'Nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('execute', () => {
    it('should throw NotFoundException when refund not found', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(null);

      await expect(service.execute(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when not approved', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(makeRefund({ status: 'pending_approval' }));

      await expect(service.execute(TENANT_ID, REFUND_ID)).rejects.toThrow(BadRequestException);
    });

    it('should execute an approved refund and update payment status to refunded_full', async () => {
      mockPrisma.refund.findFirst
        .mockResolvedValueOnce(makeRefund({ status: 'approved' })) // initial find
        .mockResolvedValueOnce(makeRefund({ status: 'executed', executed_at: new Date() })); // re-read after update
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '200.00',
        refunds: [{ status: 'executed', amount: '200.00' }],
      });
      mockPrisma.payment.update.mockResolvedValue({ id: PAYMENT_ID, status: 'refunded_full' });

      const result = (await service.execute(TENANT_ID, REFUND_ID)) as { amount: number };

      expect(result.amount).toBe(200);
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'refunded_full' },
        }),
      );
    });

    it('should set payment status to refunded_partial when partial refund', async () => {
      mockPrisma.refund.findFirst
        .mockResolvedValueOnce(makeRefund({ status: 'approved', amount: '100.00' }))
        .mockResolvedValueOnce(makeRefund({ status: 'executed', amount: '100.00' }));
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        refunds: [{ status: 'executed', amount: '100.00' }],
      });
      mockPrisma.payment.update.mockResolvedValue({ id: PAYMENT_ID, status: 'refunded_partial' });

      await service.execute(TENANT_ID, REFUND_ID);

      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'refunded_partial' },
        }),
      );
    });

    it('should keep payment status as posted when zero total refunded (excluded non-executed)', async () => {
      mockPrisma.refund.findFirst
        .mockResolvedValueOnce(makeRefund({ status: 'approved', amount: '100.00' }))
        .mockResolvedValueOnce(makeRefund({ status: 'executed', amount: '100.00' }));
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        refunds: [
          { status: 'rejected', amount: '100.00' },
          { status: 'pending_approval', amount: '200.00' },
        ], // No executed refunds
      });
      mockPrisma.payment.update.mockResolvedValue({});

      await service.execute(TENANT_ID, REFUND_ID);

      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'posted' },
        }),
      );
    });

    it('should throw BadRequestException on concurrent execution (updateMany returns 0)', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(makeRefund({ status: 'approved' }));
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 0 }); // concurrent execution

      await expect(service.execute(TENANT_ID, REFUND_ID)).rejects.toThrow(BadRequestException);
    });

    it('should reverse allocations LIFO with full and partial reversal', async () => {
      mockPrisma.refund.findFirst
        .mockResolvedValueOnce(makeRefund({ status: 'approved', amount: '350.00' }))
        .mockResolvedValueOnce(makeRefund({ status: 'executed', amount: '350.00' }));
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 1 });
      // LIFO: newest first
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([
        {
          id: 'alloc-2',
          allocated_amount: '200.00',
          invoice_id: 'inv-2',
          created_at: new Date('2026-03-02'),
        },
        {
          id: 'alloc-1',
          allocated_amount: '300.00',
          invoice_id: 'inv-1',
          created_at: new Date('2026-03-01'),
        },
      ]);
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00', // Total payment
        refunds: [{ status: 'executed', amount: '350.00' }],
      });
      mockPrisma.paymentAllocation.delete.mockResolvedValue({});
      mockPrisma.paymentAllocation.update.mockResolvedValue({});
      mockPrisma.payment.update.mockResolvedValue({});
      mockInvoicesService.recalculateBalance.mockResolvedValue(undefined);

      await service.execute(TENANT_ID, REFUND_ID);

      // alloc-2 (200) should be fully deleted (200 <= 350)
      expect(mockPrisma.paymentAllocation.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'alloc-2' } }),
      );
      // alloc-1 (300) should be partially reversed (150 of 300) => updated to 150
      expect(mockPrisma.paymentAllocation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'alloc-1' },
          data: { allocated_amount: 150 },
        }),
      );
      // recalculateBalance should be called for both invoices
      expect(mockInvoicesService.recalculateBalance).toHaveBeenCalledTimes(2);
    });

    it('should deduct from unallocated amount first during LIFO reversal', async () => {
      mockPrisma.refund.findFirst
        .mockResolvedValueOnce(makeRefund({ status: 'approved', amount: '100.00' }))
        .mockResolvedValueOnce(makeRefund({ status: 'executed', amount: '100.00' }));
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 1 });
      // Only 300 allocated of 500 total => 200 unallocated
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([
        { id: 'alloc-1', allocated_amount: '300.00', invoice_id: 'inv-1', created_at: new Date() },
      ]);
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        refunds: [{ status: 'executed', amount: '100.00' }],
      });
      mockPrisma.payment.update.mockResolvedValue({});
      mockInvoicesService.recalculateBalance.mockResolvedValue(undefined);

      await service.execute(TENANT_ID, REFUND_ID);

      // 100 refund should be fully consumed by unallocated (200), so no allocation changes
      expect(mockPrisma.paymentAllocation.delete).not.toHaveBeenCalled();
      expect(mockPrisma.paymentAllocation.update).not.toHaveBeenCalled();
    });
  });

  describe('create — void/written-off invoice guard', () => {
    it('should throw BadRequestException when payment allocated to void invoice', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        status: 'posted',
        refunds: [],
        allocations: [{ invoice: { id: 'inv-1', status: 'void' } }],
      });

      await expect(
        service.create(TENANT_ID, USER_ID, {
          payment_id: PAYMENT_ID,
          amount: 100,
          reason: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when payment allocated to written_off invoice', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        status: 'posted',
        refunds: [],
        allocations: [{ invoice: { id: 'inv-1', status: 'written_off' } }],
      });

      await expect(
        service.create(TENANT_ID, USER_ID, {
          payment_id: PAYMENT_ID,
          amount: 100,
          reason: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should exclude rejected and failed refunds from total when calculating available', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        status: 'posted',
        refunds: [
          { status: 'rejected', amount: '300.00' },
          { status: 'failed', amount: '100.00' },
          { status: 'executed', amount: '100.00' },
        ],
        allocations: [],
      });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.refund.create.mockResolvedValue({
        ...makeRefund({ amount: '350.00' }),
        payment: { id: PAYMENT_ID, payment_reference: 'PAY-001', amount: '500.00' },
        requested_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
      });

      // Available = 500 - 100 (executed) = 400. Requesting 350 should succeed.
      const result = (await service.create(TENANT_ID, USER_ID, {
        payment_id: PAYMENT_ID,
        amount: 350,
        reason: 'Partial refund',
      })) as { amount: number };

      expect(result.amount).toBe(350);
    });

    it('should allow refund from refunded_partial status', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        amount: '500.00',
        status: 'refunded_partial',
        refunds: [{ status: 'executed', amount: '100.00' }],
        allocations: [],
      });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({ receipt_prefix: 'REC' });
      mockPrisma.refund.create.mockResolvedValue({
        ...makeRefund({ amount: '200.00' }),
        payment: { id: PAYMENT_ID, payment_reference: 'PAY-001', amount: '500.00' },
        requested_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
      });

      const result = (await service.create(TENANT_ID, USER_ID, {
        payment_id: PAYMENT_ID,
        amount: 200,
        reason: 'Additional refund',
      })) as { amount: number };

      expect(result.amount).toBe(200);
    });
  });

  describe('findAll — filter branches', () => {
    it('should filter by payment_id', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, payment_id: PAYMENT_ID });

      expect(mockPrisma.refund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ payment_id: PAYMENT_ID }),
        }),
      );
    });
  });

  describe('reject — concurrent status check', () => {
    it('should throw BadRequestException when updateMany returns 0 (concurrent modification)', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(makeRefund());
      mockPrisma.refund.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reject(TENANT_ID, REFUND_ID, APPROVER_ID, 'Nope')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
