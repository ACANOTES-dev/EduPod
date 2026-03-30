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
  });
});
