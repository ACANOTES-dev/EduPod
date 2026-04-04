import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import type {
  BulkClassRequirementsDto,
  CreateClassRequirementDto,
  UpdateClassRequirementDto,
} from '@school/shared';

import { MOCK_FACADE_PROVIDERS, SchedulingReadFacade, ClassesReadFacade, RoomsReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { ClassRequirementsService } from './class-requirements.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REQUIREMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const _USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ROOM_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  classSchedulingRequirement: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function buildRequirement(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REQUIREMENT_ID,
    tenant_id: TENANT_ID,
    class_id: CLASS_ID,
    academic_year_id: YEAR_ID,
    periods_per_week: 5,
    required_room_type: null,
    preferred_room_id: null,
    max_consecutive_periods: 2,
    min_consecutive_periods: 1,
    spread_preference: 'spread_evenly',
    student_count: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildCreateDto(
  overrides: Partial<CreateClassRequirementDto> = {},
): CreateClassRequirementDto {
  return {
    class_id: CLASS_ID,
    academic_year_id: YEAR_ID,
    periods_per_week: 5,
    max_consecutive_periods: 2,
    min_consecutive_periods: 1,
    spread_preference: 'spread_evenly',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClassRequirementsService', () => {
  let service: ClassRequirementsService;
  let mockPrisma: Record<string, unknown>;
  let mockSchedulingReadFacade: {
    findClassRequirementsPaginated: jest.Mock;
    findClassRequirementById: jest.Mock;
  };
  let mockClassesReadFacade: {
    countByAcademicYear: jest.Mock;
    existsOrThrow: jest.Mock;
  };
  let mockRoomsReadFacade: {
    existsOrThrow: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {};

    mockSchedulingReadFacade = {
      findClassRequirementsPaginated: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findClassRequirementById: jest.fn().mockResolvedValue(null),
    };

    mockClassesReadFacade = {
      countByAcademicYear: jest.fn().mockResolvedValue(0),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
    };

    mockRoomsReadFacade = {
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ClassRequirementsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchedulingReadFacade, useValue: mockSchedulingReadFacade },
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
        { provide: RoomsReadFacade, useValue: mockRoomsReadFacade },
      ],
    }).compile();

    service = module.get<ClassRequirementsService>(ClassRequirementsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated class requirements with meta', async () => {
      const requirement = buildRequirement();
      mockSchedulingReadFacade.findClassRequirementsPaginated.mockResolvedValue({ data: [requirement], total: 1 });
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(3);

      const result = await service.findAll(TENANT_ID, YEAR_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(requirement);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        total_active_classes: 3,
        configured_count: 1,
      });
      expect(mockSchedulingReadFacade.findClassRequirementsPaginated).toHaveBeenCalledWith(
        TENANT_ID,
        YEAR_ID,
        { skip: 0, take: 20 },
      );
    });

    it('should apply correct skip for page 2', async () => {
      mockSchedulingReadFacade.findClassRequirementsPaginated.mockResolvedValue({ data: [], total: 0 });
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(0);

      await service.findAll(TENANT_ID, YEAR_ID, { page: 2, pageSize: 10 });

      expect(mockSchedulingReadFacade.findClassRequirementsPaginated).toHaveBeenCalledWith(
        TENANT_ID,
        YEAR_ID,
        { skip: 10, take: 10 },
      );
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a class requirement successfully', async () => {
      const dto = buildCreateDto();
      const created = buildRequirement();

      mockClassesReadFacade.existsOrThrow.mockResolvedValue(undefined);
      mockRlsTx.classSchedulingRequirement.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual(created);
      expect(mockClassesReadFacade.existsOrThrow).toHaveBeenCalledWith(TENANT_ID, CLASS_ID);
      expect(mockRlsTx.classSchedulingRequirement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            class_id: CLASS_ID,
            academic_year_id: YEAR_ID,
            periods_per_week: 5,
          }),
        }),
      );
    });

    it('should throw NotFoundException if class not found on create', async () => {
      mockClassesReadFacade.existsOrThrow.mockRejectedValue(new NotFoundException({ code: 'CLASS_NOT_FOUND', message: 'Class not found' }));

      await expect(service.create(TENANT_ID, buildCreateDto())).rejects.toThrow(NotFoundException);
      expect(mockRlsTx.classSchedulingRequirement.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if room not found on create', async () => {
      mockClassesReadFacade.existsOrThrow.mockResolvedValue(undefined);
      mockRoomsReadFacade.existsOrThrow.mockRejectedValue(new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' }));

      const dto = buildCreateDto({ preferred_room_id: ROOM_ID });

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
      expect(mockRlsTx.classSchedulingRequirement.create).not.toHaveBeenCalled();
    });

    it('should validate room when preferred_room_id is provided and room exists', async () => {
      const dto = buildCreateDto({ preferred_room_id: ROOM_ID });
      const created = buildRequirement({ preferred_room_id: ROOM_ID });

      mockClassesReadFacade.existsOrThrow.mockResolvedValue(undefined);
      mockRoomsReadFacade.existsOrThrow.mockResolvedValue(undefined);
      mockRlsTx.classSchedulingRequirement.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual(created);
      expect(mockRoomsReadFacade.existsOrThrow).toHaveBeenCalledWith(TENANT_ID, ROOM_ID);
    });

    it('should throw ConflictException on duplicate requirement (P2002)', async () => {
      mockClassesReadFacade.existsOrThrow.mockResolvedValue(undefined);

      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: {},
      });
      mockRlsTx.classSchedulingRequirement.create.mockRejectedValue(p2002);

      await expect(service.create(TENANT_ID, buildCreateDto())).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a class requirement', async () => {
      const dto: UpdateClassRequirementDto = { periods_per_week: 3 };
      const updated = buildRequirement({ periods_per_week: 3 });

      mockSchedulingReadFacade.findClassRequirementById.mockResolvedValue({ id: REQUIREMENT_ID });
      mockRlsTx.classSchedulingRequirement.update.mockResolvedValue(updated);

      const result = await service.update(TENANT_ID, REQUIREMENT_ID, dto);

      expect(result).toEqual(updated);
      expect(mockRlsTx.classSchedulingRequirement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUIREMENT_ID },
          data: expect.objectContaining({ periods_per_week: 3 }),
        }),
      );
    });

    it('should throw NotFoundException if requirement not found on update', async () => {
      mockSchedulingReadFacade.findClassRequirementById.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, REQUIREMENT_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if preferred_room_id room not found on update', async () => {
      mockSchedulingReadFacade.findClassRequirementById.mockResolvedValue({ id: REQUIREMENT_ID });
      mockRoomsReadFacade.existsOrThrow.mockRejectedValue(new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' }));

      const dto: UpdateClassRequirementDto = { preferred_room_id: ROOM_ID };

      await expect(service.update(TENANT_ID, REQUIREMENT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRlsTx.classSchedulingRequirement.update).not.toHaveBeenCalled();
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a class requirement', async () => {
      const deleted = buildRequirement();

      mockSchedulingReadFacade.findClassRequirementById.mockResolvedValue({ id: REQUIREMENT_ID });
      mockRlsTx.classSchedulingRequirement.delete.mockResolvedValue(deleted);

      const result = await service.delete(TENANT_ID, REQUIREMENT_ID);

      expect(result).toEqual(deleted);
      expect(mockRlsTx.classSchedulingRequirement.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: REQUIREMENT_ID } }),
      );
    });

    it('should throw NotFoundException if requirement not found on delete', async () => {
      mockSchedulingReadFacade.findClassRequirementById.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, REQUIREMENT_ID)).rejects.toThrow(NotFoundException);
      expect(mockRlsTx.classSchedulingRequirement.delete).not.toHaveBeenCalled();
    });
  });

  // ─── bulkUpsert ───────────────────────────────────────────────────────────

  describe('bulkUpsert', () => {
    it('should bulk upsert multiple requirements', async () => {
      const CLASS_ID_2 = '11111111-1111-1111-1111-111111111111';
      const dto: BulkClassRequirementsDto = {
        academic_year_id: YEAR_ID,
        requirements: [
          {
            class_id: CLASS_ID,
            periods_per_week: 4,
            max_consecutive_periods: 2,
            min_consecutive_periods: 1,
            spread_preference: 'spread_evenly',
          },
          {
            class_id: CLASS_ID_2,
            periods_per_week: 3,
            max_consecutive_periods: 2,
            min_consecutive_periods: 1,
            spread_preference: 'cluster',
          },
        ],
      };

      const upserted1 = buildRequirement({ class_id: CLASS_ID, periods_per_week: 4 });
      const upserted2 = buildRequirement({
        id: '22222222-2222-2222-2222-222222222222',
        class_id: CLASS_ID_2,
        periods_per_week: 3,
      });

      mockRlsTx.classSchedulingRequirement.upsert
        .mockResolvedValueOnce(upserted1)
        .mockResolvedValueOnce(upserted2);

      const result = await service.bulkUpsert(TENANT_ID, dto);

      expect(result.count).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(mockRlsTx.classSchedulingRequirement.upsert).toHaveBeenCalledTimes(2);
      expect(mockRlsTx.classSchedulingRequirement.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            idx_class_sched_req_unique: {
              tenant_id: TENANT_ID,
              class_id: CLASS_ID,
              academic_year_id: YEAR_ID,
            },
          },
        }),
      );
    });

    it('should return empty data when no requirements provided — minimum 1 enforced by Zod upstream', async () => {
      // The service itself does not validate the length; Zod does. Here we verify
      // that if an empty array somehow arrives, we get count 0 with no DB calls.
      const dto = {
        academic_year_id: YEAR_ID,
        requirements: [],
      } as unknown as BulkClassRequirementsDto;

      // $transaction fn is called but the for-loop body never executes
      const result = await service.bulkUpsert(TENANT_ID, dto);

      expect(result.count).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(mockRlsTx.classSchedulingRequirement.upsert).not.toHaveBeenCalled();
    });
  });
});
