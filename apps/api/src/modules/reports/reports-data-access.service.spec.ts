import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  StudentReadFacade,
  StaffProfileReadFacade,
  ClassesReadFacade,
  AttendanceReadFacade,
  GradebookReadFacade,
  FinanceReadFacade,
  AuditLogReadFacade,
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
            findManyGeneric: jest.fn().mockImplementation((_t: string, opts: Record<string, unknown>) => {
              return mockPrisma.student.findMany({ ...opts, where: { tenant_id: _t, ...(opts.where as Record<string, unknown> ?? {}) } });
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
            findClassesGeneric: jest.fn().mockImplementation((_t: string, where?: Record<string, unknown>) => {
              return mockPrisma.class.findMany({ where: { tenant_id: _t, ...where } });
            }),
            findClassStaffGeneric: jest.fn().mockImplementation(() => mockPrisma.classStaff.findMany()),
            countClassStaffGeneric: jest.fn().mockImplementation(() => mockPrisma.classStaff.count()),
            countEnrolmentsGeneric: jest.fn().mockImplementation(() => mockPrisma.classEnrolment.count()),
            findEnrolmentsGeneric: jest.fn().mockImplementation(() => mockPrisma.classEnrolment.findMany()),
          },
        },
        {
          provide: AttendanceReadFacade,
          useValue: {
            groupRecordsBy: jest.fn().mockImplementation(() => mockPrisma.attendanceRecord.groupBy()),
            countRecordsGeneric: jest.fn().mockImplementation(() => mockPrisma.attendanceRecord.count()),
            countSessionsGeneric: jest.fn().mockImplementation(() => mockPrisma.attendanceSession.count()),
          },
        },
        {
          provide: GradebookReadFacade,
          useValue: {
            aggregateGrades: jest.fn().mockImplementation(() => mockPrisma.grade.aggregate()),
          },
        },
        {
          provide: FinanceReadFacade,
          useValue: {
            countInvoices: jest.fn().mockImplementation(() => mockPrisma.invoice.count()),
          },
        },
        {
          provide: AuditLogReadFacade,
          useValue: {
            count: jest.fn().mockImplementation(() => mockPrisma.auditLog.count()),
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
            countRequestsGeneric: jest.fn().mockImplementation(() => mockPrisma.approvalRequest.count()),
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
});
