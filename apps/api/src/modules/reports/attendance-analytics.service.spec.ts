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

    it('should compute attendance rates per class sorted descending', async () => {
      mockDataAccess.findClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Class A' },
        { id: 'cls-2', name: 'Class B' },
      ]);
      mockDataAccess.findAttendanceSessions
        .mockResolvedValueOnce([{ records: [{ status: 'present' }, { status: 'absent' }] }])
        .mockResolvedValueOnce([{ records: [{ status: 'present' }, { status: 'present' }] }]);

      const result = await service.classComparison(TENANT_ID, 'yg-1');

      expect(result).toHaveLength(2);
      expect(result[0]?.class_id).toBe('cls-2');
      expect(result[0]?.attendance_rate).toBe(100);
      expect(result[1]?.class_id).toBe('cls-1');
      expect(result[1]?.attendance_rate).toBe(50);
    });

    it('should return 0 attendance rate when sessions have no records', async () => {
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1', name: 'Class A' }]);
      mockDataAccess.findAttendanceSessions.mockResolvedValue([]);

      const result = await service.classComparison(TENANT_ID, 'yg-1');

      expect(result).toHaveLength(1);
      expect(result[0]?.attendance_rate).toBe(0);
      expect(result[0]?.total_sessions).toBe(0);
    });

    it('should apply date filters when startDate and endDate are provided', async () => {
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1', name: 'Class A' }]);
      mockDataAccess.findAttendanceSessions.mockResolvedValue([]);

      await service.classComparison(TENANT_ID, 'yg-1', '2026-01-01', '2026-03-31');

      const callArg = mockDataAccess.findAttendanceSessions.mock.calls[0]?.[1];
      expect(callArg?.where?.session_date).toBeDefined();
    });

    it('should count late as present in classComparison', async () => {
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1', name: 'Class A' }]);
      mockDataAccess.findAttendanceSessions.mockResolvedValue([
        { records: [{ status: 'late' }, { status: 'absent' }] },
      ]);

      const result = await service.classComparison(TENANT_ID, 'yg-1');

      expect(result[0]?.attendance_rate).toBe(50);
    });
  });

  describe('chronicAbsenteeism — edge cases', () => {
    it('should apply date filters when startDate and endDate are provided', async () => {
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 20 }])
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 3 }]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: 'student-1',
          first_name: 'Alice',
          last_name: 'Smith',
          year_group: null,
          homeroom_class: null,
        },
      ]);

      const result = await service.chronicAbsenteeism(TENANT_ID, 85, '2026-01-01', '2026-03-31');

      expect(result).toHaveLength(1);
      expect(result[0]?.year_group_name).toBeNull();
      expect(result[0]?.class_name).toBeNull();
    });

    it('should use custom threshold', async () => {
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 10 }])
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 9 }]);

      const result = await service.chronicAbsenteeism(TENANT_ID, 95);

      expect(result).toHaveLength(1);
    });

    it('should handle student not found in studentMap (show Unknown)', async () => {
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 20 }])
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 3 }]);
      mockDataAccess.findStudents.mockResolvedValue([]);

      const result = await service.chronicAbsenteeism(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.student_name).toBe('Unknown');
    });

    it('edge: should handle 0 total sessions (rate = 0)', async () => {
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 0 }])
        .mockResolvedValueOnce([]);

      const result = await service.chronicAbsenteeism(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.attendance_rate).toBe(0);
    });

    it('should only provide startDate when endDate is omitted', async () => {
      mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([]);

      await service.chronicAbsenteeism(TENANT_ID, 85, '2026-01-01');

      const firstCallArg = mockDataAccess.groupAttendanceRecordsBy.mock.calls[0];
      expect(firstCallArg?.[2]).toBeDefined();
    });
  });

  describe('dayOfWeekHeatmap — edge cases', () => {
    it('should build heatmap entries with correct weekday labels', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1' }]);
      // A Wednesday session (2026-01-07 is Wednesday)
      mockDataAccess.findAttendanceSessions.mockResolvedValue([
        { session_date: new Date('2026-01-07'), _count: { records: 30 } },
      ]);

      const result = await service.dayOfWeekHeatmap(TENANT_ID);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const entry = result[0];
      expect(entry?.year_group_id).toBe('yg-1');
      expect(entry?.total_sessions).toBe(30);
    });

    it('should apply date filters to dayOfWeekHeatmap', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1' }]);
      mockDataAccess.findAttendanceSessions.mockResolvedValue([]);

      await service.dayOfWeekHeatmap(TENANT_ID, '2026-01-01', '2026-03-31');

      const callArg = mockDataAccess.findAttendanceSessions.mock.calls[0]?.[1];
      expect(callArg?.where?.session_date).toBeDefined();
    });

    it('edge: should handle Sunday session (jsDay=0 maps to weekday 6)', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1' }]);
      // 2026-01-04 is a Sunday
      mockDataAccess.findAttendanceSessions.mockResolvedValue([
        { session_date: new Date('2026-01-04'), _count: { records: 10 } },
      ]);

      const result = await service.dayOfWeekHeatmap(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.weekday).toBe(6);
      expect(result[0]?.weekday_label).toBe('Sunday');
    });

    it('should only filter by startDate when endDate is omitted', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.findClasses.mockResolvedValue([{ id: 'cls-1' }]);
      mockDataAccess.findAttendanceSessions.mockResolvedValue([]);

      await service.dayOfWeekHeatmap(TENANT_ID, '2026-01-01');

      const callArg = mockDataAccess.findAttendanceSessions.mock.calls[0]?.[1];
      expect(callArg?.where?.session_date).toBeDefined();
    });
  });

  describe('teacherMarkingCompliance — edge cases', () => {
    it('should skip staff with no class assignments', async () => {
      mockDataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      mockDataAccess.findClassStaff.mockResolvedValue([]);

      const result = await service.teacherMarkingCompliance(TENANT_ID);

      expect(result).toHaveLength(0);
    });

    it('should skip staff with zero total sessions', async () => {
      mockDataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      mockDataAccess.findClassStaff.mockResolvedValue([{ class_id: 'class-1' }]);
      mockDataAccess.countAttendanceSessions.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await service.teacherMarkingCompliance(TENANT_ID);

      expect(result).toHaveLength(0);
    });

    it('should sort by compliance_rate ascending', async () => {
      mockDataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Alice', last_name: 'A' } },
        { id: 'staff-2', user: { first_name: 'Bob', last_name: 'B' } },
      ]);
      mockDataAccess.findClassStaff
        .mockResolvedValueOnce([{ class_id: 'c1' }])
        .mockResolvedValueOnce([{ class_id: 'c2' }]);
      mockDataAccess.countAttendanceSessions
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(9) // Alice: 90%
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5); // Bob: 50%

      const result = await service.teacherMarkingCompliance(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]?.teacher_name).toBe('Bob B');
      expect(result[1]?.teacher_name).toBe('Alice A');
    });
  });

  describe('attendanceTrends', () => {
    it('should return empty when no sessions', async () => {
      mockDataAccess.countStudents.mockResolvedValue(10);

      const result = await service.attendanceTrends(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should group sessions by month and compute attendance rate', async () => {
      mockDataAccess.findAttendanceSessions.mockResolvedValue([
        {
          session_date: new Date('2026-01-15'),
          records: [{ status: 'present' }, { status: 'absent' }],
        },
        {
          session_date: new Date('2026-01-20'),
          records: [{ status: 'late' }, { status: 'present' }],
        },
      ]);
      mockDataAccess.countStudents.mockResolvedValue(10);

      const result = await service.attendanceTrends(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.period_label).toBe('2026-01');
      expect(result[0]?.attendance_rate).toBe(75); // 3 present/late out of 4
      expect(result[0]?.total_students).toBe(10);
    });

    it('should apply date filters', async () => {
      mockDataAccess.findAttendanceSessions.mockResolvedValue([]);
      mockDataAccess.countStudents.mockResolvedValue(0);

      await service.attendanceTrends(TENANT_ID, '2026-01-01', '2026-06-30');

      const callArg = mockDataAccess.findAttendanceSessions.mock.calls[0]?.[1];
      expect(callArg?.where?.session_date).toBeDefined();
    });

    it('should sort by month ascending', async () => {
      mockDataAccess.findAttendanceSessions.mockResolvedValue([
        { session_date: new Date('2026-03-01'), records: [{ status: 'present' }] },
        { session_date: new Date('2026-01-01'), records: [{ status: 'present' }] },
      ]);
      mockDataAccess.countStudents.mockResolvedValue(5);

      const result = await service.attendanceTrends(TENANT_ID);

      expect(result[0]?.period_label).toBe('2026-01');
      expect(result[1]?.period_label).toBe('2026-03');
    });
  });

  describe('excusedVsUnexcused — edge cases', () => {
    it('should filter by yearGroupId when provided', async () => {
      mockDataAccess.findStudents.mockResolvedValue([{ id: 's1' }]);
      mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([]);

      await service.excusedVsUnexcused(TENANT_ID, undefined, undefined, 'yg-1');

      expect(mockDataAccess.findStudents).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
    });

    it('should apply date filters when dates provided', async () => {
      mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([]);

      await service.excusedVsUnexcused(TENANT_ID, '2026-01-01', '2026-03-31');

      const callArg = mockDataAccess.groupAttendanceRecordsBy.mock.calls[0];
      expect(callArg?.[2]).toBeDefined();
    });

    it('should compute excused_rate correctly', async () => {
      mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([
        { status: 'absent_excused', _count: 4 },
        { status: 'absent_unexcused', _count: 6 },
        { status: 'late', _count: 0 },
        { status: 'left_early', _count: 0 },
      ]);

      const result = await service.excusedVsUnexcused(TENANT_ID);

      expect(result.excused_rate).toBe(40);
      expect(result.total_absences).toBe(10);
    });

    it('should handle left_early count', async () => {
      mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([
        { status: 'left_early', _count: 2 },
      ]);

      const result = await service.excusedVsUnexcused(TENANT_ID);

      expect(result.left_early_count).toBe(2);
      expect(result.total_absences).toBe(2);
    });
  });
});
