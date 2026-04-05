import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollOneOffsService } from './payroll-one-offs.service';

// Mock withRls helper
jest.mock('../../common/helpers/with-rls', () => ({
  withRls: jest.fn((_prisma: unknown, _ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      payrollOneOffItem: {
        create: jest.fn().mockResolvedValue({
          id: '33333333-3333-3333-3333-333333333333',
          tenant_id: '11111111-1111-1111-1111-111111111111',
          payroll_entry_id: '22222222-2222-2222-2222-222222222222',
          description: 'Annual bonus',
          amount: '1000.00',
          item_type: 'bonus',
          created_by_user_id: '44444444-4444-4444-4444-444444444444',
          created_at: new Date(),
        }),
      },
    };
    return fn(mockTx);
  }),
}));

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ENTRY_ID = '22222222-2222-2222-2222-222222222222';
const ITEM_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

const mockEntry = {
  id: ENTRY_ID,
  tenant_id: TENANT_ID,
  payroll_run: { status: 'draft' },
};

const mockItem = {
  id: ITEM_ID,
  tenant_id: TENANT_ID,
  payroll_entry_id: ENTRY_ID,
  description: 'Annual bonus',
  amount: '1000.00',
  item_type: 'bonus',
  created_by_user_id: USER_ID,
  created_at: new Date(),
  payroll_entry: {
    payroll_run: { status: 'draft' },
  },
};

function buildPrisma() {
  return {
    payrollEntry: {
      findFirst: jest.fn().mockResolvedValue(mockEntry),
    },
    payrollOneOffItem: {
      findFirst: jest.fn().mockResolvedValue(mockItem),
      findMany: jest.fn().mockResolvedValue([mockItem]),
      create: jest.fn().mockResolvedValue(mockItem),
      update: jest.fn().mockResolvedValue(mockItem),
      delete: jest.fn().mockResolvedValue(mockItem),
    },
    $extends: jest.fn().mockReturnThis(),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        payrollOneOffItem: {
          create: jest.fn().mockResolvedValue(mockItem),
        },
      }),
    ),
  };
}

describe('PayrollOneOffsService', () => {
  let service: PayrollOneOffsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollOneOffsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PayrollOneOffsService>(PayrollOneOffsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create one-off item with numeric amount', async () => {
    const result = (await service.createOneOffItem(TENANT_ID, ENTRY_ID, USER_ID, {
      description: 'Annual bonus',
      amount: 1000,
      item_type: 'bonus',
    })) as Record<string, unknown>;

    expect(typeof result['amount']).toBe('number');
    expect(result['item_type']).toBe('bonus');
  });

  it('should throw NotFoundException when entry not found for create', async () => {
    prisma.payrollEntry.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      service.createOneOffItem(TENANT_ID, ENTRY_ID, USER_ID, {
        description: 'Test',
        amount: 100,
        item_type: 'other',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when run is not draft for create', async () => {
    prisma.payrollEntry.findFirst = jest.fn().mockResolvedValue({
      ...mockEntry,
      payroll_run: { status: 'finalised' },
    });

    await expect(
      service.createOneOffItem(TENANT_ID, ENTRY_ID, USER_ID, {
        description: 'Test',
        amount: 100,
        item_type: 'other',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should list one-off items for an entry', async () => {
    const result = await service.listOneOffItems(TENANT_ID, ENTRY_ID);
    expect(result.data).toHaveLength(1);
  });

  it('should throw NotFoundException when listing items for non-existent entry', async () => {
    prisma.payrollEntry.findFirst = jest.fn().mockResolvedValue(null);
    await expect(service.listOneOffItems(TENANT_ID, ENTRY_ID)).rejects.toThrow(NotFoundException);
  });

  it('should delete one-off item when run is draft', async () => {
    const result = await service.deleteOneOffItem(TENANT_ID, ITEM_ID);
    expect(result).toMatchObject({ id: ITEM_ID, deleted: true });
  });

  it('should throw NotFoundException for non-existent item on get', async () => {
    prisma.payrollOneOffItem.findFirst = jest.fn().mockResolvedValue(null);
    await expect(service.getOneOffItem(TENANT_ID, ITEM_ID)).rejects.toThrow(NotFoundException);
  });

  // ─── Additional branch coverage ──────────────────────────────────────────

  describe('updateOneOffItem', () => {
    it('should update item when run is draft', async () => {
      prisma.payrollOneOffItem.update = jest.fn().mockResolvedValue({
        ...mockItem,
        description: 'Updated description',
        amount: '1500.00',
      });

      const result = (await service.updateOneOffItem(TENANT_ID, ITEM_ID, {
        description: 'Updated description',
        amount: 1500,
      })) as Record<string, unknown>;

      expect(typeof result['amount']).toBe('number');
    });

    it('should throw NotFoundException when item not found for update', async () => {
      prisma.payrollOneOffItem.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.updateOneOffItem(TENANT_ID, ITEM_ID, { description: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when run is not draft for update', async () => {
      prisma.payrollOneOffItem.findFirst = jest.fn().mockResolvedValue({
        ...mockItem,
        payroll_entry: { payroll_run: { status: 'finalised' } },
      });

      await expect(
        service.updateOneOffItem(TENANT_ID, ITEM_ID, { description: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should only include defined fields in update', async () => {
      prisma.payrollOneOffItem.update = jest.fn().mockResolvedValue(mockItem);

      await service.updateOneOffItem(TENANT_ID, ITEM_ID, {
        amount: 2000,
      });

      expect(prisma.payrollOneOffItem.update).toHaveBeenCalledWith({
        where: { id: ITEM_ID },
        data: { amount: 2000 },
      });
    });

    it('should update item_type when provided', async () => {
      prisma.payrollOneOffItem.update = jest.fn().mockResolvedValue({
        ...mockItem,
        item_type: 'other',
      });

      await service.updateOneOffItem(TENANT_ID, ITEM_ID, {
        item_type: 'other',
      });

      expect(prisma.payrollOneOffItem.update).toHaveBeenCalledWith({
        where: { id: ITEM_ID },
        data: { item_type: 'other' },
      });
    });
  });

  describe('deleteOneOffItem', () => {
    it('should throw NotFoundException for non-existent item', async () => {
      prisma.payrollOneOffItem.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.deleteOneOffItem(TENANT_ID, ITEM_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when run is not draft for delete', async () => {
      prisma.payrollOneOffItem.findFirst = jest.fn().mockResolvedValue({
        ...mockItem,
        payroll_entry: { payroll_run: { status: 'finalised' } },
      });

      await expect(service.deleteOneOffItem(TENANT_ID, ITEM_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
