import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ParentReadFacade, ClassesReadFacade, StudentReadFacade } from '../../common/tests/mock-facades';
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

const studentNames = [
  { id: STUDENT_ID, first_name: 'Ali', last_name: 'Ahmed' },
];

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

      await expect(
        service.listAll(TENANT_ID, USER_ID, { page: 1, pageSize: 20 }),
      ).rejects.toThrow(NotFoundException);

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
      mockPrisma.studentParent.findMany.mockResolvedValue([
        { student_id: STUDENT_ID },
      ]);
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

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        overdueAssignment,
      ]);

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

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        completedAssignment,
      ]);

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
      mockPrisma.studentParent.findMany.mockResolvedValue([
        { student_id: STUDENT_ID },
      ]);
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
        completions: [
          { status: 'completed', completed_at: new Date(), points_awarded: 95 },
        ],
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

      const result = await service.studentSummary(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
      );

      expect(result.data.total_assigned).toBe(2);
      expect(result.data.completed).toBe(1);
      expect(result.data.completion_rate).toBe(50);
      expect(result.data.recent).toHaveLength(2);
    });

    it('should return zero stats when student has no active classes', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(true);
      mockClassesFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.studentSummary(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
      );

      expect(result.data.total_assigned).toBe(0);
      expect(result.data.completed).toBe(0);
      expect(result.data.completion_rate).toBe(0);
    });

    it('should throw NotFoundException when student is not linked to parent', async () => {
      mockParentFacade.findByUserId.mockResolvedValue(parentRecord);
      mockParentFacade.isLinkedToStudent.mockResolvedValue(false);

      await expect(
        service.studentSummary(TENANT_ID, USER_ID, STUDENT_ID),
      ).rejects.toThrow(NotFoundException);
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
});
