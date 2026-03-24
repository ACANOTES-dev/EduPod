import { Test, TestingModule } from '@nestjs/testing';

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
    weekday: 1,
    start_time: new Date('1970-01-01T08:00:00.000Z'),
    end_time: new Date('1970-01-01T09:00:00.000Z'),
    teacher_staff_id: STAFF_ID,
    class_entity: {
      id: CLASS_ID,
      name: 'Y1A Math',
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
    classEnrolment: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      schedule: { findMany: jest.fn() },
      classEnrolment: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimetablesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TimetablesService>(TimetablesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getTeacherTimetable', () => {
    it('should return formatted timetable entries for a teacher', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([buildScheduleRow()]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {
        academic_year_id: AY_ID,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.start_time).toBe('08:00');
      expect(result[0]?.end_time).toBe('09:00');
      expect(result[0]?.teacher_name).toBe('John Doe');
      expect(result[0]?.class_name).toBe('Y1A Math');
      expect(result[0]?.subject_name).toBe('Mathematics');
    });

    it('should return empty array when no schedules found', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {
        academic_year_id: AY_ID,
      });

      expect(result).toEqual([]);
    });
  });

  describe('getRoomTimetable', () => {
    it('should return formatted timetable entries for a room', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([buildScheduleRow()]);

      const result = await service.getRoomTimetable(TENANT_ID, ROOM_ID, {
        academic_year_id: AY_ID,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.room_id).toBe(ROOM_ID);
      expect(result[0]?.room_name).toBe('Room 101');
    });
  });

  describe('getStudentTimetable', () => {
    it('should return timetable entries for a student based on enrolments', async () => {
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { class_id: CLASS_ID },
      ]);
      mockPrisma.schedule.findMany.mockResolvedValue([buildScheduleRow()]);

      const result = await service.getStudentTimetable(
        TENANT_ID,
        STUDENT_ID,
        { academic_year_id: AY_ID },
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.class_id).toBe(CLASS_ID);
    });

    it('should return empty array when student has no enrolments', async () => {
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

      const result = await service.getStudentTimetable(
        TENANT_ID,
        STUDENT_ID,
        { academic_year_id: AY_ID },
      );

      expect(result).toEqual([]);
      expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
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
  });

  describe('toTimetableEntry', () => {
    it('should handle entries without room or teacher', async () => {
      const row = buildScheduleRow({ room: null, teacher: null });
      mockPrisma.schedule.findMany.mockResolvedValue([row]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {
        academic_year_id: AY_ID,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.room_id).toBeUndefined();
      expect(result[0]?.teacher_staff_id).toBeUndefined();
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

      expect(result).toHaveLength(1);
      expect(result[0]?.subject_name).toBeUndefined();
    });
  });
});
