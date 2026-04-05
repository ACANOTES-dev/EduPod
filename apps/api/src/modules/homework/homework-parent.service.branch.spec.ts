import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { HomeworkParentService } from './homework-parent.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const _STUDENT_ID_2 = 'dddddddd-dddd-dddd-dddd-ddddddddddde';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  homeworkAssignment: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  diaryParentNote: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockParentReadFacade = {
  findByUserId: jest.fn(),
  findLinkedStudentIds: jest.fn(),
  isLinkedToStudent: jest.fn(),
};

const mockStudentReadFacade = {
  findByIds: jest.fn(),
};

const mockClassesReadFacade = {
  findClassIdsForStudent: jest.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkParentService — branch coverage', () => {
  let service: HomeworkParentService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        HomeworkParentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ParentReadFacade, useValue: mockParentReadFacade },
        { provide: StudentReadFacade, useValue: mockStudentReadFacade },
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
      ],
    }).compile();

    service = module.get(HomeworkParentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── resolveParent (private, tested via public methods) ──────────────────

  describe('HomeworkParentService — listAll', () => {
    it('should throw when parent not found', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue(null);
      await expect(service.listAll(TENANT_ID, USER_ID, { page: 1, pageSize: 20 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty when no linked students', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([]);

      const result = await service.listAll(TENANT_ID, USER_ID, { page: 1, pageSize: 20 });
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should return empty when no active classes', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.listAll(TENANT_ID, USER_ID, { page: 1, pageSize: 20 });
      expect(result.data).toEqual([]);
    });

    it('should group assignments by student', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          title: 'Math HW',
          description: null,
          homework_type: 'written',
          due_date: new Date('2026-04-01'),
          due_time: null,
          max_points: null,
          subject: null,
          class_entity: { id: CLASS_ID, name: 'Class A' },
          completions: [
            {
              student_id: STUDENT_ID,
              status: 'completed',
              completed_at: new Date(),
              points_awarded: null,
            },
          ],
        },
      ]);
      mockPrisma.homeworkAssignment.count.mockResolvedValue(1);
      mockStudentReadFacade.findByIds.mockResolvedValue([
        { id: STUDENT_ID, first_name: 'Alice', last_name: 'Smith' },
      ]);

      const result = await service.listAll(TENANT_ID, USER_ID, { page: 1, pageSize: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.student.first_name).toBe('Alice');
      expect(result.data[0]!.assignments).toHaveLength(1);
    });
  });

  // ─── listToday ────────────────────────────────────────────────────────────

  describe('HomeworkParentService — listToday', () => {
    it('should return empty when no linked students', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([]);
      const result = await service.listToday(TENANT_ID, USER_ID);
      expect(result.data).toEqual([]);
    });

    it('should return empty when no active classes', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([]);
      const result = await service.listToday(TENANT_ID, USER_ID);
      expect(result.data).toEqual([]);
    });
  });

  // ─── listOverdue ──────────────────────────────────────────────────────────

  describe('HomeworkParentService — listOverdue', () => {
    it('should return empty when no linked students', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([]);
      const result = await service.listOverdue(TENANT_ID, USER_ID);
      expect(result.data).toEqual([]);
    });

    it('should return empty when no active classes', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([]);
      const result = await service.listOverdue(TENANT_ID, USER_ID);
      expect(result.data).toEqual([]);
    });

    it('should filter overdue by student and incomplete status', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          title: 'Overdue HW',
          description: null,
          homework_type: 'written',
          due_date: new Date('2026-01-01'),
          due_time: null,
          max_points: null,
          subject: null,
          class_entity: { id: CLASS_ID, name: 'Class A' },
          completions: [],
        },
      ]);
      mockStudentReadFacade.findByIds.mockResolvedValue([
        { id: STUDENT_ID, first_name: 'Alice', last_name: 'Smith' },
      ]);

      const result = await service.listOverdue(TENANT_ID, USER_ID);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.assignments).toHaveLength(1);
    });

    it('should exclude completed assignments from overdue', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          title: 'Done HW',
          description: null,
          homework_type: 'written',
          due_date: new Date('2026-01-01'),
          due_time: null,
          max_points: null,
          subject: null,
          class_entity: { id: CLASS_ID, name: 'Class A' },
          completions: [
            {
              student_id: STUDENT_ID,
              status: 'completed',
              completed_at: new Date(),
              points_awarded: null,
            },
          ],
        },
      ]);
      mockStudentReadFacade.findByIds.mockResolvedValue([
        { id: STUDENT_ID, first_name: 'Alice', last_name: 'Smith' },
      ]);

      const result = await service.listOverdue(TENANT_ID, USER_ID);
      expect(result.data).toEqual([]);
    });
  });

  // ─── listWeek ─────────────────────────────────────────────────────────────

  describe('HomeworkParentService — listWeek', () => {
    it('should return empty when no linked students', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([]);
      const result = await service.listWeek(TENANT_ID, USER_ID);
      expect(result.data).toEqual([]);
    });

    it('should return empty when no active classes', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.findLinkedStudentIds.mockResolvedValue([STUDENT_ID]);
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([]);
      const result = await service.listWeek(TENANT_ID, USER_ID);
      expect(result.data).toEqual([]);
    });
  });

  // ─── studentSummary ───────────────────────────────────────────────────────

  describe('HomeworkParentService — studentSummary', () => {
    it('should throw when student not linked', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.isLinkedToStudent.mockResolvedValue(false);
      await expect(service.studentSummary(TENANT_ID, USER_ID, STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return zero stats when no active classes', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.isLinkedToStudent.mockResolvedValue(true);
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.studentSummary(TENANT_ID, USER_ID, STUDENT_ID);
      expect(result.data.total_assigned).toBe(0);
      expect(result.data.completion_rate).toBe(0);
    });

    it('should compute summary stats correctly', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.isLinkedToStudent.mockResolvedValue(true);
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);
      const today = new Date();
      const pastDate = new Date('2026-01-01');
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        {
          id: 'hw-1',
          title: 'Completed',
          description: null,
          homework_type: 'written',
          due_date: pastDate,
          due_time: null,
          max_points: 10,
          subject: null,
          class_entity: { id: CLASS_ID, name: 'A' },
          completions: [{ status: 'completed', completed_at: new Date(), points_awarded: 8 }],
        },
        {
          id: 'hw-2',
          title: 'In Progress',
          description: null,
          homework_type: 'written',
          due_date: today,
          due_time: null,
          max_points: null,
          subject: null,
          class_entity: { id: CLASS_ID, name: 'A' },
          completions: [{ status: 'in_progress', completed_at: null, points_awarded: null }],
        },
        {
          id: 'hw-3',
          title: 'Overdue',
          description: null,
          homework_type: 'reading',
          due_date: pastDate,
          due_time: null,
          max_points: null,
          subject: null,
          class_entity: { id: CLASS_ID, name: 'A' },
          completions: [],
        },
      ]);

      const result = await service.studentSummary(TENANT_ID, USER_ID, STUDENT_ID);
      expect(result.data.total_assigned).toBe(3);
      expect(result.data.completed).toBe(1);
      expect(result.data.in_progress).toBe(1);
      expect(result.data.overdue).toBe(1);
      expect(result.data.completion_rate).toBe(33);
      expect(result.data.recent).toHaveLength(3);
    });
  });

  // ─── studentDiary ─────────────────────────────────────────────────────────

  describe('HomeworkParentService — studentDiary', () => {
    it('should throw when student not linked', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.isLinkedToStudent.mockResolvedValue(false);
      await expect(
        service.studentDiary(TENANT_ID, USER_ID, STUDENT_ID, { page: 1, pageSize: 20 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return paginated diary notes', async () => {
      mockParentReadFacade.findByUserId.mockResolvedValue({ id: PARENT_ID });
      mockParentReadFacade.isLinkedToStudent.mockResolvedValue(true);
      mockPrisma.diaryParentNote.findMany.mockResolvedValue([]);
      mockPrisma.diaryParentNote.count.mockResolvedValue(0);

      const result = await service.studentDiary(TENANT_ID, USER_ID, STUDENT_ID, {
        page: 1,
        pageSize: 20,
      });
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });
});
