import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { AcademicReadFacade, MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { SenResourceService } from './sen-resource.service';
import { SenScopeService } from './sen-scope.service';

jest.mock('../../common/middleware/rls.middleware');

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACADEMIC_YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const RESOURCE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_ID_2 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const PROFILE_ID = '11111111-1111-1111-1111-111111111111';
const HOURS_ID = '22222222-2222-2222-2222-222222222222';
const YEAR_GROUP_ID = '33333333-3333-3333-3333-333333333333';

describe('SenResourceService', () => {
  let service: SenResourceService;

  const resourceAllocationMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const studentHoursMock = {
    aggregate: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const mockAcademicReadFacade = {
    findYearById: jest.fn().mockResolvedValue(null),
  };

  const senProfileMock = {
    findFirst: jest.fn(),
  };

  const mockPrisma = {
    senProfile: senProfileMock,
    senResourceAllocation: resourceAllocationMock,
    senStudentHours: studentHoursMock,
    $transaction: jest.fn() as jest.Mock,
  };

  mockPrisma.$transaction.mockImplementation((fn: (client: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );

  const mockScopeService = {
    getUserScope: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SenResourceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SenScopeService, useValue: mockScopeService },
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
      ],
    }).compile();

    service = module.get<SenResourceService>(SenResourceService);

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
    createRlsClient.mockReturnValue({
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
    });

    jest.clearAllMocks();
  });

  afterEach(() => jest.clearAllMocks());

  const createAllocationRecord = (overrides: Record<string, unknown> = {}) => ({
    id: RESOURCE_ID,
    tenant_id: TENANT_ID,
    academic_year_id: ACADEMIC_YEAR_ID,
    total_hours: new Prisma.Decimal('20.00'),
    source: 'seno',
    notes: 'Allocation notes',
    created_at: new Date('2026-04-01T09:00:00.000Z'),
    updated_at: new Date('2026-04-01T09:00:00.000Z'),
    academic_year: {
      id: ACADEMIC_YEAR_ID,
      name: '2026/2027',
      status: 'active',
      start_date: new Date('2026-08-20'),
      end_date: new Date('2027-06-30'),
    },
    ...overrides,
  });

  const createStudentHoursRecord = (overrides: Record<string, unknown> = {}) => ({
    id: HOURS_ID,
    tenant_id: TENANT_ID,
    resource_allocation_id: RESOURCE_ID,
    student_id: STUDENT_ID,
    sen_profile_id: PROFILE_ID,
    allocated_hours: new Prisma.Decimal('5.00'),
    used_hours: new Prisma.Decimal('2.00'),
    notes: 'Weekly support',
    created_at: new Date('2026-04-02T09:00:00.000Z'),
    updated_at: new Date('2026-04-02T09:00:00.000Z'),
    resource_allocation: {
      id: RESOURCE_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      total_hours: new Prisma.Decimal('20.00'),
      source: 'seno',
      academic_year: {
        id: ACADEMIC_YEAR_ID,
        name: '2026/2027',
      },
    },
    student: {
      id: STUDENT_ID,
      first_name: 'Amina',
      last_name: 'Byrne',
      year_group: {
        id: YEAR_GROUP_ID,
        name: 'First Year',
      },
    },
    sen_profile: {
      id: PROFILE_ID,
      primary_category: 'learning',
      support_level: 'school_support',
      is_active: true,
    },
    ...overrides,
  });

  describe('createAllocation', () => {
    it('should create an allocation successfully', async () => {
      mockAcademicReadFacade.findYearById.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      resourceAllocationMock.create.mockResolvedValue(createAllocationRecord());

      const result = await service.createAllocation(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        total_hours: 20,
        source: 'seno',
        notes: 'Allocation notes',
      });

      expect(result.total_hours).toBe(20);
      expect(resourceAllocationMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            academic_year_id: ACADEMIC_YEAR_ID,
            total_hours: 20,
            source: 'seno',
          }),
        }),
      );
    });

    it('should reject duplicates for the same academic year and source', async () => {
      mockAcademicReadFacade.findYearById.mockResolvedValue({ id: ACADEMIC_YEAR_ID });

      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint violation', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn(() => {
          throw p2002;
        }),
      });

      await expect(
        service.createAllocation(TENANT_ID, {
          academic_year_id: ACADEMIC_YEAR_ID,
          total_hours: 20,
          source: 'seno',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllAllocations', () => {
    it('should filter by academic year and source', async () => {
      resourceAllocationMock.findMany.mockResolvedValue([createAllocationRecord()]);
      resourceAllocationMock.count.mockResolvedValue(1);

      const result = await service.findAllAllocations(TENANT_ID, {
        page: 1,
        pageSize: 20,
        academic_year_id: ACADEMIC_YEAR_ID,
        source: 'school',
      });

      expect(result.meta.total).toBe(1);
      expect(resourceAllocationMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            academic_year_id: ACADEMIC_YEAR_ID,
            source: 'school',
          }),
        }),
      );
    });
  });

  describe('updateAllocation', () => {
    it('should update an allocation successfully', async () => {
      resourceAllocationMock.findFirst.mockResolvedValue({
        id: RESOURCE_ID,
        total_hours: new Prisma.Decimal('20.00'),
      });
      studentHoursMock.aggregate.mockResolvedValue({
        _sum: { allocated_hours: new Prisma.Decimal('8.00') },
      });
      resourceAllocationMock.update.mockResolvedValue(
        createAllocationRecord({ total_hours: new Prisma.Decimal('200.00'), notes: 'Updated' }),
      );

      const result = await service.updateAllocation(TENANT_ID, RESOURCE_ID, {
        total_hours: 200,
        notes: 'Updated',
      });

      expect(result.total_hours).toBe(200);
      expect(result.notes).toBe('Updated');
      expect(resourceAllocationMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: RESOURCE_ID },
          data: expect.objectContaining({
            total_hours: 200,
            notes: 'Updated',
          }),
        }),
      );
    });

    it('should throw when the allocation is not found', async () => {
      resourceAllocationMock.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAllocation(TENANT_ID, RESOURCE_ID, { total_hours: 12 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignStudentHours', () => {
    it('should assign student hours successfully', async () => {
      resourceAllocationMock.findFirst.mockResolvedValue({
        id: RESOURCE_ID,
        total_hours: new Prisma.Decimal('20.00'),
      });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: true,
        primary_category: 'learning',
        support_level: 'school_support',
      });
      studentHoursMock.aggregate.mockResolvedValue({
        _sum: { allocated_hours: new Prisma.Decimal('8.00') },
      });
      studentHoursMock.create.mockResolvedValue(createStudentHoursRecord());

      const result = await service.assignStudentHours(TENANT_ID, {
        resource_allocation_id: RESOURCE_ID,
        student_id: STUDENT_ID,
        sen_profile_id: PROFILE_ID,
        allocated_hours: 5,
        notes: 'Weekly support',
      });

      expect(result.assigned_percentage).toBe(25);
      expect(studentHoursMock.create).toHaveBeenCalled();
    });

    it('should reject a non-existent SEN profile', async () => {
      resourceAllocationMock.findFirst.mockResolvedValue({
        id: RESOURCE_ID,
        total_hours: new Prisma.Decimal('20.00'),
      });
      senProfileMock.findFirst.mockResolvedValue(null);

      await expect(
        service.assignStudentHours(TENANT_ID, {
          resource_allocation_id: RESOURCE_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          allocated_hours: 5,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SEN_PROFILE_NOT_FOUND',
        }),
      });
    });

    it('should reject an inactive SEN profile', async () => {
      resourceAllocationMock.findFirst.mockResolvedValue({
        id: RESOURCE_ID,
        total_hours: new Prisma.Decimal('20.00'),
      });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: false,
      });

      await expect(
        service.assignStudentHours(TENANT_ID, {
          resource_allocation_id: RESOURCE_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          allocated_hours: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a mismatched SEN profile', async () => {
      resourceAllocationMock.findFirst.mockResolvedValue({
        id: RESOURCE_ID,
        total_hours: new Prisma.Decimal('20.00'),
      });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID_2,
        is_active: true,
      });

      await expect(
        service.assignStudentHours(TENANT_ID, {
          resource_allocation_id: RESOURCE_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          allocated_hours: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject over-allocation and report available remainder', async () => {
      resourceAllocationMock.findFirst.mockResolvedValue({
        id: RESOURCE_ID,
        total_hours: new Prisma.Decimal('10.00'),
      });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: true,
      });
      studentHoursMock.aggregate.mockResolvedValue({
        _sum: { allocated_hours: new Prisma.Decimal('8.00') },
      });

      await expect(
        service.assignStudentHours(TENANT_ID, {
          resource_allocation_id: RESOURCE_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          allocated_hours: 3,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'HOURS_EXCEEDED',
          details: expect.objectContaining({
            available_hours: 2,
          }),
        }),
      });
    });

    it('should reject duplicate student assignments within the same allocation', async () => {
      resourceAllocationMock.findFirst.mockResolvedValue({
        id: RESOURCE_ID,
        total_hours: new Prisma.Decimal('20.00'),
      });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: true,
      });
      studentHoursMock.aggregate.mockResolvedValue({
        _sum: { allocated_hours: new Prisma.Decimal('5.00') },
      });

      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint violation', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn(() => {
          throw p2002;
        }),
      });

      await expect(
        service.assignStudentHours(TENANT_ID, {
          resource_allocation_id: RESOURCE_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          allocated_hours: 2,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findStudentHours', () => {
    it('should return scoped student hours with utilisation percentages', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'all',
      });
      studentHoursMock.findMany.mockResolvedValue([createStudentHoursRecord()]);

      const result = await service.findStudentHours(TENANT_ID, USER_ID, ['sen.view'], {
        student_id: STUDENT_ID,
      });

      expect(result).toHaveLength(1);
      const [firstAssignment] = result;
      expect(firstAssignment).toBeDefined();
      expect(firstAssignment?.assigned_percentage).toBe(25);
      expect(firstAssignment?.used_percentage).toBe(10);
    });
  });

  describe('updateStudentHours', () => {
    it('should update student hours successfully', async () => {
      studentHoursMock.findFirst.mockResolvedValue({
        id: HOURS_ID,
        allocated_hours: new Prisma.Decimal('5.00'),
        used_hours: new Prisma.Decimal('2.00'),
        resource_allocation: {
          id: RESOURCE_ID,
          total_hours: new Prisma.Decimal('20.00'),
        },
      });
      studentHoursMock.aggregate.mockResolvedValue({
        _sum: { allocated_hours: new Prisma.Decimal('3.00') },
      });
      studentHoursMock.update.mockResolvedValue(
        createStudentHoursRecord({
          allocated_hours: new Prisma.Decimal('15.00'),
          used_hours: new Prisma.Decimal('10.00'),
        }),
      );

      const result = await service.updateStudentHours(TENANT_ID, HOURS_ID, {
        allocated_hours: 15,
        used_hours: 10,
      });

      expect(result.allocated_hours).toBe(15);
      expect(result.used_hours).toBe(10);
      expect(studentHoursMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: HOURS_ID },
          data: expect.objectContaining({
            allocated_hours: 15,
            used_hours: 10,
          }),
        }),
      );
    });

    it('should re-check allocation capacity when allocated hours change', async () => {
      studentHoursMock.findFirst.mockResolvedValue({
        id: HOURS_ID,
        allocated_hours: new Prisma.Decimal('1.00'),
        used_hours: new Prisma.Decimal('0.50'),
        resource_allocation: {
          id: RESOURCE_ID,
          total_hours: new Prisma.Decimal('10.00'),
        },
      });
      studentHoursMock.aggregate.mockResolvedValue({
        _sum: { allocated_hours: new Prisma.Decimal('9.50') },
      });

      await expect(
        service.updateStudentHours(TENANT_ID, HOURS_ID, {
          allocated_hours: 2,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject used hours above allocated hours', async () => {
      studentHoursMock.findFirst.mockResolvedValue({
        id: HOURS_ID,
        allocated_hours: new Prisma.Decimal('4.00'),
        used_hours: new Prisma.Decimal('1.00'),
        resource_allocation: {
          id: RESOURCE_ID,
          total_hours: new Prisma.Decimal('10.00'),
        },
      });

      await expect(
        service.updateStudentHours(TENANT_ID, HOURS_ID, {
          allocated_hours: 2,
          used_hours: 3,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUtilisation', () => {
    it('should aggregate totals by source and year group', async () => {
      resourceAllocationMock.findMany.mockResolvedValue([
        {
          id: RESOURCE_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          total_hours: new Prisma.Decimal('20.00'),
          source: 'seno',
          student_allocations: [
            {
              allocated_hours: new Prisma.Decimal('5.00'),
              used_hours: new Prisma.Decimal('2.00'),
              student: {
                year_group: {
                  id: YEAR_GROUP_ID,
                  name: 'First Year',
                },
              },
            },
          ],
        },
        {
          id: 'other-allocation',
          academic_year_id: ACADEMIC_YEAR_ID,
          total_hours: new Prisma.Decimal('10.00'),
          source: 'school',
          student_allocations: [
            {
              allocated_hours: new Prisma.Decimal('3.00'),
              used_hours: new Prisma.Decimal('1.00'),
              student: {
                year_group: {
                  id: YEAR_GROUP_ID,
                  name: 'First Year',
                },
              },
            },
          ],
        },
      ]);

      const result = await service.getUtilisation(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
      });

      expect(result.totals.total_allocated_hours).toBe(30);
      expect(result.totals.total_assigned_hours).toBe(8);
      expect(result.totals.total_used_hours).toBe(3);
      expect(result.bySource).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'seno',
            total_allocated_hours: 20,
            total_assigned_hours: 5,
          }),
          expect.objectContaining({
            source: 'school',
            total_allocated_hours: 10,
            total_assigned_hours: 3,
          }),
        ]),
      );
      expect(result.byYearGroup).toEqual([
        expect.objectContaining({
          year_group_id: YEAR_GROUP_ID,
          year_group_name: 'First Year',
          total_assigned_hours: 8,
          total_used_hours: 3,
        }),
      ]);
    });
  });
});
