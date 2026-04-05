import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, TenantReadFacade } from '../../common/tests/mock-facades';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { PayrollReportsService } from './payroll-reports.service';

describe('PayrollReportsService', () => {
  let service: PayrollReportsService;
  let module: TestingModule;

  const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const RUN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const STAFF_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const mockPrisma = {
    payrollRun: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    payrollEntry: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    tenantBranding: {
      findUnique: jest.fn(),
    },
  };

  const mockPdfRenderingService = {
    renderHtmlToPdf: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        PayrollReportsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
      ],
    }).compile();

    service = module.get<PayrollReportsService>(PayrollReportsService);
  });

  describe('getCostTrend', () => {
    it('should return numeric monetary values for finalised runs in the given year', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([
        {
          period_month: 1,
          period_year: 2026,
          period_label: 'January 2026',
          total_basic_pay: 5000,
          total_bonus_pay: 200,
          total_pay: 5200,
          headcount: 8,
        },
      ]);

      const result = await service.getCostTrend(TENANT_ID, 2026);

      expect(mockPrisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'finalised',
            period_year: 2026,
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.total_basic_pay).toBe(5000);
      expect(result[0]!.total_pay).toBe(5200);
    });

    it('should default to current year when no year is provided', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);

      await service.getCostTrend(TENANT_ID);

      expect(mockPrisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            period_year: new Date().getFullYear(),
          }),
        }),
      );
    });

    it('should return empty array when no finalised runs exist', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);

      const result = await service.getCostTrend(TENANT_ID, 2026);

      expect(result).toEqual([]);
    });
  });

  describe('getYtdSummary', () => {
    it('should aggregate payroll entries by staff and return YTD totals', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          staff_profile_id: STAFF_ID,
          compensation_type: 'salaried',
          basic_pay: 5000,
          bonus_pay: 200,
          total_pay: 5200,
          staff_profile: { id: STAFF_ID, user: { first_name: 'Ali', last_name: 'Khan' } },
        },
        {
          id: 'entry-2',
          staff_profile_id: STAFF_ID,
          compensation_type: 'salaried',
          basic_pay: 5000,
          bonus_pay: 300,
          total_pay: 5300,
          staff_profile: { id: STAFF_ID, user: { first_name: 'Ali', last_name: 'Khan' } },
        },
      ]);

      const result = await service.getYtdSummary(TENANT_ID, 2026, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.staff_profile_id).toBe(STAFF_ID);
      expect(result.data[0]!.ytd_basic).toBe(10000);
      expect(result.data[0]!.ytd_bonus).toBe(500);
      expect(result.data[0]!.ytd_total).toBe(10500);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should return paginated results with correct meta', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => ({
        id: `entry-${i}`,
        staff_profile_id: `staff-${i}`,
        compensation_type: 'salaried',
        basic_pay: 1000,
        bonus_pay: 0,
        total_pay: 1000,
        staff_profile: { id: `staff-${i}`, user: { first_name: 'Staff', last_name: `${i}` } },
      }));

      mockPrisma.payrollEntry.findMany.mockResolvedValue(entries);

      const result = await service.getYtdSummary(TENANT_ID, 2026, 1, 3);

      // 5 staff total, page 1 of pageSize 3
      expect(result.meta.total).toBe(5);
      expect(result.data).toHaveLength(3);
    });

    it('should sort results by ytd_total descending', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'e1',
          staff_profile_id: 'staff-low',
          compensation_type: 'salaried',
          basic_pay: 1000,
          bonus_pay: 0,
          total_pay: 1000,
          staff_profile: { id: 'staff-low', user: { first_name: 'Low', last_name: 'Earner' } },
        },
        {
          id: 'e2',
          staff_profile_id: 'staff-high',
          compensation_type: 'salaried',
          basic_pay: 8000,
          bonus_pay: 500,
          total_pay: 8500,
          staff_profile: { id: 'staff-high', user: { first_name: 'High', last_name: 'Earner' } },
        },
      ]);

      const result = await service.getYtdSummary(TENANT_ID, 2026);

      expect(result.data[0]!.staff_profile_id).toBe('staff-high');
      expect(result.data[1]!.staff_profile_id).toBe('staff-low');
    });
  });

  describe('getBonusAnalysis', () => {
    it('should aggregate bonus entries per staff with months_with_bonus count', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'e1',
          staff_profile_id: STAFF_ID,
          compensation_type: 'salaried',
          bonus_pay: 300,
          staff_profile: { id: STAFF_ID, user: { first_name: 'Ali', last_name: 'Khan' } },
        },
        {
          id: 'e2',
          staff_profile_id: STAFF_ID,
          compensation_type: 'salaried',
          bonus_pay: 500,
          staff_profile: { id: STAFF_ID, user: { first_name: 'Ali', last_name: 'Khan' } },
        },
      ]);

      const result = await service.getBonusAnalysis(TENANT_ID, 2026);

      expect(result).toHaveLength(1);
      expect(result[0]!.months_with_bonus).toBe(2);
      expect(result[0]!.total_bonus_amount).toBe(800);
      expect(result[0]!.avg_bonus_per_month).toBe(400);
    });

    it('should return empty array when no entries with bonus_pay > 0 exist', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      const result = await service.getBonusAnalysis(TENANT_ID, 2026);

      expect(result).toEqual([]);
    });
  });

  describe('getMonthlySummary', () => {
    it('should return run and entries with numeric monetary values', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
        status: 'finalised',
        total_basic_pay: 5000,
        total_bonus_pay: 200,
        total_pay: 5200,
        headcount: 1,
        entries: [
          {
            id: 'entry-1',
            compensation_type: 'salaried',
            days_worked: 22,
            classes_taught: null,
            basic_pay: 5000,
            bonus_pay: 200,
            total_pay: 5200,
            created_at: new Date(),
            staff_profile: {
              id: STAFF_ID,
              staff_number: 'STF-001',
              department: 'Math',
              job_title: 'Teacher',
              user: { first_name: 'Ali', last_name: 'Khan' },
            },
          },
        ],
      });

      const result = await service.getMonthlySummary(TENANT_ID, RUN_ID);

      expect(result.run.id).toBe(RUN_ID);
      expect(result.run.total_pay).toBe(5200);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.staff_name).toBe('Ali Khan');
      expect(result.entries[0]!.basic_pay).toBe(5000);
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);

      await expect(service.getMonthlySummary(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.getMonthlySummary(TENANT_ID, 'nonexistent')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PAYROLL_RUN_NOT_FOUND' }),
      });
    });
  });

  describe('getStaffPaymentHistory', () => {
    it('should return paginated payment history for a staff member', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          basic_pay: 5000,
          bonus_pay: 200,
          total_pay: 5200,
          payroll_run: { period_label: 'March 2026', period_month: 3, period_year: 2026 },
          payslip: { id: 'payslip-1' },
        },
      ]);
      mockPrisma.payrollEntry.count.mockResolvedValue(1);

      const result = await service.getStaffPaymentHistory(TENANT_ID, STAFF_ID, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.payslip_id).toBe('payslip-1');
      expect(result.data[0]!.basic_pay).toBe(5000);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should return null payslip_id when no payslip is linked', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
          payroll_run: { period_label: 'January 2026', period_month: 1, period_year: 2026 },
          payslip: null,
        },
      ]);
      mockPrisma.payrollEntry.count.mockResolvedValue(1);

      const result = await service.getStaffPaymentHistory(TENANT_ID, STAFF_ID, 1, 20);

      expect(result.data[0]!.payslip_id).toBeNull();
    });
  });

  describe('exportMonthlySummary', () => {
    const mockRunWithEntries = {
      id: RUN_ID,
      period_label: 'March 2026',
      period_month: 3,
      period_year: 2026,
      total_working_days: 22,
      status: 'finalised',
      total_basic_pay: 5000,
      total_bonus_pay: 0,
      total_pay: 5000,
      headcount: 1,
      entries: [
        {
          id: 'entry-1',
          compensation_type: 'salaried',
          days_worked: 22,
          classes_taught: null,
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
          created_at: new Date(),
          staff_profile: {
            id: STAFF_ID,
            staff_number: 'STF-001',
            department: 'Math',
            job_title: 'Teacher',
            user: { first_name: 'Ali', last_name: 'Khan' },
          },
        },
      ],
    };

    it('should return CSV content for csv format', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRunWithEntries);

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'csv');

      expect(result.format).toBe('csv');
      expect((result as { format: string; content: string; filename: string }).content).toContain(
        'Staff Name',
      );
      expect((result as { format: string; content: string; filename: string }).filename).toContain(
        '2026-03',
      );
    });

    it('should return PDF html for pdf format with branding', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRunWithEntries);

      // Mock the TenantReadFacade.findBranding via the facade provider
      const tenantReadFacade = module.get(TenantReadFacade);
      (tenantReadFacade.findBranding as jest.Mock).mockResolvedValue({
        school_name_display: 'Al Noor Academy',
        school_name_ar: 'مدرسة النور',
        logo_url: 'https://example.com/logo.png',
      });

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'pdf');

      expect(result.format).toBe('pdf');
      const pdfResult = result as { format: string; html: string; data: unknown };
      expect(pdfResult.html).toContain('Al Noor Academy');
      expect(pdfResult.html).toContain('Payroll Summary');
      expect(pdfResult.html).toContain('Ali Khan');
    });

    it('should use fallback school name when branding is null', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRunWithEntries);

      const tenantReadFacade = module.get(TenantReadFacade);
      (tenantReadFacade.findBranding as jest.Mock).mockResolvedValue(null);

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'pdf');

      const pdfResult = result as { format: string; html: string; data: unknown };
      expect(pdfResult.html).toContain('School');
    });
  });

  describe('exportYtdSummary', () => {
    it('should return CSV content for csv format', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'e1',
          staff_profile_id: STAFF_ID,
          compensation_type: 'salaried',
          basic_pay: 5000,
          bonus_pay: 200,
          total_pay: 5200,
          staff_profile: { id: STAFF_ID, user: { first_name: 'Ali', last_name: 'Khan' } },
        },
      ]);

      const result = await service.exportYtdSummary(TENANT_ID, 2026, 'csv');

      expect(result.format).toBe('csv');
      const csvResult = result as { format: string; content: string; filename: string };
      expect(csvResult.content).toContain('Staff Name');
      expect(csvResult.content).toContain('Ali Khan');
      expect(csvResult.filename).toBe('payroll-ytd-2026.csv');
    });

    it('should return PDF data for pdf format', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      const result = await service.exportYtdSummary(TENANT_ID, 2026, 'pdf');

      expect(result.format).toBe('pdf');
      const pdfResult = result as { format: string; data: unknown[]; year: number };
      expect(pdfResult.year).toBe(2026);
    });

    it('should default to current year when year is undefined', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      const result = await service.exportYtdSummary(TENANT_ID, undefined, 'csv');

      const csvResult = result as { format: string; content: string; filename: string };
      expect(csvResult.filename).toBe(`payroll-ytd-${new Date().getFullYear()}.csv`);
    });
  });

  describe('getYtdSummary — defaults', () => {
    it('should default to current year when year is not provided', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      const result = await service.getYtdSummary(TENANT_ID);

      expect(mockPrisma.payrollEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payroll_run: expect.objectContaining({
              period_year: new Date().getFullYear(),
            }),
          }),
        }),
      );
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
    });
  });

  describe('getBonusAnalysis — defaults', () => {
    it('should default to current year when year is not provided', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      const result = await service.getBonusAnalysis(TENANT_ID);

      expect(mockPrisma.payrollEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payroll_run: expect.objectContaining({
              period_year: new Date().getFullYear(),
            }),
          }),
        }),
      );
      expect(result).toEqual([]);
    });

    it('should sort by total_bonus_amount descending', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'e1',
          staff_profile_id: 'staff-low',
          compensation_type: 'salaried',
          bonus_pay: 100,
          staff_profile: { id: 'staff-low', user: { first_name: 'Low', last_name: 'Bonus' } },
        },
        {
          id: 'e2',
          staff_profile_id: 'staff-high',
          compensation_type: 'salaried',
          bonus_pay: 500,
          staff_profile: { id: 'staff-high', user: { first_name: 'High', last_name: 'Bonus' } },
        },
      ]);

      const result = await service.getBonusAnalysis(TENANT_ID, 2026);

      expect(result[0]!.staff_profile_id).toBe('staff-high');
      expect(result[1]!.staff_profile_id).toBe('staff-low');
    });
  });

  describe('getMonthlySummary — CSV fields', () => {
    it('should handle entries with null optional fields in CSV', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
        status: 'finalised',
        total_basic_pay: 0,
        total_bonus_pay: 0,
        total_pay: 0,
        headcount: 1,
        entries: [
          {
            id: 'entry-1',
            compensation_type: 'per_class',
            days_worked: null,
            classes_taught: 10,
            basic_pay: 2000,
            bonus_pay: 0,
            total_pay: 2000,
            created_at: new Date(),
            staff_profile: {
              id: STAFF_ID,
              staff_number: null,
              department: null,
              job_title: null,
              user: { first_name: 'Sara', last_name: 'Ahmed' },
            },
          },
        ],
      });

      const result = await service.getMonthlySummary(TENANT_ID, RUN_ID);

      expect(result.entries[0]!.staff_number).toBeNull();
      expect(result.entries[0]!.department).toBeNull();
      expect(result.entries[0]!.days_worked).toBeNull();
      expect(result.entries[0]!.classes_taught).toBe(10);
    });
  });

  describe('getStaffPaymentHistory — defaults', () => {
    it('should use default page=1 and pageSize=20 when not provided', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);
      mockPrisma.payrollEntry.count.mockResolvedValue(0);

      const result = await service.getStaffPaymentHistory(TENANT_ID, STAFF_ID);

      expect(mockPrisma.payrollEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
    });
  });

  // ─── CSV generation — null field fallback branches ────────────────────────────

  describe('exportMonthlySummary — CSV with null fields', () => {
    it('should use empty string fallbacks for null optional CSV fields', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
        status: 'finalised',
        total_basic_pay: 2000,
        total_bonus_pay: 0,
        total_pay: 2000,
        headcount: 1,
        entries: [
          {
            id: 'entry-1',
            compensation_type: 'per_class',
            days_worked: null,
            classes_taught: null,
            basic_pay: 2000,
            bonus_pay: 0,
            total_pay: 2000,
            created_at: new Date(),
            staff_profile: {
              id: STAFF_ID,
              staff_number: null,
              department: null,
              job_title: null,
              user: { first_name: 'Sara', last_name: 'Ahmed' },
            },
          },
        ],
      });

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'csv');

      const csvResult = result as { format: string; content: string; filename: string };
      // The CSV should have empty strings for null fields
      expect(csvResult.content).toContain('Sara Ahmed');
      // Should not contain 'null' as text
      expect(csvResult.content).not.toContain('null');
    });
  });

  // ─── HTML generation — null field fallback branches ───────────────────────────

  describe('exportMonthlySummary — HTML with null fields', () => {
    it('should use empty string fallbacks for null optional HTML fields', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
        status: 'finalised',
        total_basic_pay: 2000,
        total_bonus_pay: 0,
        total_pay: 2000,
        headcount: 1,
        entries: [
          {
            id: 'entry-1',
            compensation_type: 'per_class',
            days_worked: null,
            classes_taught: null,
            basic_pay: 2000,
            bonus_pay: 0,
            total_pay: 2000,
            created_at: new Date(),
            staff_profile: {
              id: STAFF_ID,
              staff_number: null,
              department: null,
              job_title: null,
              user: { first_name: 'Sara', last_name: 'Ahmed' },
            },
          },
        ],
      });

      const tenantReadFacade = module.get(TenantReadFacade);
      (tenantReadFacade.findBranding as jest.Mock).mockResolvedValue({
        school_name_display: 'Test School',
        school_name_ar: null,
        logo_url: null,
      });

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'pdf');

      const pdfResult = result as { format: string; html: string; data: unknown };
      // HTML should not contain 'null' as text in the cells
      const tableSection = pdfResult.html.split('<tbody>')[1]!.split('</tbody>')[0]!;
      expect(tableSection).toContain('Sara Ahmed');
      // Null fields should produce empty cells
      expect(tableSection).not.toMatch(/>null</);
    });
  });

  // ─── exportMonthlySummary — PDF with all-null entry fields ─────────────────

  describe('exportMonthlySummary — PDF with comprehensive null fields', () => {
    it('should handle entries with all optional fields null in HTML generation', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        period_label: 'April 2026',
        period_month: 4,
        period_year: 2026,
        total_working_days: 20,
        status: 'finalised',
        total_basic_pay: 0,
        total_bonus_pay: 0,
        total_pay: 0,
        headcount: 1,
        entries: [
          {
            id: 'entry-null',
            compensation_type: null,
            days_worked: null,
            classes_taught: null,
            basic_pay: null,
            bonus_pay: null,
            total_pay: null,
            created_at: new Date(),
            staff_profile: {
              id: STAFF_ID,
              staff_number: null,
              department: null,
              job_title: null,
              user: { first_name: 'Test', last_name: 'Null' },
            },
          },
        ],
      });

      const tenantReadFacade = module.get(TenantReadFacade);
      (tenantReadFacade.findBranding as jest.Mock).mockResolvedValue({
        school_name_display: 'Null School',
        school_name_ar: undefined,
        logo_url: undefined,
      });

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'pdf');

      const pdfResult = result as { format: string; html: string };
      // HTML should not crash with null values
      expect(pdfResult.html).toContain('Null School');
      expect(pdfResult.html).toContain('Test Null');
    });
  });

  // ─── getCostTrend — multiple runs serialization ──────────────────────────────

  describe('getCostTrend — multiple runs', () => {
    it('should return multiple months with correct numeric values', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([
        {
          period_month: 1,
          period_year: 2026,
          period_label: 'January 2026',
          total_basic_pay: 5000,
          total_bonus_pay: 200,
          total_pay: 5200,
          headcount: 8,
        },
        {
          period_month: 2,
          period_year: 2026,
          period_label: 'February 2026',
          total_basic_pay: 5500,
          total_bonus_pay: 300,
          total_pay: 5800,
          headcount: 9,
        },
      ]);

      const result = await service.getCostTrend(TENANT_ID, 2026);

      expect(result).toHaveLength(2);
      expect(result[0]!.period_month).toBe(1);
      expect(result[1]!.period_month).toBe(2);
      expect(result[1]!.headcount).toBe(9);
    });
  });
});
