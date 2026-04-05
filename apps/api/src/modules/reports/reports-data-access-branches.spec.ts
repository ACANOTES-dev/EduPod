import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { AdmissionsReadFacade } from '../admissions/admissions-read.facade';
import { ApprovalsReadFacade } from '../approvals/approvals-read.facade';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { AuditLogReadFacade } from '../audit-log/audit-log-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { CommunicationsReadFacade } from '../communications/communications-read.facade';
import { FinanceReadFacade } from '../finance/finance-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { HouseholdReadFacade } from '../households/household-read.facade';
import { PayrollReadFacade } from '../payroll/payroll-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';

import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const makeMockFacade = () => ({
  count: jest.fn().mockResolvedValue(0),
  findManyGeneric: jest.fn().mockResolvedValue([]),
  findOneGeneric: jest.fn().mockResolvedValue(null),
  groupBy: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  findByIdGeneric: jest.fn().mockResolvedValue(null),
  countClassesGeneric: jest.fn().mockResolvedValue(0),
  findClassesGeneric: jest.fn().mockResolvedValue([]),
  findClassStaffGeneric: jest.fn().mockResolvedValue([]),
  countClassStaffGeneric: jest.fn().mockResolvedValue(0),
  countEnrolmentsGeneric: jest.fn().mockResolvedValue(0),
  findEnrolmentsGeneric: jest.fn().mockResolvedValue([]),
  groupRecordsBy: jest.fn().mockResolvedValue([]),
  countRecordsGeneric: jest.fn().mockResolvedValue(0),
  findRecordsGeneric: jest.fn().mockResolvedValue([]),
  findSessionsGeneric: jest.fn().mockResolvedValue([]),
  countSessionsGeneric: jest.fn().mockResolvedValue(0),
  findGradesGeneric: jest.fn().mockResolvedValue([]),
  groupGradesBy: jest.fn().mockResolvedValue([]),
  aggregateGrades: jest.fn().mockResolvedValue({ _avg: { raw_score: null } }),
  findAssessmentsGeneric: jest.fn().mockResolvedValue([]),
  countAssessments: jest.fn().mockResolvedValue(0),
  findPeriodSnapshotsGeneric: jest.fn().mockResolvedValue([]),
  findGpaSnapshotsGeneric: jest.fn().mockResolvedValue([]),
  countRiskAlerts: jest.fn().mockResolvedValue(0),
  findRiskAlertsGeneric: jest.fn().mockResolvedValue([]),
  findReportCardsGeneric: jest.fn().mockResolvedValue([]),
  findInvoicesGeneric: jest.fn().mockResolvedValue([]),
  countInvoices: jest.fn().mockResolvedValue(0),
  aggregateInvoices: jest
    .fn()
    .mockResolvedValue({ _sum: { total_amount: null, balance_amount: null } }),
  findPaymentsGeneric: jest.fn().mockResolvedValue([]),
  findCompensationsGeneric: jest.fn().mockResolvedValue([]),
  countApplicationsGeneric: jest.fn().mockResolvedValue(0),
  findApplicationsGeneric: jest.fn().mockResolvedValue([]),
  findYearGroupsGeneric: jest.fn().mockResolvedValue([]),
  findPeriodsGeneric: jest.fn().mockResolvedValue([]),
  findAllSubjects: jest.fn().mockResolvedValue([]),
  findPayrollRunsGeneric: jest.fn().mockResolvedValue([]),
  findNotificationsGeneric: jest.fn().mockResolvedValue([]),
  findMany: jest.fn().mockResolvedValue([]),
  findFirst: jest.fn().mockResolvedValue(null),
  groupStaffAttendanceBy: jest.fn().mockResolvedValue([]),
  countRequestsGeneric: jest.fn().mockResolvedValue(0),
});

describe('ReportsDataAccessService — branch coverage', () => {
  let service: ReportsDataAccessService;
  const mockFacade = makeMockFacade();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsDataAccessService,
        { provide: StudentReadFacade, useValue: mockFacade },
        { provide: StaffProfileReadFacade, useValue: mockFacade },
        { provide: ClassesReadFacade, useValue: mockFacade },
        { provide: AttendanceReadFacade, useValue: mockFacade },
        { provide: GradebookReadFacade, useValue: mockFacade },
        { provide: FinanceReadFacade, useValue: mockFacade },
        { provide: AdmissionsReadFacade, useValue: mockFacade },
        { provide: PayrollReadFacade, useValue: mockFacade },
        { provide: CommunicationsReadFacade, useValue: mockFacade },
        { provide: AuditLogReadFacade, useValue: mockFacade },
        { provide: AcademicReadFacade, useValue: mockFacade },
        { provide: HouseholdReadFacade, useValue: mockFacade },
        { provide: SchedulesReadFacade, useValue: mockFacade },
        { provide: ApprovalsReadFacade, useValue: mockFacade },
      ],
    }).compile();

    service = module.get<ReportsDataAccessService>(ReportsDataAccessService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('ReportsDataAccessService — countStudentsByStatus', () => {
    it('should return active, total, and applicants', async () => {
      mockFacade.count
        .mockResolvedValueOnce(50) // active
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(10); // applicants
      const result = await service.countStudentsByStatus(TENANT_ID);
      expect(result).toEqual({ active: 50, total: 100, applicants: 10 });
    });
  });

  describe('ReportsDataAccessService — countStaffByStatus', () => {
    it('should return active and total', async () => {
      mockFacade.count
        .mockResolvedValueOnce(30) // active
        .mockResolvedValueOnce(40); // total
      const result = await service.countStaffByStatus(TENANT_ID);
      expect(result).toEqual({ active: 30, total: 40 });
    });
  });

  describe('ReportsDataAccessService — findStudentById', () => {
    it('should call studentReadFacade.findOneGeneric with select', async () => {
      const select = { id: true, first_name: true };
      await service.findStudentById(TENANT_ID, 'stu-1', select);
      expect(mockFacade.findOneGeneric).toHaveBeenCalledWith(TENANT_ID, 'stu-1', { select });
    });

    it('should call without select when not provided', async () => {
      await service.findStudentById(TENANT_ID, 'stu-1');
      expect(mockFacade.findOneGeneric).toHaveBeenCalledWith(TENANT_ID, 'stu-1', undefined);
    });
  });

  describe('ReportsDataAccessService — findAuditLogs', () => {
    it('should delegate to auditLogReadFacade.findMany', async () => {
      await service.findAuditLogs(TENANT_ID, { skip: 0, take: 10 });
      expect(mockFacade.findMany).toHaveBeenCalledWith(TENANT_ID, { skip: 0, take: 10 });
    });
  });

  describe('ReportsDataAccessService — findFirstAuditLog', () => {
    it('should delegate to auditLogReadFacade.findFirst', async () => {
      await service.findFirstAuditLog(TENANT_ID);
      expect(mockFacade.findFirst).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe('ReportsDataAccessService — countAuditLogs', () => {
    it('should delegate to auditLogReadFacade.count', async () => {
      mockFacade.count.mockResolvedValue(5);
      const result = await service.countAuditLogs(TENANT_ID);
      expect(result).toBe(5);
    });
  });

  describe('ReportsDataAccessService — countSchedules', () => {
    it('should delegate to schedulesReadFacade.count', async () => {
      mockFacade.count.mockResolvedValue(100);
      const result = await service.countSchedules(TENANT_ID);
      expect(result).toBe(100);
    });
  });

  describe('ReportsDataAccessService — countApprovalRequests', () => {
    it('should delegate to approvalsReadFacade.countRequestsGeneric', async () => {
      mockFacade.countRequestsGeneric.mockResolvedValue(5);
      const result = await service.countApprovalRequests(TENANT_ID);
      expect(result).toBe(5);
    });
  });

  describe('ReportsDataAccessService — findStudents', () => {
    it('should delegate to studentReadFacade.findManyGeneric', async () => {
      await service.findStudents(TENANT_ID, { take: 10 });
      expect(mockFacade.findManyGeneric).toHaveBeenCalledWith(TENANT_ID, { take: 10 });
    });
  });

  describe('ReportsDataAccessService — groupStudentsBy', () => {
    it('should delegate to studentReadFacade.groupBy', async () => {
      await service.groupStudentsBy(TENANT_ID, ['gender' as never]);
      expect(mockFacade.groupBy).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — countStaff', () => {
    it('should delegate to staffProfileReadFacade.count', async () => {
      mockFacade.count.mockResolvedValue(20);
      const result = await service.countStaff(TENANT_ID);
      expect(result).toBe(20);
    });
  });

  describe('ReportsDataAccessService — findStaffProfiles', () => {
    it('should delegate to staffProfileReadFacade.findManyGeneric', async () => {
      await service.findStaffProfiles(TENANT_ID, {});
      expect(mockFacade.findManyGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — groupStaffBy', () => {
    it('should delegate to staffProfileReadFacade.groupBy', async () => {
      await service.groupStaffBy(TENANT_ID, ['department' as never]);
      expect(mockFacade.groupBy).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findClasses', () => {
    it('should delegate to classesReadFacade.findClassesGeneric', async () => {
      await service.findClasses(TENANT_ID);
      expect(mockFacade.findClassesGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findClassStaff', () => {
    it('should delegate to classesReadFacade.findClassStaffGeneric', async () => {
      await service.findClassStaff(TENANT_ID);
      expect(mockFacade.findClassStaffGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — countClassStaff', () => {
    it('should delegate to classesReadFacade.countClassStaffGeneric', async () => {
      mockFacade.countClassStaffGeneric.mockResolvedValue(10);
      const result = await service.countClassStaff(TENANT_ID);
      expect(result).toBe(10);
    });
  });

  describe('ReportsDataAccessService — groupAttendanceRecordsBy', () => {
    it('should delegate to attendanceReadFacade.groupRecordsBy', async () => {
      await service.groupAttendanceRecordsBy(TENANT_ID, ['status' as never]);
      expect(mockFacade.groupRecordsBy).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — countAttendanceRecords', () => {
    it('should delegate to attendanceReadFacade.countRecordsGeneric', async () => {
      mockFacade.countRecordsGeneric.mockResolvedValue(500);
      const result = await service.countAttendanceRecords(TENANT_ID);
      expect(result).toBe(500);
    });
  });

  describe('ReportsDataAccessService — findAttendanceRecords', () => {
    it('should delegate to attendanceReadFacade.findRecordsGeneric', async () => {
      await service.findAttendanceRecords(TENANT_ID, {});
      expect(mockFacade.findRecordsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findAttendanceSessions', () => {
    it('should delegate to attendanceReadFacade.findSessionsGeneric', async () => {
      await service.findAttendanceSessions(TENANT_ID, {});
      expect(mockFacade.findSessionsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — groupStaffAttendanceBy', () => {
    it('should delegate to payrollReadFacade.groupStaffAttendanceBy', async () => {
      await service.groupStaffAttendanceBy(TENANT_ID, ['status' as never]);
      expect(mockFacade.groupStaffAttendanceBy).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findGrades', () => {
    it('should delegate to gradebookReadFacade.findGradesGeneric', async () => {
      await service.findGrades(TENANT_ID, {});
      expect(mockFacade.findGradesGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — aggregateGrades', () => {
    it('should delegate to gradebookReadFacade.aggregateGrades', async () => {
      mockFacade.aggregateGrades.mockResolvedValue({ _avg: { raw_score: 85 } });
      const result = await service.aggregateGrades(TENANT_ID);
      expect(result._avg.raw_score).toBe(85);
    });
  });

  describe('ReportsDataAccessService — findInvoices', () => {
    it('should delegate to financeReadFacade.findInvoicesGeneric', async () => {
      await service.findInvoices(TENANT_ID, {});
      expect(mockFacade.findInvoicesGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — aggregateInvoices', () => {
    it('should delegate to financeReadFacade.aggregateInvoices', async () => {
      mockFacade.aggregateInvoices.mockResolvedValue({
        _sum: { total_amount: 1000, balance_amount: 500 },
      });
      const result = await service.aggregateInvoices(TENANT_ID);
      expect(result._sum.total_amount).toBe(1000);
    });
  });

  describe('ReportsDataAccessService — findPayments', () => {
    it('should delegate to financeReadFacade.findPaymentsGeneric', async () => {
      await service.findPayments(TENANT_ID, {});
      expect(mockFacade.findPaymentsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findStaffCompensations', () => {
    it('should delegate to payrollReadFacade.findCompensationsGeneric', async () => {
      await service.findStaffCompensations(TENANT_ID);
      expect(mockFacade.findCompensationsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — countApplications', () => {
    it('should delegate to admissionsReadFacade.countApplicationsGeneric', async () => {
      mockFacade.countApplicationsGeneric.mockResolvedValue(25);
      const result = await service.countApplications(TENANT_ID);
      expect(result).toBe(25);
    });
  });

  describe('ReportsDataAccessService — findYearGroups', () => {
    it('should delegate to academicReadFacade.findYearGroupsGeneric', async () => {
      await service.findYearGroups(TENANT_ID);
      expect(mockFacade.findYearGroupsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findHouseholdById', () => {
    it('should delegate to householdReadFacade.findByIdGeneric', async () => {
      await service.findHouseholdById(TENANT_ID, 'hh-1');
      expect(mockFacade.findByIdGeneric).toHaveBeenCalledWith(TENANT_ID, 'hh-1', undefined);
    });
  });

  describe('ReportsDataAccessService — findNotifications', () => {
    it('should delegate to communicationsReadFacade.findNotificationsGeneric', async () => {
      await service.findNotifications(TENANT_ID);
      expect(mockFacade.findNotificationsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findPayrollRuns', () => {
    it('should delegate to payrollReadFacade.findPayrollRunsGeneric', async () => {
      await service.findPayrollRuns(TENANT_ID);
      expect(mockFacade.findPayrollRunsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findApplications', () => {
    it('should delegate to admissionsReadFacade.findApplicationsGeneric', async () => {
      await service.findApplications(TENANT_ID, {});
      expect(mockFacade.findApplicationsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findAcademicPeriods', () => {
    it('should delegate to academicReadFacade.findPeriodsGeneric', async () => {
      await service.findAcademicPeriods(TENANT_ID);
      expect(mockFacade.findPeriodsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findSubjects', () => {
    it('should delegate to academicReadFacade.findAllSubjects', async () => {
      await service.findSubjects(TENANT_ID);
      expect(mockFacade.findAllSubjects).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — countStudents', () => {
    it('should delegate to studentReadFacade.count with where', async () => {
      mockFacade.count.mockResolvedValue(50);
      const result = await service.countStudents(TENANT_ID, { status: 'active' });
      expect(result).toBe(50);
    });
  });

  describe('ReportsDataAccessService — countClasses', () => {
    it('should delegate to classesReadFacade.countClassesGeneric', async () => {
      mockFacade.countClassesGeneric.mockResolvedValue(12);
      const result = await service.countClasses(TENANT_ID);
      expect(result).toBe(12);
    });
  });

  describe('ReportsDataAccessService — countClassEnrolments', () => {
    it('should delegate to classesReadFacade.countEnrolmentsGeneric', async () => {
      mockFacade.countEnrolmentsGeneric.mockResolvedValue(200);
      const result = await service.countClassEnrolments(TENANT_ID);
      expect(result).toBe(200);
    });
  });

  describe('ReportsDataAccessService — findClassEnrolments', () => {
    it('should delegate to classesReadFacade.findEnrolmentsGeneric', async () => {
      await service.findClassEnrolments(TENANT_ID);
      expect(mockFacade.findEnrolmentsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — countAttendanceSessions', () => {
    it('should delegate to attendanceReadFacade.countSessionsGeneric', async () => {
      mockFacade.countSessionsGeneric.mockResolvedValue(50);
      const result = await service.countAttendanceSessions(TENANT_ID);
      expect(result).toBe(50);
    });
  });

  describe('ReportsDataAccessService — groupGradesBy', () => {
    it('should delegate to gradebookReadFacade.groupGradesBy', async () => {
      await service.groupGradesBy(TENANT_ID, ['assessment_id' as never]);
      expect(mockFacade.groupGradesBy).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findAssessments', () => {
    it('should delegate to gradebookReadFacade.findAssessmentsGeneric', async () => {
      await service.findAssessments(TENANT_ID, {});
      expect(mockFacade.findAssessmentsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — countAssessments', () => {
    it('should delegate to gradebookReadFacade.countAssessments', async () => {
      mockFacade.countAssessments.mockResolvedValue(30);
      const result = await service.countAssessments(TENANT_ID);
      expect(result).toBe(30);
    });
  });

  describe('ReportsDataAccessService — findPeriodGradeSnapshots', () => {
    it('should delegate to gradebookReadFacade.findPeriodSnapshotsGeneric', async () => {
      await service.findPeriodGradeSnapshots(TENANT_ID, {});
      expect(mockFacade.findPeriodSnapshotsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findGpaSnapshots', () => {
    it('should delegate to gradebookReadFacade.findGpaSnapshotsGeneric', async () => {
      await service.findGpaSnapshots(TENANT_ID);
      expect(mockFacade.findGpaSnapshotsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — countStudentAcademicRiskAlerts', () => {
    it('should delegate to gradebookReadFacade.countRiskAlerts', async () => {
      mockFacade.countRiskAlerts.mockResolvedValue(3);
      const result = await service.countStudentAcademicRiskAlerts(TENANT_ID);
      expect(result).toBe(3);
    });
  });

  describe('ReportsDataAccessService — findStudentAcademicRiskAlerts', () => {
    it('should delegate to gradebookReadFacade.findRiskAlertsGeneric', async () => {
      await service.findStudentAcademicRiskAlerts(TENANT_ID, {});
      expect(mockFacade.findRiskAlertsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findReportCards', () => {
    it('should delegate to gradebookReadFacade.findReportCardsGeneric', async () => {
      await service.findReportCards(TENANT_ID);
      expect(mockFacade.findReportCardsGeneric).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — countInvoices', () => {
    it('should delegate to financeReadFacade.countInvoices', async () => {
      mockFacade.countInvoices.mockResolvedValue(100);
      const result = await service.countInvoices(TENANT_ID);
      expect(result).toBe(100);
    });
  });
});
