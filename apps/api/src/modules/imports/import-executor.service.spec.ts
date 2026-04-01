/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Test, TestingModule } from '@nestjs/testing';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { ImportExecutorService } from './import-executor.service';
import { ImportParserService } from './import-parser.service';

jest.mock('../../common/middleware/rls.middleware');

describe('ImportExecutorService', () => {
  let service: ImportExecutorService;
  let mockPrisma: { $transaction: jest.Mock };
  let mockSequenceService: Record<string, jest.Mock>;
  let mockEncryptionService: Record<string, jest.Mock>;
  let mockParser: Record<string, jest.Mock>;
  let mockTx: Record<string, any>;

  const TENANT_ID = 'tenant-1';
  const JOB_ID = 'job-1';
  const USER_ID = 'user-1';

  beforeEach(async () => {
    mockTx = {
      importJobRecord: { create: jest.fn() },
      household: { create: jest.fn(), findFirst: jest.fn() },
      parent: { create: jest.fn(), findFirst: jest.fn() },
      householdParent: { create: jest.fn() },
      student: { create: jest.fn(), findFirst: jest.fn() },
      yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
      staffProfile: { findFirst: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() },
      tenantMembership: { findUnique: jest.fn(), create: jest.fn() },
      membershipRole: { findFirst: jest.fn(), create: jest.fn() },
      role: { findFirst: jest.fn() },
      feeStructure: { findFirst: jest.fn() },
      householdFeeAssignment: { create: jest.fn() },
      subject: { findFirst: jest.fn() },
      assessment: { findFirst: jest.fn() },
      examResult: { create: jest.fn() },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(mockTx);
      }),
    };

    (createRlsClient as jest.Mock).mockReturnValue(mockPrisma);

    mockSequenceService = {
      generateHouseholdReference: jest.fn().mockResolvedValue('HH-001'),
      nextNumber: jest.fn().mockResolvedValue('STU-001'),
    };

    mockEncryptionService = {
      encrypt: jest.fn().mockReturnValue({ encrypted: 'enc', keyRef: 'kf1' }),
    };

    mockParser = {
      parseFlexibleDate: jest.fn().mockReturnValue(new Date('2010-01-01')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportExecutorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: ImportParserService, useValue: mockParser },
      ],
    }).compile();

    service = module.get<ImportExecutorService>(ImportExecutorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processRow (Routing)', () => {
    it('should route to processParentRow', async () => {
      // Mock processParentRow directly to avoid db logic test here
      const spy = jest.spyOn(service as any, 'processParentRow').mockResolvedValue(undefined);
      await service.processRow(
        mockTx as any,
        TENANT_ID,
        'parents',
        { email: 'test@test.com' },
        USER_ID,
      );
      expect(spy).toHaveBeenCalledWith(mockTx, TENANT_ID, { email: 'test@test.com' });
    });

    it('should route to processStaffRow', async () => {
      const spy = jest.spyOn(service as any, 'processStaffRow').mockResolvedValue(undefined);
      await service.processRow(mockTx as any, TENANT_ID, 'staff', {}, USER_ID);
      expect(spy).toHaveBeenCalled();
    });

    it('should route to processFeeRow', async () => {
      const spy = jest.spyOn(service as any, 'processFeeRow').mockResolvedValue(undefined);
      await service.processRow(mockTx as any, TENANT_ID, 'fees', {}, USER_ID);
      expect(spy).toHaveBeenCalled();
    });

    it('should throw Error if import type is students', async () => {
      await expect(
        service.processRow(mockTx as any, TENANT_ID, 'students', {}, USER_ID),
      ).rejects.toThrow('Student rows should be processed via processStudentRows');
    });

    it('should throw Error for unknown type', async () => {
      await expect(
        service.processRow(mockTx as any, TENANT_ID, 'unknown_type' as any, {}, USER_ID),
      ).rejects.toThrow('Unknown import type: unknown_type');
    });
  });

  describe('processStudentRows (Family Grouping & RLS)', () => {
    it('should create standalone household for row without email', async () => {
      const rows = [{ last_name: 'Smith', first_name: 'John' }];
      mockTx.household.create.mockResolvedValue({ id: 'hh1' });
      mockTx.student.create.mockResolvedValue({ id: 'stu1' });

      const stats = await service.processStudentRows(
        mockPrisma as any,
        TENANT_ID,
        rows,
        new Set(), // no error rows
        JOB_ID,
      );

      expect(stats.households_created).toBe(1);
      expect(stats.students_created).toBe(1);
      expect(mockTx.household.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ household_name: 'Smith Family' }),
        }),
      );
      expect(mockTx.importJobRecord.create).toHaveBeenCalledTimes(2); // Household + Student
    });

    it('should group siblings under same household when emails match', async () => {
      const rows = [
        {
          parent1_email: 'fam@test.com',
          parent1_first_name: 'John',
          parent1_last_name: 'Jones',
          first_name: 'Alice',
        },
        {
          parent1_email: 'fam@TEST.com',
          parent1_first_name: 'John',
          parent1_last_name: 'Jones',
          first_name: 'Bob',
        },
      ];

      mockTx.parent.findFirst.mockResolvedValue(null); // Parent doesn't exist
      mockTx.household.create.mockResolvedValue({ id: 'hh1' });
      mockTx.parent.create.mockResolvedValue({ id: 'parent1' });
      mockTx.student.create.mockResolvedValue({ id: 'stu-id' });

      const stats = await service.processStudentRows(
        mockPrisma as any,
        TENANT_ID,
        rows,
        new Set(),
        JOB_ID,
      );

      expect(stats.households_created).toBe(1);
      expect(stats.parents_created).toBe(1); // Only created once per group
      expect(stats.students_created).toBe(2);
      expect(stats.family_groups).toHaveLength(1);
      expect(stats.family_groups[0].rows).toEqual([2, 3]); // Original row numbers (index + 2)
    });

    it('should reuse existing household if parent found in DB', async () => {
      const rows = [{ parent1_email: 'exists@test.com', first_name: 'Alice' }];

      mockTx.parent.findFirst.mockResolvedValue({
        id: 'existing-parent',
        household_parents: [{ household_id: 'existing-hh' }],
      });
      mockTx.student.create.mockResolvedValue({ id: 'stu1' });

      const stats = await service.processStudentRows(
        mockPrisma as any,
        TENANT_ID,
        rows,
        new Set(),
        JOB_ID,
      );

      expect(stats.households_created).toBe(0);
      expect(stats.households_reused).toBe(1);
      expect(mockTx.household.create).not.toHaveBeenCalled();
      expect(mockTx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ household_id: 'existing-hh' }) }),
      );
    });

    it('should skip rows with validation errors natively', async () => {
      const rows = [
        { parent1_email: 'ok@test.com' },
        { parent1_email: 'bad@test.com' }, // Error row index 1 -> original_row: 3
      ];

      const errorSet = new Set([3]);

      const stats = await service.processStudentRows(
        mockPrisma as any,
        TENANT_ID,
        rows,
        errorSet,
        JOB_ID,
      );

      expect(stats.skipped_rows).toContainEqual({
        row: 3,
        reason: 'Validation error from preview',
      });
      // Only ok@test.com should create a household
      expect(mockTx.household.create).toHaveBeenCalledTimes(1);
    });

    it('should catch error creating household and mark all family rows skipped', async () => {
      const rows = [
        { parent1_email: 'fail@test.com', first_name: 'A' },
        { parent1_email: 'fail@test.com', first_name: 'B' },
      ];

      mockTx.parent.findFirst.mockResolvedValue(null);
      mockTx.household.create.mockRejectedValue(new Error('DB Failed'));

      const stats = await service.processStudentRows(
        mockPrisma as any,
        TENANT_ID,
        rows,
        new Set(),
        JOB_ID,
      );

      expect(stats.students_created).toBe(0);
      expect(stats.skipped_rows).toContainEqual(
        expect.objectContaining({ row: 2, reason: expect.stringContaining('Family group error') }),
      );
      expect(stats.skipped_rows).toContainEqual(
        expect.objectContaining({ row: 3, reason: expect.stringContaining('Family group error') }),
      );
    });

    it('should resolve aliased year groups (e.g. Grade 1 -> Year 1)', async () => {
      const rows = [{ year_group: 'Grade 1' }];
      mockTx.yearGroup.findMany.mockResolvedValue([{ id: 'yg1', name: 'Year 1' }]);
      mockTx.household.create.mockResolvedValue({ id: 'hh1' });
      mockTx.student.create.mockResolvedValue({ id: 'stu1' });

      const stats = await service.processStudentRows(
        mockPrisma as any,
        TENANT_ID,
        rows,
        new Set(),
        JOB_ID,
      );

      expect(mockTx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ year_group_id: 'yg1' }),
        }),
      );
    });
  });

  describe('processFeeRow', () => {
    it('should assign a fee structure to a household', async () => {
      mockTx.feeStructure.findFirst.mockResolvedValue({ id: 'fs1' });
      mockTx.household.findFirst.mockResolvedValue({ id: 'hh1' });
      mockTx.student.findFirst.mockResolvedValue({ id: 'stu1' });

      await service.processRow(
        mockTx as any,
        TENANT_ID,
        'fees',
        { fee_structure_name: 'Tuition', household_name: 'Smiths' },
        USER_ID,
      );

      expect(mockTx.householdFeeAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fee_structure_id: 'fs1',
            household_id: 'hh1',
            student_id: 'stu1',
          }),
        }),
      );
    });

    it('should throw if structure not found', async () => {
      mockTx.feeStructure.findFirst.mockResolvedValue(null);
      await expect(
        service.processRow(mockTx as any, TENANT_ID, 'fees', {}, USER_ID),
      ).rejects.toThrow(/Fee structure .* not found/);
    });
  });
});
