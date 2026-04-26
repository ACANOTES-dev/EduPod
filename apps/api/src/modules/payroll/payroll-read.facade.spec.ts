import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollReadFacade } from './payroll-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildPrisma() {
  return {
    payrollRun: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    staffCompensation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payrollEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payslip: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffAllowance: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffRecurringDeduction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffAttendanceRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('PayrollReadFacade', () => {
  let facade: PayrollReadFacade;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollReadFacade, { provide: PrismaService, useValue: prisma }],
    }).compile();

    facade = module.get<PayrollReadFacade>(PayrollReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findPayrollRuns', () => {
    it('should query payroll runs with tenant_id filter', async () => {
      await facade.findPayrollRuns(TENANT_ID);
      expect(prisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });
  });

  describe('countPayrollRunsBeforeDate', () => {
    it('should count runs before cutoff date', async () => {
      const cutoff = new Date('2026-01-01');
      await facade.countPayrollRunsBeforeDate(TENANT_ID, cutoff);
      expect(prisma.payrollRun.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            created_at: { lt: cutoff },
          },
        }),
      );
    });
  });

  describe('findCompensationsByStaff', () => {
    it('should query compensations for a specific staff member', async () => {
      await facade.findCompensationsByStaff(TENANT_ID, STAFF_ID);
      expect(prisma.staffCompensation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, staff_profile_id: STAFF_ID },
        }),
      );
    });
  });

  describe('findCompensations', () => {
    it('should query all compensations for a tenant', async () => {
      await facade.findCompensations(TENANT_ID);
      expect(prisma.staffCompensation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });
  });

  describe('findPayrollEntriesByStaff', () => {
    it('should query entries for a staff member', async () => {
      await facade.findPayrollEntriesByStaff(TENANT_ID, STAFF_ID);
      expect(prisma.payrollEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, staff_profile_id: STAFF_ID },
        }),
      );
    });
  });

  describe('findPayslipsByStaff', () => {
    it('should query payslips for a staff member via payroll_entry relation', async () => {
      await facade.findPayslipsByStaff(TENANT_ID, STAFF_ID);
      expect(prisma.payslip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            payroll_entry: { staff_profile_id: STAFF_ID },
          },
        }),
      );
    });
  });

  describe('findAllowancesByStaff', () => {
    it('should query allowances for a staff member', async () => {
      await facade.findAllowancesByStaff(TENANT_ID, STAFF_ID);
      expect(prisma.staffAllowance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, staff_profile_id: STAFF_ID },
        }),
      );
    });
  });

  describe('findRecurringDeductionsByStaff', () => {
    it('should query recurring deductions for a staff member', async () => {
      await facade.findRecurringDeductionsByStaff(TENANT_ID, STAFF_ID);
      expect(prisma.staffRecurringDeduction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, staff_profile_id: STAFF_ID },
        }),
      );
    });
  });

  describe('findStaffAttendanceByStaff', () => {
    it('should query attendance records for a staff member', async () => {
      await facade.findStaffAttendanceByStaff(TENANT_ID, STAFF_ID);
      expect(prisma.staffAttendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, staff_profile_id: STAFF_ID },
        }),
      );
    });
  });

  describe('findPayrollRunsGeneric', () => {
    it('should pass optional where, select, and orderBy', async () => {
      const where = { status: 'finalised' as const };
      const select = { id: true, status: true };
      const orderBy = { created_at: 'desc' as const };

      await facade.findPayrollRunsGeneric(TENANT_ID, where, select, orderBy);

      expect(prisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'finalised' },
          select,
          orderBy,
        }),
      );
    });

    it('should work without optional params', async () => {
      await facade.findPayrollRunsGeneric(TENANT_ID);

      expect(prisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });
  });

  describe('groupStaffAttendanceBy', () => {
    it('should group by provided fields', async () => {
      prisma.staffAttendanceRecord.groupBy.mockResolvedValue([{ status: 'present', _count: 10 }]);

      const result = await facade.groupStaffAttendanceBy(TENANT_ID, ['status' as never]);

      expect(prisma.staffAttendanceRecord.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['status'],
          where: { tenant_id: TENANT_ID },
          _count: true,
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should pass optional where clause', async () => {
      const extraWhere = { date: { gte: new Date('2026-01-01') } };
      prisma.staffAttendanceRecord.groupBy.mockResolvedValue([]);

      await facade.groupStaffAttendanceBy(TENANT_ID, ['status' as never], extraWhere);

      expect(prisma.staffAttendanceRecord.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, ...extraWhere },
        }),
      );
    });
  });

  describe('findCompensationsGeneric', () => {
    it('should pass optional where and select', async () => {
      const where = { compensation_type: 'salaried' as const };
      const select = { id: true, base_salary: true };

      await facade.findCompensationsGeneric(TENANT_ID, where, select);

      expect(prisma.staffCompensation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, compensation_type: 'salaried' },
          select,
        }),
      );
    });

    it('should work without optional params', async () => {
      await facade.findCompensationsGeneric(TENANT_ID);

      expect(prisma.staffCompensation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });
  });

  describe('sumPayrollEntriesByDepartmentForPeriod', () => {
    it('returns empty array when no payroll runs match the window', async () => {
      prisma.payrollRun.findMany.mockResolvedValueOnce([]);

      const result = await facade.sumPayrollEntriesByDepartmentForPeriod(
        TENANT_ID,
        new Date('2026-01-01'),
        new Date('2026-03-31'),
      );

      expect(result).toEqual([]);
      // Step 2 (entries lookup) must NOT run when no runs found.
      expect(prisma.payrollEntry.findMany).not.toHaveBeenCalled();
    });

    it('buckets entries by department slug and prefers override_total_pay', async () => {
      prisma.payrollRun.findMany.mockResolvedValueOnce([{ id: 'run-1' }, { id: 'run-2' }]);
      prisma.payrollEntry.findMany.mockResolvedValueOnce([
        // Mathematics: 5000 + 3000 = 8000 (override wins on first row)
        {
          total_pay: '4000.00',
          override_total_pay: '5000.00',
          staff_profile: { department: 'Mathematics' },
        },
        {
          total_pay: '3000.00',
          override_total_pay: null,
          staff_profile: { department: 'Mathematics' },
        },
        // Science: 2000
        {
          total_pay: '2000.00',
          override_total_pay: null,
          staff_profile: { department: 'Science' },
        },
        // Unassigned: 1500 (null department)
        {
          total_pay: '1500.00',
          override_total_pay: null,
          staff_profile: { department: null },
        },
      ]);

      const result = await facade.sumPayrollEntriesByDepartmentForPeriod(
        TENANT_ID,
        new Date('2026-01-15'),
        new Date('2026-02-15'),
      );

      const byDept = Object.fromEntries(result.map((r) => [r.department_id, r.total_pay]));
      expect(byDept.mathematics).toBe(8000);
      expect(byDept.science).toBe(2000);
      expect(byDept.unassigned).toBe(1500);
    });

    it('slugifies department names — kebab-case, lowercase, trims edges', async () => {
      prisma.payrollRun.findMany.mockResolvedValueOnce([{ id: 'run-1' }]);
      prisma.payrollEntry.findMany.mockResolvedValueOnce([
        {
          total_pay: '1000.00',
          override_total_pay: null,
          staff_profile: { department: '  Modern Foreign Languages  ' },
        },
        {
          total_pay: '500.00',
          override_total_pay: null,
          staff_profile: { department: '!!!' },
        },
        {
          total_pay: '500.00',
          override_total_pay: null,
          staff_profile: { department: '' },
        },
      ]);

      const result = await facade.sumPayrollEntriesByDepartmentForPeriod(
        TENANT_ID,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      const byDept = Object.fromEntries(result.map((r) => [r.department_id, r.total_pay]));
      expect(byDept['modern-foreign-languages']).toBe(1000);
      // '!!!' has no [a-z0-9] characters → falls back to 'unassigned' bucket
      // (which also catches the empty-string case)
      expect(byDept.unassigned).toBe(1000);
    });

    it('rounds department totals to 2 decimal places', async () => {
      prisma.payrollRun.findMany.mockResolvedValueOnce([{ id: 'run-1' }]);
      prisma.payrollEntry.findMany.mockResolvedValueOnce([
        {
          total_pay: '0.111',
          override_total_pay: null,
          staff_profile: { department: 'Math' },
        },
        {
          total_pay: '0.224',
          override_total_pay: null,
          staff_profile: { department: 'Math' },
        },
      ]);

      const result = await facade.sumPayrollEntriesByDepartmentForPeriod(
        TENANT_ID,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      // 0.111 + 0.224 = 0.335 → rounded to 0.34 (Math.round(33.5) = 34)
      const math = result.find((r) => r.department_id === 'math');
      expect(math?.total_pay).toBe(0.34);
    });

    it('enumerates months across a year boundary correctly', async () => {
      // Window spans Dec 2026 → Feb 2027 → 3 month entries in OR clause
      prisma.payrollRun.findMany.mockResolvedValueOnce([]);

      await facade.sumPayrollEntriesByDepartmentForPeriod(
        TENANT_ID,
        new Date(Date.UTC(2026, 11, 15)), // 15 Dec 2026
        new Date(Date.UTC(2027, 1, 15)), // 15 Feb 2027
      );

      const call = prisma.payrollRun.findMany.mock.calls[0][0] as {
        where: { OR: Array<{ period_year: number; period_month: number }> };
      };
      expect(call.where.OR).toHaveLength(3);
      expect(call.where.OR).toEqual([
        { period_year: 2026, period_month: 12 },
        { period_year: 2027, period_month: 1 },
        { period_year: 2027, period_month: 2 },
      ]);
    });

    it('handles single-month window (from === to month)', async () => {
      prisma.payrollRun.findMany.mockResolvedValueOnce([]);

      await facade.sumPayrollEntriesByDepartmentForPeriod(
        TENANT_ID,
        new Date(Date.UTC(2026, 4, 1)),
        new Date(Date.UTC(2026, 4, 30)),
      );

      const call = prisma.payrollRun.findMany.mock.calls[0][0] as {
        where: { OR: Array<{ period_year: number; period_month: number }> };
      };
      expect(call.where.OR).toHaveLength(1);
      expect(call.where.OR[0]).toEqual({ period_year: 2026, period_month: 5 });
    });
  });
});
