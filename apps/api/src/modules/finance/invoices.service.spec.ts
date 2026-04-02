/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { InvoicesService } from './invoices.service';

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID = 'user-uuid-1111';
const INVOICE_ID = 'inv-uuid-1111';
const HOUSEHOLD_ID = 'hh-uuid-1111';

const mockPrisma = {
  invoice: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  invoiceLine: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  household: {
    findFirst: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
  installment: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
};

const mockSequenceService = {
  nextNumber: jest.fn().mockResolvedValue('INV-202603-000001'),
};

const mockApprovalRequestsService = {
  checkAndCreateIfNeeded: jest.fn(),
  cancel: jest.fn(),
};

const mockSettingsService = {
  getSettings: jest.fn(),
};

const makeInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  tenant_id: TENANT_ID,
  household_id: HOUSEHOLD_ID,
  invoice_number: 'INV-202603-000001',
  status: 'draft',
  due_date: new Date('2026-04-01'),
  subtotal_amount: '1000.00',
  discount_amount: '0.00',
  total_amount: '1000.00',
  balance_amount: '1000.00',
  write_off_amount: null,
  currency_code: 'EUR',
  created_by_user_id: USER_ID,
  approval_request_id: null,
  household: { id: HOUSEHOLD_ID, household_name: 'Smith Family' },
  lines: [
    {
      id: 'line-1',
      description: 'Tuition',
      quantity: '1',
      unit_amount: '1000.00',
      line_total: '1000.00',
      student_id: null,
    },
  ],
  installments: [],
  payment_allocations: [],
  approval_request: null,
  created_at: new Date(),
  updated_at: new Date(),
  issue_date: null,
  ...overrides,
});

describe('InvoicesService', () => {
  let service: InvoicesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: ApprovalRequestsService, useValue: mockApprovalRequestsService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated invoices with numeric amounts', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice()]);
      mockPrisma.invoice.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.total_amount).toBe(1000);
    });

    it('should filter by status', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.invoice.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, status: 'issued' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['issued'] },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return serialized invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());

      const result = await service.findOne(TENANT_ID, INVOICE_ID);

      expect(result.total_amount).toBe(1000);
      expect(result.balance_amount).toBe(1000);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create an invoice with lines', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({ invoice_prefix: 'INV' });
      mockPrisma.invoice.create.mockResolvedValue(makeInvoice());

      const result = (await service.create(TENANT_ID, USER_ID, {
        household_id: HOUSEHOLD_ID,
        due_date: '2026-04-01',
        lines: [{ description: 'Tuition', quantity: 1, unit_amount: 1000 }],
      })) as { invoice_number: string; total_amount: number };

      expect(result.invoice_number).toBe('INV-202603-000001');
      expect(result.total_amount).toBe(1000);
    });

    it('should throw BadRequestException when household not found', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          household_id: 'bad',
          due_date: '2026-04-01',
          lines: [{ description: 'X', quantity: 1, unit_amount: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, 'bad-id', {
          due_date: '2026-05-01',
          expected_updated_at: new Date().toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when not draft', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'issued' }));

      await expect(
        service.update(TENANT_ID, INVOICE_ID, {
          due_date: '2026-05-01',
          expected_updated_at: new Date().toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on concurrent modification', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({ updated_at: new Date('2026-01-01T00:00:00Z') }),
      );

      await expect(
        service.update(TENANT_ID, INVOICE_ID, {
          due_date: '2026-05-01',
          expected_updated_at: '2020-01-01T00:00:00Z',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('issue', () => {
    it('should issue a draft invoice directly when no approval required', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      mockSettingsService.getSettings.mockResolvedValue({
        finance: { requireApprovalForInvoiceIssue: false },
      });
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'issued' }));

      const result = await service.issue(TENANT_ID, INVOICE_ID, USER_ID, true);

      expect((result as Record<string, unknown>).status).toBe('issued');
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.issue(TENANT_ID, 'bad-id', USER_ID, true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when not draft', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'paid' }));

      await expect(service.issue(TENANT_ID, INVOICE_ID, USER_ID, true)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('voidInvoice', () => {
    it('should void an issued invoice with no payments', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'issued' }));
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'void' }));

      const result = await service.voidInvoice(TENANT_ID, INVOICE_ID);

      expect((result as Record<string, unknown>).status).toBe('void');
    });

    it('should throw BadRequestException when payments exist', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({ status: 'issued', balance_amount: '500.00', total_amount: '1000.00' }),
      );

      await expect(service.voidInvoice(TENANT_ID, INVOICE_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid status', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'draft' }));

      await expect(service.voidInvoice(TENANT_ID, INVOICE_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should cancel a draft invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'draft' }));
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'cancelled' }));

      const result = await service.cancel(TENANT_ID, INVOICE_ID, USER_ID);

      expect((result as Record<string, unknown>).status).toBe('cancelled');
    });

    it('should throw BadRequestException for non-cancellable status', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'issued' }));

      await expect(service.cancel(TENANT_ID, INVOICE_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('writeOff', () => {
    it('should write off an issued invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({ status: 'issued', balance_amount: '500.00' }),
      );
      mockPrisma.invoice.update.mockResolvedValue(
        makeInvoice({ status: 'written_off', write_off_amount: '500.00', balance_amount: '0.00' }),
      );

      const result = await service.writeOff(TENANT_ID, INVOICE_ID, {
        write_off_reason: 'Bad debt',
      });

      expect((result as Record<string, unknown>).status).toBe('written_off');
    });

    it('should throw BadRequestException for invalid status', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'draft' }));

      await expect(
        service.writeOff(TENANT_ID, INVOICE_ID, { write_off_reason: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getInstallments', () => {
    it('should return installments with numeric amounts', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      mockPrisma.installment.findMany.mockResolvedValue([
        { id: 'inst-1', amount: '500.00', due_date: new Date(), status: 'pending' },
      ]);

      const result = await service.getInstallments(TENANT_ID, INVOICE_ID);

      expect(result[0]?.amount).toBe(500);
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.getInstallments(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createInstallments', () => {
    it('should throw BadRequestException when installment sum mismatches invoice total', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ total_amount: '1000.00' }));

      await expect(
        service.createInstallments(TENANT_ID, INVOICE_ID, [
          { due_date: '2026-04-01', amount: 300 },
          { due_date: '2026-05-01', amount: 300 },
        ]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteInstallments', () => {
    it('should delete installments for an invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      mockPrisma.installment.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.deleteInstallments(TENANT_ID, INVOICE_ID);

      expect(result.deleted).toBe(true);
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.deleteInstallments(TENANT_ID, 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createInstallments - success', () => {
    it('should create installments when sum matches invoice total', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ total_amount: '1000.00' }));
      mockPrisma.installment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.installment.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.installment.findMany.mockResolvedValue([
        { id: 'inst-1', amount: '600.00', due_date: new Date('2026-04-01'), status: 'pending' },
        { id: 'inst-2', amount: '400.00', due_date: new Date('2026-05-01'), status: 'pending' },
      ]);

      const result = await service.createInstallments(TENANT_ID, INVOICE_ID, [
        { due_date: '2026-04-01', amount: 600 },
        { due_date: '2026-05-01', amount: 400 },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]?.amount).toBe(600);
      expect(result[1]?.amount).toBe(400);
    });
  });

  describe('create with approval flow', () => {
    it('should create pending_approval invoice when approval required', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      mockSettingsService.getSettings.mockResolvedValue({
        finance: { requireApprovalForInvoiceIssue: true },
      });
      mockApprovalRequestsService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: false,
        request_id: 'approval-123',
      });
      mockPrisma.invoice.update.mockResolvedValue(
        makeInvoice({ status: 'pending_approval', approval_request_id: 'approval-123' }),
      );

      const result = await service.issue(TENANT_ID, INVOICE_ID, USER_ID, false);

      expect((result as Record<string, unknown>).status).toBe('pending_approval');
      expect((result as Record<string, unknown>).approval_request_id).toBe('approval-123');
    });

    it('should auto-issue when approval check returns approved immediately', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      mockSettingsService.getSettings.mockResolvedValue({
        finance: { requireApprovalForInvoiceIssue: true },
      });
      mockApprovalRequestsService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: true,
        request_id: null,
      });
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'issued' }));

      const result = await service.issue(TENANT_ID, INVOICE_ID, USER_ID, true);

      expect((result as Record<string, unknown>).status).toBe('issued');
    });
  });

  describe('update with lines replacement', () => {
    it('should replace lines and recalculate totals', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      mockPrisma.invoiceLine.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.invoiceLine.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.invoice.update.mockResolvedValue(
        makeInvoice({
          subtotal_amount: '1500.00',
          total_amount: '1500.00',
          balance_amount: '1500.00',
        }),
      );
      mockPrisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({
          subtotal_amount: '1500.00',
          total_amount: '1500.00',
          balance_amount: '1500.00',
          lines: [
            {
              id: 'line-1',
              description: 'New Item 1',
              quantity: '2',
              unit_amount: '500.00',
              line_total: '1000.00',
              student_id: null,
            },
            {
              id: 'line-2',
              description: 'New Item 2',
              quantity: '1',
              unit_amount: '500.00',
              line_total: '500.00',
              student_id: null,
            },
          ],
        }),
      );

      const result = await service.update(TENANT_ID, INVOICE_ID, {
        lines: [
          { description: 'New Item 1', quantity: 2, unit_amount: 500 },
          { description: 'New Item 2', quantity: 1, unit_amount: 500 },
        ],
        expected_updated_at: new Date().toISOString(),
      });

      expect(result.total_amount).toBe(1500);
      expect(mockPrisma.invoiceLine.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.invoiceLine.createMany).toHaveBeenCalled();
    });

    it('should update due_date only when no lines provided', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      mockPrisma.invoice.update.mockResolvedValue(
        makeInvoice({ due_date: new Date('2026-05-01') }),
      );
      mockPrisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({ due_date: new Date('2026-05-01') }),
      );

      const result = await service.update(TENANT_ID, INVOICE_ID, {
        due_date: '2026-05-01',
        expected_updated_at: new Date().toISOString(),
      });

      expect(mockPrisma.invoiceLine.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ due_date: expect.any(Date) }),
        }),
      );
    });
  });

  describe('cancel with approval request', () => {
    it('should cancel linked approval request when cancelling pending_approval invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({ status: 'pending_approval', approval_request_id: 'approval-123' }),
      );
      mockApprovalRequestsService.cancel.mockResolvedValue(undefined);
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'cancelled' }));

      const result = await service.cancel(TENANT_ID, INVOICE_ID, USER_ID);

      expect(mockApprovalRequestsService.cancel).toHaveBeenCalledWith(
        TENANT_ID,
        'approval-123',
        USER_ID,
      );
      expect((result as Record<string, unknown>).status).toBe('cancelled');
    });
  });

  describe('findAll with filters', () => {
    it('should filter by household_id', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice()]);
      mockPrisma.invoice.count.mockResolvedValue(1);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, household_id: HOUSEHOLD_ID });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ household_id: HOUSEHOLD_ID }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice()]);
      mockPrisma.invoice.count.mockResolvedValue(1);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            due_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should use default sort when invalid sort field provided', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice()]);
      mockPrisma.invoice.count.mockResolvedValue(1);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        sort: 'invalid_field',
        order: 'asc',
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should apply custom sort when valid field provided', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice()]);
      mockPrisma.invoice.count.mockResolvedValue(1);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        sort: 'due_date',
        order: 'asc',
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { due_date: 'asc' },
        }),
      );
    });
  });

  describe('getPreview', () => {
    it('should return invoice preview', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        invoice_number: 'INV-001',
        status: 'issued',
        due_date: new Date('2026-04-01'),
        total_amount: '1000.00',
        balance_amount: '500.00',
        currency_code: 'EUR',
        household: { id: HOUSEHOLD_ID, household_name: 'Smith Family' },
      });

      const result = await service.getPreview(TENANT_ID, INVOICE_ID);

      expect(result.total_amount).toBe(1000);
      expect(result.balance_amount).toBe(500);
    });

    it('should throw NotFoundException when invoice not found for preview', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.getPreview(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('recalculateBalance', () => {
    it('should recalculate invoice balance from allocations', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({
          status: 'issued',
          total_amount: '1000.00',
          balance_amount: '1000.00',
          due_date: new Date(),
          write_off_amount: null,
          payment_allocations: [{ allocated_amount: '300.00' }],
        }),
      );
      mockPrisma.invoice.update.mockResolvedValue({});

      await service.recalculateBalance(TENANT_ID, INVOICE_ID);

      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance_amount: 700,
            status: 'partially_paid',
          }),
        }),
      );
    });

    it('should handle fully paid invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({
          status: 'issued',
          total_amount: '1000.00',
          balance_amount: '1000.00',
          due_date: new Date(),
          write_off_amount: null,
          payment_allocations: [{ allocated_amount: '1000.00' }],
        }),
      );
      mockPrisma.invoice.update.mockResolvedValue({});

      await service.recalculateBalance(TENANT_ID, INVOICE_ID);

      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance_amount: 0,
            status: 'paid',
          }),
        }),
      );
    });

    it('should throw NotFoundException when invoice not found for recalculation', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.recalculateBalance(TENANT_ID, 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create with default prefix', () => {
    it('should use default INV prefix when no branding configured', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.invoice.create.mockResolvedValue(makeInvoice());

      await service.create(TENANT_ID, USER_ID, {
        household_id: HOUSEHOLD_ID,
        due_date: '2026-04-01',
        lines: [{ description: 'Tuition', quantity: 1, unit_amount: 1000 }],
      });

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'invoice',
        expect.anything(),
        'INV',
      );
    });

    it('should use custom prefix from branding', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({ invoice_prefix: 'SCH' });
      mockPrisma.invoice.create.mockResolvedValue(makeInvoice());

      await service.create(TENANT_ID, USER_ID, {
        household_id: HOUSEHOLD_ID,
        due_date: '2026-04-01',
        lines: [{ description: 'Tuition', quantity: 1, unit_amount: 1000 }],
      });

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'invoice',
        expect.anything(),
        'SCH',
      );
    });
  });
});
