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
import { PaymentsService } from './payments.service';
import { ReceiptsService } from './receipts.service';

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID = 'user-uuid-1111';
const PAYMENT_ID = 'pay-uuid-1111';
const HOUSEHOLD_ID = 'hh-uuid-1111';
const INVOICE_ID = 'inv-uuid-1111';

const mockPrisma = {
  payment: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  paymentAllocation: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  invoice: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  household: {
    findFirst: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  receipt: {
    findFirst: jest.fn(),
  },
};

const mockInvoicesService = {
  recalculateBalance: jest.fn(),
};

const mockReceiptsService = {
  createForPayment: jest.fn(),
};

const mockSequenceService = {
  nextNumber: jest.fn().mockResolvedValue('PAY-202603-000001'),
};

const makePayment = (overrides: Record<string, unknown> = {}) => ({
  id: PAYMENT_ID,
  tenant_id: TENANT_ID,
  household_id: HOUSEHOLD_ID,
  payment_reference: 'PAY-202603-000001',
  payment_method: 'cash',
  amount: '500.00',
  currency_code: 'EUR',
  status: 'posted',
  received_at: new Date(),
  posted_by_user_id: USER_ID,
  reason: null,
  household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
  posted_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
  receipt: null,
  _count: { allocations: 0 },
  allocations: [],
  refunds: [],
  created_at: new Date(),
  ...overrides,
});

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: ReceiptsService, useValue: mockReceiptsService },
        { provide: SequenceService, useValue: mockSequenceService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated payments with numeric amounts', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);
      mockPrisma.payment.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.amount).toBe(500);
    });

    it('should filter by household_id', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, household_id: HOUSEHOLD_ID });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ household_id: HOUSEHOLD_ID }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return payment with numeric values', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment());

      const result = await service.findOne(TENANT_ID, PAYMENT_ID);

      expect(result.amount).toBe(500);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createManual', () => {
    it('should create a manual payment', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.payment.create.mockResolvedValue(makePayment());

      const result = await service.createManual(TENANT_ID, USER_ID, {
        household_id: HOUSEHOLD_ID,
        payment_method: 'cash',
        amount: 500,
        received_at: '2026-03-24',
      });

      expect(result.amount).toBe(500);
      expect(result.payment_reference).toBe('PAY-202603-000001');
    });

    it('should throw BadRequestException when household not found', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(null);

      await expect(
        service.createManual(TENANT_ID, USER_ID, {
          household_id: 'bad',
          payment_method: 'cash',
          amount: 500,
          received_at: '2026-03-24',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('suggestAllocations', () => {
    it('should suggest FIFO allocations', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ amount: '500.00' }));
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]); // no existing allocations
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: INVOICE_ID,
          invoice_number: 'INV-001',
          balance_amount: '300.00',
          due_date: new Date('2026-03-01'),
        },
        {
          id: 'inv-2',
          invoice_number: 'INV-002',
          balance_amount: '400.00',
          due_date: new Date('2026-04-01'),
        },
      ]);

      const result = await service.suggestAllocations(TENANT_ID, PAYMENT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]?.suggested_amount).toBe(300);
      expect(result[1]?.suggested_amount).toBe(200);
    });

    it('should return empty when no remaining balance', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ amount: '500.00' }));
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([{ allocated_amount: '500.00' }]);

      const result = await service.suggestAllocations(TENANT_ID, PAYMENT_ID);

      expect(result).toEqual([]);
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.suggestAllocations(TENANT_ID, 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirmAllocations', () => {
    it('should throw NotFoundException when payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmAllocations(TENANT_ID, 'bad-id', USER_ID, {
          allocations: [{ invoice_id: INVOICE_ID, amount: 100 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when payment not posted', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'refunded_full' }));

      await expect(
        service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
          allocations: [{ invoice_id: INVOICE_ID, amount: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAcceptingStaff', () => {
    it('should return distinct staff members who posted payments', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { posted_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' } },
      ]);

      const result = await service.getAcceptingStaff(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('John Doe');
    });
  });
});
