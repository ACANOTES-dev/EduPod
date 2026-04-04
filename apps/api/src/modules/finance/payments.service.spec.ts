/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import {
  MOCK_FACADE_PROVIDERS,
  HouseholdReadFacade,
  TenantReadFacade,
} from '../../common/tests/mock-facades';
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
  $queryRawUnsafe: jest.fn(),
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

  let mockHouseholdReadFacade: { existsOrThrow: jest.Mock };

  beforeEach(async () => {
    mockHouseholdReadFacade = {
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: ReceiptsService, useValue: mockReceiptsService },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: HouseholdReadFacade, useValue: mockHouseholdReadFacade },
        {
          provide: TenantReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' }),
          },
        },
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
      mockHouseholdReadFacade.existsOrThrow.mockRejectedValue(
        new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Not found' }),
      );

      await expect(
        service.createManual(TENANT_ID, USER_ID, {
          household_id: 'bad',
          payment_method: 'cash',
          amount: 500,
          received_at: '2026-03-24',
        }),
      ).rejects.toThrow(NotFoundException);
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

    it('should successfully allocate payment to invoice and update balance', async () => {
      // Pre-transaction: payment is posted
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'posted' }));
      // Inside transaction: SELECT FOR UPDATE on payment
      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, ..._args: unknown[]) => {
          if (sql.includes('FROM public.payments')) {
            return [{ id: PAYMENT_ID, amount: '500.00', status: 'posted', household_id: HOUSEHOLD_ID }];
          }
          if (sql.includes('FROM public.invoices')) {
            return [{ id: INVOICE_ID, balance_amount: '300.00', household_id: HOUSEHOLD_ID, invoice_number: 'INV-001' }];
          }
          return [];
        },
      );
      // No existing allocations
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);
      mockPrisma.paymentAllocation.create.mockResolvedValue({});
      mockInvoicesService.recalculateBalance.mockResolvedValue(undefined);
      // No existing receipt
      mockPrisma.receipt.findFirst.mockResolvedValue(null);
      mockReceiptsService.createForPayment.mockResolvedValue({});
      // findOne after commit — return full payment
      mockPrisma.payment.findFirst.mockResolvedValue(
        makePayment({
          allocations: [{ id: 'alloc-1', allocated_amount: '300.00', invoice: { id: INVOICE_ID, invoice_number: 'INV-001', total_amount: '300.00', balance_amount: '0.00', status: 'paid' } }],
        }),
      );

      const result = await service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
        allocations: [{ invoice_id: INVOICE_ID, amount: 300 }],
      });

      expect(mockPrisma.paymentAllocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payment_id: PAYMENT_ID,
            invoice_id: INVOICE_ID,
            allocated_amount: 300,
          }),
        }),
      );
      expect(mockInvoicesService.recalculateBalance).toHaveBeenCalledWith(
        TENANT_ID,
        INVOICE_ID,
        expect.anything(),
      );
      expect(result.amount).toBe(500);
    });

    it('should throw when invoice belongs to a different household', async () => {
      const OTHER_HOUSEHOLD_ID = 'hh-uuid-9999';
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'posted' }));
      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, ..._args: unknown[]) => {
          if (sql.includes('FROM public.payments')) {
            return [{ id: PAYMENT_ID, amount: '500.00', status: 'posted', household_id: HOUSEHOLD_ID }];
          }
          if (sql.includes('FROM public.invoices')) {
            return [{ id: INVOICE_ID, balance_amount: '300.00', household_id: OTHER_HOUSEHOLD_ID, invoice_number: 'INV-001' }];
          }
          return [];
        },
      );
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);

      await expect(
        service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
          allocations: [{ invoice_id: INVOICE_ID, amount: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when allocation exceeds invoice balance', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'posted', amount: '500.00' }));
      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, ..._args: unknown[]) => {
          if (sql.includes('FROM public.payments')) {
            return [{ id: PAYMENT_ID, amount: '500.00', status: 'posted', household_id: HOUSEHOLD_ID }];
          }
          if (sql.includes('FROM public.invoices')) {
            return [{ id: INVOICE_ID, balance_amount: '100.00', household_id: HOUSEHOLD_ID, invoice_number: 'INV-001' }];
          }
          return [];
        },
      );
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);

      await expect(
        service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
          allocations: [{ invoice_id: INVOICE_ID, amount: 200 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when total allocations exceed remaining payment amount', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'posted', amount: '500.00' }));
      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, ..._args: unknown[]) => {
          if (sql.includes('FROM public.payments')) {
            return [{ id: PAYMENT_ID, amount: '500.00', status: 'posted', household_id: HOUSEHOLD_ID }];
          }
          if (sql.includes('FROM public.invoices')) {
            return [{ id: INVOICE_ID, balance_amount: '1000.00', household_id: HOUSEHOLD_ID, invoice_number: 'INV-001' }];
          }
          return [];
        },
      );
      // Already allocated 400 of 500
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([{ allocated_amount: '400.00' }]);

      await expect(
        service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
          allocations: [{ invoice_id: INVOICE_ID, amount: 200 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allocate payment across multiple invoices with partial amounts', async () => {
      const INVOICE_ID_2 = 'inv-uuid-2222';
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'posted', amount: '500.00' }));

      let invoiceCallCount = 0;
      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, id: string, ..._args: unknown[]) => {
          if (sql.includes('FROM public.payments')) {
            return [{ id: PAYMENT_ID, amount: '500.00', status: 'posted', household_id: HOUSEHOLD_ID }];
          }
          if (sql.includes('FROM public.invoices')) {
            invoiceCallCount++;
            if (id === INVOICE_ID || invoiceCallCount === 1) {
              return [{ id: INVOICE_ID, balance_amount: '300.00', household_id: HOUSEHOLD_ID, invoice_number: 'INV-001' }];
            }
            return [{ id: INVOICE_ID_2, balance_amount: '400.00', household_id: HOUSEHOLD_ID, invoice_number: 'INV-002' }];
          }
          return [];
        },
      );
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);
      mockPrisma.paymentAllocation.create.mockResolvedValue({});
      mockInvoicesService.recalculateBalance.mockResolvedValue(undefined);
      mockPrisma.receipt.findFirst.mockResolvedValue(null);
      mockReceiptsService.createForPayment.mockResolvedValue({});
      // findOne re-read after commit
      mockPrisma.payment.findFirst.mockResolvedValue(
        makePayment({
          allocations: [
            { id: 'alloc-1', allocated_amount: '300.00', invoice: { id: INVOICE_ID, invoice_number: 'INV-001', total_amount: '300.00', balance_amount: '0.00', status: 'paid' } },
            { id: 'alloc-2', allocated_amount: '200.00', invoice: { id: INVOICE_ID_2, invoice_number: 'INV-002', total_amount: '400.00', balance_amount: '200.00', status: 'partially_paid' } },
          ],
        }),
      );

      const result = await service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
        allocations: [
          { invoice_id: INVOICE_ID, amount: 300 },
          { invoice_id: INVOICE_ID_2, amount: 200 },
        ],
      });

      expect(mockPrisma.paymentAllocation.create).toHaveBeenCalledTimes(2);
      expect(mockInvoicesService.recalculateBalance).toHaveBeenCalledTimes(2);
      expect(result.amount).toBe(500);
    });

    it('should skip receipt generation when a receipt already exists', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'posted' }));
      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, ..._args: unknown[]) => {
          if (sql.includes('FROM public.payments')) {
            return [{ id: PAYMENT_ID, amount: '500.00', status: 'posted', household_id: HOUSEHOLD_ID }];
          }
          if (sql.includes('FROM public.invoices')) {
            return [{ id: INVOICE_ID, balance_amount: '500.00', household_id: HOUSEHOLD_ID, invoice_number: 'INV-001' }];
          }
          return [];
        },
      );
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);
      mockPrisma.paymentAllocation.create.mockResolvedValue({});
      mockInvoicesService.recalculateBalance.mockResolvedValue(undefined);
      // Receipt already exists
      mockPrisma.receipt.findFirst.mockResolvedValue({ id: 'rec-1', receipt_number: 'REC-001' });
      // findOne re-read
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ receipt: { id: 'rec-1', receipt_number: 'REC-001' } }));

      await service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
        allocations: [{ invoice_id: INVOICE_ID, amount: 100 }],
      });

      expect(mockReceiptsService.createForPayment).not.toHaveBeenCalled();
    });

    it('should throw when payment status changes concurrently between fetch and lock', async () => {
      // Pre-transaction: payment appears posted
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'posted' }));
      // Inside transaction: SELECT FOR UPDATE reveals status changed
      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, ..._args: unknown[]) => {
          if (sql.includes('FROM public.payments')) {
            return [{ id: PAYMENT_ID, amount: '500.00', status: 'refunded_full', household_id: HOUSEHOLD_ID }];
          }
          return [];
        },
      );
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);

      await expect(
        service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
          allocations: [{ invoice_id: INVOICE_ID, amount: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when allocating to a non-existent invoice', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'posted' }));
      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, ..._args: unknown[]) => {
          if (sql.includes('FROM public.payments')) {
            return [{ id: PAYMENT_ID, amount: '500.00', status: 'posted', household_id: HOUSEHOLD_ID }];
          }
          if (sql.includes('FROM public.invoices')) {
            return []; // invoice not found
          }
          return [];
        },
      );
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);

      await expect(
        service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
          allocations: [{ invoice_id: 'nonexistent-invoice-id', amount: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle exact boundary allocation where amount equals remaining balance', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePayment({ status: 'posted', amount: '250.75' }));
      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, ..._args: unknown[]) => {
          if (sql.includes('FROM public.payments')) {
            return [{ id: PAYMENT_ID, amount: '250.75', status: 'posted', household_id: HOUSEHOLD_ID }];
          }
          if (sql.includes('FROM public.invoices')) {
            return [{ id: INVOICE_ID, balance_amount: '250.75', household_id: HOUSEHOLD_ID, invoice_number: 'INV-001' }];
          }
          return [];
        },
      );
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([]);
      mockPrisma.paymentAllocation.create.mockResolvedValue({});
      mockInvoicesService.recalculateBalance.mockResolvedValue(undefined);
      mockPrisma.receipt.findFirst.mockResolvedValue(null);
      mockReceiptsService.createForPayment.mockResolvedValue({});
      // findOne re-read
      mockPrisma.payment.findFirst.mockResolvedValue(
        makePayment({
          amount: '250.75',
          allocations: [{ id: 'alloc-1', allocated_amount: '250.75', invoice: { id: INVOICE_ID, invoice_number: 'INV-001', total_amount: '250.75', balance_amount: '0.00', status: 'paid' } }],
        }),
      );

      const result = await service.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
        allocations: [{ invoice_id: INVOICE_ID, amount: 250.75 }],
      });

      expect(mockPrisma.paymentAllocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allocated_amount: 250.75,
          }),
        }),
      );
      expect(result.amount).toBe(250.75);
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
