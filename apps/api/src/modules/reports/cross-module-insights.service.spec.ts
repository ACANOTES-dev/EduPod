import { Test, TestingModule } from '@nestjs/testing';

import { CrossModuleInsightsService } from './cross-module-insights.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('CrossModuleInsightsService', () => {
  let service: CrossModuleInsightsService;
  let mockDataAccess: {
    groupAttendanceRecordsBy: jest.Mock;
    countAttendanceRecords: jest.Mock;
    groupGradesBy: jest.Mock;
    aggregateGrades: jest.Mock;
    findStudents: jest.Mock;
    countStudents: jest.Mock;
    findPayrollRuns: jest.Mock;
    findYearGroups: jest.Mock;
    aggregateInvoices: jest.Mock;
    countStudentAcademicRiskAlerts: jest.Mock;
    findStaffProfiles: jest.Mock;
    findClassStaff: jest.Mock;
    findClasses: jest.Mock;
    countAttendanceSessions: jest.Mock;
    findAttendanceSessions: jest.Mock;
    findAssessments: jest.Mock;
    countAssessments: jest.Mock;
    findClassEnrolments: jest.Mock;
  };

  beforeEach(async () => {
    mockDataAccess = {
      groupAttendanceRecordsBy: jest.fn().mockResolvedValue([]),
      countAttendanceRecords: jest.fn().mockResolvedValue(0),
      groupGradesBy: jest.fn().mockResolvedValue([]),
      aggregateGrades: jest.fn().mockResolvedValue({ _avg: { raw_score: null } }),
      findStudents: jest
        .fn()
        .mockResolvedValue([{ id: 'student-1', first_name: 'Alice', last_name: 'Smith' }]),
      countStudents: jest.fn().mockResolvedValue(10),
      findPayrollRuns: jest.fn().mockResolvedValue([]),
      findYearGroups: jest.fn().mockResolvedValue([]),
      aggregateInvoices: jest
        .fn()
        .mockResolvedValue({ _sum: { total_amount: 0, balance_amount: 0 } }),
      countStudentAcademicRiskAlerts: jest.fn().mockResolvedValue(0),
      findStaffProfiles: jest.fn().mockResolvedValue([]),
      findClassStaff: jest.fn().mockResolvedValue([]),
      findClasses: jest.fn().mockResolvedValue([]),
      countAttendanceSessions: jest.fn().mockResolvedValue(0),
      findAttendanceSessions: jest.fn().mockResolvedValue([]),
      findAssessments: jest.fn().mockResolvedValue([]),
      countAssessments: jest.fn().mockResolvedValue(0),
      findClassEnrolments: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossModuleInsightsService,
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
      ],
    }).compile();

    service = module.get<CrossModuleInsightsService>(CrossModuleInsightsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('attendanceVsGrades', () => {
    it('should return empty result when no shared students', async () => {
      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.data_points).toEqual([]);
      expect(result.correlation_coefficient).toBeNull();
      expect(result.insight).toBeNull();
    });

    it('should return data points when students have both attendance and grades', async () => {
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 10 }]) // total
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 8 }]); // present
      mockDataAccess.groupGradesBy.mockResolvedValue([
        { student_id: 'student-1', _avg: { raw_score: 85 }, _count: 5 },
      ]);

      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.data_points).toHaveLength(1);
      expect(result.data_points[0]?.attendance_rate).toBe(80);
      expect(result.data_points[0]?.average_grade).toBe(85);
    });
  });

  describe('costPerStudent', () => {
    it('should return empty array when no payroll runs', async () => {
      const result = await service.costPerStudent(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should compute cost_per_student from payroll total and student count', async () => {
      mockDataAccess.findPayrollRuns.mockResolvedValue([
        { period_label: '2026-01', total_pay: 50000 },
      ]);
      mockDataAccess.countStudents.mockResolvedValue(100);

      const result = await service.costPerStudent(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.cost_per_student).toBe(500);
    });
  });

  describe('yearGroupHealthScores', () => {
    it('should return empty array when no year groups', async () => {
      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('teacherEffectivenessIndex', () => {
    it('should return empty array when no staff', async () => {
      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should skip staff with no class assignments', async () => {
      mockDataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      mockDataAccess.findClassStaff.mockResolvedValue([]);

      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should compute effectiveness index for a teacher with full data', async () => {
      mockDataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      mockDataAccess.findClassStaff.mockResolvedValue([{ class_id: 'c1' }]);
      // Marking compliance: 10 total, 8 submitted = 80%
      mockDataAccess.countAttendanceSessions.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
      // Assessments & grade entry
      mockDataAccess.findAssessments.mockResolvedValue([{ id: 'a1' }]);
      mockDataAccess.countAssessments.mockResolvedValue(1); // 100% grade entry completion
      // Enrolments
      mockDataAccess.findClassEnrolments.mockResolvedValue([{ student_id: 's1' }]);
      // Student average grade
      mockDataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: 75 } });
      // Student attendance
      mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([
        { status: 'present', _count: 8 },
        { status: 'absent', _count: 2 },
      ]);

      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.teacher_name).toBe('Bob Jones');
      expect(result[0]?.marking_compliance_rate).toBe(80);
      expect(result[0]?.grade_entry_completion_rate).toBe(100);
      expect(result[0]?.student_avg_grade).toBe(75);
      expect(result[0]?.student_avg_attendance).toBe(80);
      expect(result[0]?.effectiveness_index).toBeGreaterThan(0);
    });

    it('should use defaults when no sessions, assessments, or students', async () => {
      mockDataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      mockDataAccess.findClassStaff.mockResolvedValue([{ class_id: 'c1' }]);
      // 0 sessions -> markingComplianceRate = 100 (default)
      mockDataAccess.countAttendanceSessions.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      // No assessments -> gradeEntryCompletionRate = 100 (default)
      mockDataAccess.findAssessments.mockResolvedValue([]);
      // No enrolments -> no student data
      mockDataAccess.findClassEnrolments.mockResolvedValue([]);

      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.marking_compliance_rate).toBe(100);
      expect(result[0]?.grade_entry_completion_rate).toBe(100);
      expect(result[0]?.student_avg_grade).toBeNull();
      expect(result[0]?.student_avg_attendance).toBeNull();
    });

    it('should handle assessments with no graded results', async () => {
      mockDataAccess.findStaffProfiles.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Alice', last_name: 'A' } },
      ]);
      mockDataAccess.findClassStaff.mockResolvedValue([{ class_id: 'c1' }]);
      mockDataAccess.countAttendanceSessions.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
      mockDataAccess.findAssessments.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      mockDataAccess.countAssessments.mockResolvedValue(0); // 0 graded
      mockDataAccess.findClassEnrolments.mockResolvedValue([{ student_id: 's1' }]);
      mockDataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: null } });
      mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([]);

      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.grade_entry_completion_rate).toBe(0);
      expect(result[0]?.student_avg_grade).toBeNull();
      expect(result[0]?.student_avg_attendance).toBeNull();
    });
  });

  describe('attendanceVsGrades — edge cases', () => {
    it('should apply date filters when startDate and endDate are provided', async () => {
      mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([]);
      mockDataAccess.groupGradesBy.mockResolvedValue([]);

      await service.attendanceVsGrades(TENANT_ID, '2026-01-01', '2026-03-31');

      expect(mockDataAccess.groupAttendanceRecordsBy).toHaveBeenCalled();
    });

    it('should compute insight about low-attendance students with lower grades', async () => {
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([
          { student_id: 's1', _count: 100 },
          { student_id: 's2', _count: 100 },
        ])
        .mockResolvedValueOnce([
          { student_id: 's1', _count: 60 }, // 60% attendance (below 85%)
          { student_id: 's2', _count: 95 }, // 95% attendance
        ]);
      mockDataAccess.groupGradesBy.mockResolvedValue([
        { student_id: 's1', _avg: { raw_score: 50 }, _count: 5 },
        { student_id: 's2', _avg: { raw_score: 90 }, _count: 5 },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        { id: 's1', first_name: 'Low', last_name: 'Attend' },
        { id: 's2', first_name: 'High', last_name: 'Attend' },
      ]);

      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.data_points).toHaveLength(2);
      expect(result.insight).not.toBeNull();
      expect(result.insight).toContain('85%');
      expect(result.correlation_coefficient).not.toBeNull();
    });

    it('should compute insight about low-attendance with higher grades', async () => {
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([
          { student_id: 's1', _count: 100 },
          { student_id: 's2', _count: 100 },
        ])
        .mockResolvedValueOnce([
          { student_id: 's1', _count: 60 }, // 60% attendance
          { student_id: 's2', _count: 95 }, // 95% attendance
        ]);
      mockDataAccess.groupGradesBy.mockResolvedValue([
        { student_id: 's1', _avg: { raw_score: 95 }, _count: 5 },
        { student_id: 's2', _avg: { raw_score: 50 }, _count: 5 },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        { id: 's1', first_name: 'Low', last_name: 'Attend' },
        { id: 's2', first_name: 'High', last_name: 'Attend' },
      ]);

      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.insight).toContain('higher');
    });

    it('edge: should return null correlation when only 1 data point', async () => {
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 's1', _count: 10 }])
        .mockResolvedValueOnce([{ student_id: 's1', _count: 8 }]);
      mockDataAccess.groupGradesBy.mockResolvedValue([
        { student_id: 's1', _avg: { raw_score: 75 }, _count: 3 },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        { id: 's1', first_name: 'Solo', last_name: 'Student' },
      ]);

      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.correlation_coefficient).toBeNull();
    });

    it('edge: should handle student not found in name map', async () => {
      mockDataAccess.groupAttendanceRecordsBy
        .mockResolvedValueOnce([{ student_id: 's1', _count: 10 }])
        .mockResolvedValueOnce([{ student_id: 's1', _count: 8 }]);
      mockDataAccess.groupGradesBy.mockResolvedValue([
        { student_id: 's1', _avg: { raw_score: 75 }, _count: 3 },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([]);

      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.data_points[0]?.student_name).toBe('Unknown');
    });
  });

  describe('costPerStudent — edge cases', () => {
    it('should return 0 cost_per_student when student count is 0', async () => {
      mockDataAccess.findPayrollRuns.mockResolvedValue([
        { period_label: '2026-01', total_pay: 50000 },
      ]);
      mockDataAccess.countStudents.mockResolvedValue(0);

      const result = await service.costPerStudent(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.cost_per_student).toBe(0);
    });
  });

  describe('yearGroupHealthScores — with data', () => {
    it('should compute health scores for year groups with students', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.findStudents.mockResolvedValue([
        { id: 's1', household_id: 'hh-1' },
        { id: 's2', household_id: 'hh-1' },
      ]);
      // Attendance: 100 total, 90 present => 90%
      mockDataAccess.countAttendanceRecords.mockResolvedValueOnce(100).mockResolvedValueOnce(90);
      // Grades: average 75
      mockDataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: 75 } });
      // Invoices: 1000 total, 200 outstanding => 80% collection
      mockDataAccess.aggregateInvoices.mockResolvedValue({
        _sum: { total_amount: 1000, balance_amount: 200 },
      });
      // 1 at-risk student out of 2
      mockDataAccess.countStudentAcademicRiskAlerts.mockResolvedValue(1);

      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.attendance_score).toBe(90);
      expect(result[0]?.grade_score).toBe(75);
      expect(result[0]?.fee_collection_score).toBe(80);
      expect(result[0]?.risk_score).toBe(50);
    });

    it('should skip year groups with no students', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.findStudents.mockResolvedValue([]);

      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result).toHaveLength(0);
    });

    it('should default grade_score to 50 when avg is null', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.findStudents.mockResolvedValue([{ id: 's1', household_id: null }]);
      mockDataAccess.countAttendanceRecords.mockResolvedValue(0);
      mockDataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: null } });
      mockDataAccess.countStudentAcademicRiskAlerts.mockResolvedValue(0);

      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.grade_score).toBe(50);
      expect(result[0]?.fee_collection_score).toBe(100);
    });

    it('should handle students with no household (skip fee calculation)', async () => {
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Grade 1' }]);
      mockDataAccess.findStudents.mockResolvedValue([{ id: 's1', household_id: null }]);
      mockDataAccess.countAttendanceRecords.mockResolvedValue(0);
      mockDataAccess.aggregateGrades.mockResolvedValue({ _avg: { raw_score: null } });
      mockDataAccess.countStudentAcademicRiskAlerts.mockResolvedValue(0);

      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.fee_collection_score).toBe(100);
    });
  });
});
