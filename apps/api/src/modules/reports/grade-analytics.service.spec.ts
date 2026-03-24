import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { GradeAnalyticsService } from './grade-analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('GradeAnalyticsService', () => {
  let service: GradeAnalyticsService;
  let mockPrisma: {
    assessment: { findMany: jest.Mock };
    grade: { findMany: jest.Mock; groupBy: jest.Mock };
    student: { findMany: jest.Mock };
    class: { findMany: jest.Mock };
    gpaSnapshot: { findMany: jest.Mock };
    periodGradeSnapshot: { findMany: jest.Mock };
    academicPeriod: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      assessment: { findMany: jest.fn().mockResolvedValue([]) },
      grade: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      student: { findMany: jest.fn().mockResolvedValue([]) },
      class: { findMany: jest.fn().mockResolvedValue([]) },
      gpaSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      periodGradeSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      academicPeriod: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradeAnalyticsService>(GradeAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('passFailRates', () => {
    it('should return empty array when no assessments', async () => {
      const result = await service.passFailRates(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should compute pass and fail counts per subject', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: 'assessment-1',
          max_score: '100',
          subject: { id: 'subject-1', name: 'Math' },
          class_entity: { name: 'Class A', year_group: { name: 'Grade 5' } },
        },
      ]);
      mockPrisma.grade.findMany.mockResolvedValue([
        { raw_score: '80' }, // pass (80%)
        { raw_score: '40' }, // fail (40%)
        { raw_score: '60' }, // pass (60%)
      ]);

      const result = await service.passFailRates(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.subject_id).toBe('subject-1');
      expect(result[0]?.pass_count).toBe(2);
      expect(result[0]?.fail_count).toBe(1);
      expect(result[0]?.pass_rate).toBe(66.67);
    });
  });

  describe('gradeDistribution', () => {
    it('should return 10 buckets (0-10%, 10-20%, ..., 90-100%)', async () => {
      const result = await service.gradeDistribution(TENANT_ID);

      expect(result).toHaveLength(10);
      expect(result[0]?.bucket_label).toBe('0-10%');
      expect(result[9]?.bucket_label).toBe('90-100%');
    });

    it('should place grades into correct buckets', async () => {
      mockPrisma.grade.findMany.mockResolvedValue([
        { raw_score: '75', assessment: { max_score: '100' } }, // 75% → bucket 7
        { raw_score: '95', assessment: { max_score: '100' } }, // 95% → bucket 9
      ]);

      const result = await service.gradeDistribution(TENANT_ID);

      expect(result[7]?.count).toBe(1);
      expect(result[9]?.count).toBe(1);
    });
  });

  describe('topBottomPerformers', () => {
    it('should return empty top and bottom arrays when no grades', async () => {
      const result = await service.topBottomPerformers(TENANT_ID);

      expect(result.top).toEqual([]);
      expect(result.bottom).toEqual([]);
    });
  });

  describe('gradeTrends', () => {
    it('should return empty array when no period grade snapshots', async () => {
      const result = await service.gradeTrends(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should group snapshots by academic period name', async () => {
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
        { computed_value: '80', student_id: 'student-1', academic_period_id: 'period-1' },
        { computed_value: '90', student_id: 'student-2', academic_period_id: 'period-1' },
        { computed_value: '70', student_id: 'student-3', academic_period_id: 'period-2' },
      ]);
      mockPrisma.academicPeriod.findMany.mockResolvedValue([
        { id: 'period-1', name: 'Term 1' },
        { id: 'period-2', name: 'Term 2' },
      ]);

      const result = await service.gradeTrends(TENANT_ID);

      expect(result).toHaveLength(2);
      const term1 = result.find((r) => r.period_label === 'Term 1');
      expect(term1?.average_score).toBe(85);
      expect(term1?.student_count).toBe(2);
    });
  });

  describe('gpaDistribution', () => {
    it('should return 4 GPA buckets (0-1, 1-2, 2-3, 3-4)', async () => {
      const result = await service.gpaDistribution(TENANT_ID);

      expect(result).toHaveLength(4);
      expect(result[0]?.bucket_label).toBe('0.0-1.0');
      expect(result[3]?.bucket_label).toBe('3.0-4.0');
    });

    it('should place snapshots into correct GPA buckets', async () => {
      mockPrisma.gpaSnapshot.findMany.mockResolvedValue([
        { gpa_value: '3.5' }, // 3.0-4.0 bucket
        { gpa_value: '2.1' }, // 2.0-3.0 bucket
        { gpa_value: '3.9' }, // 3.0-4.0 bucket
      ]);

      const result = await service.gpaDistribution(TENANT_ID);

      const bucket3_4 = result.find((b) => b.bucket_label === '3.0-4.0');
      expect(bucket3_4?.count).toBe(2);
      const bucket2_3 = result.find((b) => b.bucket_label === '2.0-3.0');
      expect(bucket2_3?.count).toBe(1);
    });
  });

  describe('RLS isolation', () => {
    it('should scope pass-fail query to tenantId', async () => {
      await service.passFailRates(TENANT_ID);

      expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });
  });
});
