import { Test, TestingModule } from '@nestjs/testing';

import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('AttendanceAnalyticsService', () => {
  let service: AttendanceAnalyticsService;
  let mockDataAccess: {
    groupAttendanceRecordsBy: jest.Mock;
    findStudents: jest.Mock;
    countStudents: jest.Mock;
    findAttendanceSessions: jest.Mock;
    countAttendanceSessions: jest.Mock;
    findStaffProfiles: jest.Mock;
    findClasses: jest.Mock;
    findClassStaff: jest.Mock;
    findYearGroups: jest.Mock;
  };

  beforeEach(async () => {
    mockDataAccess = {
      groupAttendanceRecordsBy: jest.fn().mockResolvedValue([]),
      findStudents: jest.fn().mockResolvedValue([]),
      countStudents: jest.fn().mockResolvedValue(0),
      findAttendanceSessions: jest.fn().mockResolvedValue([]),
      countAttendanceSessions: jest.fn().mockResolvedValue(0),
      findStaffProfiles: jest.fn().mockResolvedValue([]),
      findClasses: jest.fn().mockResolvedValue([]),
      findClassStaff: jest.fn().mockResolvedValue([]),
      findYearGroups: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceAnalyticsService,
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
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
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 20 }])
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 3 }]);
      mockDataAccess.findStudents.mockResolvedValue([
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
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 20 }])
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 18 }]);

      const result = await service.chronicAbsenteeism(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('dayOfWeekHeatmap', () => {
    it('should return empty array when no year groups exist', async () => {
      const result = await service.dayOfWeekHeatmap(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should skip year groups with no active classes', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.findClasses.mockResolvedValue([]);

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
      mockDataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      mockDataAccess.findClassStaff.mockResolvedValue([{ class_id: 'class-1' }]);
      mockDataAccess.countAttendanceSessions.mockResolvedValueOnce(10).mockResolvedValueOnce(8);

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
      mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([
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
