import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { DemographicsService } from './demographics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('DemographicsService', () => {
  let service: DemographicsService;
  let mockPrisma: {
    student: { groupBy: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    yearGroup: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      student: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemographicsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DemographicsService>(DemographicsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('nationalityBreakdown', () => {
    it('should return empty array when no students', async () => {
      const result = await service.nationalityBreakdown(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should group students by nationality with count and percentage', async () => {
      mockPrisma.student.groupBy.mockResolvedValue([
        { nationality: 'Saudi', _count: 60 },
        { nationality: 'Egyptian', _count: 40 },
      ]);

      const result = await service.nationalityBreakdown(TENANT_ID);

      expect(result).toHaveLength(2);
      const saudi = result.find((r) => r.nationality === 'Saudi');
      expect(saudi?.count).toBe(60);
      expect(saudi?.percentage).toBe(60);
    });
  });

  describe('genderBalance', () => {
    it('should return empty array when no year groups', async () => {
      const result = await service.genderBalance(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should return per-year-group gender breakdown', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: 'yg-1', name: 'Grade 1' },
      ]);
      mockPrisma.student.groupBy.mockResolvedValue([
        { gender: 'male', _count: 15 },
        { gender: 'female', _count: 10 },
      ]);

      const result = await service.genderBalance(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.male_count).toBe(15);
      expect(result[0]?.female_count).toBe(10);
      expect(result[0]?.total).toBe(25);
    });
  });

  describe('ageDistribution', () => {
    it('should return empty array when no students have date_of_birth', async () => {
      const result = await service.ageDistribution(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should compute age from date_of_birth and group into buckets', async () => {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

      mockPrisma.student.findMany.mockResolvedValue([
        { date_of_birth: tenYearsAgo },
        { date_of_birth: tenYearsAgo },
      ]);

      const result = await service.ageDistribution(TENANT_ID);

      const ageBucket10 = result.find((r) => r.age === 10);
      expect(ageBucket10?.count).toBe(2);
    });
  });

  describe('yearGroupSizes', () => {
    it('should return empty array when no year groups', async () => {
      const result = await service.yearGroupSizes(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('statusDistribution', () => {
    it('should group students by status', async () => {
      mockPrisma.student.groupBy.mockResolvedValue([
        { status: 'active', _count: 80 },
        { status: 'inactive', _count: 20 },
      ]);

      const result = await service.statusDistribution(TENANT_ID);

      expect(result).toHaveLength(2);
      const active = result.find((r) => r.status === 'active');
      expect(active?.count).toBe(80);
    });
  });

  describe('RLS isolation', () => {
    it('should scope nationality breakdown to tenantId', async () => {
      await service.nationalityBreakdown(TENANT_ID);

      expect(mockPrisma.student.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });
  });
});
