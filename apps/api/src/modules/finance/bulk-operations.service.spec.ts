import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BulkOperationsService } from './bulk-operations.service';
import { InvoicesService } from './invoices.service';
import { PaymentRemindersService } from './payment-reminders.service';

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID = 'user-uuid-1111';
const INVOICE_1 = 'invoice-uuid-0001';
const INVOICE_2 = 'invoice-uuid-0002';

const mockPrisma = {
  invoice: {
    findMany: jest.fn(),
  },
  invoiceReminder: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const mockInvoicesService = {
  issue: jest.fn(),
  voidInvoice: jest.fn(),
};

const mockPaymentRemindersService = {};

describe('BulkOperationsService', () => {
  let service: BulkOperationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkOperationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: PaymentRemindersService, useValue: mockPaymentRemindersService },
      ],
    }).compile();

    service = module.get<BulkOperationsService>(BulkOperationsService);
    jest.clearAllMocks();
  });

  describe('bulkIssue', () => {
    it('should issue all provided invoices and return success count', async () => {
      mockInvoicesService.issue.mockResolvedValue({ id: INVOICE_1, status: 'issued' });

      const result = await service.bulkIssue(TENANT_ID, USER_ID, {
        invoice_ids: [INVOICE_1, INVOICE_2],
      });

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should capture errors per invoice and continue', async () => {
      mockInvoicesService.issue
        .mockResolvedValueOnce({ id: INVOICE_1, status: 'issued' })
        .mockRejectedValueOnce(new Error('Invalid status'));

      const result = await service.bulkIssue(TENANT_ID, USER_ID, {
        invoice_ids: [INVOICE_1, INVOICE_2],
      });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]?.invoice_id).toBe(INVOICE_2);
    });
  });

  describe('bulkVoid', () => {
    it('should void all provided invoices', async () => {
      mockInvoicesService.voidInvoice.mockResolvedValue({ id: INVOICE_1, status: 'void' });

      const result = await service.bulkVoid(TENANT_ID, { invoice_ids: [INVOICE_1] });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
    });
  });

  describe('bulkRemind', () => {
    it('should throw BadRequestException with no invoice IDs', async () => {
      await expect(service.bulkRemind(TENANT_ID, { invoice_ids: [] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should skip invoices already reminded today', async () => {
      mockPrisma.invoiceReminder.findFirst.mockResolvedValue({ id: 'r1' });

      const result = await service.bulkRemind(TENANT_ID, { invoice_ids: [INVOICE_1] });

      expect(result.succeeded).toBe(1);
      expect(mockPrisma.invoiceReminder.create).not.toHaveBeenCalled();
    });

    it('should create reminder records for non-reminded invoices', async () => {
      mockPrisma.invoiceReminder.findFirst.mockResolvedValue(null);
      mockPrisma.invoiceReminder.create.mockResolvedValue({ id: 'r1' });

      const result = await service.bulkRemind(TENANT_ID, { invoice_ids: [INVOICE_1, INVOICE_2] });

      expect(result.succeeded).toBe(2);
      expect(mockPrisma.invoiceReminder.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('bulkExport', () => {
    it('should return serialized invoices with correct number types', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: INVOICE_1,
          total_amount: '1000.00',
          balance_amount: '500.00',
          subtotal_amount: '1000.00',
          discount_amount: '0.00',
          household: { id: 'hh-1', household_name: 'Smith' },
          lines: [
            {
              id: 'line-1',
              quantity: '1.00',
              unit_amount: '1000.00',
              line_total: '1000.00',
            },
          ],
        },
      ]);

      const result = await service.bulkExport(TENANT_ID, {
        invoice_ids: [INVOICE_1],
        format: 'csv',
      });

      expect(result.format).toBe('csv');
      const inv = result.invoices[0] as Record<string, unknown>;
      expect(inv['total_amount']).toBe(1000);
      expect(inv['balance_amount']).toBe(500);
    });

    it('should use default format when not specified', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.bulkExport(TENANT_ID, {
        invoice_ids: [INVOICE_1],
      });

      expect(result.format).toBe('csv');
    });
  });

  describe('bulkVoid — error handling', () => {
    it('should capture errors per invoice and continue', async () => {
      mockInvoicesService.voidInvoice
        .mockResolvedValueOnce({ id: INVOICE_1, status: 'void' })
        .mockRejectedValueOnce(new Error('Payments exist'));

      const result = await service.bulkVoid(TENANT_ID, {
        invoice_ids: [INVOICE_1, INVOICE_2],
      });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]?.invoice_id).toBe(INVOICE_2);
      expect(result.errors[0]?.error).toBe('Payments exist');
    });
  });

  describe('bulkRemind — error handling', () => {
    it('should capture errors per invoice and continue', async () => {
      mockPrisma.invoiceReminder.findFirst
        .mockResolvedValueOnce(null) // first invoice: no recent reminder
        .mockRejectedValueOnce(new Error('DB error')); // second invoice: error

      mockPrisma.invoiceReminder.create.mockResolvedValue({ id: 'r1' });

      const result = await service.bulkRemind(TENANT_ID, {
        invoice_ids: [INVOICE_1, INVOICE_2],
      });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]?.invoice_id).toBe(INVOICE_2);
    });

    it('should handle non-Error thrown objects', async () => {
      mockInvoicesService.issue
        .mockResolvedValueOnce({ id: INVOICE_1, status: 'issued' })
        .mockRejectedValueOnce('string error');

      const result = await service.bulkIssue(TENANT_ID, USER_ID, {
        invoice_ids: [INVOICE_1, INVOICE_2],
      });

      expect(result.failed).toBe(1);
      expect(result.errors[0]?.error).toBe('Unknown error');
    });
  });
});
