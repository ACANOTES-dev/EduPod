import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { HomeworkCompletionAnalyticsService } from './homework-completion-analytics.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CLASS_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef';
const SUBJECT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const YEAR_GROUP_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';

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
    findByYearGroup: jest.fn(),
  };
}

function buildMockAcademicFacade() {
  return {
    findSubjectById: jest.fn(),
  };
}

const emptyFilters = {};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkCompletionAnalyticsService', () => {
  let module: TestingModule;
  let service: HomeworkCompletionAnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockClassesFacade: ReturnType<typeof buildMockClassesFacade>;
  let mockAcademicFacade: ReturnType<typeof buildMockAcademicFacade>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockClassesFacade = buildMockClassesFacade();
    mockAcademicFacade = buildMockAcademicFacade();

    module = await Test.createTestingModule({
      providers: [
        HomeworkCompletionAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
      ],
    }).compile();

    service = module.get(HomeworkCompletionAnalyticsService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  // ─── completionRates ──────────────────────────────────────────────────────

  describe('HomeworkCompletionAnalyticsService — completionRates', () => {
    it('should group by class+subject and compute rates', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          class_entity: { name: 'Class 5A' },
          subject: { name: 'Mathematics' },
          completions: [{ status: 'completed' }, { status: 'pending' }],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          class_entity: { name: 'Class 5A' },
          subject: { name: 'Mathematics' },
          completions: [{ status: 'completed' }, { status: 'completed' }],
        },
      ]);

      const result = await service.completionRates(TENANT_ID, emptyFilters);

      expect(result).toHaveLength(1);
      expect(result[0]!.class_id).toBe(CLASS_ID);
      expect(result[0]!.total_assignments).toBe(2);
      // 3 completed out of 4 possible = 75%
      expect(result[0]!.avg_completion_rate).toBe(75);
    });

    it('should handle null subject_id with "none" grouping key', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          subject_id: null,
          class_entity: { name: 'Class 5A' },
          subject: null,
          completions: [{ status: 'completed' }],
        },
      ]);

      const result = await service.completionRates(TENANT_ID, emptyFilters);

      expect(result).toHaveLength(1);
      expect(result[0]!.subject_id).toBeNull();
      expect(result[0]!.subject_name).toBeNull();
      expect(result[0]!.avg_completion_rate).toBe(100);
    });

    it('should return 0 rate when no completions exist', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          class_entity: { name: 'Class 5A' },
          subject: { name: 'Math' },
          completions: [],
        },
      ]);

      const result = await service.completionRates(TENANT_ID, emptyFilters);

      expect(result[0]!.avg_completion_rate).toBe(0);
    });

    it('edge: should re-throw on error', async () => {
      mockPrisma.homeworkAssignment.findMany.mockRejectedValue(new Error('DB error'));

      await expect(service.completionRates(TENANT_ID, emptyFilters)).rejects.toThrow('DB error');
    });
  });

  // ─── classPatterns ────────────────────────────────────────────────────────

  describe('HomeworkCompletionAnalyticsService — classPatterns', () => {
    it('should return type breakdown and student rankings', async () => {
      const studentA = 'student-a';
      const studentB = 'student-b';

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          homework_type: 'written',
          due_date: new Date('2026-03-15'),
          completions: [
            { student_id: studentA, status: 'completed' },
            { student_id: studentB, status: 'pending' },
          ],
        },
        {
          id: 'hw-2',
          homework_type: 'reading',
          due_date: new Date('2026-03-20'),
          completions: [
            { student_id: studentA, status: 'completed' },
            { student_id: studentB, status: 'completed' },
          ],
        },
      ]);

      const result = await service.classPatterns(TENANT_ID, CLASS_ID, emptyFilters);

      expect(result.class_id).toBe(CLASS_ID);
      expect(result.assignments_count).toBe(2);
      expect(result.avg_completion_rate).toBe(75);
      expect(result.by_type).toHaveLength(2);
      expect(result.top_students.length).toBeGreaterThan(0);
      expect(result.struggling_students.length).toBeGreaterThan(0);
    });

    it('should handle empty assignments returning 0 rates', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.classPatterns(TENANT_ID, CLASS_ID, emptyFilters);

      expect(result.assignments_count).toBe(0);
      expect(result.avg_completion_rate).toBe(0);
      expect(result.by_type).toEqual([]);
      expect(result.top_students).toEqual([]);
      expect(result.struggling_students).toEqual([]);
    });

    it('should compute per-type completion rates', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          homework_type: 'written',
          due_date: new Date(),
          completions: [
            { student_id: 's1', status: 'completed' },
            { student_id: 's2', status: 'pending' },
          ],
        },
        {
          id: 'hw-2',
          homework_type: 'written',
          due_date: new Date(),
          completions: [],
        },
      ]);

      const result = await service.classPatterns(TENANT_ID, CLASS_ID, emptyFilters);

      const writtenType = result.by_type.find((t) => t.type === 'written');
      expect(writtenType).toBeDefined();
      expect(writtenType!.count).toBe(2);
      // 1 completed / 2 possible = 50%
      expect(writtenType!.completion_rate).toBe(50);
    });

    it('should return 0 type completion rate when zero possible', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          homework_type: 'revision',
          due_date: new Date(),
          completions: [],
        },
      ]);

      const result = await service.classPatterns(TENANT_ID, CLASS_ID, emptyFilters);

      expect(result.by_type[0]!.completion_rate).toBe(0);
    });

    it('edge: should re-throw on error', async () => {
      mockPrisma.homeworkAssignment.findMany.mockRejectedValue(new Error('DB error'));

      await expect(service.classPatterns(TENANT_ID, CLASS_ID, emptyFilters)).rejects.toThrow(
        'DB error',
      );
    });
  });

  // ─── subjectTrends ────────────────────────────────────────────────────────

  describe('HomeworkCompletionAnalyticsService — subjectTrends', () => {
    it('should return per-class and per-type breakdowns', async () => {
      mockAcademicFacade.findSubjectById.mockResolvedValue({ name: 'Mathematics' });
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          homework_type: 'written',
          class_entity: { name: 'Class 5A' },
          completions: [{ status: 'completed' }, { status: 'pending' }],
        },
        {
          id: 'hw-2',
          class_id: CLASS_ID_2,
          homework_type: 'reading',
          class_entity: { name: 'Class 6B' },
          completions: [{ status: 'completed' }],
        },
      ]);

      const result = await service.subjectTrends(TENANT_ID, SUBJECT_ID, emptyFilters);

      expect(result.subject_name).toBe('Mathematics');
      expect(result.total_assignments).toBe(2);
      expect(result.by_class).toHaveLength(2);
      expect(result.by_type).toHaveLength(2);
    });

    it('should handle null subject from facade', async () => {
      mockAcademicFacade.findSubjectById.mockResolvedValue(null);
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const result = await service.subjectTrends(TENANT_ID, SUBJECT_ID, emptyFilters);

      expect(result.subject_name).toBeNull();
      expect(result.avg_completion_rate).toBe(0);
    });

    it('should compute per-class rates correctly', async () => {
      mockAcademicFacade.findSubjectById.mockResolvedValue({ name: 'Science' });
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          class_id: CLASS_ID,
          homework_type: 'written',
          class_entity: { name: 'Class 5A' },
          completions: [{ status: 'completed' }, { status: 'completed' }],
        },
      ]);

      const result = await service.subjectTrends(TENANT_ID, SUBJECT_ID, emptyFilters);

      expect(result.by_class[0]!.completion_rate).toBe(100);
    });

    it('edge: should re-throw on error', async () => {
      mockAcademicFacade.findSubjectById.mockResolvedValue(null);
      mockPrisma.homeworkAssignment.findMany.mockRejectedValue(new Error('DB error'));

      await expect(service.subjectTrends(TENANT_ID, SUBJECT_ID, emptyFilters)).rejects.toThrow(
        'DB error',
      );
    });
  });

  // ─── teacherPatterns ──────────────────────────────────────────────────────

  describe('HomeworkCompletionAnalyticsService — teacherPatterns', () => {
    it('should return type breakdown and monthly trend', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          homework_type: 'written',
          due_date: new Date('2026-03-15'),
          completions: [{ status: 'completed' }],
        },
        {
          id: 'hw-2',
          homework_type: 'reading',
          due_date: new Date('2026-04-01'),
          completions: [{ status: 'pending' }],
        },
      ]);

      const result = await service.teacherPatterns(TENANT_ID, STAFF_ID, emptyFilters);

      expect(result.staff_id).toBe(STAFF_ID);
      expect(result.total_set).toBe(2);
      expect(result.by_type).toHaveLength(2);
      expect(result.trend).toHaveLength(2);
      expect(result.trend[0]!.month).toBe('2026-03');
      expect(result.trend[1]!.month).toBe('2026-04');
    });

    it('should return 0 rate for month with no completions', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          homework_type: 'written',
          due_date: new Date('2026-03-15'),
          completions: [],
        },
      ]);

      const result = await service.teacherPatterns(TENANT_ID, STAFF_ID, emptyFilters);

      expect(result.avg_completion_rate).toBe(0);
      expect(result.trend[0]!.completion_rate).toBe(0);
    });

    it('edge: should re-throw on error', async () => {
      mockPrisma.homeworkAssignment.findMany.mockRejectedValue(new Error('DB error'));

      await expect(service.teacherPatterns(TENANT_ID, STAFF_ID, emptyFilters)).rejects.toThrow(
        'DB error',
      );
    });
  });

  // ─── yearGroupOverview ────────────────────────────────────────────────────

  describe('HomeworkCompletionAnalyticsService — yearGroupOverview', () => {
    it('should return empty when year group has no classes', async () => {
      mockClassesFacade.findByYearGroup.mockResolvedValue([]);

      const result = await service.yearGroupOverview(TENANT_ID, YEAR_GROUP_ID, emptyFilters);

      expect(result.year_group_id).toBe(YEAR_GROUP_ID);
      expect(result.classes).toEqual([]);
      expect(result.total_assignments).toBe(0);
      expect(result.avg_completion_rate).toBe(0);
    });

    it('should aggregate across multiple classes', async () => {
      mockClassesFacade.findByYearGroup.mockResolvedValue([
        { id: CLASS_ID, name: 'Class 5A' },
        { id: CLASS_ID_2, name: 'Class 5B' },
      ]);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          class_id: CLASS_ID,
          completions: [{ status: 'completed' }, { status: 'pending' }],
        },
        {
          class_id: CLASS_ID_2,
          completions: [{ status: 'completed' }],
        },
      ]);

      const result = await service.yearGroupOverview(TENANT_ID, YEAR_GROUP_ID, emptyFilters);

      expect(result.classes).toHaveLength(2);
      expect(result.total_assignments).toBe(2);
      // 2 completed / 3 possible = 66.67%
      expect(result.avg_completion_rate).toBeCloseTo(66.67, 1);
    });

    it('should return 0 per-class rate when no completions', async () => {
      mockClassesFacade.findByYearGroup.mockResolvedValue([{ id: CLASS_ID, name: 'Class 5A' }]);
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          class_id: CLASS_ID,
          completions: [],
        },
      ]);

      const result = await service.yearGroupOverview(TENANT_ID, YEAR_GROUP_ID, emptyFilters);

      expect(result.classes[0]!.completion_rate).toBe(0);
    });

    it('edge: should re-throw on error', async () => {
      mockClassesFacade.findByYearGroup.mockResolvedValue([{ id: CLASS_ID, name: 'X' }]);
      mockPrisma.homeworkAssignment.findMany.mockRejectedValue(new Error('DB error'));

      await expect(
        service.yearGroupOverview(TENANT_ID, YEAR_GROUP_ID, emptyFilters),
      ).rejects.toThrow('DB error');
    });
  });
});
