import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { PayrollReportsService } from './payroll-reports.service';

describe('PayrollReportsService', () => {
  let service: PayrollReportsService;

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

    const module = await Test.createTestingModule({
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
    it('should return CSV content for csv format', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
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
      });

      const result = await service.exportMonthlySummary(TENANT_ID, RUN_ID, 'csv');

      expect(result.format).toBe('csv');
      expect((result as { format: string; content: string; filename: string }).content).toContain('Staff Name');
      expect((result as { format: string; content: string; filename: string }).filename).toContain('2026-03');
    });
  });
});
