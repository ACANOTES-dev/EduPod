import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHouseService } from './behaviour-house.service';
import { BehaviourPointsService } from './behaviour-points.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOUSE_ID = 'house-1111-1111-1111-111111111111';
const HOUSE_ID_2 = 'house-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_ID = 'ay-11111-1111-1111-111111111111';
const STUDENT_ID_1 = 'student-1111-1111-1111-11111111';
const STUDENT_ID_2 = 'student-2222-2222-2222-22222222';

// ─── RLS mock ───────────────────────────────────────────────────────────
const mockRlsTx = {
  behaviourHouseMembership: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

// ─── Factories ──────────────────────────────────────────────────────────

const makeHouse = (overrides: Record<string, unknown> = {}) => ({
  id: HOUSE_ID,
  tenant_id: TENANT_ID,
  name: 'Phoenix',
  name_ar: null,
  color: '#FF0000',
  icon: null,
  display_order: 1,
  is_active: true,
  created_at: new Date('2026-01-01'),
  ...overrides,
});

const makeMembership = (overrides: Record<string, unknown> = {}) => ({
  id: 'membership-1',
  tenant_id: TENANT_ID,
  house_id: HOUSE_ID,
  student_id: STUDENT_ID_1,
  academic_year_id: ACADEMIC_YEAR_ID,
  student: {
    id: STUDENT_ID_1,
    first_name: 'John',
    last_name: 'Doe',
  },
  ...overrides,
});

describe('BehaviourHouseService', () => {
  let service: BehaviourHouseService;
  let mockPrisma: {
    academicYear: { findFirst: jest.Mock };
    behaviourHouseTeam: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    behaviourHouseMembership: {
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let mockPointsService: {
    getStudentPoints: jest.Mock;
    invalidateHousePointsCache: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      academicYear: {
        findFirst: jest.fn(),
      },
      behaviourHouseTeam: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      behaviourHouseMembership: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockPointsService = {
      getStudentPoints: jest.fn().mockResolvedValue({ total: 0, fromCache: false }),
      invalidateHousePointsCache: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourHouseService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourPointsService, useValue: mockPointsService },
      ],
    }).compile();

    service = module.get<BehaviourHouseService>(BehaviourHouseService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listHouses ────────────────────────────────────────────────────────

  describe('listHouses', () => {
    it('should return active houses with member counts', async () => {
      const house = makeHouse();
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.behaviourHouseTeam.findMany.mockResolvedValue([house]);
      mockPrisma.behaviourHouseMembership.groupBy.mockResolvedValue([
        { house_id: HOUSE_ID, _count: { student_id: 5 } },
      ]);

      const result = await service.listHouses(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        id: HOUSE_ID,
        name: 'Phoenix',
        member_count: 5,
      }));
    });

    it('should return member_count=0 when no current academic year exists', async () => {
      const house = makeHouse();
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);
      mockPrisma.behaviourHouseTeam.findMany.mockResolvedValue([house]);

      const result = await service.listHouses(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.member_count).toBe(0);
      expect(mockPrisma.behaviourHouseMembership.groupBy).not.toHaveBeenCalled();
    });

    it('should order houses by display_order ascending', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.behaviourHouseTeam.findMany.mockResolvedValue([
        makeHouse({ id: 'h1', display_order: 1 }),
        makeHouse({ id: 'h2', display_order: 2 }),
      ]);
      mockPrisma.behaviourHouseMembership.groupBy.mockResolvedValue([]);

      await service.listHouses(TENANT_ID);

      expect(mockPrisma.behaviourHouseTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { display_order: 'asc' },
        }),
      );
    });

    it('edge: should handle zero houses gracefully', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.behaviourHouseTeam.findMany.mockResolvedValue([]);
      mockPrisma.behaviourHouseMembership.groupBy.mockResolvedValue([]);

      const result = await service.listHouses(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── getHouseDetail ────────────────────────────────────────────────────

  describe('getHouseDetail', () => {
    it('should return house with members sorted by points descending', async () => {
      const house = makeHouse();
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(house);
      mockPrisma.behaviourHouseMembership.findMany.mockResolvedValue([
        makeMembership({ student_id: STUDENT_ID_1, student: { id: STUDENT_ID_1, first_name: 'Alice', last_name: 'Low' } }),
        makeMembership({ student_id: STUDENT_ID_2, student: { id: STUDENT_ID_2, first_name: 'Bob', last_name: 'High' } }),
      ]);
      mockPointsService.getStudentPoints
        .mockResolvedValueOnce({ total: 10, fromCache: false })
        .mockResolvedValueOnce({ total: 25, fromCache: false });

      const result = await service.getHouseDetail(TENANT_ID, HOUSE_ID, ACADEMIC_YEAR_ID);

      expect(result.members[0]?.first_name).toBe('Bob');
      expect(result.members[0]?.total_points).toBe(25);
      expect(result.members[1]?.first_name).toBe('Alice');
      expect(result.members[1]?.total_points).toBe(10);
    });

    it('should calculate total_points as sum of member points', async () => {
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(makeHouse());
      mockPrisma.behaviourHouseMembership.findMany.mockResolvedValue([
        makeMembership({ student_id: STUDENT_ID_1, student: { id: STUDENT_ID_1, first_name: 'A', last_name: 'B' } }),
        makeMembership({ student_id: STUDENT_ID_2, student: { id: STUDENT_ID_2, first_name: 'C', last_name: 'D' } }),
      ]);
      mockPointsService.getStudentPoints
        .mockResolvedValueOnce({ total: 15, fromCache: false })
        .mockResolvedValueOnce({ total: 30, fromCache: false });

      const result = await service.getHouseDetail(TENANT_ID, HOUSE_ID, ACADEMIC_YEAR_ID);

      expect(result.total_points).toBe(45);
    });

    it('should throw NotFoundException for non-existent house', async () => {
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(null);

      await expect(
        service.getHouseDetail(TENANT_ID, 'nonexistent-id', ACADEMIC_YEAR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should fetch points per member via pointsService', async () => {
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(makeHouse());
      mockPrisma.behaviourHouseMembership.findMany.mockResolvedValue([
        makeMembership({ student_id: STUDENT_ID_1 }),
        makeMembership({ student_id: STUDENT_ID_2, student: { id: STUDENT_ID_2, first_name: 'Jane', last_name: 'Smith' } }),
      ]);
      mockPointsService.getStudentPoints.mockResolvedValue({ total: 5, fromCache: false });

      await service.getHouseDetail(TENANT_ID, HOUSE_ID, ACADEMIC_YEAR_ID);

      expect(mockPointsService.getStudentPoints).toHaveBeenCalledTimes(2);
      expect(mockPointsService.getStudentPoints).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID_1);
      expect(mockPointsService.getStudentPoints).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID_2);
    });
  });

  // ─── createHouse ───────────────────────────────────────────────────────

  describe('createHouse', () => {
    it('should create house with required fields', async () => {
      const dto = { name: 'Eagles', color: '#0000FF' };
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(null);
      mockPrisma.behaviourHouseTeam.create.mockResolvedValue(makeHouse({ name: 'Eagles', color: '#0000FF' }));

      const result = await service.createHouse(TENANT_ID, dto);

      expect(mockPrisma.behaviourHouseTeam.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Eagles',
          color: '#0000FF',
        }),
      });
      expect(result.name).toBe('Eagles');
    });

    it('should set optional fields when provided', async () => {
      const dto = { name: 'Dragons', color: '#00FF00', name_ar: 'التنانين', icon: 'dragon', display_order: 3 };
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(null);
      mockPrisma.behaviourHouseTeam.create.mockResolvedValue(makeHouse(dto));

      await service.createHouse(TENANT_ID, dto);

      expect(mockPrisma.behaviourHouseTeam.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name_ar: 'التنانين',
          icon: 'dragon',
          display_order: 3,
        }),
      });
    });

    it('should throw ConflictException on duplicate name within tenant', async () => {
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(makeHouse());

      await expect(
        service.createHouse(TENANT_ID, { name: 'Phoenix', color: '#FF0000' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should default display_order to 0 when not provided', async () => {
      const dto = { name: 'Hawks', color: '#FFFF00' };
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(null);
      mockPrisma.behaviourHouseTeam.create.mockResolvedValue(makeHouse({ name: 'Hawks', display_order: 0 }));

      await service.createHouse(TENANT_ID, dto);

      expect(mockPrisma.behaviourHouseTeam.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          display_order: 0,
        }),
      });
    });
  });

  // ─── updateHouse ───────────────────────────────────────────────────────

  describe('updateHouse', () => {
    it('should update allowed fields', async () => {
      const existing = makeHouse();
      mockPrisma.behaviourHouseTeam.findFirst
        .mockResolvedValueOnce(existing)   // existence check
        .mockResolvedValueOnce(null);       // duplicate check (name changed)
      mockPrisma.behaviourHouseTeam.update.mockResolvedValue(
        makeHouse({ name: 'Griffins', color: '#00FF00' }),
      );

      const result = await service.updateHouse(TENANT_ID, HOUSE_ID, {
        name: 'Griffins',
        color: '#00FF00',
      });

      expect(mockPrisma.behaviourHouseTeam.update).toHaveBeenCalledWith({
        where: { id: HOUSE_ID },
        data: expect.objectContaining({
          name: 'Griffins',
          color: '#00FF00',
        }),
      });
      expect(result.name).toBe('Griffins');
    });

    it('should throw NotFoundException for non-existent house', async () => {
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(null);

      await expect(
        service.updateHouse(TENANT_ID, 'nonexistent-id', { name: 'Ghosts' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when renaming to existing name', async () => {
      const existing = makeHouse({ name: 'Phoenix' });
      const duplicate = makeHouse({ id: HOUSE_ID_2, name: 'Eagles' });

      mockPrisma.behaviourHouseTeam.findFirst
        .mockResolvedValueOnce(existing)   // existence check
        .mockResolvedValueOnce(duplicate); // duplicate check

      await expect(
        service.updateHouse(TENANT_ID, HOUSE_ID, { name: 'Eagles' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating name to same name (no conflict)', async () => {
      const existing = makeHouse({ name: 'Phoenix' });
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(existing);
      mockPrisma.behaviourHouseTeam.update.mockResolvedValue(existing);

      // Name is same as existing => no duplicate check triggered
      await expect(
        service.updateHouse(TENANT_ID, HOUSE_ID, { name: 'Phoenix' }),
      ).resolves.toBeDefined();

      // The duplicate check findFirst should only have been called once (for existence)
      expect(mockPrisma.behaviourHouseTeam.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should allow partial update (only is_active)', async () => {
      const existing = makeHouse();
      mockPrisma.behaviourHouseTeam.findFirst.mockResolvedValue(existing);
      mockPrisma.behaviourHouseTeam.update.mockResolvedValue(
        makeHouse({ is_active: false }),
      );

      await service.updateHouse(TENANT_ID, HOUSE_ID, { is_active: false });

      expect(mockPrisma.behaviourHouseTeam.update).toHaveBeenCalledWith({
        where: { id: HOUSE_ID },
        data: { is_active: false },
      });
    });
  });

  // ─── bulkAssign ────────────────────────────────────────────────────────

  describe('bulkAssign', () => {
    it('should delete existing memberships and create new ones', async () => {
      const assignments = [
        { student_id: STUDENT_ID_1, house_id: HOUSE_ID },
        { student_id: STUDENT_ID_2, house_id: HOUSE_ID },
      ];
      mockRlsTx.behaviourHouseMembership.findMany.mockResolvedValue([
        { house_id: HOUSE_ID_2 },
      ]);
      mockRlsTx.behaviourHouseMembership.deleteMany.mockResolvedValue({ count: 1 });
      mockRlsTx.behaviourHouseMembership.create.mockResolvedValue({});

      const result = await service.bulkAssign(TENANT_ID, ACADEMIC_YEAR_ID, assignments);

      expect(result).toEqual({ assigned: 2 });
      expect(mockRlsTx.behaviourHouseMembership.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: { in: [STUDENT_ID_1, STUDENT_ID_2] },
          academic_year_id: ACADEMIC_YEAR_ID,
        }),
      });
      expect(mockRlsTx.behaviourHouseMembership.create).toHaveBeenCalledTimes(2);
      expect(mockPointsService.invalidateHousePointsCache).toHaveBeenCalled();
    });

    it('should return { assigned: 0 } for empty assignments array', async () => {
      const result = await service.bulkAssign(TENANT_ID, ACADEMIC_YEAR_ID, []);

      expect(result).toEqual({ assigned: 0 });
      expect(mockRlsTx.behaviourHouseMembership.deleteMany).not.toHaveBeenCalled();
    });

    it('edge: should handle reassigning student from one house to another', async () => {
      const assignments = [{ student_id: STUDENT_ID_1, house_id: HOUSE_ID }];

      // Student was previously in HOUSE_ID_2
      mockRlsTx.behaviourHouseMembership.findMany.mockResolvedValue([
        { house_id: HOUSE_ID_2 },
      ]);
      mockRlsTx.behaviourHouseMembership.deleteMany.mockResolvedValue({ count: 1 });
      mockRlsTx.behaviourHouseMembership.create.mockResolvedValue({});

      const result = await service.bulkAssign(TENANT_ID, ACADEMIC_YEAR_ID, assignments);

      expect(result).toEqual({ assigned: 1 });

      // Should invalidate cache for BOTH the old and new house
      expect(mockPointsService.invalidateHousePointsCache).toHaveBeenCalledWith(
        TENANT_ID,
        HOUSE_ID_2,
        ACADEMIC_YEAR_ID,
      );
      expect(mockPointsService.invalidateHousePointsCache).toHaveBeenCalledWith(
        TENANT_ID,
        HOUSE_ID,
        ACADEMIC_YEAR_ID,
      );
    });
  });
});
