/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

jest.mock('../../common/middleware/rls.middleware');

import { createRlsClient } from '../../common/middleware/rls.middleware';
import {
  MOCK_FACADE_PROVIDERS,
  AcademicReadFacade,
  AttendanceReadFacade,
  ClassesReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { SchoolClosuresService } from './school-closures.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLOSURE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const YEAR_GROUP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const makeClosure = (overrides: Record<string, unknown> = {}) => ({
  id: CLOSURE_ID,
  tenant_id: TENANT_ID,
  closure_date: new Date('2026-06-15'),
  reason: 'Holiday',
  affects_scope: 'all',
  scope_entity_id: null,
  created_by_user_id: USER_ID,
  created_by: { id: USER_ID, first_name: 'Test', last_name: 'User' },
  ...overrides,
});

// ─── Mock factories ──────────────────────────────────────────────────────────

const makeMockDb = () => ({
  schoolClosure: {
    create: jest.fn().mockResolvedValue(makeClosure()),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn().mockResolvedValue({}),
  },
  attendanceSession: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

const makeMockPrisma = () => ({
  schoolClosure: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
});

describe('SchoolClosuresService', () => {
  let service: SchoolClosuresService;
  let mockDb: ReturnType<typeof makeMockDb>;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;
  let mockAcademicFacade: {
    findYearGroupById: jest.Mock;
    findAllYearGroups: jest.Mock;
    [key: string]: jest.Mock;
  };
  let mockClassesFacade: {
    findById: jest.Mock;
    findNamesByIds: jest.Mock;
    findIdsByYearGroup: jest.Mock;
    findYearGroupId: jest.Mock;
    [key: string]: jest.Mock;
  };
  let mockAttendanceFacade: {
    findSessionsGeneric: jest.Mock;
    [key: string]: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = makeMockDb();
    mockPrisma = makeMockPrisma();

    const mockTx = jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(mockDb);
    });

    (createRlsClient as jest.Mock).mockReturnValue({ $transaction: mockTx });

    mockAcademicFacade = {
      findYearGroupById: jest.fn().mockResolvedValue(null),
      findAllYearGroups: jest.fn().mockResolvedValue([]),
    };

    mockClassesFacade = {
      findById: jest.fn().mockResolvedValue(null),
      findNamesByIds: jest.fn().mockResolvedValue([]),
      findIdsByYearGroup: jest.fn().mockResolvedValue([]),
      findYearGroupId: jest.fn().mockResolvedValue(null),
    };

    mockAttendanceFacade = {
      findSessionsGeneric: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SchoolClosuresService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AttendanceReadFacade, useValue: mockAttendanceFacade },
      ],
    }).compile();

    service = module.get<SchoolClosuresService>(SchoolClosuresService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // create
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresService — create', () => {
    it('should create a closure with scope "all" and return side effects', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
      };
      const createdClosure = makeClosure();
      mockDb.schoolClosure.create.mockResolvedValue(createdClosure);

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result.closure).toEqual(createdClosure);
      expect(result.cancelled_sessions).toBe(0);
      expect(result.flagged_sessions).toEqual([]);
      expect(mockDb.schoolClosure.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            affects_scope: 'all',
            scope_entity_id: null,
          }),
        }),
      );
    });

    it('should create a closure with scope "year_group" and set scope_entity_id', async () => {
      mockAcademicFacade!.findYearGroupById.mockResolvedValue({
        id: YEAR_GROUP_ID,
        name: 'Year 1',
      });
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Year group closure',
        affects_scope: 'year_group' as const,
        scope_entity_id: YEAR_GROUP_ID,
      };
      mockDb.schoolClosure.create.mockResolvedValue(
        makeClosure({ affects_scope: 'year_group', scope_entity_id: YEAR_GROUP_ID }),
      );

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result.closure.affects_scope).toBe('year_group');
      expect(mockDb.schoolClosure.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope_entity_id: YEAR_GROUP_ID,
          }),
        }),
      );
    });

    it('should create a closure with scope "class" and set scope_entity_id', async () => {
      mockClassesFacade!.findById.mockResolvedValue({ id: CLASS_ID, name: 'Class A' });
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Class closure',
        affects_scope: 'class' as const,
        scope_entity_id: CLASS_ID,
      };
      mockDb.schoolClosure.create.mockResolvedValue(
        makeClosure({ affects_scope: 'class', scope_entity_id: CLASS_ID }),
      );

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result.closure.affects_scope).toBe('class');
    });

    it('should throw ConflictException on P2002 unique constraint', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
      };
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockDb.schoolClosure.create.mockRejectedValue(p2002);

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(ConflictException);
    });

    it('should re-throw non-P2002 Prisma errors', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
      };
      const otherError = new Error('Database connection lost');
      mockDb.schoolClosure.create.mockRejectedValue(otherError);

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(
        'Database connection lost',
      );
    });

    it('should re-throw PrismaClientKnownRequestError with non-P2002 code', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
      };
      const p2003 = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });
      mockDb.schoolClosure.create.mockRejectedValue(p2003);

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('should cancel open sessions and flag submitted/locked sessions as side effects', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      // First call: open sessions; second call: flagged sessions
      mockAttendanceFacade!.findSessionsGeneric
        .mockResolvedValueOnce([{ id: 'session-1' }, { id: 'session-2' }])
        .mockResolvedValueOnce([
          {
            id: 'session-3',
            class_id: CLASS_ID,
            session_date: new Date('2026-06-15'),
            status: 'submitted',
          },
        ]);
      mockDb.attendanceSession.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result.cancelled_sessions).toBe(2);
      expect(result.flagged_sessions).toHaveLength(1);
      expect(result.flagged_sessions[0]).toMatchObject({ id: 'session-3', status: 'submitted' });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // bulkCreate
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresService — bulkCreate', () => {
    it('should create closures for each date in range', async () => {
      const dto = {
        start_date: '2026-06-15',
        end_date: '2026-06-17',
        reason: 'Holiday',
        affects_scope: 'all' as const,
        skip_weekends: false,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      const result = await service.bulkCreate(TENANT_ID, USER_ID, dto);

      // 15th, 16th, 17th = 3 days
      expect(result.created_count).toBe(3);
      expect(result.skipped_count).toBe(0);
      expect(result.closures).toHaveLength(3);
    });

    it('should skip weekends when skip_weekends is true', async () => {
      // 2026-06-13 is Saturday, 2026-06-14 is Sunday
      const dto = {
        start_date: '2026-06-12',
        end_date: '2026-06-15',
        reason: 'Break',
        affects_scope: 'all' as const,
        skip_weekends: true,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      const result = await service.bulkCreate(TENANT_ID, USER_ID, dto);

      // Friday 12th and Monday 15th = 2 days (skip Sat 13th and Sun 14th)
      expect(result.created_count).toBe(2);
    });

    it('should skip duplicates (P2002) and count them', async () => {
      const dto = {
        start_date: '2026-06-15',
        end_date: '2026-06-17',
        reason: 'Holiday',
        affects_scope: 'all' as const,
        skip_weekends: false,
      };
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      // First date succeeds, second is duplicate, third succeeds
      mockDb.schoolClosure.create
        .mockResolvedValueOnce(makeClosure())
        .mockRejectedValueOnce(p2002)
        .mockResolvedValueOnce(makeClosure());

      const result = await service.bulkCreate(TENANT_ID, USER_ID, dto);

      expect(result.created_count).toBe(2);
      expect(result.skipped_count).toBe(1);
    });

    it('should re-throw non-P2002 errors in bulkCreate', async () => {
      const dto = {
        start_date: '2026-06-15',
        end_date: '2026-06-16',
        reason: 'Holiday',
        affects_scope: 'all' as const,
        skip_weekends: false,
      };
      const error = new Error('Unexpected DB error');
      mockDb.schoolClosure.create.mockRejectedValue(error);

      await expect(service.bulkCreate(TENANT_ID, USER_ID, dto)).rejects.toThrow(
        'Unexpected DB error',
      );
    });

    it('should re-throw PrismaClientKnownRequestError with non-P2002 code in bulkCreate', async () => {
      const dto = {
        start_date: '2026-06-15',
        end_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
        skip_weekends: false,
      };
      const p2003 = new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });
      mockDb.schoolClosure.create.mockRejectedValue(p2003);

      await expect(service.bulkCreate(TENANT_ID, USER_ID, dto)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('should accumulate side effects across all dates in bulk', async () => {
      const dto = {
        start_date: '2026-06-15',
        end_date: '2026-06-16',
        reason: 'Holiday',
        affects_scope: 'all' as const,
        skip_weekends: false,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      // Side effects for first date
      mockAttendanceFacade!.findSessionsGeneric
        .mockResolvedValueOnce([{ id: 'session-open-1' }]) // open sessions day 1
        .mockResolvedValueOnce([
          {
            id: 'session-flagged-1',
            class_id: CLASS_ID,
            session_date: new Date('2026-06-15'),
            status: 'submitted',
          },
        ]) // flagged day 1
        .mockResolvedValueOnce([{ id: 'session-open-2' }]) // open sessions day 2
        .mockResolvedValueOnce([]); // flagged day 2 (none)

      mockDb.attendanceSession.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.bulkCreate(TENANT_ID, USER_ID, dto);

      expect(result.cancelled_sessions).toBe(2);
      expect(result.flagged_sessions).toHaveLength(1);
    });

    it('should validate scope for year_group in bulkCreate', async () => {
      const dto = {
        start_date: '2026-06-15',
        end_date: '2026-06-15',
        reason: 'Year group closure',
        affects_scope: 'year_group' as const,
        scope_entity_id: YEAR_GROUP_ID,
        skip_weekends: false,
      };
      // Year group not found
      mockAcademicFacade!.findYearGroupById.mockResolvedValue(null);

      await expect(service.bulkCreate(TENANT_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findAll
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresService — findAll', () => {
    it('should return paginated results with no filters', async () => {
      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);
      mockPrisma.schoolClosure.count.mockResolvedValue(0);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
    });

    it('should filter by start_date only', async () => {
      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);
      mockPrisma.schoolClosure.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, start_date: '2026-06-01' });

      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            closure_date: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by end_date only', async () => {
      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);
      mockPrisma.schoolClosure.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, end_date: '2026-06-30' });

      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            closure_date: expect.objectContaining({
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by both start_date and end_date', async () => {
      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);
      mockPrisma.schoolClosure.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        start_date: '2026-06-01',
        end_date: '2026-06-30',
      });

      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            closure_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by affects_scope', async () => {
      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);
      mockPrisma.schoolClosure.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        affects_scope: 'year_group',
      });

      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            affects_scope: 'year_group',
          }),
        }),
      );
    });

    it('should resolve year_group scope entity names', async () => {
      const closureWithYg = makeClosure({
        affects_scope: 'year_group',
        scope_entity_id: YEAR_GROUP_ID,
      });
      mockPrisma.schoolClosure.findMany.mockResolvedValue([closureWithYg]);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);
      mockAcademicFacade!.findAllYearGroups.mockResolvedValue([
        { id: YEAR_GROUP_ID, name: 'Year 1' },
      ]);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]).toMatchObject({ scope_entity_name: 'Year 1' });
    });

    it('should resolve class scope entity names', async () => {
      const closureWithClass = makeClosure({
        affects_scope: 'class',
        scope_entity_id: CLASS_ID,
      });
      mockPrisma.schoolClosure.findMany.mockResolvedValue([closureWithClass]);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);
      mockClassesFacade!.findNamesByIds.mockResolvedValue([{ id: CLASS_ID, name: 'Class A' }]);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]).toMatchObject({ scope_entity_name: 'Class A' });
    });

    it('should set scope_entity_name to null for "all" scope closures', async () => {
      const closureAll = makeClosure({ affects_scope: 'all', scope_entity_id: null });
      mockPrisma.schoolClosure.findMany.mockResolvedValue([closureAll]);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]).toMatchObject({ scope_entity_name: null });
    });

    it('should set scope_entity_name to null when year_group entity is not found in map', async () => {
      const closureWithYg = makeClosure({
        affects_scope: 'year_group',
        scope_entity_id: 'unknown-yg-id',
      });
      mockPrisma.schoolClosure.findMany.mockResolvedValue([closureWithYg]);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);
      mockAcademicFacade!.findAllYearGroups.mockResolvedValue([
        { id: YEAR_GROUP_ID, name: 'Year 1' },
      ]);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]).toMatchObject({ scope_entity_name: null });
    });

    it('should set scope_entity_name to null when class entity is not found in map', async () => {
      const closureWithClass = makeClosure({
        affects_scope: 'class',
        scope_entity_id: 'unknown-class-id',
      });
      mockPrisma.schoolClosure.findMany.mockResolvedValue([closureWithClass]);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);
      mockClassesFacade!.findNamesByIds.mockResolvedValue([{ id: CLASS_ID, name: 'Class A' }]);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]).toMatchObject({ scope_entity_name: null });
    });

    it('should not fetch year groups when no year_group scope closures exist', async () => {
      const closureAll = makeClosure({ affects_scope: 'all', scope_entity_id: null });
      mockPrisma.schoolClosure.findMany.mockResolvedValue([closureAll]);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(mockAcademicFacade.findAllYearGroups).not.toHaveBeenCalled();
    });

    it('should not fetch class names when no class scope closures exist', async () => {
      const closureAll = makeClosure({ affects_scope: 'all', scope_entity_id: null });
      mockPrisma.schoolClosure.findMany.mockResolvedValue([closureAll]);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(mockClassesFacade.findNamesByIds).not.toHaveBeenCalled();
    });

    it('should handle pagination offset correctly', async () => {
      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);
      mockPrisma.schoolClosure.count.mockResolvedValue(50);

      await service.findAll(TENANT_ID, { page: 3, pageSize: 10 });

      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // remove
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresService — remove', () => {
    it('should delete a closure when it exists', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: CLOSURE_ID });

      await service.remove(TENANT_ID, CLOSURE_ID);

      expect(mockDb.schoolClosure.delete).toHaveBeenCalledWith({ where: { id: CLOSURE_ID } });
    });

    it('should throw NotFoundException when closure does not exist', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      await expect(service.remove(TENANT_ID, CLOSURE_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with correct error code', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      try {
        await service.remove(TENANT_ID, CLOSURE_ID);
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const response = (err as NotFoundException).getResponse();
        expect(response).toMatchObject({
          code: 'CLOSURE_NOT_FOUND',
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // isClosureDate
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresService — isClosureDate', () => {
    const DATE = new Date('2026-06-15');

    it('should return true when a closure exists', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: CLOSURE_ID });

      const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

      expect(result).toBe(true);
    });

    it('should return false when no closure exists', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

      expect(result).toBe(false);
    });

    it('should include year_group condition when yearGroupId is provided', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

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

    it('should look up year group from facade when yearGroupId is not provided', async () => {
      mockClassesFacade!.findYearGroupId.mockResolvedValue('resolved-yg-id');
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      await service.isClosureDate(TENANT_ID, DATE, CLASS_ID);

      expect(mockClassesFacade.findYearGroupId).toHaveBeenCalledWith(TENANT_ID, CLASS_ID);
      expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { affects_scope: 'year_group', scope_entity_id: 'resolved-yg-id' },
            ]),
          }),
        }),
      );
    });

    it('should not include year_group condition when yearGroupId is not provided and facade returns null', async () => {
      mockClassesFacade!.findYearGroupId.mockResolvedValue(null);
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      await service.isClosureDate(TENANT_ID, DATE, CLASS_ID);

      const callArgs = mockPrisma.schoolClosure.findFirst.mock.calls[0][0];
      const orConditions = callArgs.where.OR as Array<Record<string, unknown>>;
      // Should only have 'all' and 'class' conditions, no 'year_group'
      expect(orConditions).toHaveLength(2);
      expect(
        orConditions.some((c: Record<string, unknown>) => c.affects_scope === 'year_group'),
      ).toBe(false);
    });

    it('should always include "all" scope and "class" scope conditions', async () => {
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

      expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { affects_scope: 'all' },
              { affects_scope: 'class', scope_entity_id: CLASS_ID },
            ]),
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validateScope (private, tested via create/bulkCreate)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresService — validateScope', () => {
    it('should pass validation for "all" scope without scope_entity_id', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      // Should not throw
      await expect(service.create(TENANT_ID, USER_ID, dto)).resolves.toBeDefined();
    });

    it('should throw BadRequestException when year_group scope has no scope_entity_id', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Year group closure',
        affects_scope: 'year_group' as const,
      };

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when class scope has no scope_entity_id', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Class closure',
        affects_scope: 'class' as const,
      };

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct error code for missing scope_entity_id', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Year group closure',
        affects_scope: 'year_group' as const,
      };

      try {
        await service.create(TENANT_ID, USER_ID, dto);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse();
        expect(response).toMatchObject({
          code: 'SCOPE_ENTITY_REQUIRED',
        });
      }
    });

    it('should throw NotFoundException when year_group entity does not exist', async () => {
      mockAcademicFacade!.findYearGroupById.mockResolvedValue(null);

      const dto = {
        closure_date: '2026-06-15',
        reason: 'Year group closure',
        affects_scope: 'year_group' as const,
        scope_entity_id: YEAR_GROUP_ID,
      };

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with YEAR_GROUP_NOT_FOUND code', async () => {
      mockAcademicFacade!.findYearGroupById.mockResolvedValue(null);

      const dto = {
        closure_date: '2026-06-15',
        reason: 'Year group closure',
        affects_scope: 'year_group' as const,
        scope_entity_id: YEAR_GROUP_ID,
      };

      try {
        await service.create(TENANT_ID, USER_ID, dto);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const response = (err as NotFoundException).getResponse();
        expect(response).toMatchObject({
          code: 'YEAR_GROUP_NOT_FOUND',
        });
      }
    });

    it('should throw NotFoundException when class entity does not exist', async () => {
      mockClassesFacade!.findById.mockResolvedValue(null);

      const dto = {
        closure_date: '2026-06-15',
        reason: 'Class closure',
        affects_scope: 'class' as const,
        scope_entity_id: CLASS_ID,
      };

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with CLASS_NOT_FOUND code', async () => {
      mockClassesFacade!.findById.mockResolvedValue(null);

      const dto = {
        closure_date: '2026-06-15',
        reason: 'Class closure',
        affects_scope: 'class' as const,
        scope_entity_id: CLASS_ID,
      };

      try {
        await service.create(TENANT_ID, USER_ID, dto);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const response = (err as NotFoundException).getResponse();
        expect(response).toMatchObject({
          code: 'CLASS_NOT_FOUND',
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // applyClosureSideEffects (private, tested via create)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresService — applyClosureSideEffects', () => {
    it('should filter sessions by year_group class IDs when scope is year_group', async () => {
      mockAcademicFacade!.findYearGroupById.mockResolvedValue({
        id: YEAR_GROUP_ID,
        name: 'Year 1',
      });
      mockClassesFacade!.findIdsByYearGroup.mockResolvedValue(['class-a', 'class-b']);

      const dto = {
        closure_date: '2026-06-15',
        reason: 'Year group closure',
        affects_scope: 'year_group' as const,
        scope_entity_id: YEAR_GROUP_ID,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());
      mockAttendanceFacade!.findSessionsGeneric.mockResolvedValue([]);

      await service.create(TENANT_ID, USER_ID, dto);

      // Verify findSessionsGeneric was called with class_id filter
      expect(mockAttendanceFacade.findSessionsGeneric).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({
            class_id: { in: ['class-a', 'class-b'] },
          }),
        }),
      );
    });

    it('should filter sessions by class_id when scope is class', async () => {
      mockClassesFacade!.findById.mockResolvedValue({ id: CLASS_ID, name: 'Class A' });

      const dto = {
        closure_date: '2026-06-15',
        reason: 'Class closure',
        affects_scope: 'class' as const,
        scope_entity_id: CLASS_ID,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());
      mockAttendanceFacade!.findSessionsGeneric.mockResolvedValue([]);

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockAttendanceFacade.findSessionsGeneric).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({
            class_id: CLASS_ID,
          }),
        }),
      );
    });

    it('should not add class_id filter when scope is "all"', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'School-wide closure',
        affects_scope: 'all' as const,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());
      mockAttendanceFacade!.findSessionsGeneric.mockResolvedValue([]);

      await service.create(TENANT_ID, USER_ID, dto);

      // The first call to findSessionsGeneric (open sessions) should not have class_id
      const firstCallArgs = mockAttendanceFacade!.findSessionsGeneric.mock.calls[0];
      expect(firstCallArgs[1].where).not.toHaveProperty('class_id');
    });

    it('should not call updateMany when there are no open sessions', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());
      mockAttendanceFacade!.findSessionsGeneric
        .mockResolvedValueOnce([]) // no open sessions
        .mockResolvedValueOnce([]); // no flagged sessions

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result.cancelled_sessions).toBe(0);
      expect(mockDb.attendanceSession.updateMany).not.toHaveBeenCalled();
    });

    it('should return empty flagged_sessions when no submitted/locked sessions exist', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());
      mockAttendanceFacade!.findSessionsGeneric
        .mockResolvedValueOnce([]) // open sessions
        .mockResolvedValueOnce([]); // flagged sessions

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result.flagged_sessions).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateDateRange (private, tested via bulkCreate)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresService — generateDateRange', () => {
    it('should generate a single date when start and end are the same', async () => {
      const dto = {
        start_date: '2026-06-15',
        end_date: '2026-06-15',
        reason: 'One day',
        affects_scope: 'all' as const,
        skip_weekends: false,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      const result = await service.bulkCreate(TENANT_ID, USER_ID, dto);

      expect(result.created_count).toBe(1);
    });

    it('should include weekends when skip_weekends is false', async () => {
      // 2026-06-13 = Saturday, 2026-06-14 = Sunday
      const dto = {
        start_date: '2026-06-13',
        end_date: '2026-06-14',
        reason: 'Weekend test',
        affects_scope: 'all' as const,
        skip_weekends: false,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      const result = await service.bulkCreate(TENANT_ID, USER_ID, dto);

      expect(result.created_count).toBe(2);
    });

    it('should skip Saturday and Sunday when skip_weekends is true', async () => {
      // 2026-06-13 = Saturday, 2026-06-14 = Sunday
      const dto = {
        start_date: '2026-06-13',
        end_date: '2026-06-14',
        reason: 'Weekend test',
        affects_scope: 'all' as const,
        skip_weekends: true,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      const result = await service.bulkCreate(TENANT_ID, USER_ID, dto);

      expect(result.created_count).toBe(0);
      expect(result.closures).toHaveLength(0);
    });

    it('edge: should handle a multi-week range with skip_weekends', async () => {
      // Mon 2026-06-08 to Fri 2026-06-19 = 10 weekdays
      const dto = {
        start_date: '2026-06-08',
        end_date: '2026-06-19',
        reason: 'Two week closure',
        affects_scope: 'all' as const,
        skip_weekends: true,
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      const result = await service.bulkCreate(TENANT_ID, USER_ID, dto);

      // Mon-Fri week 1: 5 days, Mon-Fri week 2: 5 days = 10
      expect(result.created_count).toBe(10);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresService — edge cases', () => {
    it('edge: create with scope "all" should set scope_entity_id to null even if dto provides one', async () => {
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Holiday',
        affects_scope: 'all' as const,
        scope_entity_id: 'should-be-ignored',
      };
      mockDb.schoolClosure.create.mockResolvedValue(makeClosure());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockDb.schoolClosure.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope_entity_id: null,
          }),
        }),
      );
    });

    it('edge: create with scope "class" and undefined scope_entity_id uses null fallback', async () => {
      // This actually triggers the validateScope BadRequestException because
      // scope_entity_id is required for non-all scopes
      const dto = {
        closure_date: '2026-06-15',
        reason: 'Class closure',
        affects_scope: 'class' as const,
        scope_entity_id: undefined,
      };

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('edge: findAll with year_group closure but scope_entity_id is null should not crash', async () => {
      const closureNoEntityId = makeClosure({
        affects_scope: 'year_group',
        scope_entity_id: null,
      });
      mockPrisma.schoolClosure.findMany.mockResolvedValue([closureNoEntityId]);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      // Null scope_entity_id should be filtered out and not break resolution
      expect(result.data[0]).toMatchObject({ scope_entity_name: null });
    });

    it('edge: findAll with class closure but scope_entity_id is null should not crash', async () => {
      const closureNoEntityId = makeClosure({
        affects_scope: 'class',
        scope_entity_id: null,
      });
      mockPrisma.schoolClosure.findMany.mockResolvedValue([closureNoEntityId]);
      mockPrisma.schoolClosure.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]).toMatchObject({ scope_entity_name: null });
    });
  });
});
