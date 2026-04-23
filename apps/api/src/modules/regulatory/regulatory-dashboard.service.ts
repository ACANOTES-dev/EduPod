import { Injectable } from '@nestjs/common';
import type { RegulatoryDomain } from '@prisma/client';
import { PodSyncStatus, RegulatorySubmissionStatus, TransferStatus } from '@prisma/client';

import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { ComplianceReadFacade } from '../compliance/compliance-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { SafeguardingReadFacade } from '../safeguarding/safeguarding-read.facade';

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPLETED_STATUSES: RegulatorySubmissionStatus[] = [
  RegulatorySubmissionStatus.reg_submitted,
  RegulatorySubmissionStatus.reg_accepted,
];
const MS_PER_DAY = 86_400_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface NextDeadline {
  id: string;
  title: string;
  domain: string;
  due_date: Date;
}

interface DashboardSummary {
  calendar: {
    upcoming_deadlines: number;
    overdue: number;
    next_deadline: NextDeadline | null;
    next_deadlines: NextDeadline[];
  };
  tusla: {
    students_approaching_threshold: number;
    students_exceeded_threshold: number;
    active_alerts: number;
  };
  des: {
    readiness_status: 'not_started' | 'incomplete' | 'ready';
    recent_submissions: number;
    last_submission_at: Date | null;
  };
  october_returns: {
    readiness_status: 'not_started' | 'incomplete' | 'ready';
  };
  ppod: {
    synced: number;
    pending: number;
    errors: number;
    last_sync_at: Date | null;
    health_percent: number;
  };
  cba: {
    pending_sync: number;
    synced: number;
    last_sync_at: Date | null;
  };
  transfers: {
    pending_count: number;
  };
  submissions: {
    this_year_count: number;
  };
  anti_bullying: {
    open_count: number;
  };
  safeguarding: {
    open_count: number;
  };
  gdpr: {
    open_dsar_count: number;
  };
}

interface OverdueItem {
  id: string;
  type: 'calendar_event';
  title: string;
  domain: string;
  due_date: Date;
  days_overdue: number;
}

@Injectable()
export class RegulatoryDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceReadFacade: AttendanceReadFacade,
    private readonly safeguardingReadFacade: SafeguardingReadFacade,
    private readonly complianceReadFacade: ComplianceReadFacade,
  ) {}

  // ─── Dashboard Summary ────────────────────────────────────────────────────

  async getDashboardSummary(tenantId: string): Promise<DashboardSummary> {
    const now = new Date();
    const academicYear = this.getCurrentAcademicYear();

    const [
      calendar,
      tusla,
      des,
      octoberReturns,
      ppod,
      cba,
      transfersPending,
      submissionsThisYear,
      antiBullyingOpen,
      safeguardingOpen,
      gdprOpenDsar,
    ] = await Promise.all([
      this.getCalendarSummary(tenantId, now),
      this.getTuslaSummary(tenantId),
      this.getDesSummary(tenantId),
      this.getSubmissionReadiness(tenantId, 'des_october_census'),
      this.getPpodSummary(tenantId),
      this.getCbaSummary(tenantId),
      this.countPendingTransfers(tenantId),
      this.countSubmissionsForYear(tenantId, academicYear),
      this.countOpenAntiBullying(tenantId),
      this.countOpenSafeguardingConcerns(tenantId),
      this.countOpenDsarRequests(tenantId),
    ]);

    return {
      calendar,
      tusla,
      des,
      october_returns: { readiness_status: octoberReturns.readiness_status },
      ppod,
      cba,
      transfers: { pending_count: transfersPending },
      submissions: { this_year_count: submissionsThisYear },
      anti_bullying: { open_count: antiBullyingOpen },
      safeguarding: { open_count: safeguardingOpen },
      gdpr: { open_dsar_count: gdprOpenDsar },
    };
  }

  // ─── Overdue Items ────────────────────────────────────────────────────────

  async getOverdueItems(tenantId: string): Promise<OverdueItem[]> {
    const now = new Date();

    const overdueEvents = await this.prisma.regulatoryCalendarEvent.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: COMPLETED_STATUSES },
        due_date: { lt: now },
      },
      select: { id: true, title: true, domain: true, due_date: true },
      orderBy: { due_date: 'asc' },
    });

    return overdueEvents
      .map((event: { id: string; title: string; domain: string; due_date: Date }) => ({
        id: event.id,
        type: 'calendar_event' as const,
        title: event.title,
        domain: event.domain,
        due_date: event.due_date,
        days_overdue: Math.floor((now.getTime() - event.due_date.getTime()) / MS_PER_DAY),
      }))
      .sort((a: OverdueItem, b: OverdueItem) => b.days_overdue - a.days_overdue);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getCalendarSummary(tenantId: string, now: Date) {
    const baseWhere = {
      tenant_id: tenantId,
      status: { notIn: COMPLETED_STATUSES },
    };

    const [upcomingDeadlines, overdue, nextDeadline, nextDeadlines] = await Promise.all([
      this.prisma.regulatoryCalendarEvent.count({
        where: { ...baseWhere, due_date: { gt: now } },
      }),
      this.prisma.regulatoryCalendarEvent.count({
        where: { ...baseWhere, due_date: { lt: now } },
      }),
      this.prisma.regulatoryCalendarEvent.findFirst({
        where: { ...baseWhere, due_date: { gt: now } },
        orderBy: { due_date: 'asc' },
        select: { id: true, title: true, domain: true, due_date: true },
      }),
      this.prisma.regulatoryCalendarEvent.findMany({
        where: { ...baseWhere, due_date: { gt: now } },
        orderBy: { due_date: 'asc' },
        take: 5,
        select: { id: true, title: true, domain: true, due_date: true },
      }),
    ]);

    return {
      upcoming_deadlines: upcomingDeadlines,
      overdue,
      next_deadline: nextDeadline,
      next_deadlines: nextDeadlines,
    };
  }

  private async getTuslaSummary(tenantId: string) {
    const [activeAlerts, excessiveAbsenceAlerts] = await Promise.all([
      this.attendanceReadFacade.countActivePatternAlerts(tenantId),
      this.attendanceReadFacade.findActiveAlertsByType(tenantId, 'excessive_absences'),
    ]);

    type AlertRow = { student_id: string; details_json: unknown };

    const tuslaAlerts = excessiveAbsenceAlerts.filter((a: AlertRow) => {
      const details = a.details_json as Record<string, unknown> | null;
      return details?.source === 'tusla_threshold_scan';
    });

    const exceededStudents = new Set(
      tuslaAlerts
        .filter((a: AlertRow) => (a.details_json as Record<string, unknown>).status === 'exceeded')
        .map((a: AlertRow) => a.student_id),
    );

    const approachingStudents = new Set(
      tuslaAlerts
        .filter(
          (a: AlertRow) => (a.details_json as Record<string, unknown>).status === 'approaching',
        )
        .map((a: AlertRow) => a.student_id),
    );

    return {
      students_approaching_threshold: approachingStudents.size,
      students_exceeded_threshold: exceededStudents.size,
      active_alerts: activeAlerts,
    };
  }

  private async getSubmissionReadiness(tenantId: string, domain: RegulatoryDomain) {
    const academicYear = this.getCurrentAcademicYear();

    const submissions = await this.prisma.regulatorySubmission.findMany({
      where: {
        tenant_id: tenantId,
        domain,
        academic_year: academicYear,
      },
      select: { status: true },
    });

    let readinessStatus: 'not_started' | 'incomplete' | 'ready' = 'not_started';

    if (submissions.length > 0) {
      const hasCompleted = submissions.some(
        (s: { status: RegulatorySubmissionStatus }) =>
          s.status === RegulatorySubmissionStatus.reg_submitted ||
          s.status === RegulatorySubmissionStatus.reg_accepted,
      );
      readinessStatus = hasCompleted ? 'ready' : 'incomplete';
    }

    return {
      readiness_status: readinessStatus,
      recent_submissions: submissions.length,
    };
  }

  private async getDesSummary(tenantId: string) {
    const base = await this.getSubmissionReadiness(tenantId, 'des_september_returns');
    const lastSubmission = await this.prisma.regulatorySubmission.findFirst({
      where: {
        tenant_id: tenantId,
        domain: 'des_september_returns',
        status: { in: COMPLETED_STATUSES },
      },
      orderBy: { submitted_at: 'desc' },
      select: { submitted_at: true },
    });

    return {
      readiness_status: base.readiness_status,
      recent_submissions: base.recent_submissions,
      last_submission_at: lastSubmission?.submitted_at ?? null,
    };
  }

  private async getPpodSummary(tenantId: string) {
    const [synced, pending, changed, errors, lastSync] = await Promise.all([
      this.prisma.ppodStudentMapping.count({
        where: { tenant_id: tenantId, sync_status: PodSyncStatus.synced },
      }),
      this.prisma.ppodStudentMapping.count({
        where: { tenant_id: tenantId, sync_status: PodSyncStatus.pod_pending },
      }),
      this.prisma.ppodStudentMapping.count({
        where: { tenant_id: tenantId, sync_status: PodSyncStatus.changed },
      }),
      this.prisma.ppodStudentMapping.count({
        where: { tenant_id: tenantId, sync_status: PodSyncStatus.pod_error },
      }),
      this.prisma.ppodSyncLog.findFirst({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      }),
    ]);

    const total = synced + pending + changed + errors;
    const healthPercent = total === 0 ? 0 : Math.round((synced / total) * 100);

    return {
      synced,
      pending: pending + changed,
      errors,
      last_sync_at: lastSync?.created_at ?? null,
      health_percent: healthPercent,
    };
  }

  private async getCbaSummary(tenantId: string) {
    const [pendingSync, synced, lastSync] = await Promise.all([
      this.prisma.regulatorySubmission.count({
        where: {
          tenant_id: tenantId,
          domain: 'ppod_sync',
          submission_type: 'cba_sync',
          status: { notIn: COMPLETED_STATUSES },
        },
      }),
      this.prisma.regulatorySubmission.count({
        where: {
          tenant_id: tenantId,
          domain: 'ppod_sync',
          submission_type: 'cba_sync',
          status: { in: COMPLETED_STATUSES },
        },
      }),
      this.prisma.regulatorySubmission.findFirst({
        where: {
          tenant_id: tenantId,
          domain: 'ppod_sync',
          submission_type: 'cba_sync',
        },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      }),
    ]);

    return {
      pending_sync: pendingSync,
      synced,
      last_sync_at: lastSync?.created_at ?? null,
    };
  }

  private async countPendingTransfers(tenantId: string): Promise<number> {
    return this.prisma.interSchoolTransfer.count({
      where: { tenant_id: tenantId, status: TransferStatus.transfer_pending },
    });
  }

  private async countSubmissionsForYear(tenantId: string, academicYear: string): Promise<number> {
    return this.prisma.regulatorySubmission.count({
      where: { tenant_id: tenantId, academic_year: academicYear },
    });
  }

  private async countOpenAntiBullying(tenantId: string): Promise<number> {
    return this.prisma.regulatorySubmission.count({
      where: {
        tenant_id: tenantId,
        domain: 'anti_bullying',
        status: { notIn: COMPLETED_STATUSES },
      },
    });
  }

  private async countOpenSafeguardingConcerns(tenantId: string): Promise<number> {
    return this.safeguardingReadFacade.countSafeguardingHub(tenantId);
  }

  private async countOpenDsarRequests(tenantId: string): Promise<number> {
    return this.complianceReadFacade.countOpenDsarRequests(tenantId);
  }

  private getCurrentAcademicYear(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    // Academic year starts in September (month index 8)
    if (month >= 8) {
      return `${year}-${year + 1}`;
    }
    return `${year - 1}-${year}`;
  }
}
