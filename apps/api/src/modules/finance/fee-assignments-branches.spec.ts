/**
 * Additional branch coverage for FeeAssignmentsService.
 * Targets: findAll filter branches (active_only, all filters),
 * create validation branches (inactive fee structure, student_id, discount_id, duplicate with student_id),
 * update discount validation, endAssignment already-ended, findOne/update null discount/fee_structure.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  HouseholdReadFacade,
  StudentReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { FeeAssignmentsService } from './fee-assignments.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSIGNMENT_ID = 'assign-1';
const HOUSEHOLD_ID = 'hh-1';
const FEE_STRUCTURE_ID = 'fs-1';
const STUDENT_ID = 'stu-1';
const DISCOUNT_ID = 'disc-1';

const makeAssignment = (overrides: Record<string, unknown> = {}) => ({
  id: ASSIGNMENT_ID,
  tenant_id: TENANT_ID,
  household_id: HOUSEHOLD_ID,
  student_id: null,
  fee_structure_id: FEE_STRUCTURE_ID,
  discount_id: null,
  effective_from: new Date(),
  effective_to: null,
  created_at: new Date(),
  updated_at: new Date(),
  fee_structure: {
    id: FEE_STRUCTURE_ID,
    name: 'Tuition',
    amount: 5000,
    billing_frequency: 'monthly',
  },
  discount: null,
  household: { id: HOUSEHOLD_ID, household_name: 'Smith Family' },
  student: null,
  ...overrides,
});

describe('FeeAssignmentsService — branch coverage', () => {
  let service: FeeAssignmentsService;
  let mockPrisma: {
    householdFeeAssignment: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    feeStructure: {
      findFirst: jest.Mock;
    };
    discount: {
      findFirst: jest.Mock;
    };
  };
  let mockHouseholdFacade: { findById: jest.Mock };
  let mockStudentFacade: { findById: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      householdFeeAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      feeStructure: { findFirst: jest.fn().mockResolvedValue(null) },
      discount: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockHouseholdFacade = { findById: jest.fn().mockResolvedValue({ id: HOUSEHOLD_ID }) };
    mockStudentFacade = { findById: jest.fn().mockResolvedValue({ id: STUDENT_ID }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: HouseholdReadFacade, useValue: mockHouseholdFacade },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        FeeAssignmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeeAssignmentsService>(FeeAssignmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll — filter branches ────────────────────────────────────────────

  describe('FeeAssignmentsService — findAll filter branches', () => {
    it('should filter by active_only', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([]);
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, active_only: true });

      expect(mockPrisma.householdFeeAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ effective_to: null }),
        }),
      );
    });

    it('should filter by household_id, student_id, and fee_structure_id together', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([]);
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        household_id: HOUSEHOLD_ID,
        student_id: STUDENT_ID,
        fee_structure_id: FEE_STRUCTURE_ID,
      });

      expect(mockPrisma.householdFeeAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            household_id: HOUSEHOLD_ID,
            student_id: STUDENT_ID,
            fee_structure_id: FEE_STRUCTURE_ID,
          }),
        }),
      );
    });

    it('should serialize fee_structure.amount and discount.value in results', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({
          discount: { id: DISCOUNT_ID, name: '10% Off', discount_type: 'percent', value: 10 },
        }),
      ]);
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]!.fee_structure!.amount).toBe(5000);
      expect(result.data[0]!.discount!.value).toBe(10);
    });

    it('should handle null fee_structure and discount in results', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({ fee_structure: null, discount: null }),
      ]);
      mockPrisma.householdFeeAssignment.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]!.fee_structure).toBeNull();
      expect(result.data[0]!.discount).toBeNull();
    });
  });

  // ─── create — validation branches ─────────────────────────────────────────

  describe('FeeAssignmentsService — create validation branches', () => {
    it('should throw when household does not exist', async () => {
      mockHouseholdFacade.findById.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          household_id: 'nonexistent',
          fee_structure_id: FEE_STRUCTURE_ID,
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when fee structure does not exist', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          household_id: HOUSEHOLD_ID,
          fee_structure_id: 'nonexistent',
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when fee structure is inactive', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID, active: false });

      await expect(
        service.create(TENANT_ID, {
          household_id: HOUSEHOLD_ID,
          fee_structure_id: FEE_STRUCTURE_ID,
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when student does not exist', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID, active: true });
      mockStudentFacade.findById.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          household_id: HOUSEHOLD_ID,
          fee_structure_id: FEE_STRUCTURE_ID,
          student_id: 'nonexistent',
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when discount does not exist', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID, active: true });
      mockPrisma.discount.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          household_id: HOUSEHOLD_ID,
          fee_structure_id: FEE_STRUCTURE_ID,
          discount_id: 'nonexistent',
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on duplicate active assignment', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID, active: true });
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(TENANT_ID, {
          household_id: HOUSEHOLD_ID,
          fee_structure_id: FEE_STRUCTURE_ID,
          effective_from: '2026-01-01',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should include student_id in duplicate check when provided', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID, active: true });
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.householdFeeAssignment.create.mockResolvedValue(
        makeAssignment({ student_id: STUDENT_ID }),
      );

      await service.create(TENANT_ID, {
        household_id: HOUSEHOLD_ID,
        fee_structure_id: FEE_STRUCTURE_ID,
        student_id: STUDENT_ID,
        effective_from: '2026-01-01',
      });

      // Verify duplicate check includes student_id
      expect(mockPrisma.householdFeeAssignment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ student_id: STUDENT_ID }),
        }),
      );
    });
  });

  // ─── update — branches ─────────────────────────────────────────────────────

  describe('FeeAssignmentsService — update branches', () => {
    it('should throw NotFoundException when assignment does not exist', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, 'nonexistent', { discount_id: DISCOUNT_ID }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when new discount does not exist', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue({ id: ASSIGNMENT_ID });
      mockPrisma.discount.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, ASSIGNMENT_ID, { discount_id: 'nonexistent' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update effective_to when provided', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue({ id: ASSIGNMENT_ID });
      mockPrisma.householdFeeAssignment.update.mockResolvedValue(
        makeAssignment({ effective_to: new Date('2026-12-31') }),
      );

      const result = await service.update(TENANT_ID, ASSIGNMENT_ID, {
        effective_to: '2026-12-31',
      });

      expect(mockPrisma.householdFeeAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ effective_to: expect.any(Date) }),
        }),
      );
      expect(result).toBeDefined();
    });
  });

  // ─── endAssignment — branches ─────────────────────────────────────────────

  describe('FeeAssignmentsService — endAssignment branches', () => {
    it('should throw NotFoundException when assignment does not exist', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(null);

      await expect(service.endAssignment(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when already ended', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        effective_to: new Date('2026-06-01'),
      });

      await expect(service.endAssignment(TENANT_ID, ASSIGNMENT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully end an active assignment', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        effective_to: null,
      });
      mockPrisma.householdFeeAssignment.update.mockResolvedValue({
        id: ASSIGNMENT_ID,
        effective_to: new Date(),
      });

      const result = await service.endAssignment(TENANT_ID, ASSIGNMENT_ID);

      expect(result.effective_to).toBeDefined();
    });
  });

  // ─── findOne — null discount/fee_structure ────────────────────────────────

  describe('FeeAssignmentsService — findOne null relations', () => {
    it('should handle null fee_structure and discount', async () => {
      mockPrisma.householdFeeAssignment.findFirst.mockResolvedValue(
        makeAssignment({ fee_structure: null, discount: null }),
      );

      const result = await service.findOne(TENANT_ID, ASSIGNMENT_ID);

      expect(result.fee_structure).toBeNull();
      expect(result.discount).toBeNull();
    });
  });
});
