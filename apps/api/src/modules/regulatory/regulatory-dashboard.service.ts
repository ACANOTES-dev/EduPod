import { Injectable } from '@nestjs/common';
import type { RegulatoryDomain } from '@prisma/client';
import { PodSyncStatus, RegulatorySubmissionStatus } from '@prisma/client';

import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { PrismaService } from '../prisma/prisma.service';

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
  };
  tusla: {
    students_approaching_threshold: number;
    students_exceeded_threshold: number;
    active_alerts: number;
  };
  des: {
    readiness_status: 'not_started' | 'incomplete' | 'ready';
    recent_submissions: number;
  };
  october_returns: {
    readiness_status: 'not_started' | 'incomplete' | 'ready';
  };
  ppod: {
    synced: number;
    pending: number;
    errors: number;
    last_sync_at: Date | null;
  };
  cba: {
    pending_sync: number;
    synced: number;
    last_sync_at: Date | null;
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
  ) {}

  // ─── Dashboard Summary ────────────────────────────────────────────────────

  async getDashboardSummary(tenantId: string): Promise<DashboardSummary> {
    const now = new Date();

    const [calendar, tusla, des, octoberReturns, ppod, cba] = await Promise.all([
      this.getCalendarSummary(tenantId, now),
      this.getTuslaSummary(tenantId),
      this.getSubmissionReadiness(tenantId, 'des_september_returns'),
      this.getSubmissionReadiness(tenantId, 'des_october_census'),
      this.getPpodSummary(tenantId),
      this.getCbaSummary(tenantId),
    ]);

    return {
      calendar,
      tusla,
      des,
      october_returns: { readiness_status: octoberReturns.readiness_status },
      ppod,
      cba,
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

    const [upcomingDeadlines, overdue, nextDeadline] = await Promise.all([
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
    ]);

    return {
      upcoming_deadlines: upcomingDeadlines,
      overdue,
      next_deadline: nextDeadline,
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
        .filter((a: AlertRow) => (a.details_json as Record<string, unknown>).status === 'approaching')
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

    return {
      synced,
      pending: pending + changed,
      errors,
      last_sync_at: lastSync?.created_at ?? null,
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
