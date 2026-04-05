import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  StudentReadFacade,
  StaffProfileReadFacade,
  ClassesReadFacade,
  AttendanceReadFacade,
  GradebookReadFacade,
  FinanceReadFacade,
  AdmissionsReadFacade,
  PayrollReadFacade,
  AuditLogReadFacade,
  AcademicReadFacade,
  CommunicationsReadFacade,
  HouseholdReadFacade,
  SchedulesReadFacade,
  ApprovalsReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { ReportsDataAccessService } from './reports-data-access.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = '11111111-1111-1111-1111-111111111111';
const HOUSEHOLD_ID = 'hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReportsDataAccessService', () => {
  let service: ReportsDataAccessService;
  let mockPrisma: {
    student: { count: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; groupBy: jest.Mock };
    staffProfile: { count: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
    class: { count: jest.Mock; findMany: jest.Mock };
    classStaff: { findMany: jest.Mock; count: jest.Mock };
    classEnrolment: { count: jest.Mock; findMany: jest.Mock };
    attendanceRecord: { groupBy: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    attendanceSession: { findMany: jest.Mock; count: jest.Mock };
    staffAttendanceRecord: { groupBy: jest.Mock };
    grade: { findMany: jest.Mock; groupBy: jest.Mock; aggregate: jest.Mock };
    assessment: { findMany: jest.Mock; count: jest.Mock };
    periodGradeSnapshot: { findMany: jest.Mock };
    gpaSnapshot: { findMany: jest.Mock };
    studentAcademicRiskAlert: { count: jest.Mock; findMany: jest.Mock };
    reportCard: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock; count: jest.Mock; aggregate: jest.Mock };
    payment: { findMany: jest.Mock };
    staffCompensation: { findMany: jest.Mock };
    application: { count: jest.Mock; findMany: jest.Mock };
    yearGroup: { findMany: jest.Mock };
    academicPeriod: { findMany: jest.Mock };
    subject: { findMany: jest.Mock };
    payrollRun: { findMany: jest.Mock };
    household: { findFirst: jest.Mock };
    notification: { findMany: jest.Mock };
    auditLog: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock };
    schedule: { count: jest.Mock };
    approvalRequest: { count: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      student: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), groupBy: jest.fn() },
      staffProfile: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      class: { count: jest.fn(), findMany: jest.fn() },
      classStaff: { findMany: jest.fn(), count: jest.fn() },
      classEnrolment: { count: jest.fn(), findMany: jest.fn() },
      attendanceRecord: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      attendanceSession: { findMany: jest.fn(), count: jest.fn() },
      staffAttendanceRecord: { groupBy: jest.fn() },
      grade: { findMany: jest.fn(), groupBy: jest.fn(), aggregate: jest.fn() },
      assessment: { findMany: jest.fn(), count: jest.fn() },
      periodGradeSnapshot: { findMany: jest.fn() },
      gpaSnapshot: { findMany: jest.fn() },
      studentAcademicRiskAlert: { count: jest.fn(), findMany: jest.fn() },
      reportCard: { findMany: jest.fn() },
      invoice: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
      payment: { findMany: jest.fn() },
      staffCompensation: { findMany: jest.fn() },
      application: { count: jest.fn(), findMany: jest.fn() },
      yearGroup: { findMany: jest.fn() },
      academicPeriod: { findMany: jest.fn() },
      subject: { findMany: jest.fn() },
      payrollRun: { findMany: jest.fn() },
      household: { findFirst: jest.fn() },
      notification: { findMany: jest.fn() },
      auditLog: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
      schedule: { count: jest.fn() },
      approvalRequest: { count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportsDataAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: StudentReadFacade,
          useValue: {
            count: jest.fn().mockImplementation((_t: string, where?: Record<string, unknown>) => {
              return mockPrisma.student.count({ where: { tenant_id: _t, ...where } });
            }),
            findManyGeneric: jest
              .fn()
              .mockImplementation((_t: string, opts: Record<string, unknown>) => {
                return mockPrisma.student.findMany({
                  ...opts,
                  where: { tenant_id: _t, ...((opts.where as Record<string, unknown>) ?? {}) },
                });
              }),
            findOneGeneric: jest.fn().mockImplementation((_t: string, id: string) => {
              return mockPrisma.student.findFirst({ where: { id, tenant_id: _t } });
            }),
            groupBy: jest.fn().mockImplementation(() => mockPrisma.student.groupBy()),
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            count: jest.fn().mockImplementation((_t: string, where?: Record<string, unknown>) => {
              return mockPrisma.staffProfile.count({ where: { tenant_id: _t, ...where } });
            }),
            findManyGeneric: jest.fn().mockImplementation(() => mockPrisma.staffProfile.findMany()),
            groupBy: jest.fn().mockImplementation(() => mockPrisma.staffProfile.groupBy()),
          },
        },
        {
          provide: ClassesReadFacade,
          useValue: {
            countClassesGeneric: jest.fn().mockImplementation(() => mockPrisma.class.count()),
            findClassesGeneric: jest
              .fn()
              .mockImplementation((_t: string, where?: Record<string, unknown>) => {
                return mockPrisma.class.findMany({ where: { tenant_id: _t, ...where } });
              }),
            findClassStaffGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.classStaff.findMany()),
            countClassStaffGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.classStaff.count()),
            countEnrolmentsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.classEnrolment.count()),
            findEnrolmentsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.classEnrolment.findMany()),
          },
        },
        {
          provide: AttendanceReadFacade,
          useValue: {
            groupRecordsBy: jest
              .fn()
              .mockImplementation(() => mockPrisma.attendanceRecord.groupBy()),
            countRecordsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.attendanceRecord.count()),
            findRecordsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.attendanceRecord.findMany()),
            findSessionsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.attendanceSession.findMany()),
            countSessionsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.attendanceSession.count()),
          },
        },
        {
          provide: GradebookReadFacade,
          useValue: {
            aggregateGrades: jest.fn().mockImplementation(() => mockPrisma.grade.aggregate()),
            findGradesGeneric: jest.fn().mockImplementation(() => mockPrisma.grade.findMany()),
            groupGradesBy: jest.fn().mockImplementation(() => mockPrisma.grade.groupBy()),
            findAssessmentsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.assessment.findMany()),
            countAssessments: jest.fn().mockImplementation(() => mockPrisma.assessment.count()),
            findPeriodSnapshotsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.periodGradeSnapshot.findMany()),
            findGpaSnapshotsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.gpaSnapshot.findMany()),
            countRiskAlerts: jest
              .fn()
              .mockImplementation(() => mockPrisma.studentAcademicRiskAlert.count()),
            findRiskAlertsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.studentAcademicRiskAlert.findMany()),
            findReportCardsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.reportCard.findMany()),
          },
        },
        {
          provide: FinanceReadFacade,
          useValue: {
            countInvoices: jest.fn().mockImplementation(() => mockPrisma.invoice.count()),
            findInvoicesGeneric: jest.fn().mockImplementation(() => mockPrisma.invoice.findMany()),
            aggregateInvoices: jest.fn().mockImplementation(() => mockPrisma.invoice.aggregate()),
            findPaymentsGeneric: jest.fn().mockImplementation(() => mockPrisma.payment.findMany()),
          },
        },
        {
          provide: AuditLogReadFacade,
          useValue: {
            count: jest.fn().mockImplementation(() => mockPrisma.auditLog.count()),
            findMany: jest.fn().mockImplementation((_t: string, opts?: Record<string, unknown>) => {
              return mockPrisma.auditLog.findMany(opts);
            }),
            findFirst: jest.fn().mockImplementation(() => mockPrisma.auditLog.findFirst()),
          },
        },
        {
          provide: HouseholdReadFacade,
          useValue: {
            findByIdGeneric: jest.fn().mockImplementation((_t: string, id: string) => {
              return mockPrisma.household.findFirst({ where: { id, tenant_id: _t } });
            }),
          },
        },
        {
          provide: SchedulesReadFacade,
          useValue: {
            count: jest.fn().mockImplementation(() => mockPrisma.schedule.count()),
          },
        },
        {
          provide: ApprovalsReadFacade,
          useValue: {
            countRequestsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.approvalRequest.count()),
          },
        },
        {
          provide: AdmissionsReadFacade,
          useValue: {
            countApplicationsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.application.count()),
            findApplicationsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.application.findMany()),
          },
        },
        {
          provide: PayrollReadFacade,
          useValue: {
            groupStaffAttendanceBy: jest
              .fn()
              .mockImplementation(() => mockPrisma.staffAttendanceRecord.groupBy()),
            findCompensationsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.staffCompensation.findMany()),
            findPayrollRunsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.payrollRun.findMany()),
          },
        },
        {
          provide: AcademicReadFacade,
          useValue: {
            findYearGroupsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.yearGroup.findMany()),
            findPeriodsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.academicPeriod.findMany()),
            findAllSubjects: jest.fn().mockImplementation(() => mockPrisma.subject.findMany()),
          },
        },
        {
          provide: CommunicationsReadFacade,
          useValue: {
            findNotificationsGeneric: jest
              .fn()
              .mockImplementation(() => mockPrisma.notification.findMany()),
          },
        },
      ],
    }).compile();

    service = module.get<ReportsDataAccessService>(ReportsDataAccessService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Students ──────────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countStudents', () => {
    it('should count students scoped to the tenant', async () => {
      mockPrisma.student.count.mockResolvedValue(42);

      const result = await service.countStudents(TENANT_ID);

      expect(result).toBe(42);
      expect(mockPrisma.student.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });

    it('should merge additional where filters', async () => {
      mockPrisma.student.count.mockResolvedValue(10);

      await service.countStudents(TENANT_ID, { status: 'active' });

      expect(mockPrisma.student.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, status: 'active' },
      });
    });
  });

  describe('ReportsDataAccessService — countStudentsByStatus', () => {
    it('should return active, total, and applicant counts', async () => {
      mockPrisma.student.count
        .mockResolvedValueOnce(30) // active
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(5); // applicants

      const result = await service.countStudentsByStatus(TENANT_ID);

      expect(result).toEqual({ active: 30, total: 50, applicants: 5 });
    });
  });

  describe('ReportsDataAccessService — findStudentById', () => {
    it('should find a student by id and tenant', async () => {
      const student = { id: STUDENT_ID, first_name: 'Aisha' };
      mockPrisma.student.findFirst.mockResolvedValue(student);

      const result = await service.findStudentById(TENANT_ID, STUDENT_ID);

      expect(result).toEqual(student);
      expect(mockPrisma.student.findFirst).toHaveBeenCalledWith({
        where: { id: STUDENT_ID, tenant_id: TENANT_ID },
      });
    });

    it('should return null when student not found', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(null);

      const result = await service.findStudentById(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── Staff Profiles ────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countStaffByStatus', () => {
    it('should return active and total staff counts', async () => {
      mockPrisma.staffProfile.count
        .mockResolvedValueOnce(20) // active
        .mockResolvedValueOnce(25); // total

      const result = await service.countStaffByStatus(TENANT_ID);

      expect(result).toEqual({ active: 20, total: 25 });
    });
  });

  // ─── Attendance ────────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countAttendanceRecords', () => {
    it('should count attendance records scoped to tenant', async () => {
      mockPrisma.attendanceRecord.count.mockResolvedValue(100);

      const result = await service.countAttendanceRecords(TENANT_ID);

      expect(result).toBe(100);
    });
  });

  describe('ReportsDataAccessService — countAttendanceSessions', () => {
    it('should count attendance sessions scoped to tenant', async () => {
      mockPrisma.attendanceSession.count.mockResolvedValue(15);

      const result = await service.countAttendanceSessions(TENANT_ID);

      expect(result).toBe(15);
    });
  });

  // ─── Grades ────────────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — aggregateGrades', () => {
    it('should return average raw_score as a number', async () => {
      mockPrisma.grade.aggregate.mockResolvedValue({
        _avg: { raw_score: 85.5 },
      });

      const result = await service.aggregateGrades(TENANT_ID);

      expect(result).toEqual({ _avg: { raw_score: 85.5 } });
    });

    it('should return null avg when no grades exist', async () => {
      mockPrisma.grade.aggregate.mockResolvedValue({
        _avg: { raw_score: null },
      });

      const result = await service.aggregateGrades(TENANT_ID);

      expect(result).toEqual({ _avg: { raw_score: null } });
    });
  });

  // ─── Finance ───────────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countInvoices', () => {
    it('should count invoices scoped to tenant', async () => {
      mockPrisma.invoice.count.mockResolvedValue(55);

      const result = await service.countInvoices(TENANT_ID);

      expect(result).toBe(55);
    });
  });

  // ─── Households ────────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — findHouseholdById', () => {
    it('should find a household by id and tenant', async () => {
      const household = { id: HOUSEHOLD_ID, name: 'Smith Household' };
      mockPrisma.household.findFirst.mockResolvedValue(household);

      const result = await service.findHouseholdById(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toEqual(household);
    });

    it('should return null when household not found', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(null);

      const result = await service.findHouseholdById(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── Audit Logs ────────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countAuditLogs', () => {
    it('should count audit logs scoped to tenant', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(200);

      const result = await service.countAuditLogs(TENANT_ID);

      expect(result).toBe(200);
    });
  });

  // ─── Schedules ─────────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countSchedules', () => {
    it('should count schedules scoped to tenant', async () => {
      mockPrisma.schedule.count.mockResolvedValue(120);

      const result = await service.countSchedules(TENANT_ID);

      expect(result).toBe(120);
    });
  });

  // ─── Approval Requests ─────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countApprovalRequests', () => {
    it('should count approval requests scoped to tenant', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(8);

      const result = await service.countApprovalRequests(TENANT_ID);

      expect(result).toBe(8);
    });
  });

  // ─── Tenant isolation ──────────────────────────────────────────────────────

  describe('ReportsDataAccessService — tenant isolation', () => {
    it('should always include tenant_id in the where clause for findStudents', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);

      await service.findStudents(TENANT_ID, { where: { status: 'active' } });

      expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });

    it('should always include tenant_id in findClasses', async () => {
      mockPrisma.class.findMany.mockResolvedValue([]);

      await service.findClasses(TENANT_ID);

      expect(mockPrisma.class.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });
  });

  // ─── Staff Profiles ────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countStaff', () => {
    it('should count staff scoped to tenant', async () => {
      mockPrisma.staffProfile.count.mockResolvedValue(15);

      const result = await service.countStaff(TENANT_ID);

      expect(result).toBe(15);
    });

    it('should merge additional where filters for countStaff', async () => {
      mockPrisma.staffProfile.count.mockResolvedValue(10);

      await service.countStaff(TENANT_ID, { employment_status: 'active' });

      expect(mockPrisma.staffProfile.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            employment_status: 'active',
          }),
        }),
      );
    });
  });

  describe('ReportsDataAccessService — findStaffProfiles', () => {
    it('should delegate to staffProfileReadFacade.findManyGeneric', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([{ id: 'sp-1' }]);

      const result = await service.findStaffProfiles(TENANT_ID, {
        select: { created_at: true },
      });

      expect(result).toEqual([{ id: 'sp-1' }]);
    });
  });

  describe('ReportsDataAccessService — groupStaffBy', () => {
    it('should delegate to staffProfileReadFacade.groupBy', async () => {
      mockPrisma.staffProfile.groupBy.mockResolvedValue([{ department: 'Science', _count: 5 }]);

      const result = await service.groupStaffBy(TENANT_ID, ['department' as never]);

      expect(result).toEqual([{ department: 'Science', _count: 5 }]);
    });
  });

  // ─── Classes ───────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countClasses', () => {
    it('should count classes scoped to tenant', async () => {
      mockPrisma.class.count.mockResolvedValue(10);

      const result = await service.countClasses(TENANT_ID);

      expect(result).toBe(10);
    });
  });

  describe('ReportsDataAccessService — findClassStaff', () => {
    it('should delegate to classesReadFacade.findClassStaffGeneric', async () => {
      mockPrisma.classStaff.findMany.mockResolvedValue([{ id: 'cs-1' }]);

      const result = await service.findClassStaff(TENANT_ID);

      expect(result).toEqual([{ id: 'cs-1' }]);
    });
  });

  describe('ReportsDataAccessService — countClassStaff', () => {
    it('should count class staff scoped to tenant', async () => {
      mockPrisma.classStaff.count.mockResolvedValue(8);

      const result = await service.countClassStaff(TENANT_ID);

      expect(result).toBe(8);
    });
  });

  describe('ReportsDataAccessService — countClassEnrolments', () => {
    it('should count class enrolments scoped to tenant', async () => {
      mockPrisma.classEnrolment.count.mockResolvedValue(50);

      const result = await service.countClassEnrolments(TENANT_ID);

      expect(result).toBe(50);
    });
  });

  describe('ReportsDataAccessService — findClassEnrolments', () => {
    it('should delegate to classesReadFacade.findEnrolmentsGeneric', async () => {
      mockPrisma.classEnrolment.findMany.mockResolvedValue([{ id: 'ce-1' }]);

      const result = await service.findClassEnrolments(TENANT_ID);

      expect(result).toEqual([{ id: 'ce-1' }]);
    });
  });

  // ─── Attendance ────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — groupAttendanceRecordsBy', () => {
    it('should delegate to attendanceReadFacade.groupRecordsBy', async () => {
      mockPrisma.attendanceRecord.groupBy.mockResolvedValue([{ status: 'present', _count: 50 }]);

      const result = await service.groupAttendanceRecordsBy(TENANT_ID, ['status' as never]);

      expect(result).toEqual([{ status: 'present', _count: 50 }]);
    });
  });

  // ─── Staff Attendance ──────────────────────────────────────────────────

  describe('ReportsDataAccessService — groupStaffAttendanceBy', () => {
    it('should delegate to payrollReadFacade.groupStaffAttendanceBy', async () => {
      mockPrisma.staffAttendanceRecord.groupBy.mockResolvedValue([
        { status: 'present', _count: 80 },
      ]);

      await service.groupStaffAttendanceBy(TENANT_ID, ['status' as never]);

      expect(mockPrisma.staffAttendanceRecord.groupBy).toHaveBeenCalled();
    });
  });

  // ─── findStudentById with select ──────────────────────────────────────

  describe('ReportsDataAccessService — findStudentById with select', () => {
    it('should pass select option when provided', async () => {
      const student = { id: STUDENT_ID, first_name: 'Aisha' };
      mockPrisma.student.findFirst.mockResolvedValue(student);

      const result = await service.findStudentById(TENANT_ID, STUDENT_ID, {
        id: true,
        first_name: true,
      });

      expect(result).toEqual(student);
    });

    it('should pass undefined options when no select provided', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(null);

      await service.findStudentById(TENANT_ID, STUDENT_ID);

      expect(mockPrisma.student.findFirst).toHaveBeenCalled();
    });
  });

  // ─── Audit Logs ────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — findAuditLogs', () => {
    it('should delegate to auditLogReadFacade.findMany with skip and take', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([{ id: 'al-1' }]);

      await service.findAuditLogs(TENANT_ID, {
        skip: 0,
        take: 20,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalled();
    });
  });

  describe('ReportsDataAccessService — findFirstAuditLog', () => {
    it('should delegate to auditLogReadFacade.findFirst', async () => {
      mockPrisma.auditLog.findFirst.mockResolvedValue({ id: 'al-1' });

      await service.findFirstAuditLog(TENANT_ID);

      expect(mockPrisma.auditLog.findFirst).toHaveBeenCalled();
    });
  });

  // ─── Admissions ────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — countApplications', () => {
    it('should count applications scoped to tenant', async () => {
      mockPrisma.application.count.mockResolvedValue(25);

      const result = await service.countApplications(TENANT_ID);

      expect(result).toBe(25);
    });
  });

  // ─── groupStudentsBy ──────────────────────────────────────────────────

  describe('ReportsDataAccessService — groupStudentsBy', () => {
    it('should delegate to studentReadFacade.groupBy', async () => {
      mockPrisma.student.groupBy.mockResolvedValue([{ status: 'active', _count: 30 }]);

      await service.groupStudentsBy(TENANT_ID, ['status' as never]);

      expect(mockPrisma.student.groupBy).toHaveBeenCalled();
    });
  });

  // ─── Attendance Records & Sessions ─────────────────────────────────────

  describe('ReportsDataAccessService — findAttendanceRecords', () => {
    it('should delegate to attendanceReadFacade.findRecordsGeneric', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([{ id: 'ar-1' }]);

      const result = await service.findAttendanceRecords(TENANT_ID, {
        where: { student_id: 'stu-1' },
      });

      expect(result).toEqual([{ id: 'ar-1' }]);
    });
  });

  describe('ReportsDataAccessService — findAttendanceSessions', () => {
    it('should delegate to attendanceReadFacade.findSessionsGeneric', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([{ id: 'as-1' }]);

      const result = await service.findAttendanceSessions(TENANT_ID, {});

      expect(result).toEqual([{ id: 'as-1' }]);
    });
  });

  // ─── Grades & Assessments ─────────────────────────────────────────────

  describe('ReportsDataAccessService — findGrades', () => {
    it('should delegate to gradebookReadFacade.findGradesGeneric', async () => {
      mockPrisma.grade.findMany.mockResolvedValue([{ id: 'g-1' }]);

      const result = await service.findGrades(TENANT_ID, {});

      expect(result).toEqual([{ id: 'g-1' }]);
    });
  });

  describe('ReportsDataAccessService — groupGradesBy', () => {
    it('should delegate to gradebookReadFacade.groupGradesBy', async () => {
      mockPrisma.grade.groupBy.mockResolvedValue([
        { student_id: 'stu-1', _avg: { raw_score: 80 } },
      ]);

      const result = await service.groupGradesBy(TENANT_ID, ['student_id' as never]);

      expect(result).toEqual([{ student_id: 'stu-1', _avg: { raw_score: 80 } }]);
    });
  });

  describe('ReportsDataAccessService — findAssessments', () => {
    it('should delegate to gradebookReadFacade.findAssessmentsGeneric', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([{ id: 'a-1' }]);

      const result = await service.findAssessments(TENANT_ID, {});

      expect(result).toEqual([{ id: 'a-1' }]);
    });
  });

  describe('ReportsDataAccessService — countAssessments', () => {
    it('should count assessments scoped to tenant', async () => {
      mockPrisma.assessment.count.mockResolvedValue(12);

      const result = await service.countAssessments(TENANT_ID);

      expect(result).toBe(12);
    });
  });

  describe('ReportsDataAccessService — findPeriodGradeSnapshots', () => {
    it('should delegate to gradebookReadFacade.findPeriodSnapshotsGeneric', async () => {
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([{ id: 'pgs-1' }]);

      const result = await service.findPeriodGradeSnapshots(TENANT_ID, {});

      expect(result).toEqual([{ id: 'pgs-1' }]);
    });
  });

  describe('ReportsDataAccessService — findGpaSnapshots', () => {
    it('should delegate to gradebookReadFacade.findGpaSnapshotsGeneric', async () => {
      mockPrisma.gpaSnapshot.findMany.mockResolvedValue([{ id: 'gpa-1' }]);

      const result = await service.findGpaSnapshots(TENANT_ID);

      expect(result).toEqual([{ id: 'gpa-1' }]);
    });
  });

  describe('ReportsDataAccessService — countStudentAcademicRiskAlerts', () => {
    it('should count risk alerts scoped to tenant', async () => {
      mockPrisma.studentAcademicRiskAlert.count.mockResolvedValue(7);

      const result = await service.countStudentAcademicRiskAlerts(TENANT_ID);

      expect(result).toBe(7);
    });
  });

  describe('ReportsDataAccessService — findStudentAcademicRiskAlerts', () => {
    it('should delegate to gradebookReadFacade.findRiskAlertsGeneric', async () => {
      mockPrisma.studentAcademicRiskAlert.findMany.mockResolvedValue([{ id: 'ra-1' }]);

      const result = await service.findStudentAcademicRiskAlerts(TENANT_ID, {});

      expect(result).toEqual([{ id: 'ra-1' }]);
    });
  });

  describe('ReportsDataAccessService — findReportCards', () => {
    it('should delegate to gradebookReadFacade.findReportCardsGeneric', async () => {
      mockPrisma.reportCard.findMany.mockResolvedValue([{ id: 'rc-1' }]);

      const result = await service.findReportCards(TENANT_ID);

      expect(result).toEqual([{ id: 'rc-1' }]);
    });
  });

  // ─── Finance (remaining) ──────────────────────────────────────────────

  describe('ReportsDataAccessService — findInvoices', () => {
    it('should delegate to financeReadFacade.findInvoicesGeneric', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([{ id: 'inv-1' }]);

      const result = await service.findInvoices(TENANT_ID, {});

      expect(result).toEqual([{ id: 'inv-1' }]);
    });
  });

  describe('ReportsDataAccessService — aggregateInvoices', () => {
    it('should delegate to financeReadFacade.aggregateInvoices', async () => {
      const aggResult = { _sum: { total_amount: 50000, balance_amount: 10000 } };
      mockPrisma.invoice.aggregate.mockResolvedValue(aggResult);

      const result = await service.aggregateInvoices(TENANT_ID);

      expect(result).toEqual(aggResult);
    });
  });

  describe('ReportsDataAccessService — findPayments', () => {
    it('should delegate to financeReadFacade.findPaymentsGeneric', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([{ id: 'pay-1' }]);

      const result = await service.findPayments(TENANT_ID, {});

      expect(result).toEqual([{ id: 'pay-1' }]);
    });
  });

  describe('ReportsDataAccessService — findStaffCompensations', () => {
    it('should delegate to payrollReadFacade.findCompensationsGeneric', async () => {
      mockPrisma.staffCompensation.findMany.mockResolvedValue([{ id: 'sc-1' }]);

      const result = await service.findStaffCompensations(TENANT_ID);

      expect(result).toEqual([{ id: 'sc-1' }]);
    });
  });

  // ─── Admissions (remaining) ────────────────────────────────────────────

  describe('ReportsDataAccessService — findApplications', () => {
    it('should delegate to admissionsReadFacade.findApplicationsGeneric', async () => {
      mockPrisma.application.findMany.mockResolvedValue([{ id: 'app-1' }]);

      const result = await service.findApplications(TENANT_ID, {});

      expect(result).toEqual([{ id: 'app-1' }]);
    });
  });

  // ─── Academics ─────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — findYearGroups', () => {
    it('should delegate to academicReadFacade.findYearGroupsGeneric', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);

      const result = await service.findYearGroups(TENANT_ID);

      expect(result).toEqual([{ id: 'yg-1', name: 'Year 1' }]);
    });
  });

  describe('ReportsDataAccessService — findAcademicPeriods', () => {
    it('should delegate to academicReadFacade.findPeriodsGeneric', async () => {
      mockPrisma.academicPeriod.findMany.mockResolvedValue([{ id: 'ap-1' }]);

      const result = await service.findAcademicPeriods(TENANT_ID);

      expect(result).toEqual([{ id: 'ap-1' }]);
    });
  });

  describe('ReportsDataAccessService — findSubjects', () => {
    it('should delegate to academicReadFacade.findAllSubjects', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([{ id: 'sub-1', name: 'Maths' }]);

      const result = await service.findSubjects(TENANT_ID);

      expect(result).toEqual([{ id: 'sub-1', name: 'Maths' }]);
    });
  });

  // ─── Payroll ───────────────────────────────────────────────────────────

  describe('ReportsDataAccessService — findPayrollRuns', () => {
    it('should delegate to payrollReadFacade.findPayrollRunsGeneric', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([{ id: 'pr-1' }]);

      const result = await service.findPayrollRuns(TENANT_ID);

      expect(result).toEqual([{ id: 'pr-1' }]);
    });
  });

  // ─── Notifications ─────────────────────────────────────────────────────

  describe('ReportsDataAccessService — findNotifications', () => {
    it('should delegate to communicationsReadFacade.findNotificationsGeneric', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([{ id: 'n-1' }]);

      const result = await service.findNotifications(TENANT_ID);

      expect(result).toEqual([{ id: 'n-1' }]);
    });
  });
});
