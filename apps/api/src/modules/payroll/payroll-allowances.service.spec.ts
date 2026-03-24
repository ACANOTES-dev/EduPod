import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollAllowancesService } from './payroll-allowances.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';
const TYPE_ID = '33333333-3333-3333-3333-333333333333';
const ALLOWANCE_ID = '44444444-4444-4444-4444-444444444444';

const mockType = {
  id: TYPE_ID,
  tenant_id: TENANT_ID,
  name: 'Housing',
  name_ar: null,
  is_recurring: true,
  default_amount: '500.00',
  active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockAllowance = {
  id: ALLOWANCE_ID,
  tenant_id: TENANT_ID,
  staff_profile_id: STAFF_ID,
  allowance_type_id: TYPE_ID,
  amount: '500.00',
  effective_from: new Date('2026-01-01'),
  effective_to: null,
  created_at: new Date(),
  updated_at: new Date(),
  allowance_type: { id: TYPE_ID, name: 'Housing', name_ar: null },
};

function buildPrisma() {
  return {
    payrollAllowanceType: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(mockType),
      findMany: jest.fn().mockResolvedValue([mockType]),
      create: jest.fn().mockResolvedValue(mockType),
      update: jest.fn().mockResolvedValue(mockType),
      delete: jest.fn().mockResolvedValue(mockType),
    },
    staffAllowance: {
      findFirst: jest.fn().mockResolvedValue(mockAllowance),
      findMany: jest.fn().mockResolvedValue([mockAllowance]),
      create: jest.fn().mockResolvedValue(mockAllowance),
      update: jest.fn().mockResolvedValue(mockAllowance),
      delete: jest.fn().mockResolvedValue(mockAllowance),
    },
    $extends: jest.fn().mockReturnThis(),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        payrollAllowanceType: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockType),
        },
        staffAllowance: {
          create: jest.fn().mockResolvedValue(mockAllowance),
        },
      }),
    ),
  };
}

describe('PayrollAllowancesService', () => {
  let service: PayrollAllowancesService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollAllowancesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PayrollAllowancesService>(PayrollAllowancesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list allowance types', async () => {
    const result = await service.listAllowanceTypes(TENANT_ID);
    expect(result.data).toHaveLength(1);
    const first = result.data[0] as Record<string, unknown>;
    expect(typeof first['default_amount']).toBe('number');
  });

  it('should throw NotFoundException for non-existent allowance type', async () => {
    prisma.payrollAllowanceType.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      service.getAllowanceType(TENANT_ID, TYPE_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should list staff allowances', async () => {
    const result = await service.listStaffAllowances(TENANT_ID, STAFF_ID);
    expect(result.data).toHaveLength(1);
    const first = result.data[0] as Record<string, unknown>;
    expect(typeof first['amount']).toBe('number');
  });

  it('should delete staff allowance', async () => {
    const result = await service.deleteStaffAllowance(TENANT_ID, ALLOWANCE_ID);
    expect(result).toMatchObject({ id: ALLOWANCE_ID, deleted: true });
  });

  it('should calculate allowances for an entry on a given date', async () => {
    prisma.staffAllowance.findMany = jest.fn().mockResolvedValue([
      { ...mockAllowance, allowance_type: { id: TYPE_ID, name: 'Housing', name_ar: null, is_recurring: true } },
      {
        id: '55555555-5555-5555-5555-555555555555',
        amount: '200.00',
        allowance_type_id: '66666666-6666-6666-6666-666666666666',
        allowance_type: { id: '66666666-6666-6666-6666-666666666666', name: 'Transport', name_ar: null, is_recurring: true },
      },
    ]);

    const result = await service.calculateAllowancesForEntry(
      TENANT_ID,
      STAFF_ID,
      new Date('2026-03-01'),
    );

    expect(result.total).toBe(700);
    expect(result.allowances).toHaveLength(2);
  });

  it('should throw NotFoundException when deleting non-existent staff allowance', async () => {
    prisma.staffAllowance.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      service.deleteStaffAllowance(TENANT_ID, ALLOWANCE_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
