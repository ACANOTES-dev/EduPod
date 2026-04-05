/**
 * Additional branch coverage for CrossModuleInsightsService.
 * Targets: attendanceVsGrades (date filters, empty data, low attendance insight, higher grades),
 * costPerStudent (zero students), yearGroupHealthScores (empty year groups, zero households,
 * null gradeAvg, high risk), teacherEffectivenessIndex branches.
 */
import { Test, TestingModule } from '@nestjs/testing';

import { CrossModuleInsightsService } from './cross-module-insights.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function buildMockDataAccess() {
  return {
    countStudents: jest.fn().mockResolvedValue(0),
    findStudents: jest.fn().mockResolvedValue([]),
    groupAttendanceRecordsBy: jest.fn().mockResolvedValue([]),
    groupGradesBy: jest.fn().mockResolvedValue([]),
    findPayrollRuns: jest.fn().mockResolvedValue([]),
    findYearGroups: jest.fn().mockResolvedValue([]),
    countAttendanceRecords: jest.fn().mockResolvedValue(0),
    aggregateGrades: jest.fn().mockResolvedValue({ _avg: { raw_score: null } }),
    aggregateInvoices: jest
      .fn()
      .mockResolvedValue({ _sum: { total_amount: 0, balance_amount: 0 } }),
    countStudentAcademicRiskAlerts: jest.fn().mockResolvedValue(0),
    findStaffProfiles: jest.fn().mockResolvedValue([]),
    findClassStaff: jest.fn().mockResolvedValue([]),
    countAttendanceSessions: jest.fn().mockResolvedValue(0),
    findAssessments: jest.fn().mockResolvedValue([]),
    countAssessments: jest.fn().mockResolvedValue(0),
    findClassEnrolments: jest.fn().mockResolvedValue([]),
  };
}

describe('CrossModuleInsightsService — branch coverage', () => {
  let service: CrossModuleInsightsService;
  let dataAccess: ReturnType<typeof buildMockDataAccess>;

  beforeEach(async () => {
    dataAccess = buildMockDataAccess();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossModuleInsightsService,
        { provide: ReportsDataAccessService, useValue: dataAccess },
      ],
    }).compile();

    service = module.get<CrossModuleInsightsService>(CrossModuleInsightsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── attendanceVsGrades ───────────────────────────────────────────────────

  describe('CrossModuleInsightsService — attendanceVsGrades', () => {
    it('should return empty result when no data', async () => {
      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.data_points).toHaveLength(0);
      expect(result.correlation_coefficient).toBeNull();
      expect(result.insight).toBeNull();
    });

    it('should pass date filters when startDate and endDate provided', async () => {
      const result = await service.attendanceVsGrades(TENANT_ID, '2026-01-01', '2026-06-30');

      // Should have called groupAttendanceRecordsBy with date filter
      expect(dataAccess.groupAttendanceRecordsBy).toHaveBeenCalledWith(
        TENANT_ID,
        ['student_id'],
        expect.objectContaining({ session: { session_date: expect.any(Object) } }),
      );
      expect(result.data_points).toHaveLength(0);
    });

    it('should compute correlation and insight for low attendance students', async () => {
      dataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([
          { student_id: 'stu-1', _count: 100 },
          { student_id: 'stu-2', _count: 100 },
        ])
        .mockResolvedValueOnce([
          { student_id: 'stu-1', _count: 80 }, // 80% attendance (below 85%)
          { student_id: 'stu-2', _count: 95 }, // 95% attendance
        ]);

      dataAccess.groupGradesBy.mockResolvedValue([
        { student_id: 'stu-1', _avg: { raw_score: 60 } },
        { student_id: 'stu-2', _avg: { raw_score: 85 } },
      ]);

      dataAccess.findStudents.mockResolvedValue([
        { id: 'stu-1', first_name: 'Low', last_name: 'Attendance' },
        { id: 'stu-2', first_name: 'High', last_name: 'Attendance' },
      ]);

      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.data_points).toHaveLength(2);
      expect(result.correlation_coefficient).not.toBeNull();
      expect(result.insight).not.toBeNull();
      expect(result.insight).toContain('below 85% attendance');
    });

    it('should handle students only in attendance but not in grades', async () => {
      dataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 'stu-1', _count: 50 }])
        .mockResolvedValueOnce([{ student_id: 'stu-1', _count: 40 }]);

      // No grades for stu-1
      dataAccess.groupGradesBy.mockResolvedValue([]);

      const result = await service.attendanceVsGrades(TENANT_ID);

      // stu-1 has attendance but no grades, so it's filtered out
      expect(result.data_points).toHaveLength(0);
    });

    it('should generate insight with "higher" when low attendance students have higher grades', async () => {
      dataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([
          { student_id: 'stu-1', _count: 100 },
          { student_id: 'stu-2', _count: 100 },
        ])
        .mockResolvedValueOnce([
          { student_id: 'stu-1', _count: 80 }, // 80% attendance (below 85%)
          { student_id: 'stu-2', _count: 95 }, // 95% attendance
        ]);

      dataAccess.groupGradesBy.mockResolvedValue([
        { student_id: 'stu-1', _avg: { raw_score: 95 } },
        { student_id: 'stu-2', _avg: { raw_score: 60 } },
      ]);

      dataAccess.findStudents.mockResolvedValue([
        { id: 'stu-1', first_name: 'A', last_name: 'B' },
        { id: 'stu-2', first_name: 'C', last_name: 'D' },
      ]);

      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.insight).toContain('higher');
    });
  });

  // ─── costPerStudent ───────────────────────────────────────────────────────

  describe('CrossModuleInsightsService — costPerStudent', () => {
    it('should return cost per student data points', async () => {
      dataAccess.findPayrollRuns.mockResolvedValue([
        { period_label: 'March 2026', total_pay: 50000 },
      ]);
      dataAccess.countStudents.mockResolvedValue(100);

      const result = await service.costPerStudent(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.cost_per_student).toBe(500);
    });

    it('should handle zero students gracefully', async () => {
      dataAccess.findPayrollRuns.mockResolvedValue([
        { period_label: 'March 2026', total_pay: 50000 },
      ]);
      dataAccess.countStudents.mockResolvedValue(0);

      const result = await service.costPerStudent(TENANT_ID);

      expect(result[0]!.cost_per_student).toBe(0);
    });
  });

  // ─── yearGroupHealthScores ────────────────────────────────────────────────

  describe('CrossModuleInsightsService — yearGroupHealthScores', () => {
    it('should return empty when no year groups', async () => {
      const result = await service.yearGroupHealthScores(TENANT_ID);
      expect(result).toHaveLength(0);
    });

    it('should skip year groups with no students', async () => {
      dataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);
      dataAccess.findStudents.mockResolvedValue([]);

      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result).toHaveLength(0);
    });

    it('should compute health score for year group with students', async () => {
      dataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);
      dataAccess.findStudents.mockResolvedValue([
        { id: 'stu-1', household_id: 'hh-1' },
        { id: 'stu-2', household_id: 'hh-1' },
      ]);
      dataAccess.countAttendanceRecords
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(90); // present
      dataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: 75 } });
      dataAccess.aggregateInvoices.mockResolvedValue({
        _sum: { total_amount: 10000, balance_amount: 2000 },
      });
      dataAccess.countStudentAcademicRiskAlerts.mockResolvedValue(0);

      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.attendance_score).toBeGreaterThan(0);
      expect(result[0]!.grade_score).toBe(75);
      expect(result[0]!.fee_collection_score).toBe(80); // (10000-2000)/10000 * 100
      expect(result[0]!.overall_score).toBeGreaterThan(0);
    });

    it('should handle null household_id in students', async () => {
      dataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);
      dataAccess.findStudents.mockResolvedValue([{ id: 'stu-1', household_id: null }]);
      dataAccess.countAttendanceRecords.mockResolvedValue(0);
      dataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: null } });
      dataAccess.countStudentAcademicRiskAlerts.mockResolvedValue(0);

      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result).toHaveLength(1);
      // No households = fee_collection_score stays at 100 (default)
      expect(result[0]!.fee_collection_score).toBe(100);
      // Null grade avg defaults to 50
      expect(result[0]!.grade_score).toBe(50);
    });

    it('should handle high risk count reducing risk score', async () => {
      dataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);
      dataAccess.findStudents.mockResolvedValue([{ id: 'stu-1', household_id: 'hh-1' }]);
      dataAccess.countAttendanceRecords.mockResolvedValue(0);
      dataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: null } });
      dataAccess.aggregateInvoices.mockResolvedValue({
        _sum: { total_amount: 0, balance_amount: 0 },
      });
      dataAccess.countStudentAcademicRiskAlerts.mockResolvedValue(1); // 1 alert for 1 student

      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result[0]!.risk_score).toBe(0); // max(0, 100 - (1/1)*100) = 0
    });
  });

  // ─── teacherEffectivenessIndex ────────────────────────────────────────────

  describe('CrossModuleInsightsService — teacherEffectivenessIndex', () => {
    it('should return empty when no staff profiles', async () => {
      const result = await service.teacherEffectivenessIndex(TENANT_ID);
      expect(result).toHaveLength(0);
    });

    it('should skip teachers with no class assignments', async () => {
      dataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'sp-1', user: { first_name: 'Alice', last_name: 'Smith' } },
      ]);
      dataAccess.findClassStaff.mockResolvedValue([]);

      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result).toHaveLength(0);
    });

    it('should compute effectiveness index for teachers with assignments', async () => {
      dataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'sp-1', user: { first_name: 'Alice', last_name: 'Smith' } },
      ]);
      dataAccess.findClassStaff.mockResolvedValue([{ class_id: 'c-1' }]);
      dataAccess.countAttendanceSessions
        .mockResolvedValueOnce(10) // total sessions
        .mockResolvedValueOnce(8); // submitted sessions
      dataAccess.findAssessments.mockResolvedValue([{ id: 'a-1' }, { id: 'a-2' }]);
      dataAccess.countAssessments.mockResolvedValue(2);
      dataAccess.findClassEnrolments.mockResolvedValue([{ student_id: 'stu-1' }]);
      dataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: 80 } });
      dataAccess.groupAttendanceRecordsBy.mockResolvedValue([
        { status: 'present', _count: 90 },
        { status: 'absent', _count: 10 },
      ]);

      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.teacher_name).toBe('Alice Smith');
      expect(result[0]!.marking_compliance_rate).toBe(80);
      expect(result[0]!.grade_entry_completion_rate).toBe(100);
      expect(result[0]!.student_avg_grade).toBe(80);
      expect(result[0]!.student_avg_attendance).not.toBeNull();
    });

    it('should handle zero sessions and zero assessments', async () => {
      dataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'sp-1', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      dataAccess.findClassStaff.mockResolvedValue([{ class_id: 'c-1' }]);
      dataAccess.countAttendanceSessions.mockResolvedValue(0);
      dataAccess.findAssessments.mockResolvedValue([]);
      dataAccess.findClassEnrolments.mockResolvedValue([]);

      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.marking_compliance_rate).toBe(100); // Default when no sessions
      expect(result[0]!.grade_entry_completion_rate).toBe(100); // Default when no assessments
      expect(result[0]!.student_avg_grade).toBeNull();
      expect(result[0]!.student_avg_attendance).toBeNull();
    });

    it('should handle null gradeAvg raw_score', async () => {
      dataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'sp-1', user: { first_name: 'Alice', last_name: 'Smith' } },
      ]);
      dataAccess.findClassStaff.mockResolvedValue([{ class_id: 'c-1' }]);
      dataAccess.countAttendanceSessions.mockResolvedValue(0);
      dataAccess.findAssessments.mockResolvedValue([]);
      dataAccess.findClassEnrolments.mockResolvedValue([{ student_id: 'stu-1' }]);
      dataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: null } });
      dataAccess.groupAttendanceRecordsBy.mockResolvedValue([]);

      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result[0]!.student_avg_grade).toBeNull();
      expect(result[0]!.student_avg_attendance).toBeNull();
    });
  });
});
