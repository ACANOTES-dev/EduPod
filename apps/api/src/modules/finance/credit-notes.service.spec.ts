/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { MOCK_FACADE_PROVIDERS, HouseholdReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { CreditNotesService } from './credit-notes.service';
import { InvoicesService } from './invoices.service';

const mockPrisma = {
  creditNote: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  household: {
    findFirst: jest.fn(),
  },
  invoice: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  creditNoteApplication: {
    create: jest.fn(),
  },
};

const mockSequenceService = {
  nextNumber: jest.fn().mockResolvedValue('CN-202603-000001'),
};

const mockInvoicesService = {
  findOne: jest.fn(),
};

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID = 'user-uuid-1111';
const HOUSEHOLD_ID = 'household-uuid-1111';
const INVOICE_ID = 'invoice-uuid-1111';
const CN_ID = 'cn-uuid-1111';

describe('CreditNotesService', () => {
  let service: CreditNotesService;

  let mockHouseholdReadFacade: { existsOrThrow: jest.Mock };

  beforeEach(async () => {
    mockHouseholdReadFacade = {
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        CreditNotesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: HouseholdReadFacade, useValue: mockHouseholdReadFacade },
      ],
    }).compile();

    service = module.get<CreditNotesService>(CreditNotesService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated credit notes', async () => {
      const cn = { id: CN_ID, amount: '500.00', remaining_balance: '500.00', applications: [] };
      mockPrisma.creditNote.findMany.mockResolvedValue([cn]);
      mockPrisma.creditNote.count.mockResolvedValue(1);

      const result = (await service.findAll(TENANT_ID, { page: 1, pageSize: 20 })) as {
        data: Array<{ amount: number }>;
        meta: { total: number };
      };

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.amount).toBe(500);
    });

    it('should filter by household_id when provided', async () => {
      mockPrisma.creditNote.findMany.mockResolvedValue([]);
      mockPrisma.creditNote.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, household_id: HOUSEHOLD_ID });

      expect(mockPrisma.creditNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ household_id: HOUSEHOLD_ID }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should create a credit note with a sequence number', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.creditNote.create.mockResolvedValue({
        id: CN_ID,
        credit_note_number: 'CN-202603-000001',
        amount: '500.00',
        remaining_balance: '500.00',
        applications: [],
      });

      const result = (await service.create(TENANT_ID, USER_ID, {
        household_id: HOUSEHOLD_ID,
        amount: 500,
        reason: 'Overpayment correction',
      })) as { credit_note_number: string; amount: number };

      expect(result.credit_note_number).toBe('CN-202603-000001');
      expect(result.amount).toBe(500);
    });

    it('should throw NotFoundException when household not found', async () => {
      mockHouseholdReadFacade.existsOrThrow.mockRejectedValue(
        new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Not found' }),
      );

      await expect(
        service.create(TENANT_ID, USER_ID, {
          household_id: HOUSEHOLD_ID,
          amount: 500,
          reason: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('applyToInvoice', () => {
    it('should throw NotFoundException when credit note not found', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue(null);

      await expect(
        service.applyToInvoice(TENANT_ID, USER_ID, {
          credit_note_id: CN_ID,
          invoice_id: INVOICE_ID,
          applied_amount: 100,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when insufficient balance', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue({
        id: CN_ID,
        remaining_balance: '50.00',
      });

      await expect(
        service.applyToInvoice(TENANT_ID, USER_ID, {
          credit_note_id: CN_ID,
          invoice_id: INVOICE_ID,
          applied_amount: 200,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-applicable invoice status', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue({
        id: CN_ID,
        remaining_balance: '500.00',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'draft',
        balance_amount: '300.00',
      });

      await expect(
        service.applyToInvoice(TENANT_ID, USER_ID, {
          credit_note_id: CN_ID,
          invoice_id: INVOICE_ID,
          applied_amount: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue({
        id: CN_ID,
        remaining_balance: '500.00',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.applyToInvoice(TENANT_ID, USER_ID, {
          credit_note_id: CN_ID,
          invoice_id: 'bad-id',
          applied_amount: 100,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when invoice has zero balance', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue({
        id: CN_ID,
        remaining_balance: '500.00',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '0.00',
      });

      await expect(
        service.applyToInvoice(TENANT_ID, USER_ID, {
          credit_note_id: CN_ID,
          invoice_id: INVOICE_ID,
          applied_amount: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should apply credit note to invoice and set status to paid when balance becomes zero', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue({
        id: CN_ID,
        remaining_balance: '500.00',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '200.00',
      });
      mockPrisma.creditNoteApplication.create.mockResolvedValue({});
      mockPrisma.creditNote.update.mockResolvedValue({});
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.applyToInvoice(TENANT_ID, USER_ID, {
        credit_note_id: CN_ID,
        invoice_id: INVOICE_ID,
        applied_amount: 200,
      });

      expect(result).toEqual({
        applied_amount: 200,
        invoice_id: INVOICE_ID,
        credit_note_id: CN_ID,
      });

      // Should update invoice status to 'paid' since balance becomes 0
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance_amount: 0,
            status: 'paid',
          }),
        }),
      );

      // Should reduce credit note remaining balance
      expect(mockPrisma.creditNote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { remaining_balance: 300 },
        }),
      );
    });

    it('should cap applied amount to invoice balance when requested amount exceeds it', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue({
        id: CN_ID,
        remaining_balance: '500.00',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '100.00',
      });
      mockPrisma.creditNoteApplication.create.mockResolvedValue({});
      mockPrisma.creditNote.update.mockResolvedValue({});
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.applyToInvoice(TENANT_ID, USER_ID, {
        credit_note_id: CN_ID,
        invoice_id: INVOICE_ID,
        applied_amount: 300, // Requested 300 but invoice only has 100
      });

      expect(result.applied_amount).toBe(100);
    });

    it('should set invoice status to partially_paid when balance not fully covered', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue({
        id: CN_ID,
        remaining_balance: '500.00',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '500.00',
      });
      mockPrisma.creditNoteApplication.create.mockResolvedValue({});
      mockPrisma.creditNote.update.mockResolvedValue({});
      mockPrisma.invoice.update.mockResolvedValue({});

      await service.applyToInvoice(TENANT_ID, USER_ID, {
        credit_note_id: CN_ID,
        invoice_id: INVOICE_ID,
        applied_amount: 200,
      });

      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance_amount: 300,
            status: 'partially_paid',
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return serialized credit note with numeric amounts', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue({
        id: CN_ID,
        amount: '500.00',
        remaining_balance: '300.00',
        applications: [{ applied_amount: '200.00', applied_at: new Date() }],
      });

      const result = (await service.findOne(TENANT_ID, CN_ID)) as {
        amount: number;
        remaining_balance: number;
        applications: Array<{ applied_amount: number }>;
      };

      expect(result.amount).toBe(500);
      expect(result.remaining_balance).toBe(300);
      expect(result.applications[0]?.applied_amount).toBe(200);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.creditNote.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll — serialize without applications', () => {
    it('should handle credit notes without applications array', async () => {
      mockPrisma.creditNote.findMany.mockResolvedValue([
        { id: CN_ID, amount: '100.00', remaining_balance: '100.00' },
      ]);
      mockPrisma.creditNote.count.mockResolvedValue(1);

      const result = (await service.findAll(TENANT_ID, { page: 1, pageSize: 20 })) as {
        data: Array<{ amount: number; applications: unknown }>;
      };

      expect(result.data[0]?.amount).toBe(100);
      expect(result.data[0]?.applications).toBeUndefined();
    });
  });
});
