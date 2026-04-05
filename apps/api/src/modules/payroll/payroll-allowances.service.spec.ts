import { ConflictException, NotFoundException } from '@nestjs/common';
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
      providers: [PayrollAllowancesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PayrollAllowancesService>(PayrollAllowancesService);
  });

  afterEach(() => jest.clearAllMocks());

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
    await expect(service.getAllowanceType(TENANT_ID, TYPE_ID)).rejects.toThrow(NotFoundException);
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
      {
        ...mockAllowance,
        allowance_type: { id: TYPE_ID, name: 'Housing', name_ar: null, is_recurring: true },
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        amount: '200.00',
        allowance_type_id: '66666666-6666-6666-6666-666666666666',
        allowance_type: {
          id: '66666666-6666-6666-6666-666666666666',
          name: 'Transport',
          name_ar: null,
          is_recurring: true,
        },
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
    await expect(service.deleteStaffAllowance(TENANT_ID, ALLOWANCE_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ─── Additional branch coverage ──────────────────────────────────────────

  describe('createAllowanceType', () => {
    it('should throw ConflictException when name already exists', async () => {
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          payrollAllowanceType: {
            findUnique: jest.fn().mockResolvedValue(mockType), // exists!
            create: jest.fn(),
          },
        }),
      );

      await expect(
        service.createAllowanceType(TENANT_ID, {
          name: 'Housing',
          is_recurring: true,
        }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createAllowanceType(TENANT_ID, {
          name: 'Housing',
          is_recurring: true,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ALLOWANCE_TYPE_NAME_CONFLICT' }),
      });
    });

    it('should create with optional fields (name_ar, is_recurring, default_amount)', async () => {
      const mockCreate = jest.fn().mockResolvedValue({
        ...mockType,
        name_ar: 'سكن',
        is_recurring: false,
        default_amount: '750.00',
      });

      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          payrollAllowanceType: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: mockCreate,
          },
        }),
      );

      await service.createAllowanceType(TENANT_ID, {
        name: 'Housing',
        name_ar: 'سكن',
        is_recurring: false,
        default_amount: 750,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name_ar: 'سكن',
            is_recurring: false,
            default_amount: 750,
          }),
        }),
      );
    });

    it('should default name_ar to null and is_recurring to true', async () => {
      const mockCreate = jest.fn().mockResolvedValue(mockType);

      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          payrollAllowanceType: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: mockCreate,
          },
        }),
      );

      await service.createAllowanceType(TENANT_ID, {
        name: 'Transport',
        is_recurring: true,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name_ar: null,
            is_recurring: true,
            default_amount: null,
          }),
        }),
      );
    });
  });

  describe('listAllowanceTypes — activeOnly flag', () => {
    it('should filter active=true when activeOnly is true (default)', async () => {
      await service.listAllowanceTypes(TENANT_ID);

      expect(prisma.payrollAllowanceType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('should not filter by active when activeOnly is false', async () => {
      await service.listAllowanceTypes(TENANT_ID, false);

      const where = (
        prisma.payrollAllowanceType.findMany.mock.calls[0][0] as {
          where: Record<string, unknown>;
        }
      ).where;
      expect(where).not.toHaveProperty('active');
    });
  });

  describe('updateAllowanceType', () => {
    it('should update name when provided', async () => {
      await service.updateAllowanceType(TENANT_ID, TYPE_ID, { name: 'Updated' });

      expect(prisma.payrollAllowanceType.update).toHaveBeenCalledWith({
        where: { id: TYPE_ID },
        data: expect.objectContaining({ name: 'Updated' }),
      });
    });

    it('should update name_ar when provided', async () => {
      await service.updateAllowanceType(TENANT_ID, TYPE_ID, { name_ar: 'جديد' });

      expect(prisma.payrollAllowanceType.update).toHaveBeenCalledWith({
        where: { id: TYPE_ID },
        data: expect.objectContaining({ name_ar: 'جديد' }),
      });
    });

    it('should update is_recurring when provided', async () => {
      await service.updateAllowanceType(TENANT_ID, TYPE_ID, { is_recurring: false });

      expect(prisma.payrollAllowanceType.update).toHaveBeenCalledWith({
        where: { id: TYPE_ID },
        data: expect.objectContaining({ is_recurring: false }),
      });
    });

    it('should update default_amount when provided', async () => {
      await service.updateAllowanceType(TENANT_ID, TYPE_ID, { default_amount: 1000 });

      expect(prisma.payrollAllowanceType.update).toHaveBeenCalledWith({
        where: { id: TYPE_ID },
        data: expect.objectContaining({ default_amount: 1000 }),
      });
    });

    it('should update active when provided', async () => {
      await service.updateAllowanceType(TENANT_ID, TYPE_ID, { active: false });

      expect(prisma.payrollAllowanceType.update).toHaveBeenCalledWith({
        where: { id: TYPE_ID },
        data: expect.objectContaining({ active: false }),
      });
    });

    it('should only include defined fields in update', async () => {
      await service.updateAllowanceType(TENANT_ID, TYPE_ID, {});

      expect(prisma.payrollAllowanceType.update).toHaveBeenCalledWith({
        where: { id: TYPE_ID },
        data: {},
      });
    });
  });

  describe('deleteAllowanceType', () => {
    it('should delete existing type', async () => {
      const result = await service.deleteAllowanceType(TENANT_ID, TYPE_ID);
      expect(result).toMatchObject({ id: TYPE_ID, deleted: true });
    });

    it('should throw NotFoundException when type not found', async () => {
      prisma.payrollAllowanceType.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.deleteAllowanceType(TENANT_ID, TYPE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createStaffAllowance', () => {
    it('should create with effective_to when provided', async () => {
      const mockCreate = jest.fn().mockResolvedValue({
        ...mockAllowance,
        effective_to: new Date('2026-12-31'),
      });

      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          staffAllowance: {
            create: mockCreate,
          },
        }),
      );

      await service.createStaffAllowance(TENANT_ID, {
        staff_profile_id: STAFF_ID,
        allowance_type_id: TYPE_ID,
        amount: 500,
        effective_from: '2026-01-01',
        effective_to: '2026-12-31',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            effective_to: expect.any(Date),
          }),
        }),
      );
    });

    it('should create with effective_to null when not provided', async () => {
      const mockCreate = jest.fn().mockResolvedValue(mockAllowance);

      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          staffAllowance: {
            create: mockCreate,
          },
        }),
      );

      await service.createStaffAllowance(TENANT_ID, {
        staff_profile_id: STAFF_ID,
        allowance_type_id: TYPE_ID,
        amount: 500,
        effective_from: '2026-01-01',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            effective_to: null,
          }),
        }),
      );
    });

    it('should throw NotFoundException when allowance type not found', async () => {
      prisma.payrollAllowanceType.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.createStaffAllowance(TENANT_ID, {
          staff_profile_id: STAFF_ID,
          allowance_type_id: 'nonexistent',
          amount: 500,
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listStaffAllowances — activeOnly flag', () => {
    it('should filter by effective dates when activeOnly is true (default)', async () => {
      await service.listStaffAllowances(TENANT_ID, STAFF_ID);

      const where = (
        prisma.staffAllowance.findMany.mock.calls[0][0] as {
          where: Record<string, unknown>;
        }
      ).where;
      expect(where).toHaveProperty('effective_from');
      expect(where).toHaveProperty('OR');
    });

    it('should not filter by effective dates when activeOnly is false', async () => {
      await service.listStaffAllowances(TENANT_ID, STAFF_ID, false);

      const where = (
        prisma.staffAllowance.findMany.mock.calls[0][0] as {
          where: Record<string, unknown>;
        }
      ).where;
      expect(where).not.toHaveProperty('effective_from');
      expect(where).not.toHaveProperty('OR');
    });
  });

  describe('updateStaffAllowance', () => {
    it('should update amount when provided', async () => {
      await service.updateStaffAllowance(TENANT_ID, ALLOWANCE_ID, {
        amount: 800,
      });

      expect(prisma.staffAllowance.update).toHaveBeenCalledWith({
        where: { id: ALLOWANCE_ID },
        data: expect.objectContaining({ amount: 800 }),
        include: expect.any(Object),
      });
    });

    it('should update effective_from when provided', async () => {
      await service.updateStaffAllowance(TENANT_ID, ALLOWANCE_ID, {
        effective_from: '2026-06-01',
      });

      expect(prisma.staffAllowance.update).toHaveBeenCalledWith({
        where: { id: ALLOWANCE_ID },
        data: expect.objectContaining({ effective_from: expect.any(Date) }),
        include: expect.any(Object),
      });
    });

    it('should set effective_to to null when provided as null-like', async () => {
      await service.updateStaffAllowance(TENANT_ID, ALLOWANCE_ID, {
        effective_to: null,
      });

      expect(prisma.staffAllowance.update).toHaveBeenCalledWith({
        where: { id: ALLOWANCE_ID },
        data: expect.objectContaining({ effective_to: null }),
        include: expect.any(Object),
      });
    });

    it('should set effective_to as Date when provided', async () => {
      await service.updateStaffAllowance(TENANT_ID, ALLOWANCE_ID, {
        effective_to: '2026-12-31',
      });

      expect(prisma.staffAllowance.update).toHaveBeenCalledWith({
        where: { id: ALLOWANCE_ID },
        data: expect.objectContaining({ effective_to: expect.any(Date) }),
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException when staff allowance not found', async () => {
      prisma.staffAllowance.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.updateStaffAllowance(TENANT_ID, ALLOWANCE_ID, { amount: 800 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('calculateAllowancesForEntry', () => {
    it('should return zero total for no allowances', async () => {
      prisma.staffAllowance.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.calculateAllowancesForEntry(
        TENANT_ID,
        STAFF_ID,
        new Date('2026-03-01'),
      );

      expect(result.total).toBe(0);
      expect(result.allowances).toHaveLength(0);
    });
  });

  describe('serializeAllowanceType — default_amount null handling', () => {
    it('should keep null default_amount as null', async () => {
      prisma.payrollAllowanceType.findMany = jest.fn().mockResolvedValue([
        {
          ...mockType,
          default_amount: null,
        },
      ]);

      const result = await service.listAllowanceTypes(TENANT_ID);
      const first = result.data[0] as Record<string, unknown>;
      expect(first['default_amount']).toBeNull();
    });
  });
});
