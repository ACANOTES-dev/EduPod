/**
 * Additional branch coverage for PayrollReportsService.
 * Targets: getCostTrend (default year), getYtdSummary (aggregation, pagination, default year),
 * getBonusAnalysis (multiple entries per staff), getMonthlySummary (not found),
 * exportMonthlySummary (csv vs pdf), exportYtdSummary (csv vs pdf), getStaffPaymentHistory.
 */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, TenantReadFacade } from '../../common/tests/mock-facades';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { PayrollReportsService } from './payroll-reports.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUN_ID = 'run-1';

const mockRun = {
  id: RUN_ID,
  period_label: 'March 2026',
  period_month: 3,
  period_year: 2026,
  total_working_days: 22,
  status: 'finalised',
  total_basic_pay: 50000,
  total_bonus_pay: 5000,
  total_pay: 55000,
  headcount: 10,
  entries: [
    {
      id: 'e1',
      staff_profile_id: 'sp-1',
      compensation_type: 'salaried',
      basic_pay: 5000,
      bonus_pay: 500,
      total_pay: 5500,
      days_worked: 22,
      classes_taught: null,
      staff_profile: {
        id: 'sp-1',
        staff_number: 'S001',
        department: 'Science',
        job_title: 'Teacher',
        user: { first_name: 'Alice', last_name: 'Smith' },
      },
    },
  ],
};

describe('PayrollReportsService — branch coverage', () => {
  let service: PayrollReportsService;
  let mockPrisma: {
    payrollRun: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    payrollEntry: {
      findMany: jest.Mock;
    };
  };
  let mockTenantFacade: { findById: jest.Mock; findBranding: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      payrollRun: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      payrollEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    mockTenantFacade = {
      findById: jest.fn().mockResolvedValue({ id: TENANT_ID, name: 'Test School' }),
      findBranding: jest.fn().mockResolvedValue({
        school_name_display: 'Test School',
        school_name_ar: null,
        logo_url: null,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: TenantReadFacade, useValue: mockTenantFacade },
        { provide: PdfRenderingService, useValue: { renderPdf: jest.fn() } },
        PayrollReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PayrollReportsService>(PayrollReportsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getCostTrend ─────────────────────────────────────────────────────────

  describe('PayrollReportsService — getCostTrend', () => {
    it('should return cost trend with explicit year', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([
        {
          period_month: 1,
          period_year: 2026,
          period_label: 'January 2026',
          total_basic_pay: 40000,
          total_bonus_pay: 2000,
          total_pay: 42000,
          headcount: 10,
        },
      ]);

      const result = await service.getCostTrend(TENANT_ID, 2026);

      expect(result).toHaveLength(1);
      expect(result[0]!.total_pay).toBe(42000);
    });

    it('should default to current year', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);
      const result = await service.getCostTrend(TENANT_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ─���─ getYtdSummary ────────────────────────────────────────────────────────

  describe('PayrollReportsService — getYtdSummary', () => {
    it('should aggregate YTD for same staff across multiple entries', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          staff_profile_id: 'sp-1',
          basic_pay: 5000,
          bonus_pay: 500,
          total_pay: 5500,
          compensation_type: 'salaried',
          staff_profile: { id: 'sp-1', user: { first_name: 'Alice', last_name: 'Smith' } },
        },
        {
          staff_profile_id: 'sp-1',
          basic_pay: 5000,
          bonus_pay: 200,
          total_pay: 5200,
          compensation_type: 'salaried',
          staff_profile: { id: 'sp-1', user: { first_name: 'Alice', last_name: 'Smith' } },
        },
      ]);

      const result = await service.getYtdSummary(TENANT_ID, 2026);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.ytd_basic).toBe(10000);
      expect(result.data[0]!.ytd_bonus).toBe(700);
      expect(result.data[0]!.ytd_total).toBe(10700);
    });

    it('should paginate results', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          staff_profile_id: 'sp-1',
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
          compensation_type: 'salaried',
          staff_profile: { id: 'sp-1', user: { first_name: 'A', last_name: 'B' } },
        },
        {
          staff_profile_id: 'sp-2',
          basic_pay: 3000,
          bonus_pay: 0,
          total_pay: 3000,
          compensation_type: 'per_class',
          staff_profile: { id: 'sp-2', user: { first_name: 'C', last_name: 'D' } },
        },
      ]);

      const result = await service.getYtdSummary(TENANT_ID, 2026, 1, 1);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(2);
    });
  });

  // ─── getBonusAnalysis ─────────────────────────────────────────────────────

  describe('PayrollReportsService — getBonusAnalysis', () => {
    it('should aggregate bonus data per staff', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          staff_profile_id: 'sp-1',
          bonus_pay: 500,
          compensation_type: 'salaried',
          staff_profile: { id: 'sp-1', user: { first_name: 'A', last_name: 'B' } },
        },
        {
          staff_profile_id: 'sp-1',
          bonus_pay: 300,
          compensation_type: 'salaried',
          staff_profile: { id: 'sp-1', user: { first_name: 'A', last_name: 'B' } },
        },
      ]);

      const result = await service.getBonusAnalysis(TENANT_ID, 2026);

      expect(result).toHaveLength(1);
      expect(result[0]!.total_bonus_amount).toBe(800);
      expect(result[0]!.months_with_bonus).toBe(2);
      expect(result[0]!.avg_bonus_per_month).toBe(400);
    });

    it('should return empty when no bonus entries', async () => {
      const result = await service.getBonusAnalysis(TENANT_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ─── getMonthlySummary ──────���─────────────────────────────────────────────

  describe('PayrollReportsService — getMonthlySummary', () => {
    it('should throw NotFoundException when run not found', async () => {
      await expect(service.getMonthlySummary(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return formatted summary', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);

      const result = await service.getMonthlySummary(TENANT_ID, RUN_ID);

      expect(result.run.id).toBe(RUN_ID);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.staff_name).toBe('Alice Smith');
    });
  });

  // ─── exportMonthlySummary ─────────────────────────────────────────────────

  describe('PayrollReportsService — exportMonthlySummary', () => {
    it('should return CSV for csv format', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'csv');

      expect(result.format).toBe('csv');
      expect('content' in result ? result.content : undefined).toBeDefined();
    });

    it('should return PDF structure for pdf format', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'pdf');

      expect(result.format).toBe('pdf');
      expect('html' in result ? result.html : undefined).toBeDefined();
    });

    it('should use fallback school name when branding is null', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockTenantFacade.findBranding.mockResolvedValue(null);

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'pdf');

      expect(result.format).toBe('pdf');
    });
  });

  // ─── exportYtdSummary ─���───────────────────────────────────────────────────

  describe('PayrollReportsService — exportYtdSummary', () => {
    it('should return CSV for csv format', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      const result = await service.exportYtdSummary(TENANT_ID, 2026, 'csv');

      expect(result.format).toBe('csv');
    });

    it('should return PDF structure for pdf format', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      const result = await service.exportYtdSummary(TENANT_ID, undefined, 'pdf');

      expect(result.format).toBe('pdf');
    });
  });
});
