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

  let mockHouseholdReadFacade: { findByIdWithBillingParent: jest.Mock };
  let mockTenantReadFacade: { findById: jest.Mock; findBranding: jest.Mock };

  beforeEach(async () => {
    mockHouseholdReadFacade = {
      findByIdWithBillingParent: jest.fn().mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith Family',
        billing_parent: { id: 'parent-1', first_name: 'Jane', last_name: 'Smith' },
      }),
    };
    mockTenantReadFacade = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: TENANT_ID, name: 'Test School', currency_code: 'EUR' }),
      findBranding: jest.fn().mockResolvedValue({
        school_name_display: 'Test School',
        school_name_ar: null,
        logo_url: null,
        primary_color: null,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HouseholdStatementsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: HouseholdReadFacade, useValue: mockHouseholdReadFacade },
        { provide: TenantReadFacade, useValue: mockTenantReadFacade },
      ],
    }).compile();

    service = module.get<HouseholdStatementsService>(HouseholdStatementsService);
    jest.clearAllMocks();
  });

  describe('getStatement', () => {
    it('should return a statement with invoices and payments', async () => {
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
      mockHouseholdReadFacade.findByIdWithBillingParent.mockResolvedValue(null);

      await expect(service.getStatement(TENANT_ID, 'bad-id', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle refund entries correctly', async () => {
      mockHouseholdReadFacade.findByIdWithBillingParent.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith',
        billing_parent: null,
      });
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
      mockHouseholdReadFacade.findByIdWithBillingParent.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith',
        billing_parent: null,
      });
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
      mockHouseholdReadFacade.findByIdWithBillingParent.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Orphan Household',
        billing_parent: null,
      });
      mockTenantReadFacade.findById.mockResolvedValue({ id: TENANT_ID, currency_code: 'USD' });
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.household.billing_parent_name).toBeNull();
      expect(result.closing_balance).toBe(0);
    });
  });

  describe('getStatement — date filters', () => {
    it('should apply date_from filter', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);

      await service.getStatement(TENANT_ID, HOUSEHOLD_ID, { date_from: '2026-01-01' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issue_date: { gte: expect.any(Date) },
          }),
        }),
      );
      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            received_at: { gte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should apply date_to filter', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);

      await service.getStatement(TENANT_ID, HOUSEHOLD_ID, { date_to: '2026-12-31' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issue_date: { lte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should apply both date_from and date_to', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);

      await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issue_date: { gte: expect.any(Date), lte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should handle invoice without issue_date (skips entry)', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoice_number: 'INV-001',
          status: 'draft',
          issue_date: null, // Not yet issued
          total_amount: '1000.00',
          write_off_amount: null,
          write_off_reason: null,
        },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.entries).toHaveLength(0); // No entry because issue_date is null
    });

    it('should handle refund without executed_at (skips entry)', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          refund_reference: 'REF-001',
          amount: '100.00',
          executed_at: null, // Not yet executed
          payment: { payment_reference: 'PAY-001' },
        },
      ]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.entries).toHaveLength(0);
    });

    it('should use default currency when tenant is null', async () => {
      mockTenantReadFacade.findById.mockResolvedValue(null);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);

      const result = await service.getStatement(TENANT_ID, HOUSEHOLD_ID, {});

      expect(result.currency_code).toBe('USD');
    });
  });

  describe('renderPdf', () => {
    it('should render a statement PDF', async () => {
      const pdfBuffer = Buffer.from('fake-pdf');
      // getStatement prerequisites — facade mocks already provide household + tenant
      mockHouseholdReadFacade.findByIdWithBillingParent.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith',
        billing_parent: null,
      });
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      const result = await service.renderPdf(TENANT_ID, HOUSEHOLD_ID, 'en', {});

      expect(result).toBe(pdfBuffer);
      expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
        'household-statement',
        'en',
        expect.objectContaining({ household: expect.objectContaining({ id: HOUSEHOLD_ID }) }),
        expect.objectContaining({ school_name: 'Test School' }),
      );
    });
  });
});
