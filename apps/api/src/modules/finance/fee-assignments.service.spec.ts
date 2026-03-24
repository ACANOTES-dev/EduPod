import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { FeeAssignmentsService } from './fee-assignments.service';

const mockPrisma = {
  householdFeeAssignment: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  household: {
    findFirst: jest.fn(),
  },
  feeStructure: {
    findFirst: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
  },
  discount: {
    findFirst: jest.fn(),
  },
};

const TENANT_ID = 'tenant-uuid-1111';
const ASSIGNMENT_ID = 'assign-uuid-1111';
const HOUSEHOLD_ID = 'household-uuid-1111';
const FEE_STRUCTURE_ID = 'fs-uuid-1111';
const DISCOUNT_ID = 'discount-uuid-1111';
const STUDENT_ID = 'student-uuid-1111';

const makeAssignment = (overrides: Record<string, unknown> = {}) => ({
  id: ASSIGNMENT_ID,
  tenant_id: TENANT_ID,
  household_id: HOUSEHOLD_ID,
  student_id: null,
  fee_structure_id: FEE_STRUCTURE_ID,
  discount_id: null,
  effective_from: new Date(),
  effective_to: null,
  fee_structure: { id: FEE_STRUCTURE_ID, name: 'Tuition', amount: '1000.00', billing_frequency: 'monthly' },
  discount: null,
  household: { id: HOUSEHOLD_ID, household_name: 'Smith Family' },
  student: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe('FeeAssignmentsService', () => {
  let service: FeeAssignmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeAssignmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeeAssignmentsService>(FeeAssignmentsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated assignments with numeric fee amounts', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([makeAssignment()]);
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.fee_structure?.amount).toBe(1000);
    });

    it('should filter by household_id', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([]);
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, household_id: HOUSEHOLD_ID });

      expect(mockPrisma.householdFeeAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ household_id: HOUSEHOLD_ID }),
        }),
      );
    });

    it('should filter active only assignments', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([]);
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, active_only: true });

      expect(mockPrisma.householdFeeAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ effective_to: null }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return an assignment with numeric values', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(makeAssignment());

      const result = await service.findOne(TENANT_ID, ASSIGNMENT_ID);

      expect(result.id).toBe(ASSIGNMENT_ID);
      expect(result.fee_structure?.amount).toBe(1000);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a fee assignment', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID, active: true });
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.householdFeeAssignment.create.mockResolvedValue(makeAssignment());

      const result = await service.create(TENANT_ID, {
        household_id: HOUSEHOLD_ID,
        fee_structure_id: FEE_STRUCTURE_ID,
        effective_from: '2026-01-01',
      });

      expect(result.id).toBe(ASSIGNMENT_ID);
    });

    it('should throw BadRequestException when household not found', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          household_id: 'bad',
          fee_structure_id: FEE_STRUCTURE_ID,
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when fee structure inactive', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID, active: false });

      await expect(
        service.create(TENANT_ID, {
          household_id: HOUSEHOLD_ID,
          fee_structure_id: FEE_STRUCTURE_ID,
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on duplicate active assignment', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID, active: true });
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(makeAssignment()); // duplicate

      await expect(
        service.create(TENANT_ID, {
          household_id: HOUSEHOLD_ID,
          fee_structure_id: FEE_STRUCTURE_ID,
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should validate discount exists when discount_id provided', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockPrisma.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID, active: true });
      mockPrisma.discount.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          household_id: HOUSEHOLD_ID,
          fee_structure_id: FEE_STRUCTURE_ID,
          effective_from: '2026-01-01',
          discount_id: 'bad-discount',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update an assignment', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(makeAssignment());
      mockPrisma.householdFeeAssignment.update.mockResolvedValue(
        makeAssignment({ discount_id: DISCOUNT_ID, discount: { id: DISCOUNT_ID, name: 'D', discount_type: 'percent', value: '10.00' } }),
      );
      mockPrisma.discount.findFirst.mockResolvedValue({ id: DISCOUNT_ID });

      const result = await service.update(TENANT_ID, ASSIGNMENT_ID, { discount_id: DISCOUNT_ID });

      expect(result.discount?.value).toBe(10);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, 'bad-id', { discount_id: DISCOUNT_ID }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('endAssignment', () => {
    it('should end an active assignment', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(makeAssignment());
      mockPrisma.householdFeeAssignment.update.mockResolvedValue(
        makeAssignment({ effective_to: new Date() }),
      );

      const result = await service.endAssignment(TENANT_ID, ASSIGNMENT_ID);

      expect(result.effective_to).toBeTruthy();
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(null);

      await expect(service.endAssignment(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when already ended', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(
        makeAssignment({ effective_to: new Date('2025-01-01') }),
      );

      await expect(service.endAssignment(TENANT_ID, ASSIGNMENT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
