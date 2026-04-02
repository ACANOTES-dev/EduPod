import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { SchoolClosuresService } from './school-closures.service';

// Mock the RLS middleware
jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_ID = 'class-1';
const YEAR_GROUP_ID = 'yg-1';
const DATE = new Date('2026-03-15');

describe('SchoolClosuresService', () => {
  let service: SchoolClosuresService;
  let mockPrisma: {
    schoolClosure: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      updateMany: jest.Mock;
    };
    class: { findFirst: jest.Mock; findMany: jest.Mock };
    yearGroup: { findFirst: jest.Mock };
    attendanceSession: { findMany: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mockRlsClient: { $transaction: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      schoolClosure: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      class: { findFirst: jest.fn(), findMany: jest.fn() },
      yearGroup: { findFirst: jest.fn() },
      attendanceSession: { findMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SchoolClosuresService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<SchoolClosuresService>(SchoolClosuresService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── isClosureDate tests (existing) ─────────────────────────────────────
  describe('isClosureDate', () => {
    beforeEach(() => {
      mockPrisma.schoolClosure.findFirst = jest.fn();
      mockPrisma.class.findFirst = jest.fn();
    });

    it('should return true for all scope closure on the date', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: 'closure-1' });

      const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

      expect(result).toBe(true);
      expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            closure_date: DATE,
            OR: expect.arrayContaining([{ affects_scope: 'all' }]),
          }),
        }),
      );
    });

    it('should return true for year_group scope matching class year group', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: 'closure-2' });

      const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

      expect(result).toBe(true);
      expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { affects_scope: 'year_group', scope_entity_id: YEAR_GROUP_ID },
            ]),
          }),
        }),
      );
    });

    it('should return true for class scope matching class ID', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: 'closure-3' });

      const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID);

      expect(result).toBe(true);
      expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ affects_scope: 'class', scope_entity_id: CLASS_ID }]),
          }),
        }),
      );
    });

    it('should return false when no closure exists', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

      expect(result).toBe(false);
    });

    it('should return false when closure scope does not match class', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);
      mockPrisma.class.findFirst.mockResolvedValue({ year_group_id: null });

      const result = await service.isClosureDate(TENANT_ID, DATE, 'class-unaffected');

      expect(result).toBe(false);
      expect(mockPrisma.class.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'class-unaffected', tenant_id: TENANT_ID },
          select: { year_group_id: true },
        }),
      );
    });

    it('should look up year_group_id from class when not provided', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: 'closure-1' });
      mockPrisma.class.findFirst.mockResolvedValue({ year_group_id: YEAR_GROUP_ID });

      await service.isClosureDate(TENANT_ID, DATE, CLASS_ID);

      expect(mockPrisma.class.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CLASS_ID, tenant_id: TENANT_ID },
          select: { year_group_id: true },
        }),
      );
    });
  });

  // ─── create tests ─────────────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      closure_date: '2026-03-15',
      reason: 'Public Holiday',
      affects_scope: 'all' as const,
      scope_entity_id: undefined as string | undefined,
    };

    beforeEach(() => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      mockRlsClient = {
        $transaction: jest.fn().mockImplementation(async (fn: any) => {
          const mockTx = {
            schoolClosure: {
              create: jest.fn().mockResolvedValue({
                id: 'closure-1',
                tenant_id: TENANT_ID,
                closure_date: new Date(createDto.closure_date),
                reason: createDto.reason,
                affects_scope: createDto.affects_scope,
                scope_entity_id: null,
                created_by_user_id: USER_ID,
                created_by: { id: USER_ID, first_name: 'Test', last_name: 'User' },
              }),
            },
          };
          return fn(mockTx);
        }),
      };
      createRlsClient.mockReturnValue(mockRlsClient);
    });

    it('should create a closure with all scope', async () => {
      mockPrisma.class.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.create(TENANT_ID, USER_ID, createDto);

      expect(result.closure).toBeDefined();
      expect(result.closure.tenant_id).toBe(TENANT_ID);
      expect(result.closure.reason).toBe(createDto.reason);
    });

    it('should create a closure with year_group scope', async () => {
      const yearGroupDto = {
        ...createDto,
        affects_scope: 'year_group' as const,
        scope_entity_id: YEAR_GROUP_ID,
      };

      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID });
      mockPrisma.class.findMany.mockResolvedValue([{ id: 'class-1' }, { id: 'class-2' }]);
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.create(TENANT_ID, USER_ID, yearGroupDto);

      expect(result.closure).toBeDefined();
      expect(mockPrisma.yearGroup.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: YEAR_GROUP_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should create a closure with class scope', async () => {
      const classDto = {
        ...createDto,
        affects_scope: 'class' as const,
        scope_entity_id: CLASS_ID,
      };

      mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.create(TENANT_ID, USER_ID, classDto);

      expect(result.closure).toBeDefined();
      expect(mockPrisma.class.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CLASS_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should throw ConflictException when closure already exists', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '1.0.0',
      });

      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockRejectedValue(prismaError),
      });

      await expect(service.create(TENANT_ID, USER_ID, createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException when scope_entity_id is missing for year_group scope', async () => {
      const invalidDto = {
        ...createDto,
        affects_scope: 'year_group' as const,
        scope_entity_id: undefined,
      };

      await expect(service.create(TENANT_ID, USER_ID, invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when year_group does not exist', async () => {
      const yearGroupDto = {
        ...createDto,
        affects_scope: 'year_group' as const,
        scope_entity_id: YEAR_GROUP_ID,
      };

      mockPrisma.yearGroup.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT_ID, USER_ID, yearGroupDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when class does not exist', async () => {
      const classDto = {
        ...createDto,
        affects_scope: 'class' as const,
        scope_entity_id: CLASS_ID,
      };

      mockPrisma.class.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT_ID, USER_ID, classDto)).rejects.toThrow(NotFoundException);
    });

    it('should apply side effects and cancel open sessions', async () => {
      mockPrisma.class.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.findMany
        .mockResolvedValueOnce([{ id: 'session-1' }, { id: 'session-2' }]) // open sessions
        .mockResolvedValueOnce([]); // flagged sessions
      mockPrisma.attendanceSession.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.create(TENANT_ID, USER_ID, createDto);

      expect(result.cancelled_sessions).toBe(2);
    });
  });

  // ─── bulkCreate tests ──────────────────────────────────────────────────────
  describe('bulkCreate', () => {
    const bulkDto = {
      start_date: '2026-03-15',
      end_date: '2026-03-17',
      reason: 'School Break',
      affects_scope: 'all' as const,
      scope_entity_id: undefined as string | undefined,
      skip_weekends: false,
    };

    beforeEach(() => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      mockRlsClient = {
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
              schoolClosure: {
                create: jest.fn().mockResolvedValue({
                  id: 'closure-1',
                  tenant_id: TENANT_ID,
                  closure_date: new Date(),
                  reason: bulkDto.reason,
                  affects_scope: bulkDto.affects_scope,
                  created_by: { id: USER_ID, first_name: 'Test', last_name: 'User' },
                }),
              },
            };
            return fn(mockTx);
          }),
      };
      createRlsClient.mockReturnValue(mockRlsClient);
    });

    it('should create closures for date range', async () => {
      mockPrisma.class.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.bulkCreate(TENANT_ID, USER_ID, bulkDto);

      expect(result.created_count).toBe(3); // 3 days
      expect(result.skipped_count).toBe(0);
      expect(result.closures).toHaveLength(3);
    });

    it('should skip weekends when skip_weekends is true', async () => {
      const weekendDto = {
        ...bulkDto,
        start_date: '2026-03-14', // Saturday
        end_date: '2026-03-15', // Sunday
        skip_weekends: true,
      };

      mockPrisma.class.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);

      const result = await service.bulkCreate(TENANT_ID, USER_ID, weekendDto);

      expect(result.created_count).toBe(0); // All days are weekends
      expect(result.skipped_count).toBe(0);
    });

    it('should skip existing closures and continue', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      let callCount = 0;
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
            callCount++;
            if (callCount === 2) {
              const prismaError = new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed',
                {
                  code: 'P2002',
                  clientVersion: '1.0.0',
                },
              );
              throw prismaError;
            }
            const mockTx = {
              schoolClosure: {
                create: jest.fn().mockResolvedValue({
                  id: `closure-${callCount}`,
                  tenant_id: TENANT_ID,
                  closure_date: new Date(),
                  reason: bulkDto.reason,
                  affects_scope: bulkDto.affects_scope,
                  created_by: { id: USER_ID, first_name: 'Test', last_name: 'User' },
                }),
              },
            };
            return fn(mockTx);
          }),
      });

      mockPrisma.class.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);

      const result = await service.bulkCreate(TENANT_ID, USER_ID, bulkDto);

      expect(result.created_count).toBe(2); // 2 created, 1 skipped
      expect(result.skipped_count).toBe(1);
    });

    it('should aggregate side effects across all closures', async () => {
      mockPrisma.class.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.findMany
        .mockResolvedValue([{ id: 'session-1' }])
        .mockResolvedValue([{ id: 'session-2' }])
        .mockResolvedValue([{ id: 'session-3' }]);
      mockPrisma.attendanceSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.bulkCreate(TENANT_ID, USER_ID, bulkDto);

      expect(result.cancelled_sessions).toBe(3);
    });
  });

  // ─── findAll tests ──────────────────────────────────────────────────────────
  describe('findAll', () => {
    const listParams = {
      page: 1,
      pageSize: 10,
    };

    it('should return paginated closures with default filters', async () => {
      const closures = [
        {
          id: 'closure-1',
          affects_scope: 'all',
          scope_entity_id: null,
          closure_date: new Date('2026-03-15'),
          created_by: { id: USER_ID, first_name: 'Test', last_name: 'User' },
        },
      ];
      mockPrisma.schoolClosure.findMany.mockResolvedValue(closures);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      mockPrisma.class.findMany.mockResolvedValue([]);

      const result = await service.findAll(TENANT_ID, listParams);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should filter by date range', async () => {
      const dateParams = {
        ...listParams,
        start_date: '2026-03-01',
        end_date: '2026-03-31',
      };

      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);
      mockPrisma.schoolClosure.count.mockResolvedValue(0);
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      mockPrisma.class.findMany.mockResolvedValue([]);

      await service.findAll(TENANT_ID, dateParams);

      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            closure_date: expect.objectContaining({
              gte: new Date('2026-03-01'),
              lte: new Date('2026-03-31'),
            }),
          }),
        }),
      );
    });

    it('should filter by affects_scope', async () => {
      const scopeParams = {
        ...listParams,
        affects_scope: 'class' as const,
      };

      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);
      mockPrisma.schoolClosure.count.mockResolvedValue(0);
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      mockPrisma.class.findMany.mockResolvedValue([]);

      await service.findAll(TENANT_ID, scopeParams);

      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            affects_scope: 'class',
          }),
        }),
      );
    });

    it('should resolve scope entity names', async () => {
      const closures = [
        {
          id: 'closure-1',
          affects_scope: 'year_group',
          scope_entity_id: YEAR_GROUP_ID,
          closure_date: new Date('2026-03-15'),
          created_by: { id: USER_ID, first_name: 'Test', last_name: 'User' },
        },
        {
          id: 'closure-2',
          affects_scope: 'class',
          scope_entity_id: CLASS_ID,
          closure_date: new Date('2026-03-16'),
          created_by: { id: USER_ID, first_name: 'Test', last_name: 'User' },
        },
      ];

      mockPrisma.schoolClosure.findMany.mockResolvedValue(closures);
      mockPrisma.schoolClosure.count.mockResolvedValue(2);
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: YEAR_GROUP_ID, name: 'Year 1' }]);
      mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID, name: 'Class A' }]);

      const result = await service.findAll(TENANT_ID, listParams);

      expect(result.data[0].scope_entity_name).toBe('Year 1');
      expect(result.data[1].scope_entity_name).toBe('Class A');
    });

    it('should calculate skip based on page number', async () => {
      const page2Params = {
        page: 2,
        pageSize: 10,
      };

      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);
      mockPrisma.schoolClosure.count.mockResolvedValue(0);
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      mockPrisma.class.findMany.mockResolvedValue([]);

      await service.findAll(TENANT_ID, page2Params);

      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (2-1) * 10
          take: 10,
        }),
      );
    });
  });

  // ─── remove tests ───────────────────────────────────────────────────────────
  describe('remove', () => {
    it('should delete existing closure', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: 'closure-1' });
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
              schoolClosure: {
                delete: jest.fn().mockResolvedValue({ id: 'closure-1' }),
              },
            };
            return fn(mockTx);
          }),
      });

      await service.remove(TENANT_ID, 'closure-1');

      expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'closure-1', tenant_id: TENANT_ID },
        }),
      );
    });

    it('should throw NotFoundException when closure does not exist', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      await expect(service.remove(TENANT_ID, 'non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });
});
