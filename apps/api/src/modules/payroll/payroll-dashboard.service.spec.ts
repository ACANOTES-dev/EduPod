import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollDashboardService } from './payroll-dashboard.service';

describe('PayrollDashboardService', () => {
  let service: PayrollDashboardService;

  const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const RUN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const mockPrisma = {
    payrollRun: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    payrollEntry: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        PayrollDashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PayrollDashboardService>(PayrollDashboardService);
  });

  describe('getDashboard', () => {
    it('should return null latest_run when no non-cancelled runs exist', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.latest_run).toBeNull();
      expect(result.latest_finalised).toBeNull();
      expect(result.cost_trend).toEqual([]);
      expect(result.incomplete_entries).toEqual([]);
      expect(result.current_draft_id).toBeNull();
    });

    it('should return latest_run with numeric monetary fields when a run exists', async () => {
      const latestRun = {
        id: RUN_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        status: 'draft',
        total_basic_pay: { toNumber: () => 5000 } as unknown as number,
        total_bonus_pay: { toNumber: () => 200 } as unknown as number,
        total_pay: { toNumber: () => 5200 } as unknown as number,
        headcount: 10,
        created_at: new Date(),
        finalised_at: null,
      };

      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(latestRun)   // latest run (non-cancelled)
        .mockResolvedValueOnce(null)        // latest finalised
        .mockResolvedValueOnce(null);       // current draft

      mockPrisma.payrollRun.findMany.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.latest_run).not.toBeNull();
      expect(result.latest_run?.total_basic_pay).toBe(Number(latestRun.total_basic_pay));
      expect(result.latest_run?.total_pay).toBe(Number(latestRun.total_pay));
    });

    it('should return cost_trend in chronological order (reversed from DB)', async () => {
      const trendRuns = [
        { period_month: 3, period_year: 2026, period_label: 'March 2026', total_basic_pay: 5000, total_bonus_pay: 0, total_pay: 5000, headcount: 8 },
        { period_month: 2, period_year: 2026, period_label: 'February 2026', total_basic_pay: 4800, total_bonus_pay: 0, total_pay: 4800, headcount: 8 },
      ];

      // DB returns newest-first (desc), service reverses to chronological
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.payrollRun.findMany.mockResolvedValue([...trendRuns]);

      const result = await service.getDashboard(TENANT_ID);

      // After reverse(), first element should be the second one in the returned array
      expect(result.cost_trend[0]!.period_month).toBe(2);
      expect(result.cost_trend[1]!.period_month).toBe(3);
    });

    it('should include incomplete entries from current draft run', async () => {
      const draftRun = { id: RUN_ID, tenant_id: TENANT_ID, status: 'draft' };

      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(null)   // latest non-cancelled
        .mockResolvedValueOnce(null)   // latest finalised
        .mockResolvedValueOnce(draftRun); // current draft

      mockPrisma.payrollRun.findMany.mockResolvedValue([]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          compensation_type: 'salaried',
          days_worked: null,
          classes_taught: null,
          staff_profile: {
            id: 'sp-1',
            staff_number: 'STF-001',
            user: { first_name: 'Ali', last_name: 'Khan' },
          },
        },
      ]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.current_draft_id).toBe(RUN_ID);
      expect(result.incomplete_entries).toHaveLength(1);
      expect(result.incomplete_entries[0]).toMatchObject({
        id: 'entry-1',
        staff_name: 'Ali Khan',
        staff_number: 'STF-001',
        compensation_type: 'salaried',
        missing_field: 'days_worked',
      });
    });

    it('should set missing_field to classes_taught for per_class entries', async () => {
      const draftRun = { id: RUN_ID, tenant_id: TENANT_ID, status: 'draft' };

      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(draftRun);

      mockPrisma.payrollRun.findMany.mockResolvedValue([]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-2',
          compensation_type: 'per_class',
          days_worked: null,
          classes_taught: null,
          staff_profile: {
            id: 'sp-2',
            staff_number: 'STF-002',
            user: { first_name: 'Sara', last_name: 'Ahmed' },
          },
        },
      ]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.incomplete_entries[0]!.missing_field).toBe('classes_taught');
    });

    it('should return empty incomplete_entries when no draft run exists', async () => {
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null); // no draft

      mockPrisma.payrollRun.findMany.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.incomplete_entries).toEqual([]);
      expect(mockPrisma.payrollEntry.findMany).not.toHaveBeenCalled();
    });
  });
});
