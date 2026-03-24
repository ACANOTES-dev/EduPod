import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollDeductionsService } from './payroll-deductions.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';
const DEDUCTION_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';
const RUN_ID = '55555555-5555-5555-5555-555555555555';
const ENTRY_ID = '66666666-6666-6666-6666-666666666666';

const mockDeduction = {
  id: DEDUCTION_ID,
  tenant_id: TENANT_ID,
  staff_profile_id: STAFF_ID,
  description: 'Salary advance repayment',
  total_amount: '1000.00',
  monthly_amount: '200.00',
  remaining_amount: '1000.00',
  start_date: new Date('2026-01-01'),
  months_remaining: 5,
  active: true,
  created_by_user_id: USER_ID,
  created_at: new Date(),
  updated_at: new Date(),
};

function buildPrisma() {
  return {
    staffRecurringDeduction: {
      findFirst: jest.fn().mockResolvedValue(mockDeduction),
      findMany: jest.fn().mockResolvedValue([mockDeduction]),
      create: jest.fn().mockResolvedValue(mockDeduction),
      update: jest.fn().mockResolvedValue(mockDeduction),
      delete: jest.fn().mockResolvedValue(mockDeduction),
    },
    payrollEntry: {
      findMany: jest.fn().mockResolvedValue([
        { id: ENTRY_ID, staff_profile_id: STAFF_ID },
      ]),
    },
    $extends: jest.fn().mockReturnThis(),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        staffRecurringDeduction: {
          findMany: jest.fn().mockResolvedValue([mockDeduction]),
          update: jest.fn().mockResolvedValue({ ...mockDeduction, remaining_amount: '800.00', months_remaining: 4 }),
        },
      }),
    ),
  };
}

describe('PayrollDeductionsService', () => {
  let service: PayrollDeductionsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollDeductionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PayrollDeductionsService>(PayrollDeductionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list deductions with serialized amounts', async () => {
    const result = await service.listDeductions(TENANT_ID, STAFF_ID);
    expect(result.data).toHaveLength(1);
    const first = result.data[0] as Record<string, unknown>;
    expect(typeof first['total_amount']).toBe('number');
    expect(typeof first['monthly_amount']).toBe('number');
    expect(typeof first['remaining_amount']).toBe('number');
  });

  it('should throw NotFoundException for non-existent deduction', async () => {
    prisma.staffRecurringDeduction.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      service.getDeduction(TENANT_ID, DEDUCTION_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should calculate months_remaining correctly on create', async () => {
    // total=1000, monthly=200, should compute 5 months
    const mockCreated = { ...mockDeduction, months_remaining: 5 };
    prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        staffRecurringDeduction: {
          create: jest.fn().mockResolvedValue(mockCreated),
        },
      }),
    );

    const result = await service.createDeduction(TENANT_ID, USER_ID, {
      staff_profile_id: STAFF_ID,
      description: 'Salary advance repayment',
      total_amount: 1000,
      monthly_amount: 200,
      start_date: '2026-01-01',
    }) as Record<string, unknown>;

    expect(result['months_remaining']).toBe(5);
  });

  it('should return active deductions total for staff', async () => {
    const result = await service.getActiveDeductionsForStaff(TENANT_ID, STAFF_ID);
    expect(result.total_monthly_deduction).toBe(200);
    expect(result.deductions).toHaveLength(1);
  });

  it('should delete deduction', async () => {
    const result = await service.deleteDeduction(TENANT_ID, DEDUCTION_ID);
    expect(result).toMatchObject({ id: DEDUCTION_ID, deleted: true });
  });

  it('edge: autoApplyForRun should return staff deduction map', async () => {
    const result = await service.autoApplyForRun(TENANT_ID, RUN_ID);
    expect(result).toBeInstanceOf(Map);
    expect(result.get(STAFF_ID)).toBe(200);
  });
});
