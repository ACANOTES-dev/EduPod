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

    it('should execute an approved refund and update payment status', async () => {
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
    });
  });
});
