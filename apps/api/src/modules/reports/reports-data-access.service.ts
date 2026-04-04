import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AdmissionsReadFacade } from '../admissions/admissions-read.facade';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { AuditLogReadFacade } from '../audit-log/audit-log-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { CommunicationsReadFacade } from '../communications/communications-read.facade';
import { FinanceReadFacade } from '../finance/finance-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { PayrollReadFacade } from '../payroll/payroll-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';

// ─── Cross-module read-only data access for Reports & Dashboard ──────────────
//
// This service centralises ALL cross-module reads that the reports
// and dashboard analytics services need. All cross-module reads now
// delegate to the owning module's ReadFacade.
//
// Own-module tables (report-specific) that are still queried directly:
//   schedules, approval_requests, households, notifications, audit_logs,
//   year_groups, academic_periods, subjects, payroll_runs
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
    private readonly prisma: PrismaService,
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
    return this.prisma.student.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.skip !== undefined && { skip: options.skip }),
      ...(options.take !== undefined && { take: options.take }),
      ...(options.orderBy && { orderBy: options.orderBy }),
    });
  }

  async findStudentById(
    tenantId: string,
    studentId: string,
    select?: Prisma.StudentSelect,
  ): Promise<unknown | null> {
    return this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      ...(select && { select }),
    });
  }

  /** Group students by one or more scalar fields, always scoped to the tenant. Returns `_count` per group. */
  async groupStudentsBy<K extends Prisma.StudentScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.StudentWhereInput,
  ): Promise<Array<Record<string, unknown> & { _count: number }>> {
    const result = await this.prisma.student.groupBy({
      by,
      where: { tenant_id: tenantId, ...where },
      _count: true,
    });
    return result as unknown as Array<Record<string, unknown> & { _count: number }>;
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
    return this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.skip !== undefined && { skip: options.skip }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }

  async groupStaffBy<K extends Prisma.StaffProfileScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.StaffProfileWhereInput,
  ): Promise<Array<Record<string, unknown> & { _count: number }>> {
    const result = await this.prisma.staffProfile.groupBy({
      by,
      where: { tenant_id: tenantId, ...where },
      _count: true,
    });
    return result as unknown as Array<Record<string, unknown> & { _count: number }>;
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
    const result = await this.prisma.attendanceRecord.groupBy({
      by,
      where: { tenant_id: tenantId, ...where },
      _count: true,
    });
    return result as unknown as Array<Record<string, unknown> & { _count: number }>;
  }

  async countAttendanceRecords(
    tenantId: string,
    where?: Prisma.AttendanceRecordWhereInput,
  ): Promise<number> {
    return this.prisma.attendanceRecord.count({
      where: { tenant_id: tenantId, ...where },
    });
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
    return this.prisma.attendanceRecord.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }

  async findAttendanceSessions(
    tenantId: string,
    options: {
      where?: Prisma.AttendanceSessionWhereInput;
      select?: Prisma.AttendanceSessionSelect;
      orderBy?: Prisma.AttendanceSessionOrderByWithRelationInput;
    },
  ): Promise<unknown[]> {
    return this.prisma.attendanceSession.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
    });
  }

  async countAttendanceSessions(
    tenantId: string,
    where?: Prisma.AttendanceSessionWhereInput,
  ): Promise<number> {
    return this.prisma.attendanceSession.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  // ─── Staff Attendance ──────────────────────────────────────────────────────

  async groupStaffAttendanceBy<K extends Prisma.StaffAttendanceRecordScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.StaffAttendanceRecordWhereInput,
  ): Promise<Array<Record<string, unknown> & { _count: number }>> {
    const result = await this.prisma.staffAttendanceRecord.groupBy({
      by,
      where: { tenant_id: tenantId, ...where },
      _count: true,
    });
    return result as unknown as Array<Record<string, unknown> & { _count: number }>;
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
    return this.prisma.grade.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
    });
  }

  async groupGradesBy<K extends Prisma.GradeScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.GradeWhereInput,
    options?: { _avg?: Prisma.GradeAvgAggregateInputType },
  ): Promise<Array<Record<string, unknown>>> {
    const result = await this.prisma.grade.groupBy({
      by,
      where: { tenant_id: tenantId, ...where },
      ...(options?._avg && { _avg: options._avg }),
      _count: true,
    });
    return result as unknown as Array<Record<string, unknown>>;
  }

  /** Aggregate grade scores. Converts Prisma Decimal to `number` so callers get a plain JS number, not a Decimal object. */
  async aggregateGrades(
    tenantId: string,
    where?: Prisma.GradeWhereInput,
  ): Promise<{ _avg: { raw_score: number | null } }> {
    const result = await this.prisma.grade.aggregate({
      where: { tenant_id: tenantId, ...where },
      _avg: { raw_score: true },
    });
    return {
      _avg: { raw_score: result._avg.raw_score !== null ? Number(result._avg.raw_score) : null },
    };
  }

  async findAssessments(
    tenantId: string,
    options: {
      where?: Prisma.AssessmentWhereInput;
      select?: Prisma.AssessmentSelect;
    },
  ): Promise<unknown[]> {
    return this.prisma.assessment.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
    });
  }

  async countAssessments(tenantId: string, where?: Prisma.AssessmentWhereInput): Promise<number> {
    return this.prisma.assessment.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  async findPeriodGradeSnapshots(
    tenantId: string,
    options: {
      where?: Prisma.PeriodGradeSnapshotWhereInput;
      select?: Prisma.PeriodGradeSnapshotSelect;
      orderBy?: Prisma.PeriodGradeSnapshotOrderByWithRelationInput;
    },
  ): Promise<unknown[]> {
    return this.prisma.periodGradeSnapshot.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
    });
  }

  async findGpaSnapshots(
    tenantId: string,
    where?: Prisma.GpaSnapshotWhereInput,
    select?: Prisma.GpaSnapshotSelect,
  ): Promise<unknown[]> {
    return this.prisma.gpaSnapshot.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
    });
  }

  async countStudentAcademicRiskAlerts(
    tenantId: string,
    where?: Prisma.StudentAcademicRiskAlertWhereInput,
  ): Promise<number> {
    return this.prisma.studentAcademicRiskAlert.count({
      where: { tenant_id: tenantId, ...where },
    });
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
    return this.prisma.studentAcademicRiskAlert.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }

  async findReportCards(
    tenantId: string,
    where?: Prisma.ReportCardWhereInput,
    select?: Prisma.ReportCardSelect,
    orderBy?: Prisma.ReportCardOrderByWithRelationInput,
  ): Promise<unknown[]> {
    return this.prisma.reportCard.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
      ...(orderBy && { orderBy }),
    });
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
    return this.prisma.invoice.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
      ...(options.skip !== undefined && { skip: options.skip }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }

  async countInvoices(tenantId: string, where?: Prisma.InvoiceWhereInput): Promise<number> {
    return this.prisma.invoice.count({
      where: { tenant_id: tenantId, ...where },
    });
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
    return this.prisma.invoice.aggregate({
      where: { tenant_id: tenantId, ...where },
      _sum: { total_amount: true, balance_amount: true },
    }) as unknown as {
      _sum: {
        total_amount: number | null;
        balance_amount: number | null;
        discount_amount?: number | null;
      };
    };
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
    return this.prisma.payment.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }

  async findStaffCompensations(
    tenantId: string,
    where?: Prisma.StaffCompensationWhereInput,
    select?: Prisma.StaffCompensationSelect,
  ): Promise<unknown[]> {
    return this.prisma.staffCompensation.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
    });
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
    return this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      ...(select && { select }),
      ...(orderBy ? { orderBy } : { orderBy: { display_order: 'asc' } }),
    });
  }

  async findAcademicPeriods(
    tenantId: string,
    where?: Prisma.AcademicPeriodWhereInput,
    select?: Prisma.AcademicPeriodSelect,
  ): Promise<unknown[]> {
    return this.prisma.academicPeriod.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
    });
  }

  async findSubjects(tenantId: string, select?: Prisma.SubjectSelect): Promise<unknown[]> {
    return this.prisma.subject.findMany({
      where: { tenant_id: tenantId },
      ...(select && { select }),
    });
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
    return this.prisma.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      ...(select && { select }),
    });
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
    where?: Prisma.AuditLogWhereInput,
    orderBy?: Prisma.AuditLogOrderByWithRelationInput,
  ): Promise<unknown | null> {
    return this.auditLogReadFacade.findFirst(tenantId);
  }

  async countAuditLogs(tenantId: string, where?: Prisma.AuditLogWhereInput): Promise<number> {
    return this.auditLogReadFacade.count(tenantId);
  }

  // ─── Schedules ─────────────────────────────────────────────────────────────

  async countSchedules(tenantId: string, where?: Prisma.ScheduleWhereInput): Promise<number> {
    return this.prisma.schedule.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  // ─── Approval Requests ─────────────────────────────────────────────────────

  async countApprovalRequests(
    tenantId: string,
    where?: Prisma.ApprovalRequestWhereInput,
  ): Promise<number> {
    return this.prisma.approvalRequest.count({
      where: { tenant_id: tenantId, ...where },
    });
  }
}
