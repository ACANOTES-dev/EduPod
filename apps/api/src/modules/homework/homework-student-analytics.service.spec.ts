import { Test, TestingModule } from '@nestjs/testing';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { HomeworkStudentAnalyticsService } from './homework-student-analytics.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SUBJECT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    homeworkAssignment: {
      findMany: jest.fn(),
    },
  };
}

function buildMockClassesFacade() {
  return {
    findClassIdsForStudent: jest.fn(),
  };
}

function buildMockStudentFacade() {
  return {
    findByIds: jest.fn(),
  };
}

const emptyFilters = {};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkStudentAnalyticsService', () => {
  let module: TestingModule;
  let service: HomeworkStudentAnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockClassesFacade: ReturnType<typeof buildMockClassesFacade>;
  let mockStudentFacade: ReturnType<typeof buildMockStudentFacade>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockClassesFacade = buildMockClassesFacade();
    mockStudentFacade = buildMockStudentFacade();

    module = await Test.createTestingModule({
      providers: [
        HomeworkStudentAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    service = module.get(HomeworkStudentAnalyticsService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  // ─── studentTrends ────────────────────────────────────────────────────────

  describe('HomeworkStudentAnalyticsService — studentTrends', () => {
    it('should return zero stats when student has no enrolments', async () => {
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.studentTrends(TENANT_ID, STUDENT_ID, emptyFilters);

      expect(result.student_id).toBe(STUDENT_ID);
      expect(result.overall.total_assigned).toBe(0);
      expect(result.overall.completion_rate).toBe(0);
      expect(result.overall.avg_points_awarded).toBeNull();
      expect(result.by_subject).toEqual([]);
      expect(result.trend.current_period).toBe(0);
      expect(result.trend.previous_period).toBe(0);
    });

    it('should compute overall stats and per-subject breakdown with points', async () => {
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);

      const now = new Date();
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          subject_id: SUBJECT_ID,
          due_date: new Date(now.getTime() - 5 * 86400000),
          subject: { name: 'Mathematics' },
          completions: [{ status: 'completed', points_awarded: 85 }],
        },
        {
          id: 'hw-2',
          subject_id: SUBJECT_ID,
          due_date: new Date(now.getTime() - 10 * 86400000),
          subject: { name: 'Mathematics' },
          completions: [{ status: 'completed', points_awarded: 95 }],
        },
        {
          id: 'hw-3',
          subject_id: 'other-subject',
          due_date: new Date(now.getTime() - 15 * 86400000),
          subject: { name: 'Science' },
          completions: [{ status: 'pending', points_awarded: null }],
        },
      ]);

      const result = await service.studentTrends(TENANT_ID, STUDENT_ID, emptyFilters);

      expect(result.overall.total_assigned).toBe(3);
      expect(result.overall.total_completed).toBe(2);
      expect(result.overall.completion_rate).toBe(66.67);
      expect(result.overall.avg_points_awarded).toBe(90);
      expect(result.by_subject).toHaveLength(2);

      const mathSubject = result.by_subject.find((s) => s.subject_name === 'Mathematics');
      expect(mathSubject).toBeDefined();
      expect(mathSubject!.total_assigned).toBe(2);
      expect(mathSubject!.total_completed).toBe(2);
      expect(mathSubject!.completion_rate).toBe(100);
      expect(mathSubject!.avg_points).toBe(90);

      const sciSubject = result.by_subject.find((s) => s.subject_name === 'Science');
      expect(sciSubject).toBeDefined();
      expect(sciSubject!.total_assigned).toBe(1);
      expect(sciSubject!.total_completed).toBe(0);
      expect(sciSubject!.completion_rate).toBe(0);
      expect(sciSubject!.avg_points).toBeNull();
    });

    it('should compute trend buckets for current and previous periods', async () => {
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);

      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000);
      const fortyDaysAgo = new Date(now.getTime() - 40 * 86400000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-current',
          subject_id: SUBJECT_ID,
          due_date: fiveDaysAgo,
          subject: { name: 'Math' },
          completions: [{ status: 'completed', points_awarded: 90 }],
        },
        {
          id: 'hw-previous',
          subject_id: SUBJECT_ID,
          due_date: fortyDaysAgo,
          subject: { name: 'Math' },
          completions: [{ status: 'pending', points_awarded: null }],
        },
        {
          id: 'hw-old',
          subject_id: SUBJECT_ID,
          due_date: ninetyDaysAgo,
          subject: { name: 'Math' },
          completions: [{ status: 'completed', points_awarded: 80 }],
        },
      ]);

      const result = await service.studentTrends(TENANT_ID, STUDENT_ID, emptyFilters);

      // Current period (last 30 days): 1 assigned, 1 completed = 100%
      expect(result.trend.current_period).toBe(100);
      // Previous period (30-60 days): 1 assigned, 0 completed = 0%
      expect(result.trend.previous_period).toBe(0);
    });

    it('should handle subject with null subject_id (grouped as "none")', async () => {
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          subject_id: null,
          due_date: new Date(),
          subject: null,
          completions: [{ status: 'completed', points_awarded: 70 }],
        },
      ]);

      const result = await service.studentTrends(TENANT_ID, STUDENT_ID, emptyFilters);

      expect(result.by_subject).toHaveLength(1);
      expect(result.by_subject[0]!.subject_id).toBeNull();
      expect(result.by_subject[0]!.subject_name).toBeNull();
      expect(result.by_subject[0]!.avg_points).toBe(70);
    });

    it('should return null avg_points when no assignments have points', async () => {
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          subject_id: SUBJECT_ID,
          due_date: new Date(),
          subject: { name: 'Math' },
          completions: [{ status: 'completed', points_awarded: null }],
        },
      ]);

      const result = await service.studentTrends(TENANT_ID, STUDENT_ID, emptyFilters);

      expect(result.overall.avg_points_awarded).toBeNull();
      expect(result.by_subject[0]!.avg_points).toBeNull();
    });

    it('edge: should re-throw error from prisma failure', async () => {
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);
      mockPrisma.homeworkAssignment.findMany.mockRejectedValue(new Error('DB failure'));

      await expect(service.studentTrends(TENANT_ID, STUDENT_ID, emptyFilters)).rejects.toThrow(
        'DB failure',
      );
    });
  });

  // ─── nonCompleters ────────────────────────────────────────────────────────

  describe('HomeworkStudentAnalyticsService — nonCompleters', () => {
    it('should return struggling students with enriched names', async () => {
      const STRUGGLE_ID = 'struggle-student';

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: STRUGGLE_ID, status: 'pending' }],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: STRUGGLE_ID, status: 'pending' }],
        },
        {
          id: 'hw-3',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: STRUGGLE_ID, status: 'completed' }],
        },
      ]);

      mockStudentFacade.findByIds.mockResolvedValue([
        { id: STRUGGLE_ID, first_name: 'Ali', last_name: 'Noor' },
      ]);

      const result = await service.nonCompleters(TENANT_ID, emptyFilters);

      expect(result.students).toHaveLength(1);
      expect(result.students[0]!.student_id).toBe(STRUGGLE_ID);
      expect(result.students[0]!.first_name).toBe('Ali');
      expect(result.students[0]!.last_name).toBe('Noor');
      expect(result.students[0]!.total_assigned).toBe(3);
      expect(result.students[0]!.total_completed).toBe(1);
      expect(result.students[0]!.rate).toBeCloseTo(33.33, 1);
      expect(result.students[0]!.classes).toHaveLength(1);
    });

    it('should not return students with fewer than 3 assignments', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: 'few-student', status: 'pending' }],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: 'few-student', status: 'pending' }],
        },
      ]);

      const result = await service.nonCompleters(TENANT_ID, emptyFilters);

      expect(result.students).toHaveLength(0);
    });

    it('should not return students with 50%+ completion rate', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: 'ok-student', status: 'completed' }],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: 'ok-student', status: 'completed' }],
        },
        {
          id: 'hw-3',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: 'ok-student', status: 'pending' }],
        },
      ]);

      const result = await service.nonCompleters(TENANT_ID, emptyFilters);

      expect(result.students).toHaveLength(0);
    });

    it('should use empty name fallback when student not found in facade', async () => {
      const UNKNOWN_ID = 'unknown-student';

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: UNKNOWN_ID, status: 'pending' }],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: UNKNOWN_ID, status: 'pending' }],
        },
        {
          id: 'hw-3',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: UNKNOWN_ID, status: 'pending' }],
        },
      ]);

      // Return empty so name lookup fails
      mockStudentFacade.findByIds.mockResolvedValue([]);

      const result = await service.nonCompleters(TENANT_ID, emptyFilters);

      expect(result.students).toHaveLength(1);
      expect(result.students[0]!.first_name).toBe('');
      expect(result.students[0]!.last_name).toBe('');
    });

    it('should aggregate students across multiple classes', async () => {
      const MULTI_ID = 'multi-class-student';
      const CLASS_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef';

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: MULTI_ID, status: 'pending' }],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID_2,
          class_entity: { name: 'Class 6B' },
          completions: [{ student_id: MULTI_ID, status: 'pending' }],
        },
        {
          id: 'hw-3',
          class_id: CLASS_ID,
          class_entity: { name: 'Class 5A' },
          completions: [{ student_id: MULTI_ID, status: 'pending' }],
        },
      ]);

      mockStudentFacade.findByIds.mockResolvedValue([
        { id: MULTI_ID, first_name: 'Sara', last_name: 'Khan' },
      ]);

      const result = await service.nonCompleters(TENANT_ID, emptyFilters);

      expect(result.students).toHaveLength(1);
      expect(result.students[0]!.classes).toHaveLength(2);
    });

    it('should not call findByIds when no students are struggling', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.nonCompleters(TENANT_ID, emptyFilters);

      expect(result.students).toHaveLength(0);
      expect(mockStudentFacade.findByIds).not.toHaveBeenCalled();
    });

    it('edge: should re-throw error from prisma failure', async () => {
      mockPrisma.homeworkAssignment.findMany.mockRejectedValue(new Error('DB failure'));

      await expect(service.nonCompleters(TENANT_ID, emptyFilters)).rejects.toThrow('DB failure');
    });
  });

  // ─── correlationAnalysis ──────────────────────────────────────────────────

  describe('HomeworkStudentAnalyticsService — correlationAnalysis', () => {
    it('should bucket students by completion rate with average points', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          completions: [{ student_id: 'high', status: 'completed', points_awarded: 90 }],
        },
        {
          completions: [{ student_id: 'high', status: 'completed', points_awarded: 80 }],
        },
        {
          completions: [{ student_id: 'low', status: 'pending', points_awarded: null }],
        },
        {
          completions: [{ student_id: 'low', status: 'pending', points_awarded: null }],
        },
        {
          completions: [{ student_id: 'low', status: 'pending', points_awarded: null }],
        },
      ]);

      const result = await service.correlationAnalysis(TENANT_ID, emptyFilters);

      expect(result.buckets).toHaveLength(4);

      const lowBucket = result.buckets.find((b) => b.range === '0-25%');
      expect(lowBucket!.student_count).toBe(1);
      expect(lowBucket!.avg_points).toBeNull();

      const highBucket = result.buckets.find((b) => b.range === '75-100%');
      expect(highBucket!.student_count).toBe(1);
      expect(highBucket!.avg_points).toBe(85);
    });

    it('should return empty buckets when no data', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.correlationAnalysis(TENANT_ID, emptyFilters);

      expect(result.buckets).toHaveLength(4);
      for (const bucket of result.buckets) {
        expect(bucket.student_count).toBe(0);
        expect(bucket.avg_points).toBeNull();
      }
    });

    it('should handle student with completed assignments but no points', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          completions: [{ student_id: 'no-pts', status: 'completed', points_awarded: null }],
        },
      ]);

      const result = await service.correlationAnalysis(TENANT_ID, emptyFilters);

      const highBucket = result.buckets.find((b) => b.range === '75-100%');
      expect(highBucket!.student_count).toBe(1);
      expect(highBucket!.avg_points).toBeNull();
    });

    it('should place students in correct buckets including mid-range', async () => {
      // Create a student with 2 out of 3 completed = ~66.67% -> "50-75%" bucket
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          completions: [{ student_id: 'mid', status: 'completed', points_awarded: 70 }],
        },
        {
          completions: [{ student_id: 'mid', status: 'completed', points_awarded: 80 }],
        },
        {
          completions: [{ student_id: 'mid', status: 'pending', points_awarded: null }],
        },
      ]);

      const result = await service.correlationAnalysis(TENANT_ID, emptyFilters);

      const midBucket = result.buckets.find((b) => b.range === '50-75%');
      expect(midBucket!.student_count).toBe(1);
      expect(midBucket!.avg_points).toBe(75);
    });

    it('should place students in the 25-50% bucket', async () => {
      // 1 out of 3 = 33.33% -> "25-50%" bucket
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          completions: [{ student_id: 'low-mid', status: 'completed', points_awarded: 60 }],
        },
        {
          completions: [{ student_id: 'low-mid', status: 'pending', points_awarded: null }],
        },
        {
          completions: [{ student_id: 'low-mid', status: 'pending', points_awarded: null }],
        },
      ]);

      const result = await service.correlationAnalysis(TENANT_ID, emptyFilters);

      const bucket = result.buckets.find((b) => b.range === '25-50%');
      expect(bucket!.student_count).toBe(1);
      expect(bucket!.avg_points).toBe(60);
    });

    it('edge: should re-throw error from prisma failure', async () => {
      mockPrisma.homeworkAssignment.findMany.mockRejectedValue(new Error('DB failure'));

      await expect(service.correlationAnalysis(TENANT_ID, emptyFilters)).rejects.toThrow(
        'DB failure',
      );
    });
  });
});
