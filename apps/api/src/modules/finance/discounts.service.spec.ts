import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { DiscountsService } from './discounts.service';

const mockPrisma = {
  discount: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  householdFeeAssignment: {
    count: jest.fn(),
  },
};

const TENANT_ID = 'tenant-uuid-1111';
const DISCOUNT_ID = 'discount-uuid-1111';

const makeDiscount = (overrides: Record<string, unknown> = {}) => ({
  id: DISCOUNT_ID,
  tenant_id: TENANT_ID,
  name: 'Sibling Discount',
  discount_type: 'percent',
  value: '10.00',
  active: true,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe('DiscountsService', () => {
  let service: DiscountsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiscountsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<DiscountsService>(DiscountsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated discounts with numeric values', async () => {
      mockPrisma.discount.findMany.mockResolvedValue([makeDiscount()]);
      mockPrisma.discount.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.value).toBe(10);
      expect(typeof result.data[0]?.value).toBe('number');
    });

    it('should apply search filter', async () => {
      mockPrisma.discount.findMany.mockResolvedValue([]);
      mockPrisma.discount.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, search: 'sibling' });

      expect(mockPrisma.discount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'sibling', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return discount with numeric value', async () => {
      mockPrisma.discount.findFirst.mockResolvedValue(makeDiscount());

      const result = await service.findOne(TENANT_ID, DISCOUNT_ID);

      expect(result.value).toBe(10);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.discount.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a discount', async () => {
      mockPrisma.discount.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.discount.create.mockResolvedValue(makeDiscount());

      const result = await service.create(TENANT_ID, {
        name: 'Sibling Discount',
        discount_type: 'percent',
        value: 10,
      });

      expect(result.name).toBe('Sibling Discount');
      expect(result.value).toBe(10);
    });

    it('should throw ConflictException on duplicate name', async () => {
      mockPrisma.discount.findFirst.mockResolvedValue(makeDiscount());

      await expect(
        service.create(TENANT_ID, {
          name: 'Sibling Discount',
          discount_type: 'percent',
          value: 10,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update a discount', async () => {
      mockPrisma.discount.findFirst
        .mockResolvedValueOnce(makeDiscount()) // existing
        .mockResolvedValueOnce(null); // no duplicate name
      mockPrisma.discount.update.mockResolvedValue(
        makeDiscount({ name: 'Updated', value: '15.00' }),
      );

      const result = await service.update(TENANT_ID, DISCOUNT_ID, { name: 'Updated', value: 15 });

      expect(result.value).toBe(15);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.discount.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, 'bad-id', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when percent value > 100', async () => {
      mockPrisma.discount.findFirst
        .mockResolvedValueOnce(makeDiscount({ discount_type: 'percent', value: '10.00' }))
        .mockResolvedValueOnce(null); // no duplicate name

      await expect(
        service.update(TENANT_ID, DISCOUNT_ID, { name: 'Big', value: 150 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on duplicate name during update', async () => {
      mockPrisma.discount.findFirst
        .mockResolvedValueOnce(makeDiscount({ name: 'Old Name' }))
        .mockResolvedValueOnce(makeDiscount({ id: 'other-id', name: 'Taken' }));

      await expect(service.update(TENANT_ID, DISCOUNT_ID, { name: 'Taken' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should skip name uniqueness check when name unchanged', async () => {
      mockPrisma.discount.findFirst.mockResolvedValueOnce(
        makeDiscount({ name: 'Sibling Discount' }),
      );
      mockPrisma.discount.update.mockResolvedValue(
        makeDiscount({ name: 'Sibling Discount', value: '20.00' }),
      );

      const result = await service.update(TENANT_ID, DISCOUNT_ID, {
        name: 'Sibling Discount',
        value: 20,
      });

      // findFirst should only be called once (for existence check, not duplicate check)
      expect(mockPrisma.discount.findFirst).toHaveBeenCalledTimes(1);
      expect(result.value).toBe(20);
    });

    it('should validate percent when only discount_type changes (uses existing value)', async () => {
      mockPrisma.discount.findFirst.mockResolvedValueOnce(
        makeDiscount({ discount_type: 'fixed', value: '150.00' }),
      );

      // Changing type to percent but value stays 150 => should throw
      await expect(
        service.update(TENANT_ID, DISCOUNT_ID, { discount_type: 'percent' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow percent update when value is within range', async () => {
      mockPrisma.discount.findFirst.mockResolvedValueOnce(
        makeDiscount({ discount_type: 'percent', value: '10.00' }),
      );
      mockPrisma.discount.update.mockResolvedValue(
        makeDiscount({ discount_type: 'percent', value: '50.00' }),
      );

      const result = await service.update(TENANT_ID, DISCOUNT_ID, { value: 50 });

      expect(result.value).toBe(50);
    });
  });

  describe('deactivate', () => {
    it('should deactivate a discount with no active assignments', async () => {
      mockPrisma.discount.findFirst.mockResolvedValue(makeDiscount());
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(0);
      mockPrisma.discount.update.mockResolvedValue(makeDiscount({ active: false }));

      const result = await service.deactivate(TENANT_ID, DISCOUNT_ID);

      expect(result.active).toBe(false);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.discount.findFirst.mockResolvedValue(null);

      await expect(service.deactivate(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when active assignments exist', async () => {
      mockPrisma.discount.findFirst.mockResolvedValue(makeDiscount());
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(2);

      await expect(service.deactivate(TENANT_ID, DISCOUNT_ID)).rejects.toThrow(BadRequestException);
    });
  });
});
