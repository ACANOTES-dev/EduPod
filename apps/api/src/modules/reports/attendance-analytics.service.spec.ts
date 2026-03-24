import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AttendanceAnalyticsService } from './attendance-analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('AttendanceAnalyticsService', () => {
  let service: AttendanceAnalyticsService;
  let mockPrisma: {
    attendanceRecord: { groupBy: jest.Mock; findMany: jest.Mock };
    student: { findMany: jest.Mock; count: jest.Mock };
    attendanceSession: { groupBy: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    staffProfile: { findMany: jest.Mock };
    class: { findMany: jest.Mock };
    classStaff: { findMany: jest.Mock };
    yearGroup: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      attendanceRecord: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceSession: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffProfile: { findMany: jest.fn().mockResolvedValue([]) },
      class: { findMany: jest.fn().mockResolvedValue([]) },
      classStaff: { findMany: jest.fn().mockResolvedValue([]) },
      yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AttendanceAnalyticsService>(AttendanceAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('chronicAbsenteeism', () => {
    it('should return empty array when no students have chronic absenteeism', async () => {
      const result = await service.chronicAbsenteeism(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should flag students whose attendance rate falls below the threshold', async () => {
      // Student with 20 total sessions, 3 present (15% rate) — below default 85% threshold
      mockPrisma.attendanceRecord.groupBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 20 }]) // total
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 3 }]); // present
      mockPrisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          first_name: 'Alice',
          last_name: 'Smith',
          year_group: { name: 'Grade 5' },
          homeroom_class: { name: '5A' },
        },
      ]);

      const result = await service.chronicAbsenteeism(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.student_id).toBe('student-1');
      expect(result[0]?.attendance_rate).toBe(15);
      expect(result[0]?.absent_sessions).toBe(17);
    });

    it('should not flag students who meet the attendance threshold', async () => {
      // Student with 20 total, 18 present (90%) — above default 85% threshold
      mockPrisma.attendanceRecord.groupBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 20 }])
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 18 }]);

      const result = await service.chronicAbsenteeism(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('dayOfWeekHeatmap', () => {
    it('should return empty array when no year groups exist', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);

      const result = await service.dayOfWeekHeatmap(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should skip year groups with no active classes', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: 'yg-1', name: 'Grade 1' },
      ]);
      mockPrisma.class.findMany.mockResolvedValue([]); // no classes

      const result = await service.dayOfWeekHeatmap(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('teacherMarkingCompliance', () => {
    it('should return empty array when no active staff', async () => {
      const result = await service.teacherMarkingCompliance(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should compute compliance_rate as submitted_sessions / total_sessions', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      mockPrisma.classStaff.findMany.mockResolvedValue([
        { class_id: 'class-1' },
      ]);
      mockPrisma.attendanceSession.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8); // submitted

      const result = await service.teacherMarkingCompliance(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.compliance_rate).toBe(80);
    });
  });

  describe('excusedVsUnexcused', () => {
    it('should return zeros when no absence records', async () => {
      const result = await service.excusedVsUnexcused(TENANT_ID);

      expect(result.excused_count).toBe(0);
      expect(result.unexcused_count).toBe(0);
      expect(result.total_absences).toBe(0);
    });

    it('should count absent_excused and absent_unexcused separately', async () => {
      mockPrisma.attendanceRecord.groupBy.mockResolvedValue([
        { status: 'absent_excused', _count: 10 },
        { status: 'absent_unexcused', _count: 5 },
        { status: 'late', _count: 3 },
      ]);

      const result = await service.excusedVsUnexcused(TENANT_ID);

      expect(result.excused_count).toBe(10);
      expect(result.unexcused_count).toBe(5);
      expect(result.late_count).toBe(3);
    });
  });

  describe('classComparison', () => {
    it('should return empty array when no active classes in year group', async () => {
      const result = await service.classComparison(TENANT_ID, 'yg-1');

      expect(result).toEqual([]);
    });
  });
});
