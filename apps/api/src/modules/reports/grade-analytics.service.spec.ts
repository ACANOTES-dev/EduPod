import { Test, TestingModule } from '@nestjs/testing';

import { GradeAnalyticsService } from './grade-analytics.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('GradeAnalyticsService', () => {
  let service: GradeAnalyticsService;
  let mockDataAccess: {
    findAssessments: jest.Mock;
    findGrades: jest.Mock;
    groupGradesBy: jest.Mock;
    findStudents: jest.Mock;
    findClasses: jest.Mock;
    findGpaSnapshots: jest.Mock;
    findPeriodGradeSnapshots: jest.Mock;
    findAcademicPeriods: jest.Mock;
  };

  beforeEach(async () => {
    mockDataAccess = {
      findAssessments: jest.fn().mockResolvedValue([]),
      findGrades: jest.fn().mockResolvedValue([]),
      groupGradesBy: jest.fn().mockResolvedValue([]),
      findStudents: jest.fn().mockResolvedValue([]),
      findClasses: jest.fn().mockResolvedValue([]),
      findGpaSnapshots: jest.fn().mockResolvedValue([]),
      findPeriodGradeSnapshots: jest.fn().mockResolvedValue([]),
      findAcademicPeriods: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeAnalyticsService,
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
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
      mockDataAccess.findAssessments.mockResolvedValue([
        {
          id: 'assessment-1',
          max_score: '100',
          subject: { id: 'subject-1', name: 'Math' },
          class_entity: { name: 'Class A', year_group: { name: 'Grade 5' } },
        },
      ]);
      mockDataAccess.findGrades.mockResolvedValue([
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
      mockDataAccess.findGrades.mockResolvedValue([
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
      mockDataAccess.findPeriodGradeSnapshots.mockResolvedValue([
        { computed_value: '80', student_id: 'student-1', academic_period_id: 'period-1' },
        { computed_value: '90', student_id: 'student-2', academic_period_id: 'period-1' },
        { computed_value: '70', student_id: 'student-3', academic_period_id: 'period-2' },
      ]);
      mockDataAccess.findAcademicPeriods.mockResolvedValue([
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
      mockDataAccess.findGpaSnapshots.mockResolvedValue([
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

  describe('passFailRates — edge cases', () => {
    it('should filter by yearGroupId', async () => {
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1' }]);
      mockDataAccess.findAssessments.mockResolvedValue([]);

      await service.passFailRates(TENANT_ID, 'yg-1');

      expect(mockDataAccess.findClasses).toHaveBeenCalledWith(
        TENANT_ID,
        { year_group_id: 'yg-1' },
        { id: true },
      );
    });

    it('should filter by subjectId', async () => {
      mockDataAccess.findAssessments.mockResolvedValue([]);

      await service.passFailRates(TENANT_ID, undefined, 'subject-1');

      const callArg = mockDataAccess.findAssessments.mock.calls[0]?.[1];
      expect(callArg?.where?.subject_id).toBe('subject-1');
    });

    it('should filter by academicPeriodId', async () => {
      mockDataAccess.findAssessments.mockResolvedValue([]);

      await service.passFailRates(TENANT_ID, undefined, undefined, 'period-1');

      const callArg = mockDataAccess.findAssessments.mock.calls[0]?.[1];
      expect(callArg?.where?.academic_period_id).toBe('period-1');
    });

    it('should skip assessments with no subject', async () => {
      mockDataAccess.findAssessments.mockResolvedValue([
        {
          id: 'a1',
          max_score: '100',
          subject: null,
          class_entity: { name: 'Class A', year_group: null },
        },
      ]);

      const result = await service.passFailRates(TENANT_ID);

      expect(result).toHaveLength(0);
    });

    it('edge: should handle maxScore of 0 (all grades fail with 0%)', async () => {
      mockDataAccess.findAssessments.mockResolvedValue([
        {
          id: 'a1',
          max_score: '0',
          subject: { id: 's1', name: 'Art' },
          class_entity: { name: 'Class A', year_group: null },
        },
      ]);
      mockDataAccess.findGrades.mockResolvedValue([{ raw_score: '0' }]);

      const result = await service.passFailRates(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.fail_count).toBe(1);
      expect(result[0]?.pass_count).toBe(0);
    });

    it('should aggregate grades across multiple assessments for the same subject', async () => {
      mockDataAccess.findAssessments.mockResolvedValue([
        {
          id: 'a1',
          max_score: '100',
          subject: { id: 's1', name: 'Math' },
          class_entity: { name: 'A', year_group: { name: 'G5' } },
        },
        {
          id: 'a2',
          max_score: '50',
          subject: { id: 's1', name: 'Math' },
          class_entity: { name: 'A', year_group: { name: 'G5' } },
        },
      ]);
      mockDataAccess.findGrades
        .mockResolvedValueOnce([{ raw_score: '60' }]) // 60% pass
        .mockResolvedValueOnce([{ raw_score: '20' }]); // 40% fail

      const result = await service.passFailRates(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.pass_count).toBe(1);
      expect(result[0]?.fail_count).toBe(1);
      expect(result[0]?.pass_rate).toBe(50);
    });
  });

  describe('gradeDistribution — edge cases', () => {
    it('should filter by subjectId', async () => {
      mockDataAccess.findGrades.mockResolvedValue([]);

      await service.gradeDistribution(TENANT_ID, undefined, 'subject-1');

      const callArg = mockDataAccess.findGrades.mock.calls[0]?.[1];
      expect(callArg?.where?.assessment?.subject_id).toBe('subject-1');
    });

    it('should filter by academicPeriodId', async () => {
      mockDataAccess.findGrades.mockResolvedValue([]);

      await service.gradeDistribution(TENANT_ID, undefined, undefined, 'period-1');

      const callArg = mockDataAccess.findGrades.mock.calls[0]?.[1];
      expect(callArg?.where?.assessment?.academic_period_id).toBe('period-1');
    });

    it('should filter by yearGroupId', async () => {
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1' }]);
      mockDataAccess.findGrades.mockResolvedValue([]);

      await service.gradeDistribution(TENANT_ID, 'yg-1');

      expect(mockDataAccess.findClasses).toHaveBeenCalled();
    });

    it('edge: should skip grades with maxScore <= 0', async () => {
      mockDataAccess.findGrades.mockResolvedValue([
        { raw_score: '50', assessment: { max_score: '0' } },
      ]);

      const result = await service.gradeDistribution(TENANT_ID);

      const totalCount = result.reduce((sum, b) => sum + b.count, 0);
      expect(totalCount).toBe(0);
    });

    it('should combine both subjectId and academicPeriodId filters', async () => {
      mockDataAccess.findGrades.mockResolvedValue([]);

      await service.gradeDistribution(TENANT_ID, undefined, 'subject-1', 'period-1');

      const callArg = mockDataAccess.findGrades.mock.calls[0]?.[1];
      expect(callArg?.where?.assessment?.subject_id).toBe('subject-1');
      expect(callArg?.where?.assessment?.academic_period_id).toBe('period-1');
    });
  });

  describe('topBottomPerformers — edge cases', () => {
    it('should filter by subjectId', async () => {
      mockDataAccess.groupGradesBy.mockResolvedValue([]);

      await service.topBottomPerformers(TENANT_ID, 10, undefined, 'subject-1');

      const callArg = mockDataAccess.groupGradesBy.mock.calls[0]?.[2];
      expect(callArg?.assessment?.subject_id).toBe('subject-1');
    });

    it('should filter by yearGroupId', async () => {
      mockDataAccess.findStudents.mockResolvedValue([{ id: 's1' }]);
      mockDataAccess.groupGradesBy.mockResolvedValue([]);

      await service.topBottomPerformers(TENANT_ID, 10, 'yg-1');

      expect(mockDataAccess.findStudents).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: { year_group_id: 'yg-1' },
        }),
      );
    });

    it('should return top and bottom performers correctly', async () => {
      mockDataAccess.groupGradesBy.mockResolvedValue([
        { student_id: 's1', _avg: { raw_score: 95 }, _count: 5 },
        { student_id: 's2', _avg: { raw_score: 30 }, _count: 5 },
        { student_id: 's3', _avg: { raw_score: 70 }, _count: 5 },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        { id: 's1', first_name: 'Top', last_name: 'Student', year_group: { name: 'G5' } },
        { id: 's2', first_name: 'Bottom', last_name: 'Student', year_group: null },
        { id: 's3', first_name: 'Mid', last_name: 'Student', year_group: { name: 'G5' } },
      ]);

      const result = await service.topBottomPerformers(TENANT_ID, 2);

      expect(result.top[0]?.student_name).toBe('Top Student');
      expect(result.bottom[0]?.student_name).toBe('Bottom Student');
    });

    it('edge: should handle student not found in name map', async () => {
      mockDataAccess.groupGradesBy.mockResolvedValue([
        { student_id: 'unknown', _avg: { raw_score: 50 }, _count: 3 },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([]);

      const result = await service.topBottomPerformers(TENANT_ID);

      expect(result.top[0]?.student_name).toBe('Unknown');
      expect(result.top[0]?.year_group_name).toBeNull();
    });
  });

  describe('gradeTrends — edge cases', () => {
    it('should filter by yearGroupId', async () => {
      mockDataAccess.findStudents.mockResolvedValue([{ id: 's1' }]);
      mockDataAccess.findPeriodGradeSnapshots.mockResolvedValue([]);

      await service.gradeTrends(TENANT_ID, 'yg-1');

      expect(mockDataAccess.findStudents).toHaveBeenCalled();
    });

    it('should filter by subjectId', async () => {
      mockDataAccess.findPeriodGradeSnapshots.mockResolvedValue([]);

      await service.gradeTrends(TENANT_ID, undefined, 'subject-1');

      const callArg = mockDataAccess.findPeriodGradeSnapshots.mock.calls[0]?.[1];
      expect(callArg?.where?.subject_id).toBe('subject-1');
    });
  });

  describe('subjectDifficulty', () => {
    it('should return empty array when no grades', async () => {
      mockDataAccess.findGrades.mockResolvedValue([]);

      const result = await service.subjectDifficulty(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should rank subjects by average score ascending (hardest first)', async () => {
      mockDataAccess.findGrades.mockResolvedValue([
        {
          raw_score: '90',
          student_id: 's1',
          assessment: { max_score: '100', subject: { id: 'math', name: 'Math' } },
        },
        {
          raw_score: '40',
          student_id: 's1',
          assessment: { max_score: '100', subject: { id: 'physics', name: 'Physics' } },
        },
      ]);

      const result = await service.subjectDifficulty(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]?.subject_name).toBe('Physics');
      expect(result[0]?.difficulty_rank).toBe(1);
      expect(result[1]?.subject_name).toBe('Math');
      expect(result[1]?.difficulty_rank).toBe(2);
    });

    it('should filter by yearGroupId', async () => {
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1' }]);
      mockDataAccess.findGrades.mockResolvedValue([]);

      await service.subjectDifficulty(TENANT_ID, 'yg-1');

      expect(mockDataAccess.findClasses).toHaveBeenCalled();
    });

    it('edge: should skip grades with no subject', async () => {
      mockDataAccess.findGrades.mockResolvedValue([
        { raw_score: '80', student_id: 's1', assessment: { max_score: '100', subject: null } },
      ]);

      const result = await service.subjectDifficulty(TENANT_ID);

      expect(result).toHaveLength(0);
    });

    it('edge: should skip grades with maxScore <= 0', async () => {
      mockDataAccess.findGrades.mockResolvedValue([
        {
          raw_score: '80',
          student_id: 's1',
          assessment: { max_score: '0', subject: { id: 'art', name: 'Art' } },
        },
      ]);

      const result = await service.subjectDifficulty(TENANT_ID);

      expect(result).toHaveLength(0);
    });
  });

  describe('gpaDistribution — edge cases', () => {
    it('should filter by yearGroupId', async () => {
      mockDataAccess.findStudents.mockResolvedValue([{ id: 's1' }]);
      mockDataAccess.findGpaSnapshots.mockResolvedValue([]);

      await service.gpaDistribution(TENANT_ID, 'yg-1');

      expect(mockDataAccess.findStudents).toHaveBeenCalled();
    });

    it('edge: should place GPA of exactly 4.0 in the 3.0-4.0 bucket', async () => {
      mockDataAccess.findGpaSnapshots.mockResolvedValue([{ gpa_value: '4.0' }]);

      const result = await service.gpaDistribution(TENANT_ID);

      const lastBucket = result.find((b) => b.bucket_label === '3.0-4.0');
      expect(lastBucket?.count).toBe(1);
    });

    it('edge: should handle null gpa_value (treated as 0)', async () => {
      mockDataAccess.findGpaSnapshots.mockResolvedValue([{ gpa_value: null }]);

      const result = await service.gpaDistribution(TENANT_ID);

      const firstBucket = result.find((b) => b.bucket_label === '0.0-1.0');
      expect(firstBucket?.count).toBe(1);
    });
  });

  describe('RLS isolation', () => {
    it('should pass tenantId to findAssessments', async () => {
      await service.passFailRates(TENANT_ID);

      expect(mockDataAccess.findAssessments).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
    });
  });
});
