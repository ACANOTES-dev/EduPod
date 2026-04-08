/**
 * Additional branch coverage for HouseholdStatementsService.
 * Targets: date filter branches (date_from only, date_to only),
 * write-off entries, refund entries, null invoice issue_date,
 * null billing_parent, null tenant, renderPdf branding fallbacks.
 */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  HouseholdReadFacade,
  TenantReadFacade,
} from '../../common/tests/mock-facades';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { HouseholdStatementsService } from './household-statements.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOUSEHOLD_ID = 'hh-1';

describe('HouseholdStatementsService — branch coverage', () => {
  let service: HouseholdStatementsService;
  let mockPrisma: {
    invoice: { findMany: jest.Mock };
    payment: { findMany: jest.Mock };
    refund: { findMany: jest.Mock };
  };
  let mockHouseholdFacade: { findByIdWithBillingParent: jest.Mock };
  let mockTenantFacade: { findById: jest.Mock; findBranding: jest.Mock };
  let mockPdfService: { renderPdf: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      refund: { findMany: jest.fn().mockResolvedValue([]) },
    };

    mockHouseholdFacade = {
      findByIdWithBillingParent: jest.fn().mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith Family',
        billing_parent: { first_name: 'John', last_name: 'Smith' },
      }),
    };
    mockTenantFacade = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: TENANT_ID, currency_code: 'SAR', name: 'Test School' }),
      findBranding: jest.fn().mockResolvedValue({
        school_name_display: 'Test School',
        school_name_ar: 'مدرسة تجربة',
        logo_url: 'https://logo.png',
        primary_color: '#003366',
      }),
    };
    mockPdfService = {
      renderPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-content')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: HouseholdReadFacade, useValue: mockHouseholdFacade },
        { provide: TenantReadFacade, useValue: mockTenantFacade },
        { provide: PdfRenderingService, useValue: mockPdfService },
        HouseholdStatementsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HouseholdStatementsService>(HouseholdStatementsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getStatement — household not found ───────────────────────────────────

  describe('HouseholdStatementsService — getStatement household not found', () => {
    it('should throw NotFoundException when household does not exist', async () => {
      mockHouseholdFacade.findByIdWithBillingParent.mockResolvedValue(null);

      await expect(service.getStatement(TENANT_ID, 'nonexistent', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getStatement — date filter branches ──────────────────────────────────

  describe('HouseholdStatementsService — getStatement date filters', () => {
    it('should filter by date_from only', async () => {
      await service.getStatement(TENANT_ID, HOUSEHOLD_ID, { date_from: '2026-01-01' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issue_date: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('should filter by date_to only', async () => {
      await service.getStatement(TENANT_ID, HOUSEHOLD_ID, { date_to: '2026-12-31' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issue_date: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('should not add date filter when no dates provided', async () => {
      await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      const callArgs = mockPrisma.invoice.findMany.mock.calls[0]![0] as Record<string, unknown>;
      const where = callArgs.where as Record<string, unknown>;
      expect(where.issue_date).toBeUndefined();
    });
  });

  // ─── getStatement — write-off entries ─────────────────────────────────────

  describe('HouseholdStatementsService — getStatement write-offs', () => {
    it('should create credit entry for write-offs', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoice_number: 'INV-001',
          status: 'paid',
          issue_date: new Date('2026-03-01'),
          total_amount: 1000,
          write_off_amount: 200,
          write_off_reason: 'Goodwill discount',
        },
      ]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      const writeOffEntry = result.entries.find((e) => e.type === 'write_off');
      expect(writeOffEntry).toBeDefined();
      expect(writeOffEntry!.credit).toBe(200);
      expect(writeOffEntry!.description).toContain('Goodwill discount');
    });

    it('should skip write-off entry when write_off_amount is 0', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoice_number: 'INV-001',
          status: 'paid',
          issue_date: new Date('2026-03-01'),
          total_amount: 1000,
          write_off_amount: 0,
          write_off_reason: null,
        },
      ]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.entries.filter((e) => e.type === 'write_off')).toHaveLength(0);
    });

    it('should handle invoice with null issue_date', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoice_number: 'INV-001',
          status: 'draft',
          issue_date: null,
          total_amount: 1000,
          write_off_amount: null,
          write_off_reason: null,
        },
      ]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      // No entry should be added for invoice without issue_date
      expect(result.entries.filter((e) => e.type === 'invoice_issued')).toHaveLength(0);
    });
  });

  // ─── getStatement — refund entries ────────────────────────────────────────

  describe('HouseholdStatementsService — getStatement refunds', () => {
    it('should include refund entries as debits', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          refund_reference: 'REF-001',
          amount: 150,
          executed_at: new Date('2026-03-15'),
          payment: { payment_reference: 'PAY-001' },
        },
      ]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      const refundEntry = result.entries.find((e) => e.type === 'refund');
      expect(refundEntry).toBeDefined();
      expect(refundEntry!.debit).toBe(150);
      expect(refundEntry!.credit).toBeNull();
    });

    it('should skip refund entries with null executed_at', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          refund_reference: 'REF-001',
          amount: 150,
          executed_at: null,
          payment: { payment_reference: 'PAY-001' },
        },
      ]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.entries.filter((e) => e.type === 'refund')).toHaveLength(0);
    });
  });

  // ─── getStatement — running balance computation ───────────────────────────

  describe('HouseholdStatementsService — getStatement running balance', () => {
    it('should compute running balance across invoice, payment, and refund', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoice_number: 'INV-001',
          status: 'paid',
          issue_date: new Date('2026-03-01'),
          total_amount: 1000,
          write_off_amount: null,
          write_off_reason: null,
        },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          payment_reference: 'PAY-001',
          amount: 600,
          received_at: new Date('2026-03-10'),
          allocations: [],
        },
      ]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      // Invoice debit: +1000, Payment credit: -600 = closing 400
      expect(result.closing_balance).toBe(400);
      expect(result.entries).toHaveLength(2);
    });
  });

  // ─── getStatement — null billing_parent ───────────────────────────────────

  describe('HouseholdStatementsService — getStatement null billing_parent', () => {
    it('should handle null billing_parent', async () => {
      mockHouseholdFacade.findByIdWithBillingParent.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith Family',
        billing_parent: null,
      });

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.household.billing_parent_name).toBeNull();
    });
  });

  // ─── getStatement — null tenant ───────────────────────────────────────────

  describe('HouseholdStatementsService — getStatement null tenant', () => {
    it('should default currency_code to USD when tenant is null', async () => {
      mockTenantFacade.findById.mockResolvedValue(null);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.currency_code).toBe('USD');
    });
  });

  // ─── renderPdf — branding fallbacks ───────────────────────────────────────

  describe('HouseholdStatementsService — renderPdf', () => {
    it('should use branding fields when available', async () => {
      await service.renderPdf(TENANT_ID, HOUSEHOLD_ID, 'en', {});

      expect(mockPdfService.renderPdf).toHaveBeenCalledWith(
        'household-statement',
        'en',
        expect.any(Object),
        expect.objectContaining({
          school_name: 'Test School',
          school_name_ar: 'مدرسة تجربة',
          logo_url: 'https://logo.png',
          primary_color: '#003366',
        }),
      );
    });

    it('should use fallbacks when branding is null', async () => {
      mockTenantFacade.findBranding.mockResolvedValue(null);

      await service.renderPdf(TENANT_ID, HOUSEHOLD_ID, 'ar', {});

      expect(mockPdfService.renderPdf).toHaveBeenCalledWith(
        'household-statement',
        'ar',
        expect.any(Object),
        expect.objectContaining({
          school_name: 'Test School',
        }),
      );
    });

    it('should use empty string when both branding and tenant are null', async () => {
      mockTenantFacade.findBranding.mockResolvedValue(null);
      mockTenantFacade.findById.mockResolvedValue(null);

      await service.renderPdf(TENANT_ID, HOUSEHOLD_ID, 'en', {});

      expect(mockPdfService.renderPdf).toHaveBeenCalledWith(
        'household-statement',
        'en',
        expect.any(Object),
        expect.objectContaining({
          school_name: '',
        }),
      );
    });
  });
});
