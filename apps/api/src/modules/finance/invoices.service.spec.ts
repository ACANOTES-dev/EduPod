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

      const result = await service.create(TENANT_ID, USER_ID, {
        household_id: HOUSEHOLD_ID,
        due_date: '2026-04-01',
        lines: [{ description: 'Tuition', quantity: 1, unit_amount: 1000 }],
      });

      expect(result).toMatchObject({
        invoice_number: 'INV-202603-000001',
        total_amount: 1000,
      });
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

  // ─── Additional branch coverage ─────────────────────────────────────────────

  describe('findAll — parentHouseholdIds scoping', () => {
    it('should scope by parentHouseholdIds and hide draft/pending/cancelled', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.invoice.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20 }, ['hh-1', 'hh-2']);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            household_id: { in: ['hh-1', 'hh-2'] },
            status: { notIn: ['draft', 'pending_approval', 'cancelled'] },
          }),
        }),
      );
    });

    it('should NOT override parent status filter even when status is provided', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.invoice.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, status: 'issued' }, ['hh-1']);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            // Parent filter stays — status should NOT be overridden to {in: ['issued']}
            status: { notIn: ['draft', 'pending_approval', 'cancelled'] },
          }),
        }),
      );
    });

    it('should NOT override household_id when parentHouseholdIds provided', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.invoice.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, household_id: 'other-hh' }, [
        'hh-1',
      ]);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            household_id: { in: ['hh-1'] },
          }),
        }),
      );
    });
  });

  describe('findAll — filter branches', () => {
    beforeEach(() => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.invoice.count.mockResolvedValue(0);
    });

    it('should filter by multiple statuses (array)', async () => {
      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, status: ['issued', 'overdue'] });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['issued', 'overdue'] },
          }),
        }),
      );
    });

    it('should filter by household_id', async () => {
      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, household_id: HOUSEHOLD_ID });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ household_id: HOUSEHOLD_ID }),
        }),
      );
    });

    it('should filter by date_from only', async () => {
      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, date_from: '2026-01-01' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            due_date: { gte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should filter by date_to only', async () => {
      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, date_to: '2026-12-31' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            due_date: { lte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should filter by date range (both from and to)', async () => {
      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            due_date: { gte: expect.any(Date), lte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should filter by search (invoice_number)', async () => {
      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, search: 'INV-2026' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoice_number: { contains: 'INV-2026', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should sort by allowed column', async () => {
      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, sort: 'due_date', order: 'asc' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { due_date: 'asc' },
        }),
      );
    });

    it('should use default sort (created_at desc) for unknown sort column', async () => {
      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, sort: 'unknown_column' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should default to desc order when sort provided but no order', async () => {
      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, sort: 'total_amount' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { total_amount: 'desc' },
        }),
      );
    });
  });

  describe('create — tenant not found', () => {
    it('should throw NotFoundException when tenant not found', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          household_id: HOUSEHOLD_ID,
          due_date: '2026-04-01',
          lines: [{ description: 'X', quantity: 1, unit_amount: 100 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use default prefix when branding has no invoice_prefix', async () => {
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

    it('should create lines with optional student_id and fee_structure_id', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({ invoice_prefix: 'INV' });
      mockPrisma.invoice.create.mockResolvedValue(makeInvoice());

      await service.create(TENANT_ID, USER_ID, {
        household_id: HOUSEHOLD_ID,
        due_date: '2026-04-01',
        lines: [
          {
            description: 'Tuition',
            quantity: 2,
            unit_amount: 500,
            student_id: 'stu-1',
            fee_structure_id: 'fs-1',
          },
        ],
      });

      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lines: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  student_id: 'stu-1',
                  fee_structure_id: 'fs-1',
                  quantity: 2,
                  unit_amount: 500,
                  line_total: 1000,
                }),
              ]),
            },
          }),
        }),
      );
    });
  });

  describe('update — line replacement and due_date-only branches', () => {
    it('should replace lines when dto.lines is provided', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ updated_at: new Date() }));
      mockPrisma.invoiceLine.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.invoiceLine.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ total_amount: '1500.00' }));
      // findOne after update
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ total_amount: '1500.00' }));

      const result = await service.update(TENANT_ID, INVOICE_ID, {
        lines: [
          { description: 'Line A', quantity: 1, unit_amount: 500 },
          { description: 'Line B', quantity: 1, unit_amount: 1000 },
        ],
        due_date: '2026-05-01',
        expected_updated_at: new Date().toISOString(),
      });

      expect(mockPrisma.invoiceLine.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { invoice_id: INVOICE_ID } }),
      );
      expect(mockPrisma.invoiceLine.createMany).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should update only due_date when no lines provided', async () => {
      const now = new Date();
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ updated_at: now }));
      mockPrisma.invoice.update.mockResolvedValue(
        makeInvoice({ due_date: new Date('2026-06-01') }),
      );
      // findOne
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());

      await service.update(TENANT_ID, INVOICE_ID, {
        due_date: '2026-06-01',
        expected_updated_at: now.toISOString(),
      });

      expect(mockPrisma.invoiceLine.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { due_date: expect.any(Date) },
        }),
      );
    });

    it('should do nothing inside RLS transaction when neither lines nor due_date provided', async () => {
      const now = new Date();
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ updated_at: now }));
      // findOne
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());

      await service.update(TENANT_ID, INVOICE_ID, {
        expected_updated_at: now.toISOString(),
      });

      expect(mockPrisma.invoiceLine.deleteMany).not.toHaveBeenCalled();
    });

    it('should skip concurrency check when expected_updated_at is not provided', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      // findOne
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());

      // Should not throw ConflictException
      await expect(
        service.update(TENANT_ID, INVOICE_ID, { due_date: '2026-05-01' }),
      ).resolves.toBeDefined();
    });
  });

  describe('issue — approval flow branches', () => {
    it('should set pending_approval when approval is required and not auto-approved', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      mockSettingsService.getSettings.mockResolvedValue({
        finance: { requireApprovalForInvoiceIssue: true },
      });
      mockApprovalRequestsService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: false,
        request_id: 'approval-req-1',
      });
      mockPrisma.invoice.update.mockResolvedValue(
        makeInvoice({ status: 'pending_approval', approval_request_id: 'approval-req-1' }),
      );

      const result = await service.issue(TENANT_ID, INVOICE_ID, USER_ID, false);

      expect((result as Record<string, unknown>).approval_status).toBe('pending_approval');
      expect((result as Record<string, unknown>).approval_request_id).toBe('approval-req-1');
    });

    it('should issue directly when approval required but auto-approved', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice());
      mockSettingsService.getSettings.mockResolvedValue({
        finance: { requireApprovalForInvoiceIssue: true },
      });
      mockApprovalRequestsService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: true,
      });
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'issued' }));

      const result = await service.issue(TENANT_ID, INVOICE_ID, USER_ID, true);

      expect((result as Record<string, unknown>).status).toBe('issued');
    });
  });

  describe('voidInvoice — not found branch', () => {
    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.voidInvoice(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel — pending_approval with approval_request_id', () => {
    it('should cancel linked approval request when invoice is pending_approval', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({ status: 'pending_approval', approval_request_id: 'approval-req-1' }),
      );
      mockApprovalRequestsService.cancel.mockResolvedValue(undefined);
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'cancelled' }));

      await service.cancel(TENANT_ID, INVOICE_ID, USER_ID);

      expect(mockApprovalRequestsService.cancel).toHaveBeenCalledWith(
        TENANT_ID,
        'approval-req-1',
        USER_ID,
      );
    });

    it('should NOT cancel approval when invoice is not pending_approval', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'draft' }));
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'cancelled' }));

      await service.cancel(TENANT_ID, INVOICE_ID, USER_ID);

      expect(mockApprovalRequestsService.cancel).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.cancel(TENANT_ID, 'bad-id', USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('writeOff — not found', () => {
    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.writeOff(TENANT_ID, 'bad-id', { write_off_reason: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recalculateBalance', () => {
    it('should recalculate balance and derive paid status', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        total_amount: '1000.00',
        balance_amount: '1000.00',
        write_off_amount: null,
        due_date: new Date('2026-12-31'),
        payment_allocations: [{ allocated_amount: '1000.00' }],
      });
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

    it('should derive partially_paid status', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        total_amount: '1000.00',
        balance_amount: '1000.00',
        write_off_amount: null,
        due_date: new Date('2026-12-31'),
        payment_allocations: [{ allocated_amount: '400.00' }],
      });
      mockPrisma.invoice.update.mockResolvedValue({});

      await service.recalculateBalance(TENANT_ID, INVOICE_ID);

      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance_amount: 600,
            status: 'partially_paid',
          }),
        }),
      );
    });

    it('should use provided client (transaction) instead of default prisma', async () => {
      const txClient = {
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: INVOICE_ID,
            status: 'issued',
            total_amount: '500.00',
            balance_amount: '500.00',
            write_off_amount: '0',
            due_date: new Date('2026-12-31'),
            payment_allocations: [{ allocated_amount: '500.00' }],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      } as unknown as typeof mockPrisma;

      await service.recalculateBalance(TENANT_ID, INVOICE_ID, txClient as never);

      expect(txClient.invoice.findFirst).toHaveBeenCalled();
      expect(txClient.invoice.update).toHaveBeenCalled();
      // Default prisma should NOT be called
      expect(mockPrisma.invoice.findFirst).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.recalculateBalance(TENANT_ID, 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createInstallments — happy path', () => {
    it('should create installments when sum matches invoice total', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ total_amount: '1000.00' }));
      mockPrisma.installment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.installment.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.installment.findMany.mockResolvedValue([
        { id: 'inst-1', amount: '500.00', due_date: new Date('2026-04-01'), status: 'pending' },
        { id: 'inst-2', amount: '500.00', due_date: new Date('2026-05-01'), status: 'pending' },
      ]);

      const result = await service.createInstallments(TENANT_ID, INVOICE_ID, [
        { due_date: '2026-04-01', amount: 500 },
        { due_date: '2026-05-01', amount: 500 },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]?.amount).toBe(500);
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.createInstallments(TENANT_ID, 'bad-id', [{ due_date: '2026-04-01', amount: 100 }]),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPreview', () => {
    it('should return preview with numeric amounts', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        invoice_number: 'INV-001',
        status: 'issued',
        due_date: new Date('2026-04-01'),
        total_amount: '1000.00',
        balance_amount: '500.00',
        currency_code: 'EUR',
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });

      const result = await service.getPreview(TENANT_ID, INVOICE_ID);

      expect(result.total_amount).toBe(1000);
      expect(result.balance_amount).toBe(500);
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.getPreview(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('serializeInvoice — edge cases', () => {
    it('should handle undefined optional fields', async () => {
      const invoice = {
        id: INVOICE_ID,
        status: 'draft',
        // No subtotal_amount, discount_amount, write_off_amount, lines
      };
      mockPrisma.invoice.findMany.mockResolvedValue([invoice]);
      mockPrisma.invoice.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]?.subtotal_amount).toBeUndefined();
      expect(result.data[0]?.discount_amount).toBeUndefined();
      expect(result.data[0]?.total_amount).toBeUndefined();
      expect(result.data[0]?.lines).toBeUndefined();
      expect(result.data[0]?.write_off_amount).toBeNull();
    });
  });

  describe('serializeInvoiceFull — edge cases', () => {
    it('should serialize installments and payment_allocations', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        ...makeInvoice(),
        installments: [{ amount: '250.00', due_date: new Date() }],
        payment_allocations: [
          {
            allocated_amount: '100.00',
            payment: {
              id: 'pay-1',
              payment_reference: 'PAY-1',
              payment_method: 'cash',
              received_at: new Date(),
            },
          },
        ],
      });

      const result = await service.findOne(TENANT_ID, INVOICE_ID);

      expect(result.installments?.[0]?.amount).toBe(250);
      expect(result.payment_allocations?.[0]?.allocated_amount).toBe(100);
    });

    it('should handle missing installments and allocations arrays', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        ...makeInvoice(),
        installments: undefined,
        payment_allocations: undefined,
      });

      const result = await service.findOne(TENANT_ID, INVOICE_ID);

      expect(result.installments).toBeUndefined();
      expect(result.payment_allocations).toBeUndefined();
    });
  });
});
