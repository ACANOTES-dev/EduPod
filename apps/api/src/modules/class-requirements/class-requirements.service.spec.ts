import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import type {
  BulkClassRequirementsDto,
  CreateClassRequirementDto,
  UpdateClassRequirementDto,
} from '@school/shared';

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
  let mockPrisma: {
    classSchedulingRequirement: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
    };
    class: {
      findFirst: jest.Mock;
      count: jest.Mock;
    };
    room: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      classSchedulingRequirement: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      class: {
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      room: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassRequirementsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ClassRequirementsService>(ClassRequirementsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated class requirements with meta', async () => {
      const requirement = buildRequirement();
      mockPrisma.classSchedulingRequirement.findMany.mockResolvedValue([requirement]);
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(1);
      mockPrisma.class.count.mockResolvedValue(3);

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
      expect(mockPrisma.classSchedulingRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, academic_year_id: YEAR_ID },
          skip: 0,
          take: 20,
          orderBy: { created_at: 'asc' },
        }),
      );
    });

    it('should apply correct skip for page 2', async () => {
      mockPrisma.classSchedulingRequirement.findMany.mockResolvedValue([]);
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(0);
      mockPrisma.class.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, YEAR_ID, { page: 2, pageSize: 10 });

      expect(mockPrisma.classSchedulingRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a class requirement successfully', async () => {
      const dto = buildCreateDto();
      const created = buildRequirement();

      mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
      mockRlsTx.classSchedulingRequirement.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual(created);
      expect(mockPrisma.class.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CLASS_ID, tenant_id: TENANT_ID } }),
      );
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
      mockPrisma.class.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT_ID, buildCreateDto())).rejects.toThrow(NotFoundException);
      expect(mockRlsTx.classSchedulingRequirement.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if room not found on create', async () => {
      mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
      mockPrisma.room.findFirst.mockResolvedValue(null);

      const dto = buildCreateDto({ preferred_room_id: ROOM_ID });

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
      expect(mockRlsTx.classSchedulingRequirement.create).not.toHaveBeenCalled();
    });

    it('should validate room when preferred_room_id is provided and room exists', async () => {
      const dto = buildCreateDto({ preferred_room_id: ROOM_ID });
      const created = buildRequirement({ preferred_room_id: ROOM_ID });

      mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
      mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });
      mockRlsTx.classSchedulingRequirement.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual(created);
      expect(mockPrisma.room.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ROOM_ID, tenant_id: TENANT_ID } }),
      );
    });

    it('should throw ConflictException on duplicate requirement (P2002)', async () => {
      mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });

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

      mockPrisma.classSchedulingRequirement.findFirst.mockResolvedValue({ id: REQUIREMENT_ID });
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
      mockPrisma.classSchedulingRequirement.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, REQUIREMENT_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if preferred_room_id room not found on update', async () => {
      mockPrisma.classSchedulingRequirement.findFirst.mockResolvedValue({ id: REQUIREMENT_ID });
      mockPrisma.room.findFirst.mockResolvedValue(null);

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

      mockPrisma.classSchedulingRequirement.findFirst.mockResolvedValue({ id: REQUIREMENT_ID });
      mockRlsTx.classSchedulingRequirement.delete.mockResolvedValue(deleted);

      const result = await service.delete(TENANT_ID, REQUIREMENT_ID);

      expect(result).toEqual(deleted);
      expect(mockRlsTx.classSchedulingRequirement.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: REQUIREMENT_ID } }),
      );
    });

    it('should throw NotFoundException if requirement not found on delete', async () => {
      mockPrisma.classSchedulingRequirement.findFirst.mockResolvedValue(null);

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
