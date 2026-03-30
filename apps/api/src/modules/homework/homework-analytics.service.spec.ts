import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { HomeworkAnalyticsService } from './homework-analytics.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SUBJECT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const YEAR_GROUP_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    homeworkAssignment: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    classEnrolment: {
      findMany: jest.fn(),
    },
    student: {
      findMany: jest.fn(),
    },
    subject: {
      findFirst: jest.fn(),
    },
    class: {
      findMany: jest.fn(),
    },
  };
}

const emptyFilters = {};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkAnalyticsService', () => {
  let service: HomeworkAnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        HomeworkAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(HomeworkAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── completionRates ──────────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — completionRates', () => {
    it('should return per-class/subject completion rates', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          class_entity: { name: 'Class 5A' },
          subject: { name: 'Mathematics' },
          completions: [
            { status: 'completed' },
            { status: 'completed' },
            { status: 'pending' },
          ],
        },
      ]);

      const result = await service.completionRates(TENANT_ID, emptyFilters);

      expect(result).toHaveLength(1);
      expect(result[0].class_id).toBe(CLASS_ID);
      expect(result[0].class_name).toBe('Class 5A');
      expect(result[0].subject_id).toBe(SUBJECT_ID);
      expect(result[0].total_assignments).toBe(1);
      // 2 completed out of 3 possible = 66.67%
      expect(result[0].avg_completion_rate).toBeCloseTo(66.67, 1);
    });

    it('should return empty array when no assignments exist', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.completionRates(TENANT_ID, emptyFilters);

      expect(result).toEqual([]);
    });

    it('should return 0 completion rate when no completions exist', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          subject_id: null,
          class_entity: { name: 'Class 5A' },
          subject: null,
          completions: [],
        },
      ]);

      const result = await service.completionRates(TENANT_ID, emptyFilters);

      expect(result).toHaveLength(1);
      expect(result[0].avg_completion_rate).toBe(0);
      expect(result[0].subject_id).toBeNull();
    });

    it('should apply date filters to the where clause', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      await service.completionRates(TENANT_ID, {
        date_from: '2026-01-01',
        date_to: '2026-03-31',
      });

      expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'published',
            due_date: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-03-31'),
            },
          }),
        }),
      );
    });
  });

  // ─── studentTrends ────────────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — studentTrends', () => {
    it('should return overall and per-subject breakdown for a student', async () => {
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { class_id: CLASS_ID },
      ]);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          subject_id: SUBJECT_ID,
          due_date: new Date(),
          subject: { name: 'Mathematics' },
          completions: [{ status: 'completed', points_awarded: 85 }],
        },
        {
          id: 'hw-2',
          subject_id: SUBJECT_ID,
          due_date: new Date(),
          subject: { name: 'Mathematics' },
          completions: [{ status: 'pending', points_awarded: null }],
        },
      ]);

      const result = await service.studentTrends(
        TENANT_ID,
        STUDENT_ID,
        emptyFilters,
      );

      expect(result.student_id).toBe(STUDENT_ID);
      expect(result.overall.total_assigned).toBe(2);
      expect(result.overall.total_completed).toBe(1);
      expect(result.overall.completion_rate).toBe(50);
      expect(result.overall.avg_points_awarded).toBe(85);
      expect(result.by_subject).toHaveLength(1);
      expect(result.by_subject[0].subject_name).toBe('Mathematics');
    });

    it('should return empty result when student has no enrolments', async () => {
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

      const result = await service.studentTrends(
        TENANT_ID,
        STUDENT_ID,
        emptyFilters,
      );

      expect(result.overall.total_assigned).toBe(0);
      expect(result.overall.completion_rate).toBe(0);
      expect(result.by_subject).toEqual([]);
    });

    it('should compute trend periods correctly', async () => {
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { class_id: CLASS_ID },
      ]);

      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000);
      const fortyDaysAgo = new Date(now.getTime() - 40 * 86400000);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-current',
          subject_id: SUBJECT_ID,
          due_date: fiveDaysAgo,
          subject: { name: 'Mathematics' },
          completions: [{ status: 'completed', points_awarded: 90 }],
        },
        {
          id: 'hw-previous',
          subject_id: SUBJECT_ID,
          due_date: fortyDaysAgo,
          subject: { name: 'Mathematics' },
          completions: [{ status: 'pending', points_awarded: null }],
        },
      ]);

      const result = await service.studentTrends(
        TENANT_ID,
        STUDENT_ID,
        emptyFilters,
      );

      expect(result.trend.current_period).toBe(100);
      expect(result.trend.previous_period).toBe(0);
    });
  });

  // ─── classPatterns ────────────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — classPatterns', () => {
    it('should return class metrics with type breakdown and student rankings', async () => {
      const studentA = 'student-a';
      const studentB = 'student-b';

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          homework_type: 'assignment',
          due_date: new Date('2026-03-15'),
          completions: [
            { student_id: studentA, status: 'completed' },
            { student_id: studentB, status: 'pending' },
          ],
        },
        {
          id: 'hw-2',
          homework_type: 'quiz',
          due_date: new Date('2026-03-20'),
          completions: [
            { student_id: studentA, status: 'completed' },
            { student_id: studentB, status: 'completed' },
          ],
        },
      ]);

      const result = await service.classPatterns(
        TENANT_ID,
        CLASS_ID,
        emptyFilters,
      );

      expect(result.class_id).toBe(CLASS_ID);
      expect(result.assignments_count).toBe(2);
      expect(result.avg_completion_rate).toBe(75);
      expect(result.by_type).toHaveLength(2);
      expect(result.top_students).toBeDefined();
      expect(result.struggling_students).toBeDefined();

      // Student A completed 2/2 = 100%, Student B completed 1/2 = 50%
      const topStudent = result.top_students[0];
      expect(topStudent.student_id).toBe(studentA);
      expect(topStudent.completion_rate).toBe(100);
    });

    it('should handle empty assignments', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.classPatterns(
        TENANT_ID,
        CLASS_ID,
        emptyFilters,
      );

      expect(result.assignments_count).toBe(0);
      expect(result.avg_completion_rate).toBe(0);
      expect(result.by_type).toEqual([]);
      expect(result.top_students).toEqual([]);
      expect(result.struggling_students).toEqual([]);
    });
  });

  // ─── loadAnalysis ─────────────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — loadAnalysis', () => {
    it('should return per-class weekly averages and subject breakdown', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          due_date: new Date('2026-03-02'),
          class_entity: { name: 'Class 5A' },
          subject: { name: 'Mathematics' },
        },
        {
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          due_date: new Date('2026-03-04'),
          class_entity: { name: 'Class 5A' },
          subject: { name: 'Mathematics' },
        },
        {
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          due_date: new Date('2026-03-09'),
          class_entity: { name: 'Class 5A' },
          subject: { name: 'Mathematics' },
        },
      ]);

      const result = await service.loadAnalysis(TENANT_ID, emptyFilters);

      expect(result.by_class).toHaveLength(1);
      expect(result.by_class[0].class_id).toBe(CLASS_ID);
      expect(result.by_class[0].total_assignments).toBe(3);
      // 3 assignments across 2 weeks = 1.5 avg
      expect(result.by_class[0].weekly_avg).toBe(1.5);
      expect(result.by_class[0].subject_breakdown).toHaveLength(1);
    });

    it('should return empty result when no assignments', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.loadAnalysis(TENANT_ID, emptyFilters);

      expect(result.by_class).toEqual([]);
    });

    it('should pass class_id filter when provided', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      await service.loadAnalysis(TENANT_ID, { class_id: CLASS_ID });

      expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            class_id: CLASS_ID,
          }),
        }),
      );
    });
  });

  // ─── dailyLoadHeatmap ─────────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — dailyLoadHeatmap', () => {
    it('should return date/count array with day of week', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        { due_date: new Date('2026-03-30') },
        { due_date: new Date('2026-03-30') },
        { due_date: new Date('2026-03-31') },
      ]);

      const result = await service.dailyLoadHeatmap(TENANT_ID, emptyFilters);

      expect(result).toHaveLength(2);

      const march30 = result.find(
        (r: { date: string }) => r.date === '2026-03-30',
      );
      expect(march30).toBeDefined();
      expect(march30!.count).toBe(2);
      expect(march30!.day_of_week).toBe('Monday');

      const march31 = result.find(
        (r: { date: string }) => r.date === '2026-03-31',
      );
      expect(march31).toBeDefined();
      expect(march31!.count).toBe(1);
      expect(march31!.day_of_week).toBe('Tuesday');
    });

    it('should return empty array when no assignments', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.dailyLoadHeatmap(TENANT_ID, emptyFilters);

      expect(result).toEqual([]);
    });
  });

  // ─── nonCompleters ────────────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — nonCompleters', () => {
    it('should return students below 50% completion with 3+ assignments', async () => {
      const struggleStudentId = 'struggle-student';

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [
            { student_id: struggleStudentId, status: 'pending' },
          ],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [
            { student_id: struggleStudentId, status: 'pending' },
          ],
        },
        {
          id: 'hw-3',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [
            { student_id: struggleStudentId, status: 'completed' },
          ],
        },
      ]);

      mockPrisma.student.findMany.mockResolvedValue([
        { id: struggleStudentId, first_name: 'Ali', last_name: 'Noor' },
      ]);

      const result = await service.nonCompleters(TENANT_ID, emptyFilters);

      expect(result.students).toHaveLength(1);
      expect(result.students[0].student_id).toBe(struggleStudentId);
      expect(result.students[0].first_name).toBe('Ali');
      expect(result.students[0].total_assigned).toBe(3);
      expect(result.students[0].total_completed).toBe(1);
      expect(result.students[0].rate).toBeCloseTo(33.33, 1);
    });

    it('should not include students with fewer than 3 assignments', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [
            { student_id: 'student-few', status: 'pending' },
          ],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [
            { student_id: 'student-few', status: 'pending' },
          ],
        },
      ]);

      const result = await service.nonCompleters(TENANT_ID, emptyFilters);

      expect(result.students).toHaveLength(0);
    });

    it('should not include students with 50% or higher completion rate', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [
            { student_id: 'student-ok', status: 'completed' },
          ],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [
            { student_id: 'student-ok', status: 'completed' },
          ],
        },
        {
          id: 'hw-3',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [
            { student_id: 'student-ok', status: 'pending' },
          ],
        },
      ]);

      const result = await service.nonCompleters(TENANT_ID, emptyFilters);

      expect(result.students).toHaveLength(0);
    });
  });

  // ─── subjectTrends ────────────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — subjectTrends', () => {
    it('should return subject-level metrics with class and type breakdowns', async () => {
      mockPrisma.subject.findFirst.mockResolvedValue({ name: 'Mathematics' });
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          homework_type: 'assignment',
          class_entity: { name: 'Class 5A' },
          completions: [
            { status: 'completed' },
            { status: 'pending' },
          ],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID,
          homework_type: 'quiz',
          class_entity: { name: 'Class 5A' },
          completions: [
            { status: 'completed' },
            { status: 'completed' },
          ],
        },
      ]);

      const result = await service.subjectTrends(
        TENANT_ID,
        SUBJECT_ID,
        emptyFilters,
      );

      expect(result.subject_id).toBe(SUBJECT_ID);
      expect(result.subject_name).toBe('Mathematics');
      expect(result.total_assignments).toBe(2);
      // 3 completed out of 4 possible = 75%
      expect(result.avg_completion_rate).toBe(75);
      expect(result.by_class).toHaveLength(1);
      expect(result.by_type).toHaveLength(2);
    });

    it('should handle missing subject name gracefully', async () => {
      mockPrisma.subject.findFirst.mockResolvedValue(null);
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.subjectTrends(
        TENANT_ID,
        SUBJECT_ID,
        emptyFilters,
      );

      expect(result.subject_name).toBeNull();
      expect(result.total_assignments).toBe(0);
      expect(result.avg_completion_rate).toBe(0);
    });
  });

  // ─── teacherPatterns ──────────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — teacherPatterns', () => {
    it('should return teacher-level metrics with type and monthly trends', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          homework_type: 'assignment',
          due_date: new Date('2026-03-15'),
          completions: [
            { status: 'completed' },
            { status: 'completed' },
          ],
        },
        {
          id: 'hw-2',
          homework_type: 'assignment',
          due_date: new Date('2026-03-20'),
          completions: [
            { status: 'pending' },
          ],
        },
      ]);

      const result = await service.teacherPatterns(
        TENANT_ID,
        STAFF_ID,
        emptyFilters,
      );

      expect(result.staff_id).toBe(STAFF_ID);
      expect(result.total_set).toBe(2);
      expect(result.by_type).toHaveLength(1);
      expect(result.by_type[0].type).toBe('assignment');
      expect(result.by_type[0].count).toBe(2);
      // 2 completed out of 3 possible = 66.67%
      expect(result.avg_completion_rate).toBeCloseTo(66.67, 1);
      expect(result.trend).toHaveLength(1);
      expect(result.trend[0].month).toBe('2026-03');
      expect(result.trend[0].assignments_set).toBe(2);
    });

    it('should handle empty assignments for teacher', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.teacherPatterns(
        TENANT_ID,
        STAFF_ID,
        emptyFilters,
      );

      expect(result.total_set).toBe(0);
      expect(result.avg_completion_rate).toBe(0);
      expect(result.by_type).toEqual([]);
      expect(result.trend).toEqual([]);
    });
  });

  // ─── yearGroupOverview ────────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — yearGroupOverview', () => {
    it('should return year-group aggregate across classes', async () => {
      mockPrisma.class.findMany.mockResolvedValue([
        { id: CLASS_ID, name: 'Class 5A' },
      ]);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          class_id: CLASS_ID,
          completions: [
            { status: 'completed' },
            { status: 'completed' },
            { status: 'pending' },
          ],
        },
        {
          class_id: CLASS_ID,
          completions: [
            { status: 'completed' },
          ],
        },
      ]);

      const result = await service.yearGroupOverview(
        TENANT_ID,
        YEAR_GROUP_ID,
        emptyFilters,
      );

      expect(result.year_group_id).toBe(YEAR_GROUP_ID);
      expect(result.total_assignments).toBe(2);
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].class_id).toBe(CLASS_ID);
      expect(result.classes[0].class_name).toBe('Class 5A');
      expect(result.classes[0].assignments_count).toBe(2);
      // 3 completed out of 4 possible = 75%
      expect(result.avg_completion_rate).toBe(75);
    });

    it('should return empty result when year group has no classes', async () => {
      mockPrisma.class.findMany.mockResolvedValue([]);

      const result = await service.yearGroupOverview(
        TENANT_ID,
        YEAR_GROUP_ID,
        emptyFilters,
      );

      expect(result.year_group_id).toBe(YEAR_GROUP_ID);
      expect(result.classes).toEqual([]);
      expect(result.total_assignments).toBe(0);
      expect(result.avg_completion_rate).toBe(0);
    });

    it('should handle classes with no assignments', async () => {
      mockPrisma.class.findMany.mockResolvedValue([
        { id: CLASS_ID, name: 'Class 5A' },
      ]);
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.yearGroupOverview(
        TENANT_ID,
        YEAR_GROUP_ID,
        emptyFilters,
      );

      expect(result.total_assignments).toBe(0);
      expect(result.avg_completion_rate).toBe(0);
      expect(result.classes).toEqual([]);
    });
  });

  // ─── correlationAnalysis ──────────────────────────────────────────────────

  describe('HomeworkAnalyticsService — correlationAnalysis', () => {
    it('should return bucketed student data with average points', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          completions: [
            { student_id: 'high-student', status: 'completed', points_awarded: 90 },
          ],
        },
        {
          completions: [
            { student_id: 'high-student', status: 'completed', points_awarded: 80 },
          ],
        },
        {
          completions: [
            { student_id: 'low-student', status: 'pending', points_awarded: null },
          ],
        },
        {
          completions: [
            { student_id: 'low-student', status: 'pending', points_awarded: null },
          ],
        },
        {
          completions: [
            { student_id: 'low-student', status: 'pending', points_awarded: null },
          ],
        },
      ]);

      const result = await service.correlationAnalysis(
        TENANT_ID,
        emptyFilters,
      );

      expect(result.buckets).toHaveLength(4);

      const lowBucket = result.buckets.find(
        (b: { range: string }) => b.range === '0-25%',
      );
      expect(lowBucket).toBeDefined();
      expect(lowBucket!.student_count).toBe(1);

      const highBucket = result.buckets.find(
        (b: { range: string }) => b.range === '75-100%',
      );
      expect(highBucket).toBeDefined();
      expect(highBucket!.student_count).toBe(1);
      expect(highBucket!.avg_points).toBe(85);
    });

    it('should return empty buckets when no assignments', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.correlationAnalysis(
        TENANT_ID,
        emptyFilters,
      );

      expect(result.buckets).toHaveLength(4);
      for (const bucket of result.buckets) {
        expect(bucket.student_count).toBe(0);
        expect(bucket.avg_points).toBeNull();
      }
    });

    it('should handle students without points', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          completions: [
            { student_id: 'no-points', status: 'completed', points_awarded: null },
          ],
        },
      ]);

      const result = await service.correlationAnalysis(
        TENANT_ID,
        emptyFilters,
      );

      const highBucket = result.buckets.find(
        (b: { range: string }) => b.range === '75-100%',
      );
      expect(highBucket).toBeDefined();
      expect(highBucket!.student_count).toBe(1);
      expect(highBucket!.avg_points).toBeNull();
    });
  });
});
