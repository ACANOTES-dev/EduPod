import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BreakGroupsService } from './break-groups.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-1';
const BG_ID = 'bg-1';
const YG_ID_1 = 'yg-1';
const YG_ID_2 = 'yg-2';

const mockTx = {
  breakGroup: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
  },
  breakGroupYearGroup: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('BreakGroupsService', () => {
  let service: BreakGroupsService;
  let mockPrisma: {
    breakGroup: { findMany: jest.Mock; findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
  };

  const breakGroupWithRelations = {
    id: BG_ID,
    name: 'Morning Break',
    name_ar: null,
    location: 'Yard',
    required_supervisor_count: 2,
    year_groups: [
      { year_group_id: YG_ID_1, year_group: { id: YG_ID_1, name: 'Year 1' } },
      { year_group_id: YG_ID_2, year_group: { id: YG_ID_2, name: 'Year 2' } },
    ],
  };

  beforeEach(async () => {
    mockPrisma = {
      breakGroup: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      academicYear: { findFirst: jest.fn() },
    };

    mockTx.breakGroup.create.mockReset();
    mockTx.breakGroup.update.mockReset();
    mockTx.breakGroup.delete.mockReset();
    mockTx.breakGroup.findUnique.mockReset();
    mockTx.breakGroupYearGroup.create.mockReset();
    mockTx.breakGroupYearGroup.deleteMany.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakGroupsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BreakGroupsService>(BreakGroupsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return formatted break groups', async () => {
      mockPrisma.breakGroup.findMany.mockResolvedValue([breakGroupWithRelations]);

      const result = await service.list(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!['year_group_ids']).toEqual([YG_ID_1, YG_ID_2]);
      expect(result.data[0]!['year_groups_detail']).toHaveLength(2);
    });

    it('should return empty data when no break groups exist', async () => {
      mockPrisma.breakGroup.findMany.mockResolvedValue([]);

      const result = await service.list(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      academic_year_id: AY_ID,
      name: 'Lunch Break',
      year_group_ids: [YG_ID_1, YG_ID_2],
      required_supervisor_count: 3,
    };

    it('should create a break group with year group links', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockTx.breakGroup.create.mockResolvedValue({ id: BG_ID });
      mockTx.breakGroupYearGroup.create.mockResolvedValue({});
      mockTx.breakGroup.findUnique.mockResolvedValue(breakGroupWithRelations);

      const result = await service.create(TENANT_ID, dto);

      expect(result['id']).toBe(BG_ID);
      expect(mockTx.breakGroupYearGroup.create).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when academic year does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should handle break group with optional fields', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockTx.breakGroup.create.mockResolvedValue({ id: BG_ID });
      mockTx.breakGroupYearGroup.create.mockResolvedValue({});
      mockTx.breakGroup.findUnique.mockResolvedValue({
        ...breakGroupWithRelations,
        name_ar: 'فترة الغداء',
        location: 'Cafeteria',
      });

      const dtoWithOptionals = {
        ...dto,
        name_ar: 'فترة الغداء',
        location: 'Cafeteria',
      };

      const result = await service.create(TENANT_ID, dtoWithOptionals);

      expect(result['name_ar']).toBe('فترة الغداء');
      expect(result['location']).toBe('Cafeteria');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a break group', async () => {
      mockPrisma.breakGroup.findFirst.mockResolvedValue({ id: BG_ID });
      mockTx.breakGroup.update.mockResolvedValue({ id: BG_ID });
      mockTx.breakGroup.findUnique.mockResolvedValue({
        ...breakGroupWithRelations,
        name: 'Updated Break',
      });

      const result = await service.update(TENANT_ID, BG_ID, { name: 'Updated Break' });

      expect(result['name']).toBe('Updated Break');
    });

    it('should replace year group links when year_group_ids is provided', async () => {
      mockPrisma.breakGroup.findFirst.mockResolvedValue({ id: BG_ID });
      mockTx.breakGroupYearGroup.deleteMany.mockResolvedValue({ count: 2 });
      mockTx.breakGroupYearGroup.create.mockResolvedValue({});
      mockTx.breakGroup.findUnique.mockResolvedValue(breakGroupWithRelations);

      await service.update(TENANT_ID, BG_ID, { year_group_ids: [YG_ID_1] });

      expect(mockTx.breakGroupYearGroup.deleteMany).toHaveBeenCalled();
      expect(mockTx.breakGroupYearGroup.create).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when break group does not exist', async () => {
      mockPrisma.breakGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, 'nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a break group and its year group links', async () => {
      mockPrisma.breakGroup.findFirst.mockResolvedValue({ id: BG_ID });
      mockTx.breakGroupYearGroup.deleteMany.mockResolvedValue({ count: 2 });
      mockTx.breakGroup.delete.mockResolvedValue({ id: BG_ID });

      const result = await service.delete(TENANT_ID, BG_ID);

      expect(result.message).toBe('Break group deleted');
      expect(mockTx.breakGroupYearGroup.deleteMany).toHaveBeenCalled();
      expect(mockTx.breakGroup.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when break group does not exist', async () => {
      mockPrisma.breakGroup.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
