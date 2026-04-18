import { Test, TestingModule } from '@nestjs/testing';

import { ClassesReadFacade, MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { TimetablesService } from './timetables.service';

const TENANT_ID = 'tenant-uuid-1';
const AY_ID = 'ay-uuid-1';
const STAFF_ID = 'staff-uuid-1';
const ROOM_ID = 'room-uuid-1';
const STUDENT_ID = 'student-uuid-1';
const CLASS_ID = 'class-uuid-1';

function buildScheduleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sched-1',
    class_id: CLASS_ID,
    weekday: 1,
    period_order: 1,
    start_time: new Date('1970-01-01T08:00:00.000Z'),
    end_time: new Date('1970-01-01T09:00:00.000Z'),
    teacher_staff_id: STAFF_ID,
    scheduling_run_id: null,
    class_entity: {
      id: CLASS_ID,
      name: 'Y1A Math',
      year_group_id: null,
      subject: { name: 'Mathematics' },
    },
    room: { id: ROOM_ID, name: 'Room 101' },
    teacher: {
      id: STAFF_ID,
      user: { first_name: 'John', last_name: 'Doe' },
    },
    ...overrides,
  };
}

describe('TimetablesService', () => {
  let service: TimetablesService;
  let mockPrisma: {
    schedule: { findMany: jest.Mock };
    schedulingRun: { findMany: jest.Mock };
    schedulePeriodTemplate: { findMany: jest.Mock };
  };

  const mockClassesReadFacade = {
    findClassIdsForStudent: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    mockPrisma = {
      schedule: { findMany: jest.fn() },
      schedulingRun: { findMany: jest.fn().mockResolvedValue([]) },
      schedulePeriodTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
        TimetablesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TimetablesService>(TimetablesService);

    jest.clearAllMocks();
    mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getTeacherTimetable', () => {
    it('should return formatted timetable entries for a teacher', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([buildScheduleRow()]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {
        academic_year_id: AY_ID,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.start_time).toBe('08:00');
      expect(result.data[0]?.end_time).toBe('09:00');
      expect(result.data[0]?.teacher_name).toBe('John Doe');
      expect(result.data[0]?.class_name).toBe('Y1A Math');
      expect(result.data[0]?.subject_name).toBe('Mathematics');
    });

    it('should return empty array when no schedules found', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {
        academic_year_id: AY_ID,
      });

      expect(result.data).toEqual([]);
    });

    it('should use week_start as reference date when provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {
        academic_year_id: AY_ID,
        week_start: '2025-10-15',
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      const expectedDate = new Date('2025-10-15');
      expect(callArgs.where.effective_start_date).toEqual({ lte: expectedDate });
    });

    it('should use current date as reference when no week_start provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {
        academic_year_id: AY_ID,
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      // Reference date should be a Date (now)
      expect(callArgs.where.effective_start_date.lte).toBeInstanceOf(Date);
    });
  });

  describe('getRoomTimetable', () => {
    it('should return formatted timetable entries for a room', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([buildScheduleRow()]);

      const result = await service.getRoomTimetable(TENANT_ID, ROOM_ID, {
        academic_year_id: AY_ID,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.room_id).toBe(ROOM_ID);
      expect(result.data[0]?.room_name).toBe('Room 101');
    });

    it('should use week_start as reference date when provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await service.getRoomTimetable(TENANT_ID, ROOM_ID, {
        academic_year_id: AY_ID,
        week_start: '2025-11-01',
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.effective_start_date).toEqual({ lte: new Date('2025-11-01') });
    });
  });

  describe('getClassTimetable', () => {
    it('should return entries filtered by class_id', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([buildScheduleRow()]);

      const result = await service.getClassTimetable(TENANT_ID, CLASS_ID, {
        academic_year_id: AY_ID,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.class_id).toBe(CLASS_ID);
      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.class_id).toBe(CLASS_ID);
    });

    it('should use week_start as reference date', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await service.getClassTimetable(TENANT_ID, CLASS_ID, {
        academic_year_id: AY_ID,
        week_start: '2025-10-15',
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.effective_start_date).toEqual({ lte: new Date('2025-10-15') });
    });
  });

  describe('getStudentTimetable', () => {
    it('should return timetable entries for a student based on enrolments', async () => {
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);
      mockPrisma.schedule.findMany.mockResolvedValue([buildScheduleRow()]);

      const result = await service.getStudentTimetable(TENANT_ID, STUDENT_ID, {
        academic_year_id: AY_ID,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.class_id).toBe(CLASS_ID);
    });

    it('should return empty array when student has no enrolments', async () => {
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([]);

      const result = await service.getStudentTimetable(TENANT_ID, STUDENT_ID, {
        academic_year_id: AY_ID,
      });

      expect(result.data).toEqual([]);
      expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
    });

    it('should use week_start as reference date for student timetable', async () => {
      mockClassesReadFacade.findClassIdsForStudent.mockResolvedValue([CLASS_ID]);
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await service.getStudentTimetable(TENANT_ID, STUDENT_ID, {
        academic_year_id: AY_ID,
        week_start: '2025-10-20',
      });

      const callArgs = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(callArgs.where.effective_start_date).toEqual({ lte: new Date('2025-10-20') });
      expect(callArgs.where.class_id).toEqual({ in: [CLASS_ID] });
    });
  });

  describe('getWorkloadReport', () => {
    it('should aggregate workload per teacher and sort by name', async () => {
      const rows = [
        buildScheduleRow({
          id: 'sched-1',
          teacher_staff_id: 'teacher-a',
          teacher: {
            id: 'teacher-a',
            user: { first_name: 'Zara', last_name: 'Ahmed' },
          },
          weekday: 1,
          start_time: new Date('1970-01-01T08:00:00.000Z'),
          end_time: new Date('1970-01-01T09:00:00.000Z'),
        }),
        buildScheduleRow({
          id: 'sched-2',
          teacher_staff_id: 'teacher-a',
          teacher: {
            id: 'teacher-a',
            user: { first_name: 'Zara', last_name: 'Ahmed' },
          },
          weekday: 2,
          start_time: new Date('1970-01-01T10:00:00.000Z'),
          end_time: new Date('1970-01-01T11:30:00.000Z'),
        }),
        buildScheduleRow({
          id: 'sched-3',
          teacher_staff_id: 'teacher-b',
          teacher: {
            id: 'teacher-b',
            user: { first_name: 'Adam', last_name: 'Baker' },
          },
          weekday: 1,
          start_time: new Date('1970-01-01T08:00:00.000Z'),
          end_time: new Date('1970-01-01T09:00:00.000Z'),
        }),
      ];
      mockPrisma.schedule.findMany.mockResolvedValue(rows);

      const result = await service.getWorkloadReport(TENANT_ID, AY_ID);

      expect(result).toHaveLength(2);
      // Sorted by name: Adam Baker before Zara Ahmed
      expect(result[0]?.name).toBe('Adam Baker');
      expect(result[0]?.total_periods).toBe(1);
      expect(result[0]?.total_hours).toBe(1);

      expect(result[1]?.name).toBe('Zara Ahmed');
      expect(result[1]?.total_periods).toBe(2);
      // 60 + 90 = 150 min = 2.5 hours
      expect(result[1]?.total_hours).toBe(2.5);
    });

    it('should skip entries with no teacher', async () => {
      const row = buildScheduleRow({
        teacher_staff_id: null,
        teacher: null,
      });
      mockPrisma.schedule.findMany.mockResolvedValue([row]);

      const result = await service.getWorkloadReport(TENANT_ID, AY_ID);

      expect(result).toEqual([]);
    });

    it('should aggregate perDay counts correctly', async () => {
      const rows = [
        buildScheduleRow({
          id: 'sched-1',
          teacher_staff_id: 'teacher-a',
          teacher: {
            id: 'teacher-a',
            user: { first_name: 'Jane', last_name: 'Smith' },
          },
          weekday: 1,
        }),
        buildScheduleRow({
          id: 'sched-2',
          teacher_staff_id: 'teacher-a',
          teacher: {
            id: 'teacher-a',
            user: { first_name: 'Jane', last_name: 'Smith' },
          },
          weekday: 1,
        }),
        buildScheduleRow({
          id: 'sched-3',
          teacher_staff_id: 'teacher-a',
          teacher: {
            id: 'teacher-a',
            user: { first_name: 'Jane', last_name: 'Smith' },
          },
          weekday: 3,
        }),
      ];
      mockPrisma.schedule.findMany.mockResolvedValue(rows);

      const result = await service.getWorkloadReport(TENANT_ID, AY_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.per_day).toEqual({ 1: 2, 3: 1 });
    });

    it('should return empty array when no schedules exist', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.getWorkloadReport(TENANT_ID, AY_ID);

      expect(result).toEqual([]);
    });
  });

  describe('toTimetableEntry', () => {
    it('should handle entries without room or teacher', async () => {
      const row = buildScheduleRow({ room: null, teacher: null });
      mockPrisma.schedule.findMany.mockResolvedValue([row]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {
        academic_year_id: AY_ID,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.room_id).toBeUndefined();
      expect(result.data[0]?.teacher_staff_id).toBeUndefined();
    });

    it('should handle entries without subject', async () => {
      const row = buildScheduleRow({
        class_entity: {
          id: CLASS_ID,
          name: 'Y1A General',
          subject: null,
        },
      });
      mockPrisma.schedule.findMany.mockResolvedValue([row]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {
        academic_year_id: AY_ID,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.subject_name).toBeUndefined();
    });
  });
});
