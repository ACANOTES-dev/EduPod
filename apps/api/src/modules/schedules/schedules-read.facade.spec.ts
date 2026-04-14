import { Test, TestingModule } from '@nestjs/testing';
import { $Enums } from '@prisma/client';

import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingReadFacade } from '../scheduling/scheduling-read.facade';

import { SchedulesReadFacade } from './schedules-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCHEDULE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const AY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STAFF_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ROOM_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CLASS_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const STUDENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function buildCoreRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SCHEDULE_ID,
    class_id: CLASS_ID,
    academic_year_id: AY_ID,
    room_id: ROOM_ID,
    teacher_staff_id: STAFF_ID,
    weekday: 1,
    period_order: 1,
    start_time: new Date('1970-01-01T08:00:00.000Z'),
    end_time: new Date('1970-01-01T09:00:00.000Z'),
    effective_start_date: new Date('2025-09-01'),
    effective_end_date: null,
    is_pinned: false,
    source: 'manual',
    rotation_week: null,
    ...overrides,
  };
}

describe('SchedulesReadFacade', () => {
  let facade: SchedulesReadFacade;
  let mockPrisma: {
    schedule: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
  };
  let mockSchedulingFacade: { findTeacherCompetencies: jest.Mock };
  let mockGradebookFacade: { findClassSubjectConfigs: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    mockSchedulingFacade = {
      findTeacherCompetencies: jest.fn().mockResolvedValue([]),
    };
    mockGradebookFacade = {
      findClassSubjectConfigs: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchedulingReadFacade, useValue: mockSchedulingFacade },
        { provide: GradebookReadFacade, useValue: mockGradebookFacade },
      ],
    }).compile();

    facade = module.get<SchedulesReadFacade>(SchedulesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findById ───────────────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findById', () => {
    it('should return schedule with class/subject details when found', async () => {
      const row = {
        ...buildCoreRow(),
        class_entity: {
          name: 'Y1A Math',
          year_group_id: 'yg-1',
          subject_id: 'sub-1',
          subject: { name: 'Mathematics' },
        },
        room: { name: 'Room 101' },
        teacher: { user: { first_name: 'John', last_name: 'Doe' } },
      };
      mockPrisma.schedule.findFirst.mockResolvedValue(row);

      const result = await facade.findById(TENANT_ID, SCHEDULE_ID);

      expect(result).toEqual(row);
      expect(mockPrisma.schedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SCHEDULE_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should return null when schedule not found', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      const result = await facade.findById(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── findCoreById ──────────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findCoreById', () => {
    it('should return core row when found', async () => {
      const row = buildCoreRow();
      mockPrisma.schedule.findFirst.mockResolvedValue(row);

      const result = await facade.findCoreById(TENANT_ID, SCHEDULE_ID);

      expect(result).toEqual(row);
    });

    it('should return null when not found', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      const result = await facade.findCoreById(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── existsById ────────────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- existsById', () => {
    it('should return id when schedule exists', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: SCHEDULE_ID });

      const result = await facade.existsById(TENANT_ID, SCHEDULE_ID);

      expect(result).toEqual({ id: SCHEDULE_ID });
    });

    it('should return null when schedule does not exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      const result = await facade.existsById(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── findBusyTeacherIds ────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findBusyTeacherIds', () => {
    it('should return set of busy teacher IDs', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        { teacher_staff_id: 'teacher-1' },
        { teacher_staff_id: 'teacher-2' },
        { teacher_staff_id: 'teacher-1' }, // duplicate
      ]);

      const result = await facade.findBusyTeacherIds(TENANT_ID, {
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
      });

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      expect(result.has('teacher-1')).toBe(true);
      expect(result.has('teacher-2')).toBe(true);
    });

    it('should filter null teacher IDs', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        { teacher_staff_id: null },
        { teacher_staff_id: 'teacher-1' },
      ]);

      const result = await facade.findBusyTeacherIds(TENANT_ID, {
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
      });

      expect(result.size).toBe(1);
      expect(result.has('teacher-1')).toBe(true);
    });

    it('should use effectiveAt filter when effectiveDate provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      const specificDate = new Date('2025-10-15');

      await facade.findBusyTeacherIds(TENANT_ID, {
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
        effectiveDate: specificDate,
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.effective_start_date).toEqual({ lte: specificDate });
    });

    it('should use effectiveNow filter when no effectiveDate provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findBusyTeacherIds(TENANT_ID, {
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      // effectiveNow adds OR clause but not effective_start_date
      expect(callArgs.where.OR).toBeDefined();
    });

    it('should filter by academicYearId when provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findBusyTeacherIds(TENANT_ID, {
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
        academicYearId: AY_ID,
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.academic_year_id).toBe(AY_ID);
    });

    it('should return empty set when no schedules found', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await facade.findBusyTeacherIds(TENANT_ID, {
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
      });

      expect(result.size).toBe(0);
    });
  });

  // ─── countWeeklyPeriodsPerTeacher ──────────────────────────────────────────

  describe('SchedulesReadFacade -- countWeeklyPeriodsPerTeacher', () => {
    it('should aggregate period counts per teacher', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        { teacher_staff_id: 'teacher-1' },
        { teacher_staff_id: 'teacher-1' },
        { teacher_staff_id: 'teacher-2' },
      ]);

      const result = await facade.countWeeklyPeriodsPerTeacher(TENANT_ID, AY_ID);

      expect(result).toBeInstanceOf(Map);
      expect(result.get('teacher-1')).toBe(2);
      expect(result.get('teacher-2')).toBe(1);
    });

    it('should skip null teacher_staff_id entries', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        { teacher_staff_id: null },
        { teacher_staff_id: 'teacher-1' },
      ]);

      const result = await facade.countWeeklyPeriodsPerTeacher(TENANT_ID, AY_ID);

      expect(result.size).toBe(1);
    });

    it('should return empty map when no schedules', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await facade.countWeeklyPeriodsPerTeacher(TENANT_ID, AY_ID);

      expect(result.size).toBe(0);
    });
  });

  // ─── findTeacherTimetable ──────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findTeacherTimetable', () => {
    it('should query schedules for a teacher at a specific date', async () => {
      const asOfDate = new Date('2025-10-15');
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findTeacherTimetable(TENANT_ID, STAFF_ID, { asOfDate });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.tenant_id).toBe(TENANT_ID);
      expect(callArgs.where.teacher_staff_id).toBe(STAFF_ID);
      expect(callArgs.where.effective_start_date).toEqual({ lte: asOfDate });
    });

    it('should filter by rotation_week when provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findTeacherTimetable(TENANT_ID, STAFF_ID, {
        asOfDate: new Date(),
        rotationWeek: 2,
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.rotation_week).toBe(2);
    });

    it('should not include rotation_week filter when not provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findTeacherTimetable(TENANT_ID, STAFF_ID, {
        asOfDate: new Date(),
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.rotation_week).toBeUndefined();
    });
  });

  // ─── findClassTimetable ────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findClassTimetable', () => {
    it('should query schedules for a class at a specific date', async () => {
      const asOfDate = new Date('2025-10-15');
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findClassTimetable(TENANT_ID, CLASS_ID, { asOfDate });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.class_id).toBe(CLASS_ID);
      expect(callArgs.where.effective_start_date).toEqual({ lte: asOfDate });
    });

    it('should filter by rotation_week when provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findClassTimetable(TENANT_ID, CLASS_ID, {
        asOfDate: new Date(),
        rotationWeek: 1,
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.rotation_week).toBe(1);
    });

    it('should not include rotation_week filter when not provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findClassTimetable(TENANT_ID, CLASS_ID, {
        asOfDate: new Date(),
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.rotation_week).toBeUndefined();
    });
  });

  // ─── findPinnedEntries ─────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findPinnedEntries', () => {
    it('should query pinned entries for an academic year', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findPinnedEntries(TENANT_ID, AY_ID);

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.is_pinned).toBe(true);
      expect(callArgs.where.academic_year_id).toBe(AY_ID);
    });
  });

  // ─── countPinnedEntries ────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- countPinnedEntries', () => {
    it('should count pinned entries', async () => {
      mockPrisma.schedule.count.mockResolvedValue(5);

      const result = await facade.countPinnedEntries(TENANT_ID, AY_ID);

      expect(result).toBe(5);
      const callArgs = mockPrisma.schedule.count.mock.calls[0][0];
      expect(callArgs.where.is_pinned).toBe(true);
    });
  });

  // ─── findByAcademicYear ────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findByAcademicYear', () => {
    it('should find entries for academic year without opts', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([buildCoreRow()]);

      const result = await facade.findByAcademicYear(TENANT_ID, AY_ID);

      expect(result).toHaveLength(1);
      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.academic_year_id).toBe(AY_ID);
    });

    it('should filter by teacherAssigned when opts.teacherAssigned is true', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByAcademicYear(TENANT_ID, AY_ID, { teacherAssigned: true });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.teacher_staff_id).toEqual({ not: null });
    });

    it('should filter by roomAssigned when opts.roomAssigned is true', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByAcademicYear(TENANT_ID, AY_ID, { roomAssigned: true });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.room_id).toEqual({ not: null });
    });

    it('should filter by source when opts.source is provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByAcademicYear(TENANT_ID, AY_ID, {
        source: 'manual' as $Enums.ScheduleSource,
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.source).toBe('manual');
    });

    it('should not add optional filters when opts are falsy', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByAcademicYear(TENANT_ID, AY_ID, {
        teacherAssigned: false,
        roomAssigned: false,
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.teacher_staff_id).toBeUndefined();
      expect(callArgs.where.room_id).toBeUndefined();
    });
  });

  // ─── findScheduledClassIds ─────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findScheduledClassIds', () => {
    it('should return distinct class IDs from groupBy', async () => {
      mockPrisma.schedule.groupBy.mockResolvedValue([
        { class_id: 'class-1' },
        { class_id: 'class-2' },
      ]);

      const result = await facade.findScheduledClassIds(TENANT_ID, AY_ID);

      expect(result).toEqual(['class-1', 'class-2']);
    });

    it('should filter by source when provided', async () => {
      mockPrisma.schedule.groupBy.mockResolvedValue([]);

      await facade.findScheduledClassIds(TENANT_ID, AY_ID, {
        source: 'pinned' as $Enums.ScheduleSource,
      });

      const callArgs = mockPrisma.schedule.groupBy.mock.calls[0][0];
      expect(callArgs.where.source).toBe('pinned');
    });

    it('should not filter by source when not provided', async () => {
      mockPrisma.schedule.groupBy.mockResolvedValue([]);

      await facade.findScheduledClassIds(TENANT_ID, AY_ID);

      const callArgs = mockPrisma.schedule.groupBy.mock.calls[0][0];
      expect(callArgs.where.source).toBeUndefined();
    });

    it('should return empty array when no groups', async () => {
      mockPrisma.schedule.groupBy.mockResolvedValue([]);

      const result = await facade.findScheduledClassIds(TENANT_ID, AY_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── countEntriesPerClass ──────────────────────────────────────────────────

  describe('SchedulesReadFacade -- countEntriesPerClass', () => {
    it('should aggregate counts per class', async () => {
      mockPrisma.schedule.groupBy.mockResolvedValue([
        { class_id: 'class-1', _count: 3 },
        { class_id: 'class-2', _count: 5 },
      ]);

      const result = await facade.countEntriesPerClass(TENANT_ID, AY_ID);

      expect(result).toBeInstanceOf(Map);
      expect(result.get('class-1')).toBe(3);
      expect(result.get('class-2')).toBe(5);
    });

    it('should return empty map when no groups', async () => {
      mockPrisma.schedule.groupBy.mockResolvedValue([]);

      const result = await facade.countEntriesPerClass(TENANT_ID, AY_ID);

      expect(result.size).toBe(0);
    });
  });

  // ─── count ─────────────────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- count', () => {
    it('should count with additional where clause', async () => {
      mockPrisma.schedule.count.mockResolvedValue(10);

      const result = await facade.count(TENANT_ID, { weekday: 1 });

      expect(result).toBe(10);
      const callArgs = mockPrisma.schedule.count.mock.calls[0][0];
      expect(callArgs.where.tenant_id).toBe(TENANT_ID);
      expect(callArgs.where.weekday).toBe(1);
    });

    it('should count with tenant_id only when no extra where', async () => {
      mockPrisma.schedule.count.mockResolvedValue(42);

      const result = await facade.count(TENANT_ID);

      expect(result).toBe(42);
    });
  });

  // ─── findByWeekdayInDateRange ──────────────────────────────────────────────

  describe('SchedulesReadFacade -- findByWeekdayInDateRange', () => {
    it('should query schedules by date range', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([buildCoreRow()]);
      const dateFrom = new Date('2025-09-01');
      const dateTo = new Date('2025-12-31');

      const result = await facade.findByWeekdayInDateRange(TENANT_ID, {
        dateFrom,
        dateTo,
      });

      expect(result).toHaveLength(1);
      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.effective_start_date).toEqual({ lte: dateTo });
    });

    it('should filter by weekday when provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByWeekdayInDateRange(TENANT_ID, {
        weekday: 3,
        dateFrom: new Date('2025-09-01'),
        dateTo: new Date('2025-12-31'),
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.weekday).toBe(3);
    });

    it('should not filter by weekday when not provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByWeekdayInDateRange(TENANT_ID, {
        dateFrom: new Date('2025-09-01'),
        dateTo: new Date('2025-12-31'),
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.weekday).toBeUndefined();
    });

    it('should filter by classIds when provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByWeekdayInDateRange(TENANT_ID, {
        dateFrom: new Date('2025-09-01'),
        dateTo: new Date('2025-12-31'),
        classIds: ['class-1', 'class-2'],
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.class_id).toEqual({ in: ['class-1', 'class-2'] });
    });

    it('should not filter by classIds when not provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByWeekdayInDateRange(TENANT_ID, {
        dateFrom: new Date('2025-09-01'),
        dateTo: new Date('2025-12-31'),
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.class_id).toBeUndefined();
    });
  });

  // ─── findByStudentWeekday ──────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findByStudentWeekday', () => {
    it('should query schedules by student and weekday', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByStudentWeekday(TENANT_ID, STUDENT_ID, 1);

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.tenant_id).toBe(TENANT_ID);
      expect(callArgs.where.weekday).toBe(1);
      expect(callArgs.where.class_entity.class_enrolments.some.student_id).toBe(STUDENT_ID);
    });
  });

  // ─── hasRotationEntries ────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- hasRotationEntries', () => {
    it('should return true when rotation entries exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: SCHEDULE_ID });

      const result = await facade.hasRotationEntries(TENANT_ID, AY_ID);

      expect(result).toBe(true);
    });

    it('should return false when no rotation entries exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      const result = await facade.hasRotationEntries(TENANT_ID, AY_ID);

      expect(result).toBe(false);
    });
  });

  // ─── countByRoom ───────────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- countByRoom', () => {
    it('should count schedules referencing a room', async () => {
      mockPrisma.schedule.count.mockResolvedValue(3);

      const result = await facade.countByRoom(TENANT_ID, ROOM_ID);

      expect(result).toBe(3);
      const callArgs = mockPrisma.schedule.count.mock.calls[0][0];
      expect(callArgs.where.room_id).toBe(ROOM_ID);
    });
  });

  // ─── findTeachingLoadEntries ───────────────────────────────────────────────

  describe('SchedulesReadFacade -- findTeachingLoadEntries', () => {
    it('should query teaching load entries', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findTeachingLoadEntries(TENANT_ID, AY_ID);

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.teacher_staff_id).toEqual({ not: null });
      expect(callArgs.where.academic_year_id).toBe(AY_ID);
    });
  });

  // ─── findTeacherScheduleEntries ────────────────────────────────────────────

  describe('SchedulesReadFacade -- findTeacherScheduleEntries', () => {
    it('should query teacher schedule entries', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        { teacher_staff_id: STAFF_ID, weekday: 1, period_order: 1 },
      ]);

      const result = await facade.findTeacherScheduleEntries(TENANT_ID, AY_ID);

      expect(result).toHaveLength(1);
    });
  });

  // ─── findTeacherWorkloadEntries ────────────────────────────────────────────

  describe('SchedulesReadFacade -- findTeacherWorkloadEntries', () => {
    it('should query teacher workload entries with user details', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          teacher_staff_id: STAFF_ID,
          teacher: { id: STAFF_ID, user: { first_name: 'John', last_name: 'Doe' } },
        },
      ]);

      const result = await facade.findTeacherWorkloadEntries(TENANT_ID, AY_ID);

      expect(result).toHaveLength(1);
    });
  });

  // ─── countRoomAssignedEntries ──────────────────────────────────────────────

  describe('SchedulesReadFacade -- countRoomAssignedEntries', () => {
    it('should count room-assigned entries', async () => {
      mockPrisma.schedule.count.mockResolvedValue(15);

      const result = await facade.countRoomAssignedEntries(TENANT_ID, AY_ID);

      expect(result).toBe(15);
      const callArgs = mockPrisma.schedule.count.mock.calls[0][0];
      expect(callArgs.where.room_id).toEqual({ not: null });
    });
  });

  // ─── findByIdWithSwapContext ───────────────────────────────────────────────

  describe('SchedulesReadFacade -- findByIdWithSwapContext', () => {
    it('should return schedule with swap context when found', async () => {
      const row = {
        id: SCHEDULE_ID,
        teacher_staff_id: STAFF_ID,
        room_id: ROOM_ID,
        weekday: 1,
        period_order: 1,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T09:00:00.000Z'),
        rotation_week: null,
        class_entity: { name: 'Y1A', year_group_id: 'yg-1', subject_id: 'sub-1' },
        teacher: { id: STAFF_ID, user: { first_name: 'John', last_name: 'Doe' } },
        room: { id: ROOM_ID, name: 'Room 101' },
      };
      mockPrisma.schedule.findFirst.mockResolvedValue(row);

      const result = await facade.findByIdWithSwapContext(TENANT_ID, SCHEDULE_ID);

      expect(result).toEqual(row);
    });

    it('should return null when not found', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      const result = await facade.findByIdWithSwapContext(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── hasConflict ───────────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- hasConflict', () => {
    it('should return false when neither teacherStaffId nor roomId provided', async () => {
      const result = await facade.hasConflict(TENANT_ID, {
        excludeIds: [],
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
      });

      expect(result).toBe(false);
      expect(mockPrisma.schedule.findFirst).not.toHaveBeenCalled();
    });

    it('should return true when a conflicting schedule is found for teacher', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: 'conflicting' });

      const result = await facade.hasConflict(TENANT_ID, {
        excludeIds: [SCHEDULE_ID],
        teacherStaffId: STAFF_ID,
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
      });

      expect(result).toBe(true);
      const callArgs = mockPrisma.schedule.findFirst.mock.calls[0][0];
      expect(callArgs.where.teacher_staff_id).toBe(STAFF_ID);
    });

    it('should return true when a conflicting schedule is found for room', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: 'conflicting' });

      const result = await facade.hasConflict(TENANT_ID, {
        excludeIds: [SCHEDULE_ID],
        roomId: ROOM_ID,
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
      });

      expect(result).toBe(true);
      const callArgs = mockPrisma.schedule.findFirst.mock.calls[0][0];
      expect(callArgs.where.room_id).toBe(ROOM_ID);
    });

    it('should return false when no conflicting schedule found', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      const result = await facade.hasConflict(TENANT_ID, {
        excludeIds: [],
        teacherStaffId: STAFF_ID,
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
      });

      expect(result).toBe(false);
    });

    it('should exclude specified IDs from query', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await facade.hasConflict(TENANT_ID, {
        excludeIds: ['id-1', 'id-2'],
        teacherStaffId: STAFF_ID,
        weekday: 1,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'),
      });

      const callArgs = mockPrisma.schedule.findFirst.mock.calls[0][0];
      expect(callArgs.where.id).toEqual({ notIn: ['id-1', 'id-2'] });
    });
  });

  // ─── findByIdWithSubstitutionContext ───────────────────────────────────────

  describe('SchedulesReadFacade -- findByIdWithSubstitutionContext', () => {
    it('should return schedule with substitution context', async () => {
      const row = {
        id: SCHEDULE_ID,
        teacher_staff_id: STAFF_ID,
        academic_year_id: AY_ID,
        weekday: 1,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T09:00:00.000Z'),
        class_entity: {
          name: 'Y1A',
          year_group_id: 'yg-1',
          subject_id: 'sub-1',
          academic_year_id: AY_ID,
          subject: { name: 'Mathematics' },
          year_group: { name: 'Year 1' },
        },
        room: { name: 'Room 101' },
      };
      mockPrisma.schedule.findFirst.mockResolvedValue(row);

      const result = await facade.findByIdWithSubstitutionContext(TENANT_ID, SCHEDULE_ID);

      expect(result).toEqual(row);
    });

    it('should return null when not found', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      const result = await facade.findByIdWithSubstitutionContext(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── findRoomScheduleEntries ───────────────────────────────────────────────

  describe('SchedulesReadFacade -- findRoomScheduleEntries', () => {
    it('should query room schedule entries', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          room_id: ROOM_ID,
          weekday: 1,
          period_order: 1,
          schedule_period_template: { period_name: 'P1' },
        },
      ]);

      const result = await facade.findRoomScheduleEntries(TENANT_ID, AY_ID);

      expect(result).toHaveLength(1);
      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.room_id).toEqual({ not: null });
    });
  });

  // ─── findByWeekdayWithClassYearGroup ───────────────────────────────────────

  describe('SchedulesReadFacade -- findByWeekdayWithClassYearGroup', () => {
    it('should query by weekday and effective date', async () => {
      const asOfDate = new Date('2025-10-15');
      mockPrisma.schedule.findMany.mockResolvedValue([
        { id: SCHEDULE_ID, class_id: CLASS_ID, class_entity: { year_group_id: 'yg-1' } },
      ]);

      const result = await facade.findByWeekdayWithClassYearGroup(TENANT_ID, 3, asOfDate);

      expect(result).toHaveLength(1);
      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.weekday).toBe(3);
      expect(callArgs.where.effective_start_date).toEqual({ lte: asOfDate });
    });
  });

  // ─── findByClassIdsAndWeekday ──────────────────────────────────────────────

  describe('SchedulesReadFacade -- findByClassIdsAndWeekday', () => {
    it('should return empty array when classIds is empty', async () => {
      const result = await facade.findByClassIdsAndWeekday(TENANT_ID, [], 1, new Date());

      expect(result).toEqual([]);
      expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
    });

    it('should query schedules for given class IDs and weekday', async () => {
      const asOfDate = new Date('2025-10-15');
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await facade.findByClassIdsAndWeekday(TENANT_ID, [CLASS_ID], 2, asOfDate);

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.class_id).toEqual({ in: [CLASS_ID] });
      expect(callArgs.where.weekday).toBe(2);
    });
  });

  // ─── findEffectiveInRange ──────────────────────────────────────────────────

  describe('SchedulesReadFacade -- findEffectiveInRange', () => {
    it('should query schedules effective within a date range', async () => {
      const rangeStart = new Date('2025-09-01');
      const rangeEnd = new Date('2025-12-31');
      mockPrisma.schedule.findMany.mockResolvedValue([
        { id: SCHEDULE_ID, teacher_staff_id: STAFF_ID, weekday: 1 },
      ]);

      const result = await facade.findEffectiveInRange(TENANT_ID, rangeStart, rangeEnd);

      expect(result).toHaveLength(1);
      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.effective_start_date).toEqual({ lte: rangeEnd });
    });
  });

  // ─── Stage 8 helpers ───────────────────────────────────────────────────────

  describe('SchedulesReadFacade -- getTeacherAssignmentsForYear', () => {
    it('dedupes by (class_id, subject_id) for subject-specific classes', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        { class_id: 'class-a', class_entity: { subject_id: 'math', year_group_id: 'yg-1' } },
        { class_id: 'class-a', class_entity: { subject_id: 'math', year_group_id: 'yg-1' } },
        { class_id: 'class-b', class_entity: { subject_id: 'math', year_group_id: 'yg-1' } },
      ]);

      const result = await facade.getTeacherAssignmentsForYear(TENANT_ID, 'ay-1', STAFF_ID);

      expect(result).toEqual([
        { class_id: 'class-a', subject_id: 'math' },
        { class_id: 'class-b', subject_id: 'math' },
      ]);
    });

    it('returns empty array when the teacher has no scheduled entries', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      const result = await facade.getTeacherAssignmentsForYear(TENANT_ID, 'ay-1', STAFF_ID);
      expect(result).toEqual([]);
    });

    it('resolves homeroom classes via competency × curriculum matrix (pool match)', async () => {
      // NHQS-shape: class has subject_id=null (homeroom model). The teacher
      // teaches Arabic + Maths across Grade 3's matrix; only those two
      // subjects land in the pool.
      mockPrisma.schedule.findMany.mockResolvedValue([
        { class_id: 'class-3a', class_entity: { subject_id: null, year_group_id: 'yg-3' } },
      ]);
      mockSchedulingFacade.findTeacherCompetencies.mockResolvedValue([
        { subject_id: 'arabic', year_group_id: 'yg-3', class_id: null },
        { subject_id: 'math', year_group_id: 'yg-3', class_id: null },
      ]);
      mockGradebookFacade.findClassSubjectConfigs.mockResolvedValue([
        { class_id: 'class-3a', subject_id: 'arabic' },
        { class_id: 'class-3a', subject_id: 'math' },
        { class_id: 'class-3a', subject_id: 'english' }, // teacher has no competency → skipped
      ]);

      const result = await facade.getTeacherAssignmentsForYear(TENANT_ID, 'ay-1', STAFF_ID);

      expect(result).toEqual(
        expect.arrayContaining([
          { class_id: 'class-3a', subject_id: 'arabic' },
          { class_id: 'class-3a', subject_id: 'math' },
        ]),
      );
      expect(result).not.toContainEqual({ class_id: 'class-3a', subject_id: 'english' });
    });

    it('honours pin (class_id match) when resolving homeroom subject', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        { class_id: 'class-3a', class_entity: { subject_id: null, year_group_id: 'yg-3' } },
      ]);
      mockSchedulingFacade.findTeacherCompetencies.mockResolvedValue([
        { subject_id: 'arabic', year_group_id: 'yg-3', class_id: 'class-3a' },
      ]);
      mockGradebookFacade.findClassSubjectConfigs.mockResolvedValue([
        { class_id: 'class-3a', subject_id: 'arabic' },
      ]);

      const result = await facade.getTeacherAssignmentsForYear(TENANT_ID, 'ay-1', STAFF_ID);
      expect(result).toEqual([{ class_id: 'class-3a', subject_id: 'arabic' }]);
    });

    it('scopes the query by tenant + academic year + teacher + effective-now', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      await facade.getTeacherAssignmentsForYear(TENANT_ID, 'ay-1', STAFF_ID);
      const where = mockPrisma.schedule.findMany.mock.calls[0][0].where;
      expect(where.tenant_id).toBe(TENANT_ID);
      expect(where.academic_year_id).toBe('ay-1');
      expect(where.teacher_staff_id).toBe(STAFF_ID);
      expect(where.OR).toEqual([
        { effective_end_date: null },
        { effective_end_date: { gte: expect.any(Date) } },
      ]);
    });
  });

  describe('SchedulesReadFacade -- getAllAssignmentsForYear', () => {
    it('dedupes by (class_id, subject_id, teacher_staff_id) for subject-specific classes', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          class_id: 'class-a',
          teacher_staff_id: 'staff-1',
          class_entity: { subject_id: 'math', year_group_id: 'yg-1' },
        },
        {
          class_id: 'class-a',
          teacher_staff_id: 'staff-1',
          class_entity: { subject_id: 'math', year_group_id: 'yg-1' },
        },
        {
          class_id: 'class-a',
          teacher_staff_id: 'staff-2',
          class_entity: { subject_id: 'math', year_group_id: 'yg-1' },
        },
        {
          class_id: 'class-b',
          teacher_staff_id: 'staff-1',
          class_entity: { subject_id: 'math', year_group_id: 'yg-1' },
        },
      ]);

      const result = await facade.getAllAssignmentsForYear(TENANT_ID, 'ay-1');

      expect(result).toHaveLength(3);
      expect(result).toContainEqual({
        class_id: 'class-a',
        subject_id: 'math',
        teacher_staff_id: 'staff-1',
      });
      expect(result).toContainEqual({
        class_id: 'class-a',
        subject_id: 'math',
        teacher_staff_id: 'staff-2',
      });
      expect(result).toContainEqual({
        class_id: 'class-b',
        subject_id: 'math',
        teacher_staff_id: 'staff-1',
      });
    });

    it('skips rows missing teacher_staff_id', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          class_id: 'a',
          teacher_staff_id: null,
          class_entity: { subject_id: 'math', year_group_id: 'yg-1' },
        },
        {
          class_id: 'c',
          teacher_staff_id: 'staff-1',
          class_entity: { subject_id: 'math', year_group_id: 'yg-1' },
        },
      ]);
      const result = await facade.getAllAssignmentsForYear(TENANT_ID, 'ay-1');
      expect(result).toEqual([{ class_id: 'c', subject_id: 'math', teacher_staff_id: 'staff-1' }]);
    });
  });

  describe('SchedulesReadFacade -- hasAppliedSchedule', () => {
    it('returns true when at least one effective row exists for the year', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: SCHEDULE_ID });
      const result = await facade.hasAppliedSchedule(TENANT_ID, 'ay-1');
      expect(result).toBe(true);
    });

    it('returns false when no effective rows exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);
      const result = await facade.hasAppliedSchedule(TENANT_ID, 'ay-1');
      expect(result).toBe(false);
    });

    it('filters by tenant + academic year + effective-now', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);
      await facade.hasAppliedSchedule(TENANT_ID, 'ay-1');
      const where = mockPrisma.schedule.findFirst.mock.calls[0][0].where;
      expect(where.tenant_id).toBe(TENANT_ID);
      expect(where.academic_year_id).toBe('ay-1');
      expect(where.OR).toEqual([
        { effective_end_date: null },
        { effective_end_date: { gte: expect.any(Date) } },
      ]);
    });
  });
});
