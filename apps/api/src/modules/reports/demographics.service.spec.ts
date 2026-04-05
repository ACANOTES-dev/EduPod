import { Test, TestingModule } from '@nestjs/testing';

import { DemographicsService } from './demographics.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('DemographicsService', () => {
  let service: DemographicsService;
  let mockDataAccess: {
    groupStudentsBy: jest.Mock;
    findStudents: jest.Mock;
    countStudents: jest.Mock;
    findYearGroups: jest.Mock;
  };

  beforeEach(async () => {
    mockDataAccess = {
      groupStudentsBy: jest.fn().mockResolvedValue([]),
      findStudents: jest.fn().mockResolvedValue([]),
      countStudents: jest.fn().mockResolvedValue(0),
      findYearGroups: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemographicsService,
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
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
      mockDataAccess.groupStudentsBy.mockResolvedValue([
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
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.groupStudentsBy.mockResolvedValue([
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

      mockDataAccess.findStudents.mockResolvedValue([
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
      mockDataAccess.groupStudentsBy.mockResolvedValue([
        { status: 'active', _count: 80 },
        { status: 'inactive', _count: 20 },
      ]);

      const result = await service.statusDistribution(TENANT_ID);

      expect(result).toHaveLength(2);
      const active = result.find((r) => r.status === 'active');
      expect(active?.count).toBe(80);
    });
  });

  describe('nationalityBreakdown — edge cases', () => {
    it('should filter by yearGroupId when provided', async () => {
      mockDataAccess.groupStudentsBy.mockResolvedValue([]);

      await service.nationalityBreakdown(TENANT_ID, 'yg-1');

      const callArg = mockDataAccess.groupStudentsBy.mock.calls[0]?.[2];
      expect(callArg?.year_group_id).toBe('yg-1');
    });

    it('should filter out null nationalities', async () => {
      mockDataAccess.groupStudentsBy.mockResolvedValue([
        { nationality: null, _count: 5 },
        { nationality: 'Saudi', _count: 10 },
      ]);

      const result = await service.nationalityBreakdown(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.nationality).toBe('Saudi');
    });
  });

  describe('genderBalance — edge cases', () => {
    it('should skip year groups with zero total students', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.groupStudentsBy.mockResolvedValue([]);

      const result = await service.genderBalance(TENANT_ID);

      expect(result).toHaveLength(0);
    });

    it('should count other and prefer_not_to_say together as other_count', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.groupStudentsBy.mockResolvedValue([
        { gender: 'male', _count: 5 },
        { gender: 'other', _count: 2 },
        { gender: 'prefer_not_to_say', _count: 1 },
      ]);

      const result = await service.genderBalance(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.other_count).toBe(3);
      expect(result[0]?.total).toBe(8);
    });
  });

  describe('ageDistribution — edge cases', () => {
    it('should filter by yearGroupId', async () => {
      mockDataAccess.findStudents.mockResolvedValue([]);

      await service.ageDistribution(TENANT_ID, 'yg-1');

      const callArg = mockDataAccess.findStudents.mock.calls[0]?.[1];
      expect(callArg?.where?.year_group_id).toBe('yg-1');
    });

    it('should skip students with null date_of_birth in age calculation', async () => {
      mockDataAccess.findStudents.mockResolvedValue([{ date_of_birth: null }]);

      const result = await service.ageDistribution(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('edge: should adjust age when birthday has not occurred yet this year', async () => {
      const futureMonthDob = new Date();
      futureMonthDob.setFullYear(futureMonthDob.getFullYear() - 10);
      futureMonthDob.setMonth(futureMonthDob.getMonth() + 1); // birthday next month

      mockDataAccess.findStudents.mockResolvedValue([{ date_of_birth: futureMonthDob }]);

      const result = await service.ageDistribution(TENANT_ID);

      const bucket = result[0];
      expect(bucket?.age).toBe(9); // not yet turned 10
    });
  });

  describe('yearGroupSizes — with data', () => {
    it('should return sizes for each year group', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.countStudents.mockResolvedValueOnce(30).mockResolvedValueOnce(25);

      const result = await service.yearGroupSizes(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.student_count).toBe(30);
      expect(result[0]?.active_count).toBe(25);
      expect(result[0]?.capacity).toBeNull();
    });
  });

  describe('enrolmentTrends', () => {
    it('should return empty when no students', async () => {
      const result = await service.enrolmentTrends(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should compute new enrolments and withdrawals per month', async () => {
      mockDataAccess.findStudents.mockResolvedValue([
        { entry_date: new Date('2026-01-15'), status: 'active', exit_date: null },
        {
          entry_date: new Date('2026-01-20'),
          status: 'withdrawn',
          exit_date: new Date('2026-03-01'),
        },
        { entry_date: new Date('2026-02-01'), status: 'active', exit_date: null },
      ]);

      const result = await service.enrolmentTrends(TENANT_ID);

      const jan = result.find((r) => r.month === '2026-01');
      expect(jan?.new_enrolments).toBe(2);
      expect(jan?.withdrawals).toBe(0);
      expect(jan?.net_change).toBe(2);

      const mar = result.find((r) => r.month === '2026-03');
      expect(mar?.new_enrolments).toBe(0);
      expect(mar?.withdrawals).toBe(1);
      expect(mar?.net_change).toBe(-1);
    });

    it('should handle student with both entry_date and exit_date in same month', async () => {
      mockDataAccess.findStudents.mockResolvedValue([
        {
          entry_date: new Date('2026-01-01'),
          status: 'withdrawn',
          exit_date: new Date('2026-01-30'),
        },
      ]);

      const result = await service.enrolmentTrends(TENANT_ID);

      const jan = result.find((r) => r.month === '2026-01');
      expect(jan?.new_enrolments).toBe(1);
      expect(jan?.withdrawals).toBe(1);
      expect(jan?.net_change).toBe(0);
    });
  });

  describe('RLS isolation', () => {
    it('should pass tenantId to groupStudentsBy', async () => {
      await service.nationalityBreakdown(TENANT_ID);

      expect(mockDataAccess.groupStudentsBy).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Array),
        expect.any(Object),
      );
    });
  });
});
