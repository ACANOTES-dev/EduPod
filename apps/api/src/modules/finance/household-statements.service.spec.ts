import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { HouseholdStatementsService } from './household-statements.service';

const TENANT_ID = 'tenant-uuid-1111';
const HOUSEHOLD_ID = 'hh-uuid-1111';

const mockPrisma = {
  household: {
    findFirst: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  invoice: {
    findMany: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
  },
  refund: {
    findMany: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
};

const mockPdfRenderingService = {
  renderPdf: jest.fn(),
};

describe('HouseholdStatementsService', () => {
  let service: HouseholdStatementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdStatementsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
      ],
    }).compile();

    service = module.get<HouseholdStatementsService>(HouseholdStatementsService);
    jest.clearAllMocks();
  });

  describe('getStatement', () => {
    it('should return a statement with invoices and payments', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith Family',
        billing_parent: { id: 'parent-1', first_name: 'Jane', last_name: 'Smith' },
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoice_number: 'INV-001',
          status: 'issued',
          issue_date: new Date('2026-03-01'),
          total_amount: '1000.00',
          write_off_amount: null,
          write_off_reason: null,
        },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          payment_reference: 'PAY-001',
          amount: '500.00',
          received_at: new Date('2026-03-10'),
          allocations: [],
        },
      ]);
      mockPrisma.refund.findMany.mockResolvedValue([]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.household.household_name).toBe('Smith Family');
      expect(result.household.billing_parent_name).toBe('Jane Smith');
      expect(result.entries).toHaveLength(2);
      expect(result.closing_balance).toBe(500); // 1000 debit - 500 credit
      expect(result.currency_code).toBe('EUR');
    });

    it('should throw NotFoundException when household not found', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(null);

      await expect(
        service.getStatement(TENANT_ID, 'bad-id', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle refund entries correctly', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith',
        billing_parent: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          payment_reference: 'PAY-001',
          amount: '500.00',
          received_at: new Date('2026-03-10'),
          allocations: [],
        },
      ]);
      mockPrisma.refund.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          refund_reference: 'REF-001',
          amount: '200.00',
          executed_at: new Date('2026-03-15'),
          payment: { payment_reference: 'PAY-001' },
        },
      ]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.entries).toHaveLength(2); // payment + refund
      // Payment credit -500, refund debit +200, net = -300
      expect(result.closing_balance).toBe(-300);
    });

    it('should include write-off entries', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith',
        billing_parent: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoice_number: 'INV-001',
          status: 'written_off',
          issue_date: new Date('2026-03-01'),
          total_amount: '1000.00',
          write_off_amount: '1000.00',
          write_off_reason: 'Bad debt',
        },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      // invoice debit 1000 + write-off credit 1000 = 0
      expect(result.entries).toHaveLength(2);
      expect(result.closing_balance).toBe(0);
    });

    it('should handle null billing parent gracefully', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Orphan Household',
        billing_parent: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'USD' });
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.household.billing_parent_name).toBeNull();
      expect(result.closing_balance).toBe(0);
    });
  });

  describe('renderPdf', () => {
    it('should render a statement PDF', async () => {
      const pdfBuffer = Buffer.from('fake-pdf');
      // getStatement prerequisites
      mockPrisma.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith',
        billing_parent: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, name: 'Test School', currency_code: 'EUR' });
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({
        school_name_display: 'Test School',
        school_name_ar: null,
        logo_url: null,
        primary_color: null,
      });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      const result = await service.renderPdf(TENANT_ID, HOUSEHOLD_ID, 'en', {});

      expect(result).toBe(pdfBuffer);
      expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
        'statement',
        'en',
        expect.objectContaining({ household: expect.objectContaining({ id: HOUSEHOLD_ID }) }),
        expect.objectContaining({ school_name: 'Test School' }),
      );
    });
  });
});
