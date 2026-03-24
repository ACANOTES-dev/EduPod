import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { YearGroupsService } from './year-groups.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_GROUP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const NEXT_YEAR_GROUP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  yearGroup: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockPrisma = {
  yearGroup: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  student: {
    count: jest.fn(),
  },
  class: {
    count: jest.fn(),
  },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseYearGroup = {
  id: YEAR_GROUP_ID,
  tenant_id: TENANT_ID,
  name: 'Year 1',
  display_order: 1,
  next_year_group_id: null,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('YearGroupsService', () => {
  let service: YearGroupsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YearGroupsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<YearGroupsService>(YearGroupsService);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a year group successfully', async () => {
      mockRlsTx.yearGroup.create.mockResolvedValueOnce(baseYearGroup);

      const result = await service.create(TENANT_ID, {
        name: 'Year 1',
        display_order: 1,
      });

      expect(mockRlsTx.yearGroup.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          name: 'Year 1',
          display_order: 1,
          next_year_group_id: null,
        },
      });
      expect(result).toEqual(baseYearGroup);
    });

    it('should throw ConflictException on duplicate name', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockRlsTx.yearGroup.create.mockRejectedValueOnce(p2002);

      let caught: unknown;
      try {
        await service.create(TENANT_ID, { name: 'Year 1', display_order: 1 });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).getResponse()).toMatchObject({
        code: 'DUPLICATE_NAME',
      });
    });

    it('should create a year group with next_year_group_id', async () => {
      const withNext = { ...baseYearGroup, next_year_group_id: NEXT_YEAR_GROUP_ID };
      mockRlsTx.yearGroup.create.mockResolvedValueOnce(withNext);

      const result = await service.create(TENANT_ID, {
        name: 'Year 1',
        display_order: 1,
        next_year_group_id: NEXT_YEAR_GROUP_ID,
      });

      expect(mockRlsTx.yearGroup.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          name: 'Year 1',
          display_order: 1,
          next_year_group_id: NEXT_YEAR_GROUP_ID,
        },
      });
      expect((result as { next_year_group_id: string }).next_year_group_id).toBe(NEXT_YEAR_GROUP_ID);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return year groups ordered by display_order', async () => {
      const groups = [
        { ...baseYearGroup, display_order: 1 },
        { ...baseYearGroup, id: NEXT_YEAR_GROUP_ID, name: 'Year 2', display_order: 2 },
      ];
      mockPrisma.yearGroup.findMany.mockResolvedValueOnce(groups);

      const result = await service.findAll(TENANT_ID);

      expect(result).toEqual(groups);
      expect(mockPrisma.yearGroup.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { display_order: 'asc' },
      });
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a year group including next_year_group_id', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValueOnce({ id: YEAR_GROUP_ID });
      const updated = { ...baseYearGroup, name: 'Year 1 Updated', next_year_group_id: NEXT_YEAR_GROUP_ID };
      mockRlsTx.yearGroup.update.mockResolvedValueOnce(updated);

      const result = await service.update(TENANT_ID, YEAR_GROUP_ID, {
        name: 'Year 1 Updated',
        next_year_group_id: NEXT_YEAR_GROUP_ID,
      });

      expect(mockRlsTx.yearGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: YEAR_GROUP_ID },
          data: expect.objectContaining({
            name: 'Year 1 Updated',
            next_year_group: { connect: { id: NEXT_YEAR_GROUP_ID } },
          }),
        }),
      );
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating nonexistent year group', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.update(TENANT_ID, YEAR_GROUP_ID, { name: 'New Name' });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'YEAR_GROUP_NOT_FOUND',
      });
      expect(mockRlsTx.yearGroup.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete a year group with no references', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValueOnce({ id: YEAR_GROUP_ID });
      mockPrisma.student.count.mockResolvedValueOnce(0);
      mockPrisma.class.count.mockResolvedValueOnce(0);
      mockRlsTx.yearGroup.delete.mockResolvedValueOnce(baseYearGroup);

      const result = await service.remove(TENANT_ID, YEAR_GROUP_ID);

      expect(mockRlsTx.yearGroup.delete).toHaveBeenCalledWith({ where: { id: YEAR_GROUP_ID } });
      expect(result).toEqual(baseYearGroup);
    });

    it('should throw BadRequestException when year group has students', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValueOnce({ id: YEAR_GROUP_ID });
      mockPrisma.student.count.mockResolvedValueOnce(5);

      let caught: unknown;
      try {
        await service.remove(TENANT_ID, YEAR_GROUP_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'YEAR_GROUP_IN_USE',
      });
      expect(mockRlsTx.yearGroup.delete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when year group has classes', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValueOnce({ id: YEAR_GROUP_ID });
      mockPrisma.student.count.mockResolvedValueOnce(0);
      mockPrisma.class.count.mockResolvedValueOnce(2);

      let caught: unknown;
      try {
        await service.remove(TENANT_ID, YEAR_GROUP_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'YEAR_GROUP_IN_USE',
      });
      expect(mockRlsTx.yearGroup.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when year group does not exist', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.remove(TENANT_ID, YEAR_GROUP_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'YEAR_GROUP_NOT_FOUND',
      });
    });
  });
});
