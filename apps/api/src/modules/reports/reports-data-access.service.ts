import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

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

// ─── Cross-module read-only data access for Reports & Dashboard ──────────────
//
// This service centralises ALL cross-module reads that the reports
// and dashboard analytics services need. All cross-module reads now
// delegate to the owning module's ReadFacade.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Return types ────────────────────────────────────────────────────────────

export interface StudentCountResult {
  active: number;
  total: number;
  applicants: number;
}

export interface StaffCountResult {
  active: number;
  total: number;
}

export interface StatusCount {
  status: string;
  _count: number;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsDataAccessService {
  constructor(
    private readonly studentReadFacade: StudentReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly attendanceReadFacade: AttendanceReadFacade,
    private readonly gradebookReadFacade: GradebookReadFacade,
    private readonly financeReadFacade: FinanceReadFacade,
    private readonly admissionsReadFacade: AdmissionsReadFacade,
    private readonly payrollReadFacade: PayrollReadFacade,
    private readonly communicationsReadFacade: CommunicationsReadFacade,
    private readonly auditLogReadFacade: AuditLogReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly householdReadFacade: HouseholdReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly approvalsReadFacade: ApprovalsReadFacade,
  ) {}

  // ─── Students ──────────────────────────────────────────────────────────────

  async countStudents(tenantId: string, where?: Prisma.StudentWhereInput): Promise<number> {
    return this.studentReadFacade.count(tenantId, where);
  }

  async countStudentsByStatus(tenantId: string): Promise<StudentCountResult> {
    const [active, total, applicants] = await Promise.all([
      this.studentReadFacade.count(tenantId, { status: 'active' }),
      this.studentReadFacade.count(tenantId),
      this.studentReadFacade.count(tenantId, { status: 'applicant' }),
    ]);
    return { active, total, applicants };
  }

  async findStudents(
    tenantId: string,
    options: {
      where?: Prisma.StudentWhereInput;
      select?: Prisma.StudentSelect;
      skip?: number;
      take?: number;
      orderBy?: Prisma.StudentOrderByWithRelationInput;
    },
  ): Promise<unknown[]> {
    return this.studentReadFacade.findManyGeneric(tenantId, options);
  }

  async findStudentById(
    tenantId: string,
    studentId: string,
    select?: Prisma.StudentSelect,
  ): Promise<unknown | null> {
    return this.studentReadFacade.findOneGeneric(
      tenantId,
      studentId,
      select ? { select } : undefined,
    );
  }

  /** Group students by one or more scalar fields, always scoped to the tenant. Returns `_count` per group. */
  async groupStudentsBy<K extends Prisma.StudentScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.StudentWhereInput,
  ): Promise<Array<Record<string, unknown> & { _count: number }>> {
    return this.studentReadFacade.groupBy(tenantId, by, where);
  }

  // ─── Staff Profiles ────────────────────────────────────────────────────────

  async countStaff(tenantId: string, where?: Prisma.StaffProfileWhereInput): Promise<number> {
    return this.staffProfileReadFacade.count(tenantId, where);
  }

  async countStaffByStatus(tenantId: string): Promise<StaffCountResult> {
    const [active, total] = await Promise.all([
      this.staffProfileReadFacade.count(tenantId, { employment_status: 'active' }),
      this.staffProfileReadFacade.count(tenantId),
    ]);
    return { active, total };
  }

  async findStaffProfiles(
    tenantId: string,
    options: {
      where?: Prisma.StaffProfileWhereInput;
      select?: Prisma.StaffProfileSelect;
      skip?: number;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.staffProfileReadFacade.findManyGeneric(tenantId, options);
  }

  async groupStaffBy<K extends Prisma.StaffProfileScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.StaffProfileWhereInput,
  ): Promise<Array<Record<string, unknown> & { _count: number }>> {
    return this.staffProfileReadFacade.groupBy(tenantId, by, where);
  }

  // ─── Classes ───────────────────────────────────────────────────────────────

  async countClasses(tenantId: string, where?: Prisma.ClassWhereInput): Promise<number> {
    return this.classesReadFacade.countClassesGeneric(tenantId, where);
  }

  async findClasses(
    tenantId: string,
    where?: Prisma.ClassWhereInput,
    select?: Prisma.ClassSelect,
  ): Promise<unknown[]> {
    return this.classesReadFacade.findClassesGeneric(tenantId, where, select);
  }

  async findClassStaff(
    tenantId: string,
    where?: Prisma.ClassStaffWhereInput,
    select?: Prisma.ClassStaffSelect,
  ): Promise<unknown[]> {
    return this.classesReadFacade.findClassStaffGeneric(tenantId, where, select);
  }

  async countClassStaff(tenantId: string, where?: Prisma.ClassStaffWhereInput): Promise<number> {
    return this.classesReadFacade.countClassStaffGeneric(tenantId, where);
  }

  async countClassEnrolments(
    tenantId: string,
    where?: Prisma.ClassEnrolmentWhereInput,
  ): Promise<number> {
    return this.classesReadFacade.countEnrolmentsGeneric(tenantId, where);
  }

  async findClassEnrolments(
    tenantId: string,
    where?: Prisma.ClassEnrolmentWhereInput,
    select?: Prisma.ClassEnrolmentSelect,
    orderBy?: Prisma.ClassEnrolmentOrderByWithRelationInput,
  ): Promise<unknown[]> {
    return this.classesReadFacade.findEnrolmentsGeneric(tenantId, where, select, orderBy);
  }

  // ─── Attendance ────────────────────────────────────────────────────────────

  async groupAttendanceRecordsBy<K extends Prisma.AttendanceRecordScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.AttendanceRecordWhereInput,
  ): Promise<Array<Record<string, unknown> & { _count: number }>> {
    return this.attendanceReadFacade.groupRecordsBy(tenantId, by, where);
  }

  async countAttendanceRecords(
    tenantId: string,
    where?: Prisma.AttendanceRecordWhereInput,
  ): Promise<number> {
    return this.attendanceReadFacade.countRecordsGeneric(tenantId, where);
  }

  async findAttendanceRecords(
    tenantId: string,
    options: {
      where?: Prisma.AttendanceRecordWhereInput;
      select?: Prisma.AttendanceRecordSelect;
      orderBy?: Prisma.AttendanceRecordOrderByWithRelationInput;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.attendanceReadFacade.findRecordsGeneric(tenantId, options);
  }

  async findAttendanceSessions(
    tenantId: string,
    options: {
      where?: Prisma.AttendanceSessionWhereInput;
      select?: Prisma.AttendanceSessionSelect;
      orderBy?: Prisma.AttendanceSessionOrderByWithRelationInput;
    },
  ): Promise<unknown[]> {
    return this.attendanceReadFacade.findSessionsGeneric(tenantId, options);
  }

  async countAttendanceSessions(
    tenantId: string,
    where?: Prisma.AttendanceSessionWhereInput,
  ): Promise<number> {
    return this.attendanceReadFacade.countSessionsGeneric(tenantId, where);
  }

  // ─── Staff Attendance ──────────────────────────────────────────────────────

  async groupStaffAttendanceBy<K extends Prisma.StaffAttendanceRecordScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.StaffAttendanceRecordWhereInput,
  ): Promise<Array<Record<string, unknown> & { _count: number }>> {
    return this.payrollReadFacade.groupStaffAttendanceBy(tenantId, by, where);
  }

  // ─── Grades & Assessments ─────────────────────────────────────────────────

  async findGrades(
    tenantId: string,
    options: {
      where?: Prisma.GradeWhereInput;
      select?: Prisma.GradeSelect;
      orderBy?: Prisma.GradeOrderByWithRelationInput;
    },
  ): Promise<unknown[]> {
    return this.gradebookReadFacade.findGradesGeneric(tenantId, options);
  }

  async groupGradesBy<K extends Prisma.GradeScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.GradeWhereInput,
    options?: { _avg?: Prisma.GradeAvgAggregateInputType },
  ): Promise<Array<Record<string, unknown>>> {
    return this.gradebookReadFacade.groupGradesBy(tenantId, by, where, options);
  }

  /** Aggregate grade scores. Converts Prisma Decimal to `number` so callers get a plain JS number, not a Decimal object. */
  async aggregateGrades(
    tenantId: string,
    where?: Prisma.GradeWhereInput,
  ): Promise<{ _avg: { raw_score: number | null } }> {
    return this.gradebookReadFacade.aggregateGrades(tenantId, where);
  }

  async findAssessments(
    tenantId: string,
    options: {
      where?: Prisma.AssessmentWhereInput;
      select?: Prisma.AssessmentSelect;
    },
  ): Promise<unknown[]> {
    return this.gradebookReadFacade.findAssessmentsGeneric(tenantId, options);
  }

  async countAssessments(tenantId: string, where?: Prisma.AssessmentWhereInput): Promise<number> {
    return this.gradebookReadFacade.countAssessments(tenantId, where);
  }

  async findPeriodGradeSnapshots(
    tenantId: string,
    options: {
      where?: Prisma.PeriodGradeSnapshotWhereInput;
      select?: Prisma.PeriodGradeSnapshotSelect;
      orderBy?: Prisma.PeriodGradeSnapshotOrderByWithRelationInput;
    },
  ): Promise<unknown[]> {
    return this.gradebookReadFacade.findPeriodSnapshotsGeneric(tenantId, options);
  }

  async findGpaSnapshots(
    tenantId: string,
    where?: Prisma.GpaSnapshotWhereInput,
    select?: Prisma.GpaSnapshotSelect,
  ): Promise<unknown[]> {
    return this.gradebookReadFacade.findGpaSnapshotsGeneric(tenantId, where, select);
  }

  async countStudentAcademicRiskAlerts(
    tenantId: string,
    where?: Prisma.StudentAcademicRiskAlertWhereInput,
  ): Promise<number> {
    return this.gradebookReadFacade.countRiskAlerts(tenantId, where);
  }

  async findStudentAcademicRiskAlerts(
    tenantId: string,
    options: {
      where?: Prisma.StudentAcademicRiskAlertWhereInput;
      select?: Prisma.StudentAcademicRiskAlertSelect;
      orderBy?: Prisma.StudentAcademicRiskAlertOrderByWithRelationInput;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.gradebookReadFacade.findRiskAlertsGeneric(tenantId, options);
  }

  async findReportCards(
    tenantId: string,
    where?: Prisma.ReportCardWhereInput,
    select?: Prisma.ReportCardSelect,
    orderBy?: Prisma.ReportCardOrderByWithRelationInput,
  ): Promise<unknown[]> {
    return this.gradebookReadFacade.findReportCardsGeneric(tenantId, where, select, orderBy);
  }

  // ─── Finance ───────────────────────────────────────────────────────────────

  async findInvoices(
    tenantId: string,
    options: {
      where?: Prisma.InvoiceWhereInput;
      select?: Prisma.InvoiceSelect;
      orderBy?: Prisma.InvoiceOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.financeReadFacade.findInvoicesGeneric(tenantId, options);
  }

  async countInvoices(tenantId: string, where?: Prisma.InvoiceWhereInput): Promise<number> {
    return this.financeReadFacade.countInvoices(tenantId, where);
  }

  /** Aggregate invoice monetary totals. Returns plain `number` values — Prisma returns Decimal for NUMERIC columns which must be coerced. */
  async aggregateInvoices(
    tenantId: string,
    where?: Prisma.InvoiceWhereInput,
  ): Promise<{
    _sum: {
      total_amount: number | null;
      balance_amount: number | null;
      discount_amount?: number | null;
    };
  }> {
    return this.financeReadFacade.aggregateInvoices(tenantId, where);
  }

  async findPayments(
    tenantId: string,
    options: {
      where?: Prisma.PaymentWhereInput;
      select?: Prisma.PaymentSelect;
      orderBy?: Prisma.PaymentOrderByWithRelationInput;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.financeReadFacade.findPaymentsGeneric(tenantId, options);
  }

  async findStaffCompensations(
    tenantId: string,
    where?: Prisma.StaffCompensationWhereInput,
    select?: Prisma.StaffCompensationSelect,
  ): Promise<unknown[]> {
    return this.payrollReadFacade.findCompensationsGeneric(tenantId, where, select);
  }

  // ─── Admissions ────────────────────────────────────────────────────────────

  async countApplications(tenantId: string, where?: Prisma.ApplicationWhereInput): Promise<number> {
    return this.admissionsReadFacade.countApplicationsGeneric(tenantId, where);
  }

  async findApplications(
    tenantId: string,
    options: {
      where?: Prisma.ApplicationWhereInput;
      select?: Prisma.ApplicationSelect;
      orderBy?: Prisma.ApplicationOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.admissionsReadFacade.findApplicationsGeneric(tenantId, options);
  }

  // ─── Academics ─────────────────────────────────────────────────────────────

  async findYearGroups(
    tenantId: string,
    select?: Prisma.YearGroupSelect,
    orderBy?: Prisma.YearGroupOrderByWithRelationInput,
  ): Promise<unknown[]> {
    return this.academicReadFacade.findYearGroupsGeneric(tenantId, select, orderBy);
  }

  async findAcademicPeriods(
    tenantId: string,
    where?: Prisma.AcademicPeriodWhereInput,
    select?: Prisma.AcademicPeriodSelect,
  ): Promise<unknown[]> {
    return this.academicReadFacade.findPeriodsGeneric(tenantId, where, select);
  }

  async findSubjects(tenantId: string, select?: Prisma.SubjectSelect): Promise<unknown[]> {
    return this.academicReadFacade.findAllSubjects(tenantId, select);
  }

  // ─── Payroll ───────────────────────────────────────────────────────────────

  async findPayrollRuns(
    tenantId: string,
    where?: Prisma.PayrollRunWhereInput,
    select?: Prisma.PayrollRunSelect,
    orderBy?: Prisma.PayrollRunOrderByWithRelationInput,
  ): Promise<unknown[]> {
    return this.payrollReadFacade.findPayrollRunsGeneric(tenantId, where, select, orderBy);
  }

  // ─── Households ────────────────────────────────────────────────────────────

  async findHouseholdById(
    tenantId: string,
    householdId: string,
    select?: Prisma.HouseholdSelect,
  ): Promise<unknown | null> {
    return this.householdReadFacade.findByIdGeneric(tenantId, householdId, select);
  }

  // ─── Notifications ─────────────────────────────────────────────────────────

  async findNotifications(
    tenantId: string,
    where?: Prisma.NotificationWhereInput,
    select?: Prisma.NotificationSelect,
  ): Promise<unknown[]> {
    return this.communicationsReadFacade.findNotificationsGeneric(tenantId, where, select);
  }

  // ─── Audit Logs ────────────────────────────────────────────────────────────

  async findAuditLogs(
    tenantId: string,
    options: {
      where?: Prisma.AuditLogWhereInput;
      orderBy?: Prisma.AuditLogOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.auditLogReadFacade.findMany(tenantId, {
      skip: options.skip,
      take: options.take,
    });
  }

  async findFirstAuditLog(
    tenantId: string,
    _where?: Prisma.AuditLogWhereInput,
    _orderBy?: Prisma.AuditLogOrderByWithRelationInput,
  ): Promise<unknown | null> {
    return this.auditLogReadFacade.findFirst(tenantId);
  }

  async countAuditLogs(tenantId: string, _where?: Prisma.AuditLogWhereInput): Promise<number> {
    return this.auditLogReadFacade.count(tenantId);
  }

  // ─── Schedules ─────────────────────────────────────────────────────────────

  async countSchedules(tenantId: string, where?: Prisma.ScheduleWhereInput): Promise<number> {
    return this.schedulesReadFacade.count(tenantId, where);
  }

  // ─── Approval Requests ─────────────────────────────────────────────────────

  async countApprovalRequests(
    tenantId: string,
    where?: Prisma.ApprovalRequestWhereInput,
  ): Promise<number> {
    return this.approvalsReadFacade.countRequestsGeneric(tenantId, where);
  }
}
