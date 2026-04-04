import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ConfigurationReadFacade } from '../configuration/configuration-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { DailySummaryService } from './daily-summary.service';

interface ExceptionsParams {
  date?: string;
  start_date?: string;
  end_date?: string;
}

interface StudentAttendanceParams {
  start_date?: string;
  end_date?: string;
}

// ─── AttendanceReportingService ──────────────────────────────────────────────

/**
 * Handles read-only aggregation and reporting queries:
 * attendance exceptions, per-student records, and parent attendance views.
 */
@Injectable()
export class AttendanceReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dailySummaryService: DailySummaryService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly configurationReadFacade: ConfigurationReadFacade,
    private readonly parentReadFacade: ParentReadFacade,
  ) {}

  // ─── Exceptions ──────────────────────────────────────────────────────────

  /**
   * Get attendance exceptions: pending sessions and excessive absences.
   */
  async getExceptions(tenantId: string, params: ExceptionsParams) {
    const dateFilter: Prisma.AttendanceSessionWhereInput = { tenant_id: tenantId };

    if (params.date) {
      dateFilter.session_date = new Date(params.date);
    } else if (params.start_date || params.end_date) {
      dateFilter.session_date = {};
      if (params.start_date) {
        (dateFilter.session_date as Prisma.DateTimeFilter).gte = new Date(params.start_date);
      }
      if (params.end_date) {
        (dateFilter.session_date as Prisma.DateTimeFilter).lte = new Date(params.end_date);
      }
    }

    // 1. Pending sessions: open sessions in the date range
    const pendingSessions = await this.prisma.attendanceSession.findMany({
      where: {
        ...dateFilter,
        status: 'open',
      },
      include: {
        class_entity: {
          select: {
            id: true,
            name: true,
            class_staff: {
              include: {
                staff_profile: {
                  select: {
                    id: true,
                    user: {
                      select: { first_name: true, last_name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { session_date: 'asc' },
    });

    // 2. Excessive absences: students with >5 absences in past 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const excessiveAbsences = await this.prisma.dailyAttendanceSummary.groupBy({
      by: ['student_id'],
      where: {
        tenant_id: tenantId,
        summary_date: { gte: thirtyDaysAgo },
        derived_status: { in: ['absent', 'partially_absent'] },
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 5 } },
      },
    });

    // Get student details for excessive absences
    const studentIds = excessiveAbsences.map((a) => a.student_id);
    const students = await this.studentReadFacade.findByIds(tenantId, studentIds);

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const excessiveAbsenceDetails = excessiveAbsences.map((a) => ({
      student: studentMap.get(a.student_id) ?? { id: a.student_id },
      absent_days: a._count.id,
      period_days: 30,
    }));

    return {
      pending_sessions: pendingSessions,
      excessive_absences: excessiveAbsenceDetails,
    };
  }

  // ─── Student Attendance ───────────────────────────────────────────────────

  /**
   * Get attendance records for a specific student across sessions.
   */
  async getStudentAttendance(tenantId: string, studentId: string, params: StudentAttendanceParams) {
    // Verify student exists
    const student = await this.studentReadFacade.findById(tenantId, studentId);

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    const sessionWhere: Prisma.AttendanceSessionWhereInput = {
      status: { in: ['submitted', 'locked'] },
    };

    if (params.start_date || params.end_date) {
      sessionWhere.session_date = {};
      if (params.start_date) {
        sessionWhere.session_date.gte = new Date(params.start_date);
      }
      if (params.end_date) {
        sessionWhere.session_date.lte = new Date(params.end_date);
      }
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        session: sessionWhere,
      },
      include: {
        session: {
          select: {
            id: true,
            session_date: true,
            class_entity: {
              select: { id: true, name: true },
            },
            schedule: {
              select: {
                id: true,
                start_time: true,
                end_time: true,
              },
            },
          },
        },
      },
      orderBy: { session: { session_date: 'desc' } },
    });

    // Format schedule times
    const formattedRecords = records.map((r) => ({
      ...r,
      session: {
        ...r.session,
        schedule: r.session.schedule
          ? {
              id: r.session.schedule.id,
              start_time: r.session.schedule.start_time.toISOString().slice(11, 16),
              end_time: r.session.schedule.end_time.toISOString().slice(11, 16),
            }
          : null,
      },
    }));

    return {
      student,
      data: formattedRecords,
    };
  }

  // ─── Parent View ──────────────────────────────────────────────────────────

  /**
   * Get attendance data for a parent's child.
   * Validates parent-student relationship and tenant settings.
   */
  async getParentStudentAttendance(
    tenantId: string,
    userId: string,
    studentId: string,
    params: StudentAttendanceParams,
  ) {
    // Check tenant settings to see if attendance is visible to parents
    const tenantSettingsJson = await this.configurationReadFacade.findSettingsJson(tenantId);

    const settings = (tenantSettingsJson ?? {}) as Record<string, unknown>;
    const generalSettings = (settings['general'] ?? {}) as Record<string, unknown>;
    const attendanceVisible = generalSettings['attendanceVisibleToParents'] !== false;

    if (!attendanceVisible) {
      throw new ForbiddenException({
        code: 'ATTENDANCE_NOT_VISIBLE',
        message: 'Attendance information is not available for parent viewing',
      });
    }

    // Verify the student is linked to the parent
    const parentId = await this.parentReadFacade.resolveIdByUserId(tenantId, userId);

    if (!parentId) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const isLinked = await this.studentReadFacade.isParentLinked(tenantId, studentId, parentId);

    if (!isLinked) {
      throw new ForbiddenException({
        code: 'NOT_LINKED_TO_STUDENT',
        message: 'You are not linked to this student',
      });
    }

    // Get daily summaries for the student
    const summaries = await this.dailySummaryService.findForStudent(tenantId, studentId, params);

    // Get recent records for detail
    const records = await this.getStudentAttendance(tenantId, studentId, params);

    return {
      summaries: summaries.data,
      records: records.data,
    };
  }
}
