import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { FeeStructuresService } from './fee-structures.service';

const mockPrisma = {
  feeStructure: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  yearGroup: {
    findFirst: jest.fn(),
  },
  householdFeeAssignment: {
    count: jest.fn(),
  },
};

const TENANT_ID = 'tenant-uuid-1111';
const FS_ID = 'fs-uuid-1111';
const YG_ID = 'yg-uuid-1111';

const makeFeeStructure = (overrides: Record<string, unknown> = {}) => ({
  id: FS_ID,
  tenant_id: TENANT_ID,
  name: 'Tuition Fee',
  amount: '1000.00',
  billing_frequency: 'monthly',
  active: true,
  year_group: { id: YG_ID, name: 'Year 1' },
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe('FeeStructuresService', () => {
  let service: FeeStructuresService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        FeeStructuresService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeeStructuresService>(FeeStructuresService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated fee structures with numeric amounts', async () => {
      const fs = makeFeeStructure();
      mockPrisma.feeStructure.findMany.mockResolvedValue([fs]);
      mockPrisma.feeStructure.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.amount).toBe(1000);
      expect(typeof result.data[0]?.amount).toBe('number');
    });

    it('should apply search filter', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([]);
      mockPrisma.feeStructure.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, search: 'tuition' });

      expect(mockPrisma.feeStructure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'tuition', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should filter by active status', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([]);
      mockPrisma.feeStructure.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, active: true });

      expect(mockPrisma.feeStructure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return fee structure with numeric amount', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(makeFeeStructure());

      const result = await service.findOne(TENANT_ID, FS_ID);

      expect(result.amount).toBe(1000);
      expect(result.id).toBe(FS_ID);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a fee structure', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.feeStructure.create.mockResolvedValue(makeFeeStructure());

      const result = await service.create(TENANT_ID, {
        name: 'Tuition Fee',
        amount: 1000,
        billing_frequency: 'monthly',
      });

      expect(result.name).toBe('Tuition Fee');
      expect(result.amount).toBe(1000);
    });

    it('should throw ConflictException on duplicate name', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(makeFeeStructure());

      await expect(
        service.create(TENANT_ID, {
          name: 'Tuition Fee',
          amount: 1000,
          billing_frequency: 'monthly',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when year_group_id not found', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.yearGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          name: 'New Fee',
          amount: 500,
          billing_frequency: 'monthly',
          year_group_id: 'bad-id',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update a fee structure', async () => {
      mockPrisma.feeStructure.findFirst
        .mockResolvedValueOnce(makeFeeStructure()) // existing lookup
        .mockResolvedValueOnce(null);              // no duplicate name
      mockPrisma.feeStructure.update.mockResolvedValue(
        makeFeeStructure({ name: 'Updated Fee', amount: '1500.00' }),
      );

      const result = await service.update(TENANT_ID, FS_ID, { name: 'Updated Fee', amount: 1500 });

      expect(result.amount).toBe(1500);
    });

    it('should throw NotFoundException when fee structure not found', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, 'bad-id', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on duplicate name during update', async () => {
      mockPrisma.feeStructure.findFirst
        .mockResolvedValueOnce(makeFeeStructure({ name: 'Old Name' }))
        .mockResolvedValueOnce(makeFeeStructure({ id: 'other-id', name: 'Duplicate' }));

      await expect(
        service.update(TENANT_ID, FS_ID, { name: 'Duplicate' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate a fee structure with no active assignments', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(makeFeeStructure());
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(0);
      mockPrisma.feeStructure.update.mockResolvedValue(
        makeFeeStructure({ active: false }),
      );

      const result = await service.deactivate(TENANT_ID, FS_ID);

      expect(result.active).toBe(false);
    });

    it('should throw NotFoundException when fee structure not found', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(null);

      await expect(service.deactivate(TENANT_ID, 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when active assignments exist', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(makeFeeStructure());
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(3);

      await expect(service.deactivate(TENANT_ID, FS_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
