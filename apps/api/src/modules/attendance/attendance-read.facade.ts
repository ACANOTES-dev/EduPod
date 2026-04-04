import { Injectable } from '@nestjs/common';
import type {
  AttendanceAlertStatus,
  AttendanceAlertType,
  AttendanceRecordStatus,
  AttendanceSessionStatus,
  DailyAttendanceStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DateRange {
  from: Date;
  to: Date;
}

/** Aggregated attendance counts for a single student over a date range. */
interface StudentAttendanceSummary {
  student_id: string;
  total_days: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  partially_absent: number;
}

/** A single daily attendance record with session context. */
interface DailyRecord {
  id: string;
  session_id: string;
  session_date: Date;
  status: AttendanceRecordStatus;
  reason: string | null;
  class_id: string;
  class_name: string;
}

/** An attendance pattern alert for a student. */
interface PatternAlert {
  id: string;
  alert_type: AttendanceAlertType;
  status: AttendanceAlertStatus;
  detected_date: Date;
  window_start: Date;
  window_end: Date;
  details_json: unknown;
  parent_notified: boolean;
  created_at: Date;
}

// ─── Facade ─────────────────────────────────────────────────────────────────

/**
 * Read-only facade for attendance data consumed by other modules
 * (report cards, regulatory reporting, risk detection).
 *
 * All reads use direct Prisma queries with `tenant_id` in `where` — no RLS
 * transaction needed for reads.
 */
@Injectable()
export class AttendanceReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Single Student Summary ───────────────────────────────────────────────

  /**
   * Returns aggregated attendance counts for a single student over a date range.
   * Reads from `daily_attendance_summaries` for O(1)-per-day efficiency.
   */
  async getStudentSummary(
    tenantId: string,
    studentId: string,
    dateRange: DateRange,
  ): Promise<StudentAttendanceSummary> {
    const summaries = await this.prisma.dailyAttendanceSummary.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        summary_date: {
          gte: dateRange.from,
          lte: dateRange.to,
        },
      },
      select: {
        derived_status: true,
      },
    });

    return this.aggregateSummaries(studentId, summaries);
  }

  // ─── Batch Student Summary ────────────────────────────────────────────────

  /**
   * Returns aggregated attendance counts for multiple students over a date range.
   * Efficient single query grouped by student_id.
   */
  async getStudentsSummary(
    tenantId: string,
    studentIds: string[],
    dateRange: DateRange,
  ): Promise<StudentAttendanceSummary[]> {
    if (studentIds.length === 0) {
      return [];
    }

    const summaries = await this.prisma.dailyAttendanceSummary.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        summary_date: {
          gte: dateRange.from,
          lte: dateRange.to,
        },
      },
      select: {
        student_id: true,
        derived_status: true,
      },
    });

    // Group by student
    const grouped = new Map<string, Array<{ derived_status: DailyAttendanceStatus }>>();
    for (const s of summaries) {
      const existing = grouped.get(s.student_id);
      if (existing) {
        existing.push({ derived_status: s.derived_status });
      } else {
        grouped.set(s.student_id, [{ derived_status: s.derived_status }]);
      }
    }

    // Ensure every requested student appears in the result (even with zero counts)
    return studentIds.map((studentId) => {
      const studentSummaries = grouped.get(studentId) ?? [];
      return this.aggregateSummaries(studentId, studentSummaries);
    });
  }

  // ─── Pattern Alerts ───────────────────────────────────────────────────────

  /**
   * Returns active and acknowledged attendance pattern alerts for a student.
   * Excludes resolved alerts by default.
   */
  async getPatternAlerts(tenantId: string, studentId: string): Promise<PatternAlert[]> {
    const alerts = await this.prisma.attendancePatternAlert.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['active', 'acknowledged'] },
      },
      select: {
        id: true,
        alert_type: true,
        status: true,
        detected_date: true,
        window_start: true,
        window_end: true,
        details_json: true,
        parent_notified: true,
        created_at: true,
      },
      orderBy: { detected_date: 'desc' },
    });

    return alerts;
  }

  // ─── Session Status Counts ────────────────────────────────────────────────

  /**
   * Return attendance record counts grouped by status for a given session.
   * Useful for dashboards and session summary views.
   */
  async getAttendanceStatusCounts(
    tenantId: string,
    sessionId: string,
  ): Promise<Record<string, number>> {
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        attendance_session_id: sessionId,
      },
      select: { status: true },
    });

    const counts: Record<string, number> = {};
    for (const r of records) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }

    return counts;
  }

  // ─── Daily Records ────────────────────────────────────────────────────────

  /**
   * Returns raw daily attendance records for a student over a date range,
   * including session and class context. Only submitted/locked sessions included.
   */
  async getDailyRecords(
    tenantId: string,
    studentId: string,
    dateRange: DateRange,
  ): Promise<DailyRecord[]> {
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        session: {
          session_date: {
            gte: dateRange.from,
            lte: dateRange.to,
          },
          status: { in: ['submitted', 'locked'] },
        },
      },
      select: {
        id: true,
        status: true,
        reason: true,
        session: {
          select: {
            id: true,
            session_date: true,
            class_id: true,
            class_entity: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { session: { session_date: 'desc' } },
    });

    return records.map((r) => ({
      id: r.id,
      session_id: r.session.id,
      session_date: r.session.session_date,
      status: r.status,
      reason: r.reason,
      class_id: r.session.class_id,
      class_name: r.session.class_entity.name,
    }));
  }

  // ─── Attendance Record Count ───────────────────────────────────────────────

  /**
   * Count attendance records matching a filter.
   * Used by retention policies (records before cutoff date) and reports.
   */
  async countAttendanceRecords(tenantId: string, options?: { beforeDate?: Date }): Promise<number> {
    return this.prisma.attendanceRecord.count({
      where: {
        tenant_id: tenantId,
        ...(options?.beforeDate ? { created_at: { lt: options.beforeDate } } : {}),
      },
    });
  }

  /**
   * Find all attendance records for a student (unfiltered).
   * Used by DSAR traversal — returns complete history.
   */
  async findAllRecordsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<
    Array<{ id: string; student_id: string; status: AttendanceRecordStatus; marked_at: Date }>
  > {
    return this.prisma.attendanceRecord.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: { id: true, student_id: true, status: true, marked_at: true },
      orderBy: { marked_at: 'desc' },
    });
  }

  /**
   * Find attendance records for a student filtered by session date range.
   * Used by gradebook AI comments and progress summary services.
   */
  async findRecordsForStudentBySessionDate(
    tenantId: string,
    studentId: string,
    dateRange: DateRange,
  ): Promise<
    Array<{
      id: string;
      status: AttendanceRecordStatus;
      session: { session_date: Date };
    }>
  > {
    return this.prisma.attendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        session: {
          session_date: { gte: dateRange.from, lte: dateRange.to },
        },
      },
      select: {
        id: true,
        status: true,
        session: { select: { session_date: true } },
      },
      orderBy: { session: { session_date: 'desc' } },
    });
  }

  // ─── Attendance Session Counts ────────────────────────────────────────────

  /**
   * Count attendance sessions matching a filter.
   */
  async countSessions(
    tenantId: string,
    options?: {
      scheduleId?: string;
      dateRange?: DateRange;
      status?: AttendanceSessionStatus;
    },
  ): Promise<number> {
    return this.prisma.attendanceSession.count({
      where: {
        tenant_id: tenantId,
        ...(options?.scheduleId ? { schedule_id: options.scheduleId } : {}),
        ...(options?.dateRange
          ? { session_date: { gte: options.dateRange.from, lte: options.dateRange.to } }
          : {}),
        ...(options?.status ? { status: options.status } : {}),
      },
    });
  }

  // ─── Daily Attendance Summary — Additional Methods ────────────────────────

  /**
   * Find daily summaries for a student within a date range (raw rows).
   * Used by behaviour analytics for attendance correlation.
   */
  async findDailySummariesForStudent(
    tenantId: string,
    studentId: string,
    dateRange: DateRange,
  ): Promise<Array<{ summary_date: Date; derived_status: DailyAttendanceStatus }>> {
    return this.prisma.dailyAttendanceSummary.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        summary_date: { gte: dateRange.from, lte: dateRange.to },
      },
      select: { summary_date: true, derived_status: true },
      orderBy: { summary_date: 'desc' },
    });
  }

  /**
   * Count daily summaries for a student within a date range.
   * Used by behaviour student analytics.
   */
  async countDailySummariesForStudent(
    tenantId: string,
    studentId: string,
    dateRange: DateRange,
  ): Promise<number> {
    return this.prisma.dailyAttendanceSummary.count({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        summary_date: { gte: dateRange.from, lte: dateRange.to },
      },
    });
  }

  /**
   * Count all daily summaries for a student (no date filter).
   * Used by behaviour student analytics for attendance correlation.
   */
  async countAllDailySummariesForStudent(tenantId: string, studentId: string): Promise<number> {
    return this.prisma.dailyAttendanceSummary.count({
      where: { tenant_id: tenantId, student_id: studentId },
    });
  }

  /**
   * Find all daily summaries for a student (no date filter).
   * Used by behaviour student analytics for attendance correlation.
   */
  async findAllDailySummariesForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<Array<{ summary_date: Date; derived_status: DailyAttendanceStatus }>> {
    return this.prisma.dailyAttendanceSummary.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: { summary_date: true, derived_status: true },
      orderBy: { summary_date: 'desc' },
    });
  }

  /**
   * Find daily summaries for a student since a given date.
   * Used by early-warning attendance signal collector.
   */
  async findDailySummariesSince(
    tenantId: string,
    studentId: string,
    sinceDate: Date,
  ): Promise<Array<{ summary_date: Date; derived_status: DailyAttendanceStatus }>> {
    return this.prisma.dailyAttendanceSummary.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        summary_date: { gte: sinceDate },
      },
      select: { summary_date: true, derived_status: true },
      orderBy: { summary_date: 'desc' },
    });
  }

  /**
   * Group daily attendance summaries by derived_status for a student/period.
   * Used by report card generation for attendance breakdown in report cards.
   */
  async groupSummariesByStatus(
    tenantId: string,
    studentId: string,
    dateRange: DateRange,
  ): Promise<Array<{ derived_status: DailyAttendanceStatus; _count: { _all: number } }>> {
    const groups = await this.prisma.dailyAttendanceSummary.groupBy({
      by: ['derived_status'],
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        summary_date: { gte: dateRange.from, lte: dateRange.to },
      },
      _count: { _all: true },
    });

    return groups;
  }

  // ─── Pattern Alert ──────────────────────────────────────────────────────

  /**
   * Find active pattern alerts for a student.
   * Used by early-warning attendance signal collector.
   */
  async findActivePatternAlerts(
    tenantId: string,
    studentId: string,
  ): Promise<
    Array<{
      id: string;
      alert_type: AttendanceAlertType;
      status: AttendanceAlertStatus;
      detected_date: Date;
      window_start: Date;
      window_end: Date;
      details_json: unknown;
      parent_notified: boolean;
      created_at: Date;
    }>
  > {
    return this.prisma.attendancePatternAlert.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
      },
      select: {
        id: true,
        alert_type: true,
        status: true,
        detected_date: true,
        window_start: true,
        window_end: true,
        details_json: true,
        parent_notified: true,
        created_at: true,
      },
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Aggregate daily summary rows into counts by status category.
   */
  private aggregateSummaries(
    studentId: string,
    summaries: Array<{ derived_status: DailyAttendanceStatus }>,
  ): StudentAttendanceSummary {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    let partiallyAbsent = 0;

    for (const s of summaries) {
      switch (s.derived_status) {
        case 'present':
          present++;
          break;
        case 'absent':
          absent++;
          break;
        case 'late':
          late++;
          break;
        case 'excused':
          excused++;
          break;
        case 'partially_absent':
          partiallyAbsent++;
          break;
      }
    }

    return {
      student_id: studentId,
      total_days: summaries.length,
      present,
      absent,
      late,
      excused,
      partially_absent: partiallyAbsent,
    };
  }
}
