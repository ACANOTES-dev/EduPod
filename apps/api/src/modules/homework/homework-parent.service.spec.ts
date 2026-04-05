import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ParentReadFacade,
  ClassesReadFacade,
  StudentReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { HomeworkParentService } from './homework-parent.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    parent: { findFirst: jest.fn() },
    studentParent: { findFirst: jest.fn(), findMany: jest.fn() },
    classEnrolment: { findMany: jest.fn() },
    homeworkAssignment: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    homeworkCompletion: { findMany: jest.fn(), count: jest.fn() },
    diaryParentNote: { findMany: jest.fn(), count: jest.fn() },
    student: { findMany: jest.fn() },
  };
}

const parentRecord = { id: PARENT_ID, tenant_id: TENANT_ID, user_id: USER_ID };

const studentNames = [{ id: STUDENT_ID, first_name: 'Ali', last_name: 'Ahmed' }];

/** Set up facade + prisma mocks for tests requiring a resolved parent + linked students. */
function mockBaseSetupFacades(
  pFacade: { findByUserId: jest.Mock; findLinkedStudentIds: jest.Mock },
  cFacade: { findClassIdsForStudent: jest.Mock },
  sFacade: { findByIds: jest.Mock },
) {
  pFacade.findByUserId.mockResolvedValue(parentRecord);
  pFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
  cFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);
  sFacade.findByIds.mockResolvedValue(studentNames);
}

function buildAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hw-1',
    title: 'Math Homework',
    description: 'Solve page 10',
    homework_type: 'assignment',
    due_date: new Date('2026-03-30'),
    due_time: null,
    max_points: 100,
    subject: { id: 'sub-1', name: 'Mathematics' },
    class_entity: { id: CLASS_ID, name: 'Class 5A' },
    completions: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkParentService', () => {
  let module: TestingModule;
  let service: HomeworkParentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockParentFacade: {
    findByUserId: jest.Mock;
    findLinkedStudentIds: jest.Mock;
    isLinkedToStudent: jest.Mock;
  };
  let mockClassesFacade: { findClassIdsForStudent: jest.Mock };
  let mockStudentFacade: { findByIds: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockParentFacade = {
      findByUserId: jest.fn().mockResolvedValue(null),
      findLinkedStudentIds: jest.fn().mockResolvedValue([]),
      isLinkedToStudent: jest.fn().mockResolvedValue(false),
    };
    mockClassesFacade = {
      findClassIdsForStudent: jest.fn().mockResolvedValue([]),
    };
    mockStudentFacade = {
      findByIds: jest.fn().mockResolvedValue([]),
    };

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkParentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ParentReadFacade, useValue: mockParentFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    service = module.get(HomeworkParentService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  // ─── resolveParent ──────────────────────────────────────────────────────

  describe('HomeworkParentService — resolveParent (via listAll)', () => {
    it('should throw NotFoundException when no parent record exists', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(null);

      await expect(service.listAll(TENANT_ID, USER_ID, { page: 1, pageSize: 20 })).rejects.toThrow(
        NotFoundException,
      );

      expect(mockParentFacade.findByUserId).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });
  });

  // ─── listAll ──────────────────────────────────────────────────────────────

  describe('HomeworkParentService — listAll', () => {
    it('should return grouped homework for linked students', async () => {
      mockBaseSetupFacades(mockParentFacade, mockClassesFacade, mockStudentFacade);

      const assignment = buildAssignment({
        completions: [
          {
            student_id: STUDENT_ID,
            status: 'completed',
            completed_at: new Date(),
            points_awarded: 90,
          },
        ],
      });

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([assignment]);
      mockPrisma.homeworkAssignment.count.mockResolvedValue(1);

      const result = await service.listAll(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.student.id).toBe(STUDENT_ID);
      expect(result.data[0]!.assignments).toHaveLength(1);
      expect(result.data[0]!.assignments[0]!.completion).toEqual(
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('should return empty when no linked students', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.findLinkedStudentIds.mockResolvedValue([]);

      const result = await service.listAll(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should return empty when students have no active class enrolments', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.listAll(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── listToday ────────────────────────────────────────────────────────────

  describe('HomeworkParentService — listToday', () => {
    it('should return today homework grouped by student', async () => {
      mockBaseSetupFacades(mockParentFacade, mockClassesFacade, mockStudentFacade);

      const assignment = buildAssignment();
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([assignment]);

      const result = await service.listToday(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.student.id).toBe(STUDENT_ID);
      expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'published',
            due_date: expect.any(Date),
          }),
        }),
      );
    });

    it('should return empty data when no linked students', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.findLinkedStudentIds.mockResolvedValue([]);

      const result = await service.listToday(TENANT_ID, USER_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── listOverdue ──────────────────────────────────────────────────────────

  describe('HomeworkParentService — listOverdue', () => {
    it('should return overdue incomplete homework for linked students', async () => {
      mockBaseSetupFacades(mockParentFacade, mockClassesFacade, mockStudentFacade);

      const overdueAssignment = buildAssignment({
        due_date: new Date('2026-03-01'),
        completions: [
          {
            student_id: STUDENT_ID,
            status: 'pending',
            completed_at: null,
            points_awarded: null,
          },
        ],
      });

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([overdueAssignment]);

      const result = await service.listOverdue(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.student.id).toBe(STUDENT_ID);
      expect(result.data[0]!.assignments).toHaveLength(1);
    });

    it('should exclude assignments where student has completed', async () => {
      mockBaseSetupFacades(mockParentFacade, mockClassesFacade, mockStudentFacade);

      const completedAssignment = buildAssignment({
        due_date: new Date('2026-03-01'),
        completions: [
          {
            student_id: STUDENT_ID,
            status: 'completed',
            completed_at: new Date(),
            points_awarded: 80,
          },
        ],
      });

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([completedAssignment]);

      const result = await service.listOverdue(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(0);
    });

    it('should return empty data when no linked students', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.findLinkedStudentIds.mockResolvedValue([]);

      const result = await service.listOverdue(TENANT_ID, USER_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── listWeek ─────────────────────────────────────────────────────────────

  describe('HomeworkParentService — listWeek', () => {
    it('should return weekly homework grouped by day and student', async () => {
      mockBaseSetupFacades(mockParentFacade, mockClassesFacade, mockStudentFacade);

      const assignment = buildAssignment({
        due_date: new Date('2026-03-30'),
      });
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([assignment]);

      const result = await service.listWeek(TENANT_ID, USER_ID);

      expect(result.data).toBeInstanceOf(Array);
      expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'published',
            due_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should return empty data when no linked students', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.findLinkedStudentIds.mockResolvedValue([]);

      const result = await service.listWeek(TENANT_ID, USER_ID);

      expect(result.data).toEqual([]);
    });

    it('should return empty data when students have no active classes', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.listWeek(TENANT_ID, USER_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── studentSummary ───────────────────────────────────────────────────────

  describe('HomeworkParentService — studentSummary', () => {
    it('should return summary counts and completion rate for a linked student', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(true);
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);

      const completedAssignment = buildAssignment({
        completions: [{ status: 'completed', completed_at: new Date(), points_awarded: 95 }],
      });
      const pendingAssignment = buildAssignment({
        id: 'hw-2',
        title: 'Science Homework',
        due_date: new Date('2026-04-05'),
        completions: [],
      });

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        completedAssignment,
        pendingAssignment,
      ]);

      const result = await service.studentSummary(TENANT_ID, USER_ID, STUDENT_ID);

      expect(result.data.total_assigned).toBe(2);
      expect(result.data.completed).toBe(1);
      expect(result.data.completion_rate).toBe(50);
      expect(result.data.recent).toHaveLength(2);
    });

    it('should return zero stats when student has no active classes', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(true);
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.studentSummary(TENANT_ID, USER_ID, STUDENT_ID);

      expect(result.data.total_assigned).toBe(0);
      expect(result.data.completed).toBe(0);
      expect(result.data.completion_rate).toBe(0);
    });

    it('should throw NotFoundException when student is not linked to parent', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(false);

      await expect(service.studentSummary(TENANT_ID, USER_ID, STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── studentDiary ─────────────────────────────────────────────────────────

  describe('HomeworkParentService — studentDiary', () => {
    it('should return paginated diary notes for a linked student', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(true);

      const notes = [
        {
          id: 'note-1',
          note_date: new Date('2026-03-30'),
          content: 'Great day',
          acknowledged: false,
          acknowledged_at: null,
          created_at: new Date(),
          author: { id: 'staff-1', first_name: 'Teacher', last_name: 'One' },
        },
      ];

      mockPrisma.diaryParentNote.findMany.mockResolvedValue(notes);
      mockPrisma.diaryParentNote.count.mockResolvedValue(1);

      const result = await service.studentDiary(TENANT_ID, USER_ID, STUDENT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.content).toBe('Great day');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should throw NotFoundException when student is not linked to parent', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(false);

      await expect(
        service.studentDiary(TENANT_ID, USER_ID, STUDENT_ID, {
          page: 1,
          pageSize: 20,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use correct skip/take for pagination', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(true);
      mockPrisma.diaryParentNote.findMany.mockResolvedValue([]);
      mockPrisma.diaryParentNote.count.mockResolvedValue(0);

      await service.studentDiary(TENANT_ID, USER_ID, STUDENT_ID, {
        page: 3,
        pageSize: 10,
      });

      expect(mockPrisma.diaryParentNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });
  });

  // ─── listToday — empty classIds ───────────────────────────────────────

  describe('HomeworkParentService — listToday — empty classIds', () => {
    it('should return empty data when students have no active classes', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.listToday(TENANT_ID, USER_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── listOverdue — empty classIds ─────────────────────────────────────

  describe('HomeworkParentService — listOverdue — empty classIds', () => {
    it('should return empty data when students have no active classes', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.listOverdue(TENANT_ID, USER_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── listWeek — student not enrolled in assignment class ──────────────

  describe('HomeworkParentService — listWeek — class scope', () => {
    it('should skip assignments for classes the student is not enrolled in', async () => {
      mockBaseSetupFacades(mockParentFacade, mockClassesFacade, mockStudentFacade);

      // Assignment belongs to a different class than the student is enrolled in
      const assignment = buildAssignment({
        class_entity: { id: 'other-class-id', name: 'Not Enrolled Class' },
        due_date: new Date(),
      });
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([assignment]);

      const result = await service.listWeek(TENANT_ID, USER_ID);

      // The day entry should exist but the student should have no assignments
      // (or student not appear in that day at all)
      for (const dayEntry of result.data) {
        for (const studentEntry of (dayEntry as { students: Array<{ assignments: unknown[] }> })
          .students) {
          expect(studentEntry.assignments).toHaveLength(0);
        }
      }
    });
  });

  // ─── listOverdue — with no completion record → treated as overdue ─────

  describe('HomeworkParentService — listOverdue — no completion', () => {
    it('should include assignment when student has no completion record at all', async () => {
      mockBaseSetupFacades(mockParentFacade, mockClassesFacade, mockStudentFacade);

      const overdueAssignment = buildAssignment({
        due_date: new Date('2026-03-01'),
        completions: [], // no completion at all
      });

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([overdueAssignment]);

      const result = await service.listOverdue(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.assignments).toHaveLength(1);
      expect(result.data[0]!.assignments[0]!.completion).toBeNull();
    });
  });

  // ─── studentSummary — in_progress and overdue statuses ────────────────

  describe('HomeworkParentService — studentSummary — status branches', () => {
    it('should count in_progress and overdue statuses correctly', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(true);
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);

      const inProgressAssignment = buildAssignment({
        id: 'hw-1',
        due_date: new Date('2026-04-10'),
        completions: [{ status: 'in_progress', completed_at: null, points_awarded: null }],
      });
      const overdueAssignment = buildAssignment({
        id: 'hw-2',
        due_date: new Date('2026-03-01'), // past due
        completions: [], // no completion
      });
      const completedAssignment = buildAssignment({
        id: 'hw-3',
        due_date: new Date('2026-04-01'),
        completions: [{ status: 'completed', completed_at: new Date(), points_awarded: 90 }],
      });

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        inProgressAssignment,
        overdueAssignment,
        completedAssignment,
      ]);

      const result = await service.studentSummary(TENANT_ID, USER_ID, STUDENT_ID);

      expect(result.data.total_assigned).toBe(3);
      expect(result.data.completed).toBe(1);
      expect(result.data.in_progress).toBe(1);
      expect(result.data.overdue).toBe(1);
      expect(result.data.completion_rate).toBe(33);
    });

    it('should return recent assignments with null completion when no completions exist', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(true);
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);

      const noCompletionAssignment = buildAssignment({
        id: 'hw-1',
        due_date: new Date('2026-04-10'),
        completions: [],
      });

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([noCompletionAssignment]);

      const result = await service.studentSummary(TENANT_ID, USER_ID, STUDENT_ID);

      expect(result.data.recent).toHaveLength(1);
      expect(result.data.recent[0]!.completion).toBeNull();
    });
  });

  // ─── listAll — multiple students with different class scoping ─────────

  describe('HomeworkParentService — listAll — multi-student class scoping', () => {
    it('should scope assignments per student by their class enrolments', async () => {
      const STUDENT_ID_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccd';
      const CLASS_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef';

      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID, STUDENT_ID_2]);
      mockClassesFacade.findClassIdsForStudent
        .mockResolvedValueOnce([CLASS_ID]) // first student
        .mockResolvedValueOnce([CLASS_ID_2]) // second student
        .mockResolvedValueOnce([CLASS_ID]) // getStudentClassMap first
        .mockResolvedValueOnce([CLASS_ID_2]); // getStudentClassMap second
      mockStudentFacade.findByIds.mockResolvedValue([
        { id: STUDENT_ID, first_name: 'Ali', last_name: 'Ahmed' },
        { id: STUDENT_ID_2, first_name: 'Sara', last_name: 'Khan' },
      ]);

      const assignment1 = buildAssignment({
        id: 'hw-1',
        class_entity: { id: CLASS_ID, name: 'Class 5A' },
        completions: [],
      });
      const assignment2 = buildAssignment({
        id: 'hw-2',
        class_entity: { id: CLASS_ID_2, name: 'Class 6B' },
        completions: [],
      });

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([assignment1, assignment2]);
      mockPrisma.homeworkAssignment.count.mockResolvedValue(2);

      const result = await service.listAll(TENANT_ID, USER_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      // First student only sees assignment1 (CLASS_ID)
      const aliEntry = result.data.find((d) => d.student.first_name === 'Ali');
      expect(aliEntry).toBeDefined();
      expect(aliEntry!.assignments).toHaveLength(1);
      expect(aliEntry!.assignments[0]!.id).toBe('hw-1');

      // Second student only sees assignment2 (CLASS_ID_2)
      const saraEntry = result.data.find((d) => d.student.first_name === 'Sara');
      expect(saraEntry).toBeDefined();
      expect(saraEntry!.assignments).toHaveLength(1);
      expect(saraEntry!.assignments[0]!.id).toBe('hw-2');
    });
  });
});
