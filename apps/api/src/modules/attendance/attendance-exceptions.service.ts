import { randomUUID } from 'crypto';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { AttendanceParentNotificationService } from './attendance-parent-notification.service';
import type { ExceptionsUploadResult } from './attendance-upload.service';
import { DailySummaryService } from './daily-summary.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface UndoPayload {
  tenant_id: string;
  user_id: string;
  entries: Array<{
    record_id: string;
    previous_status: string;
    student_id: string;
    session_id: string;
  }>;
  session_date: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class AttendanceExceptionsService {
  private readonly logger = new Logger(AttendanceExceptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly redisService: RedisService,
    private readonly dailySummaryService: DailySummaryService,
    private readonly parentNotificationService: AttendanceParentNotificationService,
  ) {}

  // ─── Exceptions-Only Upload ────────────────────────────────────────────

  /**
   * Process an exceptions-only upload: update existing attendance records
   * from present to the specified exception status. Stores undo data in Redis.
   */
  async processExceptionsUpload(
    tenantId: string,
    userId: string,
    sessionDate: string,
    entries: Array<{ student_number: string; status: string; reason?: string }>,
  ): Promise<ExceptionsUploadResult> {
    const date = new Date(sessionDate);
    if (isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'session_date must be a valid YYYY-MM-DD date',
      });
    }

    // Resolve all students by student_number
    const students = await this.studentReadFacade.findAllStudentNumbers(tenantId, 1000);
    const studentByNumber = new Map<string, string>();
    for (const s of students) {
      if (s.student_number) {
        studentByNumber.set(s.student_number, s.id);
      }
    }

    const errors: Array<{ row: number; error: string }> = [];
    const batchId = randomUUID();
    const undoEntries: UndoPayload['entries'] = [];
    const affectedStudentIds = new Set<string>();
    let updated = 0;

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const [i, entry] of entries.entries()) {
        const rowNum = i + 1;

        // Resolve student
        const studentId = studentByNumber.get(entry.student_number);
        if (!studentId) {
          errors.push({
            row: rowNum,
            error: `Student number "${entry.student_number}" not found`,
          });
          continue;
        }

        // Validate status
        const status = entry.status as $Enums.AttendanceRecordStatus;
        const validStatuses: string[] = [
          'absent_unexcused',
          'absent_excused',
          'late',
          'left_early',
        ];
        if (!validStatuses.includes(status)) {
          errors.push({
            row: rowNum,
            error: `Invalid exception status "${entry.status}"`,
          });
          continue;
        }

        // Find attendance record(s) for this student on this date in open/submitted sessions
        const records = await db.attendanceRecord.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            session: {
              session_date: date,
              status: { in: ['open', 'submitted'] },
            },
          },
          select: {
            id: true,
            status: true,
            attendance_session_id: true,
          },
        });

        if (records.length === 0) {
          errors.push({
            row: rowNum,
            error: `No attendance record found for student "${entry.student_number}" on ${sessionDate} in an open/submitted session`,
          });
          continue;
        }

        // Update the first matching record
        const record = records[0];
        if (!record) continue;

        await db.attendanceRecord.update({
          where: { id: record.id },
          data: {
            amended_from_status: record.status,
            status,
            reason: entry.reason ?? null,
            marked_by_user_id: userId,
            marked_at: now,
          },
        });

        undoEntries.push({
          record_id: record.id,
          previous_status: record.status,
          student_id: studentId,
          session_id: record.attendance_session_id,
        });

        affectedStudentIds.add(studentId);
        updated++;
      }
    });

    // Store undo data in Redis with 5 minute TTL
    const undoPayload: UndoPayload = {
      tenant_id: tenantId,
      user_id: userId,
      entries: undoEntries,
      session_date: sessionDate,
    };

    const redisClient = this.redisService.getClient();
    await redisClient.set(
      `attendance:undo:${batchId}`,
      JSON.stringify(undoPayload),
      'EX',
      300, // 5 minutes
    );

    // Recalculate daily summaries for affected students
    for (const studentId of affectedStudentIds) {
      await this.dailySummaryService.recalculate(tenantId, studentId, date);
    }

    // Trigger parent notifications for each updated record (outside transaction)
    for (const entry of undoEntries) {
      // Only notify for exception statuses (all entries here are non-present)
      try {
        const matchingInput = entries.find(
          (e) => studentByNumber.get(e.student_number) === entry.student_id,
        );
        if (matchingInput) {
          await this.parentNotificationService.triggerAbsenceNotification(
            tenantId,
            entry.student_id,
            entry.record_id,
            matchingInput.status,
            sessionDate,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to trigger absence notification for student ${entry.student_id} — attendance operation continues`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    return {
      success: errors.length === 0,
      updated,
      errors,
      batch_id: batchId,
    };
  }

  // ─── Undo Upload ──────────────────────────────────────────────────────

  /**
   * Undo a previous exceptions upload by reverting records to their prior status.
   * Only works within the 5-minute TTL window and if sessions are still open.
   */
  async undoUpload(
    tenantId: string,
    userId: string,
    batchId: string,
  ): Promise<{ reverted: number }> {
    const redisClient = this.redisService.getClient();
    const raw = await redisClient.get(`attendance:undo:${batchId}`);

    if (!raw) {
      throw new BadRequestException({
        code: 'UNDO_EXPIRED_OR_NOT_FOUND',
        message:
          'Undo window has expired or batch not found. Changes can only be undone within 5 minutes.',
      });
    }

    const payload: UndoPayload = JSON.parse(raw) as UndoPayload;

    // Validate tenant and user match
    if (payload.tenant_id !== tenantId) {
      throw new BadRequestException({
        code: 'UNDO_TENANT_MISMATCH',
        message: 'Undo batch does not belong to this tenant',
      });
    }

    if (payload.user_id !== userId) {
      throw new BadRequestException({
        code: 'UNDO_USER_MISMATCH',
        message: 'Only the user who performed the upload can undo it',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    let reverted = 0;
    const affectedStudentIds = new Set<string>();

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const entry of payload.entries) {
        // Verify session is still open
        const session = await db.attendanceSession.findFirst({
          where: {
            id: entry.session_id,
            tenant_id: tenantId,
            status: 'open',
          },
          select: { id: true },
        });

        if (!session) {
          // Session is no longer open — skip this record silently
          continue;
        }

        await db.attendanceRecord.update({
          where: { id: entry.record_id },
          data: {
            status: entry.previous_status as $Enums.AttendanceRecordStatus,
            amended_from_status: null,
            reason: null,
            marked_by_user_id: userId,
            marked_at: new Date(),
          },
        });

        affectedStudentIds.add(entry.student_id);
        reverted++;
      }
    });

    // Delete the undo key
    await redisClient.del(`attendance:undo:${batchId}`);

    // Recalculate daily summaries
    const date = new Date(payload.session_date);
    for (const studentId of affectedStudentIds) {
      await this.dailySummaryService.recalculate(tenantId, studentId, date);
    }

    return { reverted };
  }
}
