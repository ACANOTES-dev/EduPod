import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { HomeworkAnalyticsController } from './homework-analytics.controller';
import { HomeworkAnalyticsService } from './homework-analytics.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SUBJECT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const YEAR_GROUP_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';

const tenantContext = { tenant_id: TENANT_ID };
const baseQuery = {};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkAnalyticsController', () => {
  let controller: HomeworkAnalyticsController;
  let mockService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockService = {
      completionRates: jest.fn(),
      studentTrends: jest.fn(),
      classPatterns: jest.fn(),
      loadAnalysis: jest.fn(),
      dailyLoadHeatmap: jest.fn(),
      nonCompleters: jest.fn(),
      subjectTrends: jest.fn(),
      teacherPatterns: jest.fn(),
      yearGroupOverview: jest.fn(),
      correlationAnalysis: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [HomeworkAnalyticsController],
      providers: [
        { provide: HomeworkAnalyticsService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(HomeworkAnalyticsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getCompletionRates ───────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getCompletionRates', () => {
    it('should delegate to analyticsService.completionRates', async () => {
      const expected = [
        {
          class_id: CLASS_ID,
          class_name: 'Class 5A',
          subject_id: SUBJECT_ID,
          subject_name: 'Mathematics',
          total_assignments: 10,
          avg_completion_rate: 85.5,
        },
      ];
      mockService.completionRates.mockResolvedValue(expected);

      const result = await controller.getCompletionRates(
        tenantContext,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.completionRates).toHaveBeenCalledWith(
        TENANT_ID,
        baseQuery,
      );
    });
  });

  // ─── getLoadAnalysis ──────────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getLoadAnalysis', () => {
    it('should delegate to analyticsService.loadAnalysis', async () => {
      const expected = { by_class: [] };
      mockService.loadAnalysis.mockResolvedValue(expected);

      const result = await controller.getLoadAnalysis(
        tenantContext,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.loadAnalysis).toHaveBeenCalledWith(
        TENANT_ID,
        baseQuery,
      );
    });
  });

  // ─── getDailyLoadHeatmap ──────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getDailyLoadHeatmap', () => {
    it('should delegate to analyticsService.dailyLoadHeatmap', async () => {
      const expected = [
        { date: '2026-03-30', day_of_week: 'Monday', count: 5 },
      ];
      mockService.dailyLoadHeatmap.mockResolvedValue(expected);

      const result = await controller.getDailyLoadHeatmap(
        tenantContext,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.dailyLoadHeatmap).toHaveBeenCalledWith(
        TENANT_ID,
        baseQuery,
      );
    });
  });

  // ─── getNonCompleters ─────────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getNonCompleters', () => {
    it('should delegate to analyticsService.nonCompleters', async () => {
      const expected = { students: [] };
      mockService.nonCompleters.mockResolvedValue(expected);

      const result = await controller.getNonCompleters(
        tenantContext,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.nonCompleters).toHaveBeenCalledWith(
        TENANT_ID,
        baseQuery,
      );
    });
  });

  // ─── getCorrelation ───────────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getCorrelation', () => {
    it('should delegate to analyticsService.correlationAnalysis', async () => {
      const expected = { buckets: [] };
      mockService.correlationAnalysis.mockResolvedValue(expected);

      const result = await controller.getCorrelation(
        tenantContext,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.correlationAnalysis).toHaveBeenCalledWith(
        TENANT_ID,
        baseQuery,
      );
    });
  });

  // ─── getStudentTrends ─────────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getStudentTrends', () => {
    it('should delegate to analyticsService.studentTrends with studentId', async () => {
      const expected = {
        student_id: STUDENT_ID,
        overall: {
          total_assigned: 0,
          total_completed: 0,
          completion_rate: 0,
          avg_points_awarded: null,
        },
        by_subject: [],
        trend: { current_period: 0, previous_period: 0 },
      };
      mockService.studentTrends.mockResolvedValue(expected);

      const result = await controller.getStudentTrends(
        tenantContext,
        STUDENT_ID,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.studentTrends).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
        baseQuery,
      );
    });
  });

  // ─── getClassPatterns ─────────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getClassPatterns', () => {
    it('should delegate to analyticsService.classPatterns with classId', async () => {
      const expected = {
        class_id: CLASS_ID,
        assignments_count: 0,
        avg_completion_rate: 0,
        by_type: [],
        top_students: [],
        struggling_students: [],
      };
      mockService.classPatterns.mockResolvedValue(expected);

      const result = await controller.getClassPatterns(
        tenantContext,
        CLASS_ID,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.classPatterns).toHaveBeenCalledWith(
        TENANT_ID,
        CLASS_ID,
        baseQuery,
      );
    });
  });

  // ─── getSubjectTrends ─────────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getSubjectTrends', () => {
    it('should delegate to analyticsService.subjectTrends with subjectId', async () => {
      const expected = {
        subject_id: SUBJECT_ID,
        subject_name: 'Mathematics',
        total_assignments: 0,
        avg_completion_rate: 0,
        by_class: [],
        by_type: [],
      };
      mockService.subjectTrends.mockResolvedValue(expected);

      const result = await controller.getSubjectTrends(
        tenantContext,
        SUBJECT_ID,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.subjectTrends).toHaveBeenCalledWith(
        TENANT_ID,
        SUBJECT_ID,
        baseQuery,
      );
    });
  });

  // ─── getTeacherPatterns ───────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getTeacherPatterns', () => {
    it('should delegate to analyticsService.teacherPatterns with staffId', async () => {
      const expected = {
        staff_id: STAFF_ID,
        total_set: 0,
        by_type: [],
        avg_completion_rate: 0,
        trend: [],
      };
      mockService.teacherPatterns.mockResolvedValue(expected);

      const result = await controller.getTeacherPatterns(
        tenantContext,
        STAFF_ID,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.teacherPatterns).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_ID,
        baseQuery,
      );
    });
  });

  // ─── getYearGroupOverview ─────────────────────────────────────────────────

  describe('HomeworkAnalyticsController — getYearGroupOverview', () => {
    it('should delegate to analyticsService.yearGroupOverview with ygId', async () => {
      const expected = {
        year_group_id: YEAR_GROUP_ID,
        classes: [],
        total_assignments: 0,
        avg_completion_rate: 0,
      };
      mockService.yearGroupOverview.mockResolvedValue(expected);

      const result = await controller.getYearGroupOverview(
        tenantContext,
        YEAR_GROUP_ID,
        baseQuery,
      );

      expect(result).toEqual(expected);
      expect(mockService.yearGroupOverview).toHaveBeenCalledWith(
        TENANT_ID,
        YEAR_GROUP_ID,
        baseQuery,
      );
    });
  });
});
