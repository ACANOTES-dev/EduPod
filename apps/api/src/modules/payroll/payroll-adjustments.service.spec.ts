import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollAdjustmentsService } from './payroll-adjustments.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID = '33333333-3333-3333-3333-333333333333';
const ADJ_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = '55555555-5555-5555-5555-555555555555';

const mockEntry = {
  id: ENTRY_ID,
  tenant_id: TENANT_ID,
  payroll_run_id: RUN_ID,
  staff_profile_id: '66666666-6666-6666-6666-666666666666',
  payroll_run: { status: 'draft' },
};

const mockAdjustment = {
  id: ADJ_ID,
  tenant_id: TENANT_ID,
  payroll_run_id: RUN_ID,
  payroll_entry_id: ENTRY_ID,
  adjustment_type: 'bonus',
  amount: '500.00',
  description: 'Performance bonus',
  reference_period: null,
  created_by_user_id: USER_ID,
  created_at: new Date(),
  updated_at: new Date(),
};

function buildPrisma() {
  return {
    payrollEntry: {
      findFirst: jest.fn().mockResolvedValue(mockEntry),
    },
    payrollAdjustment: {
      create: jest.fn().mockResolvedValue(mockAdjustment),
      findMany: jest.fn().mockResolvedValue([mockAdjustment]),
      findFirst: jest.fn().mockResolvedValue({ ...mockAdjustment, payroll_run: { status: 'draft' } }),
      update: jest.fn().mockResolvedValue(mockAdjustment),
      delete: jest.fn().mockResolvedValue(mockAdjustment),
    },
    $extends: jest.fn().mockReturnThis(),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        payrollAdjustment: {
          create: jest.fn().mockResolvedValue(mockAdjustment),
        },
      }),
    ),
  };
}

describe('PayrollAdjustmentsService', () => {
  let service: PayrollAdjustmentsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollAdjustmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PayrollAdjustmentsService>(PayrollAdjustmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create adjustment and return serialized amount', async () => {
    const result = await service.createAdjustment(TENANT_ID, RUN_ID, USER_ID, {
      payroll_entry_id: ENTRY_ID,
      adjustment_type: 'bonus',
      amount: 500,
      description: 'Performance bonus',
    }) as Record<string, unknown>;

    expect(result).toMatchObject({ adjustment_type: 'bonus' });
    expect(typeof result['amount']).toBe('number');
  });

  it('should throw NotFoundException when entry not found', async () => {
    prisma.payrollEntry.findFirst = jest.fn().mockResolvedValue(null);

    await expect(
      service.createAdjustment(TENANT_ID, RUN_ID, USER_ID, {
        payroll_entry_id: ENTRY_ID,
        adjustment_type: 'bonus',
        amount: 100,
        description: 'Test',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when run is not draft', async () => {
    prisma.payrollEntry.findFirst = jest.fn().mockResolvedValue({
      ...mockEntry,
      payroll_run: { status: 'finalised' },
    });

    await expect(
      service.createAdjustment(TENANT_ID, RUN_ID, USER_ID, {
        payroll_entry_id: ENTRY_ID,
        adjustment_type: 'bonus',
        amount: 100,
        description: 'Test',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should list adjustments for an entry', async () => {
    prisma.payrollEntry.findFirst = jest.fn().mockResolvedValue(mockEntry);
    const result = await service.listAdjustments(TENANT_ID, ENTRY_ID);
    expect(result.data).toHaveLength(1);
  });

  it('should delete adjustment when run is draft', async () => {
    const result = await service.deleteAdjustment(TENANT_ID, ADJ_ID);
    expect(result).toMatchObject({ id: ADJ_ID, deleted: true });
  });

  it('should throw NotFoundException for non-existent adjustment', async () => {
    prisma.payrollAdjustment.findFirst = jest.fn().mockResolvedValue(null);

    await expect(
      service.getAdjustment(TENANT_ID, ADJ_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
