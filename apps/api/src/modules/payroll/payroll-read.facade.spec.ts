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
      const where = { status: 'finalised' };
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
      const where = { compensation_type: 'salaried' };
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
});
