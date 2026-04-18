import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { AttendanceLockingService } from './attendance-locking.service';
import { AttendanceParentNotificationService } from './attendance-parent-notification.service';
import { AttendanceReportingService } from './attendance-reporting.service';
import { AttendanceSessionService } from './attendance-session.service';
import { DailySummaryService } from './daily-summary.service';
import type {
  CreateAttendanceSessionDto,
  SaveAttendanceRecordsDto,
  AmendAttendanceRecordDto,
} from './dto/attendance.dto';

// ─── AttendanceService ───────────────────────────────────────────────────────

/**
 * Thin orchestration facade for the attendance module.
 *
 * Business logic is split across:
 *  - AttendanceSessionService  — session lifecycle, batch generation, teacher dashboard
 *  - AttendanceLockingService  — auto-lock expired sessions
 *  - AttendanceReportingService — exceptions, student records, parent view
 *
 * This service owns mark/amend operations (saveRecords, submitSession, amendRecord)
 * directly, since they are the core write path and tightly coupled to the
 * notification and daily-summary side-effects.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dailySummaryService: DailySummaryService,
    private readonly parentNotificationService: AttendanceParentNotificationService,
    private readonly sessionService: AttendanceSessionService,
    private readonly lockingService: AttendanceLockingService,
    private readonly reportingService: AttendanceReportingService,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── Session Management (delegated) ─────────────────────────────────────

  async createSession(
    tenantId: string,
    userId: string,
    dto: CreateAttendanceSessionDto,
    userPermissions: string[],
    userStaffProfileId?: string,
  ) {
    return this.sessionService.createSession(
      tenantId,
      userId,
      dto,
      userPermissions,
      userStaffProfileId,
    );
  }

  async createDefaultPresentRecords(
    tenantId: string,
    sessionId: string,
    classId: string,
    userId: string,
  ): Promise<number> {
    return this.sessionService.createDefaultPresentRecords(tenantId, sessionId, classId, userId);
  }

  async findAllSessions(
    tenantId: string,
    params: {
      page: number;
      pageSize: number;
      session_date?: string;
      start_date?: string;
      end_date?: string;
      class_id?: string;
      status?: string;
    },
    userStaffProfileId?: string,
  ) {
    return this.sessionService.findAllSessions(tenantId, params, userStaffProfileId);
  }

  async findOneSession(tenantId: string, id: string) {
    return this.sessionService.findOneSession(tenantId, id);
  }

  async cancelSession(tenantId: string, id: string) {
    return this.sessionService.cancelSession(tenantId, id);
  }

  async batchGenerateSessions(tenantId: string, date: Date) {
    return this.sessionService.batchGenerateSessions(tenantId, date);
  }

  async getTeacherDashboard(tenantId: string, userId: string) {
    return this.sessionService.getTeacherDashboard(tenantId, userId);
  }

  async getOfficerDashboard(
    tenantId: string,
    params: {
      page: number;
      pageSize: number;
      session_date?: string;
      status?: string;
      year_group_id?: string;
      class_id?: string;
      teacher_staff_id?: string;
    },
  ) {
    return this.sessionService.getOfficerDashboard(tenantId, params);
  }

  // ─── Locking (delegated) ─────────────────────────────────────────────────

  async lockExpiredSessions(tenantId: string) {
    return this.lockingService.lockExpiredSessions(tenantId);
  }

  // ─── Reporting (delegated) ───────────────────────────────────────────────

  async getExceptions(
    tenantId: string,
    params: { date?: string; start_date?: string; end_date?: string },
  ) {
    return this.reportingService.getExceptions(tenantId, params);
  }

  async getStudentAttendance(
    tenantId: string,
    studentId: string,
    params: { start_date?: string; end_date?: string },
  ) {
    return this.reportingService.getStudentAttendance(tenantId, studentId, params);
  }

  async getParentStudentAttendance(
    tenantId: string,
    userId: string,
    studentId: string,
    params: { start_date?: string; end_date?: string },
  ) {
    return this.reportingService.getParentStudentAttendance(tenantId, userId, studentId, params);
  }

  // ─── Record Management ───────────────────────────────────────────────────

  /**
   * Save (upsert) attendance records for a session.
   */
  async saveRecords(
    tenantId: string,
    sessionId: string,
    userId: string,
    dto: SaveAttendanceRecordsDto,
    // Null means the caller has `attendance.take_any_class` (or admin-level
    // equivalent) and may mark any class in the tenant. A non-null string
    // means the caller is a regular teacher and we must enforce that they
    // are the teacher bound to this session.
    allowedTeacherStaffId: string | null = null,
  ) {
    // 1. Validate session exists and is open
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: {
        id: true,
        status: true,
        class_id: true,
        session_date: true,
        teacher_staff_id: true,
      },
    });

    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `Attendance session with id "${sessionId}" not found`,
      });
    }

    if (allowedTeacherStaffId !== null) {
      if (!session.teacher_staff_id || session.teacher_staff_id !== allowedTeacherStaffId) {
        throw new ForbiddenException({
          code: 'NOT_SESSION_TEACHER',
          message:
            'You are not the teacher assigned to this session. Ask an attendance officer or admin to take it.',
        });
      }
    }

    if (session.status !== 'open') {
      throw new ConflictException({
        code: 'SESSION_NOT_OPEN',
        message: `Cannot modify records for session with status "${session.status}". Session must be open.`,
      });
    }

    // 2. Validate all student_ids are actively enrolled in the class
    const studentIds = dto.records.map((r) => r.student_id);
    const allEnrolledIds = await this.classesReadFacade.findEnrolledStudentIds(
      tenantId,
      session.class_id,
    );

    const enrolledStudentIds = new Set(allEnrolledIds);
    const notEnrolled = studentIds.filter((id) => !enrolledStudentIds.has(id));

    if (notEnrolled.length > 0) {
      throw new BadRequestException({
        code: 'STUDENTS_NOT_ENROLLED',
        message: `The following students are not actively enrolled in this class: ${notEnrolled.join(', ')}`,
      });
    }

    // 3. Upsert records via RLS transaction
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    const records = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const upsertedRecords: Array<{
        id: string;
        student_id: string;
        status: string;
        [key: string]: unknown;
      }> = [];
      for (const record of dto.records) {
        // Find existing record for this session + student
        const existing = await db.attendanceRecord.findFirst({
          where: {
            tenant_id: tenantId,
            attendance_session_id: sessionId,
            student_id: record.student_id,
          },
          select: { id: true },
        });

        if (existing) {
          const updated = await db.attendanceRecord.update({
            where: { id: existing.id },
            data: {
              status: record.status as $Enums.AttendanceRecordStatus,
              reason: record.reason ?? null,
              marked_by_user_id: userId,
              marked_at: now,
            },
          });
          upsertedRecords.push(updated);
        } else {
          const created = await db.attendanceRecord.create({
            data: {
              tenant_id: tenantId,
              attendance_session_id: sessionId,
              student_id: record.student_id,
              status: record.status as $Enums.AttendanceRecordStatus,
              reason: record.reason ?? null,
              marked_by_user_id: userId,
              marked_at: now,
            },
          });
          upsertedRecords.push(created);
        }
      }

      return upsertedRecords;
    })) as Array<{ id: string; student_id: string; status: string; [key: string]: unknown }>;

    // 4. Trigger parent notifications for non-present records (outside transaction)
    const sessionDateStr = session.session_date.toISOString().split('T')[0] ?? '';
    for (const record of records) {
      if (record.status !== 'present') {
        try {
          await this.parentNotificationService.triggerAbsenceNotification(
            tenantId,
            record.student_id,
            record.id,
            record.status,
            sessionDateStr,
          );
        } catch (err) {
          // Notification failure must never break attendance saving
          void err;
        }
      }
    }

    return { data: records };
  }

  /**
   * Submit an attendance session (mark as submitted).
   * Triggers daily summary recalculation for all students.
   */
  async submitSession(
    tenantId: string,
    sessionId: string,
    userId: string,
    allowedTeacherStaffId: string | null = null,
  ) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true, session_date: true, teacher_staff_id: true },
    });

    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `Attendance session with id "${sessionId}" not found`,
      });
    }

    if (allowedTeacherStaffId !== null) {
      if (!session.teacher_staff_id || session.teacher_staff_id !== allowedTeacherStaffId) {
        throw new ForbiddenException({
          code: 'NOT_SESSION_TEACHER',
          message:
            'You are not the teacher assigned to this session. Ask an attendance officer or admin to submit it.',
        });
      }
    }

    if (session.status !== 'open') {
      throw new ConflictException({
        code: 'SESSION_NOT_OPEN',
        message: `Cannot submit session with status "${session.status}". Session must be open.`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.attendanceSession.update({
        where: { id: sessionId },
        data: {
          status: 'submitted',
          submitted_by_user_id: userId,
          submitted_at: new Date(),
        },
      });
    });

    // Trigger daily summary recalculation for each student with a record
    const records = await this.prisma.attendanceRecord.findMany({
      where: { attendance_session_id: sessionId, tenant_id: tenantId },
      select: { student_id: true },
    });

    const uniqueStudentIds = [...new Set(records.map((r) => r.student_id))];
    for (const studentId of uniqueStudentIds) {
      await this.dailySummaryService.recalculate(tenantId, studentId, session.session_date);
    }

    return updated;
  }

  /**
   * Amend a record on a submitted or locked session.
   */
  async amendRecord(
    tenantId: string,
    recordId: string,
    userId: string,
    dto: AmendAttendanceRecordDto,
  ) {
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id: recordId, tenant_id: tenantId },
      include: {
        session: {
          select: { id: true, status: true, session_date: true },
        },
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'RECORD_NOT_FOUND',
        message: `Attendance record with id "${recordId}" not found`,
      });
    }

    if (record.session.status !== 'submitted' && record.session.status !== 'locked') {
      throw new ConflictException({
        code: 'SESSION_NOT_SUBMITTED_OR_LOCKED',
        message: `Cannot amend records for session with status "${record.session.status}". Session must be submitted or locked.`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.attendanceRecord.update({
        where: { id: recordId },
        data: {
          amended_from_status: record.status,
          status: dto.status as $Enums.AttendanceRecordStatus,
          amendment_reason: dto.amendment_reason,
          marked_by_user_id: userId,
          marked_at: new Date(),
        },
      });
    });

    // Trigger daily summary recalculation
    await this.dailySummaryService.recalculate(
      tenantId,
      record.student_id,
      record.session.session_date,
    );

    return updated;
  }
}
