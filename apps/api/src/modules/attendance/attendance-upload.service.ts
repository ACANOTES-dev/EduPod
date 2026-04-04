import { randomUUID } from 'crypto';

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import * as XLSX from 'xlsx';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { AttendanceParentNotificationService } from './attendance-parent-notification.service';
import { DailySummaryService } from './daily-summary.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UploadValidationError {
  row: number;
  field: string;
  message: string;
}

export interface UploadValidationFailure {
  valid: false;
  errors: UploadValidationError[];
  total_rows: number;
  valid_rows: number;
}

export interface UploadSuccess {
  valid: true;
  sessions_created: number;
  records_created: number;
}

interface ParsedRow {
  student_number: string;
  student_name: string;
  class_name: string;
  status: string;
}

interface ValidatedRow {
  student_id: string;
  class_id: string;
  class_name: string;
  status: $Enums.AttendanceRecordStatus;
}

const STATUS_MAP: Record<string, $Enums.AttendanceRecordStatus> = {
  p: 'present',
  a: 'absent_unexcused',
  ae: 'absent_excused',
  l: 'late',
  le: 'left_early',
};

const EXCEPTION_STATUS_MAP: Record<string, $Enums.AttendanceRecordStatus> = {
  a: 'absent_unexcused',
  ae: 'absent_excused',
  l: 'late',
  le: 'left_early',
};

export interface QuickMarkEntry {
  student_number: string;
  status: string;
  reason?: string;
}

export interface ExceptionsUploadResult {
  success: boolean;
  updated: number;
  errors: Array<{ row: number; error: string }>;
  batch_id: string;
}

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

const EXPECTED_HEADERS = ['student_number', 'student_name', 'class_name', 'status'] as const;

/** Safely get index from header map; returns -1 if missing. */
function getHeaderIndex(indices: Map<string, number>, key: string): number {
  return indices.get(key) ?? -1;
}

@Injectable()
export class AttendanceUploadService {
  private readonly logger = new Logger(AttendanceUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly dailySummaryService: DailySummaryService,
    private readonly redisService: RedisService,
    private readonly parentNotificationService: AttendanceParentNotificationService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
  ) {}

  // ─── Template Generation ────────────────────────────────────────────────

  /**
   * Generate a CSV template pre-populated with enrolled students for a given date.
   */
  async generateTemplate(tenantId: string, sessionDate: string): Promise<string> {
    // 1. Validate date format
    const date = new Date(sessionDate);
    if (isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'session_date must be a valid YYYY-MM-DD date',
      });
    }

    // 2. Validate date falls on a work day
    const tenantSettings = await this.settingsService.getSettings(tenantId);
    const dayOfWeek = date.getUTCDay(); // 0=Sun, 6=Sat
    if (!tenantSettings.attendance.workDays.includes(dayOfWeek)) {
      throw new BadRequestException({
        code: 'SESSION_DATE_NOT_WORK_DAY',
        message: 'The selected date is not a configured work day',
      });
    }

    // 3. Find the active academic year
    const academicYearId = await this.academicReadFacade.findCurrentYearId(tenantId);

    // 4. Load all active homeroom classes (subject_id IS NULL) for the academic year
    const classes = await this.classesReadFacade.findActiveHomeroomClasses(tenantId, academicYearId);

    // 5. For each class, load actively enrolled students
    const rows: string[] = [];

    for (const cls of classes) {
      const enrolments = await this.classesReadFacade.findEnrolledStudentsWithNumber(tenantId, cls.id);

      for (const enrolment of enrolments) {
        const student = enrolment.student;
        const studentName = `${student.first_name} ${student.last_name}`;
        const studentNumber = student.student_number ?? '';
        rows.push(
          `${this.escapeCsvField(studentNumber)},${this.escapeCsvField(studentName)},${this.escapeCsvField(cls.name)},`,
        );
      }
    }

    // 6. Build CSV
    const lines: string[] = [
      `"# Attendance Template — ${sessionDate}"`,
      '"# Status values: P=Present | A=Absent (Unexcused) | AE=Absent (Excused) | L=Late | LE=Left Early"',
      'student_number,student_name,class_name,status',
      ...rows,
    ];

    return lines.join('\n');
  }

  // ─── File Upload Processing ─────────────────────────────────────────────

  /**
   * Parse and process an uploaded attendance file (CSV or XLSX).
   */
  async processUpload(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    originalName: string,
    sessionDate: string,
  ): Promise<UploadValidationFailure | UploadSuccess> {
    // 1. Validate date format
    const date = new Date(sessionDate);
    if (isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'session_date must be a valid YYYY-MM-DD date',
      });
    }

    // 2. Validate date falls on a work day
    const tenantSettings = await this.settingsService.getSettings(tenantId);
    const dayOfWeek = date.getUTCDay();
    if (!tenantSettings.attendance.workDays.includes(dayOfWeek)) {
      throw new BadRequestException({
        code: 'SESSION_DATE_NOT_WORK_DAY',
        message: 'The selected date is not a configured work day',
      });
    }

    // 3. Parse file into rows
    const ext = originalName.toLowerCase().split('.').pop();
    let parsedRows: ParsedRow[];

    if (ext === 'xlsx' || ext === 'xls') {
      parsedRows = this.parseXlsx(fileBuffer);
    } else if (ext === 'csv') {
      parsedRows = this.parseCsv(fileBuffer);
    } else {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Only CSV (.csv) and Excel (.xlsx, .xls) files are supported',
      });
    }

    if (parsedRows.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The uploaded file contains no data rows',
      });
    }

    // 4. Find the active academic year
    const academicYearId2 = await this.academicReadFacade.findCurrentYearId(tenantId);

    // 5. Load lookup data for validation
    // Load all students by student_number for this tenant
    const students = await this.studentReadFacade.findAllStudentNumbers(tenantId, 1000);
    const studentByNumber = new Map<string, string>();
    for (const s of students) {
      if (s.student_number) {
        studentByNumber.set(s.student_number, s.id);
      }
    }

    // Load all active homeroom classes for this academic year
    const classes = await this.classesReadFacade.findActiveHomeroomClasses(tenantId, academicYearId2);
    const classByName = new Map<string, string>();
    for (const c of classes) {
      classByName.set(c.name, c.id);
    }

    // 6. Validate each row
    const errors: UploadValidationError[] = [];
    const validatedRows: ValidatedRow[] = [];

    for (const [i, row] of parsedRows.entries()) {
      const rowNum = i + 2; // +2 because row 1 is header, data starts at row 2

      // Validate student_number
      if (!row.student_number || row.student_number.trim() === '') {
        errors.push({
          row: rowNum,
          field: 'student_number',
          message: 'Student number is required',
        });
        continue;
      }

      const studentId = studentByNumber.get(row.student_number.trim());
      if (!studentId) {
        errors.push({
          row: rowNum,
          field: 'student_number',
          message: `Student number '${row.student_number.trim()}' not found`,
        });
        continue;
      }

      // Validate class_name
      if (!row.class_name || row.class_name.trim() === '') {
        errors.push({ row: rowNum, field: 'class_name', message: 'Class name is required' });
        continue;
      }

      const classId = classByName.get(row.class_name.trim());
      if (!classId) {
        errors.push({
          row: rowNum,
          field: 'class_name',
          message: `Class '${row.class_name.trim()}' not found or not an active homeroom class`,
        });
        continue;
      }

      // Validate status
      if (!row.status || row.status.trim() === '') {
        errors.push({ row: rowNum, field: 'status', message: 'Status is required' });
        continue;
      }

      const statusKey = row.status.trim().toLowerCase();
      const mappedStatus = STATUS_MAP[statusKey];
      if (!mappedStatus) {
        errors.push({
          row: rowNum,
          field: 'status',
          message: `Invalid status '${row.status.trim()}'. Valid values: P, A, AE, L, LE`,
        });
        continue;
      }

      validatedRows.push({
        student_id: studentId,
        class_id: classId,
        class_name: row.class_name.trim(),
        status: mappedStatus,
      });
    }

    // 7. If any errors, return validation failure
    if (errors.length > 0) {
      return {
        valid: false,
        errors,
        total_rows: parsedRows.length,
        valid_rows: validatedRows.length,
      };
    }

    // 8. Group rows by class and create sessions + records in a single RLS transaction
    const groupedByClass = new Map<string, ValidatedRow[]>();
    for (const row of validatedRows) {
      const existing = groupedByClass.get(row.class_id);
      if (existing) {
        existing.push(row);
      } else {
        groupedByClass.set(row.class_id, [row]);
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();
    let sessionsCreated = 0;
    let recordsCreated = 0;
    const affectedStudentIds = new Set<string>();

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const [classId, classRows] of groupedByClass) {
        const firstRow = classRows[0];
        // classRows is guaranteed non-empty since we only add non-empty arrays to the map

        // Check if a session already exists for this class + date
        const existingSession = await db.attendanceSession.findFirst({
          where: {
            tenant_id: tenantId,
            class_id: classId,
            session_date: date,
            schedule_id: null,
            status: { not: 'cancelled' },
          },
          select: { id: true, status: true },
        });

        let sessionId: string;

        if (existingSession) {
          // If session exists but is already submitted/locked, error
          if (existingSession.status === 'submitted' || existingSession.status === 'locked') {
            const className = firstRow ? firstRow.class_name : classId;
            throw new BadRequestException({
              code: 'SESSION_ALREADY_SUBMITTED',
              message: `An attendance session for class '${className}' on ${sessionDate} is already submitted or locked`,
            });
          }
          sessionId = existingSession.id;
        } else {
          // Create a new session
          const session = await db.attendanceSession.create({
            data: {
              tenant_id: tenantId,
              class_id: classId,
              schedule_id: null,
              session_date: date,
              status: 'submitted',
              submitted_by_user_id: userId,
              submitted_at: now,
            },
          });
          sessionId = session.id;
          sessionsCreated++;
        }

        // If session was open (pre-existing), update it to submitted
        if (existingSession && existingSession.status === 'open') {
          await db.attendanceSession.update({
            where: { id: sessionId },
            data: {
              status: 'submitted',
              submitted_by_user_id: userId,
              submitted_at: now,
            },
          });
          sessionsCreated++;
        }

        // Create attendance records for each student in this class
        for (const row of classRows) {
          // Upsert: check if record already exists for this session + student
          const existingRecord = await db.attendanceRecord.findFirst({
            where: {
              tenant_id: tenantId,
              attendance_session_id: sessionId,
              student_id: row.student_id,
            },
            select: { id: true },
          });

          if (existingRecord) {
            await db.attendanceRecord.update({
              where: { id: existingRecord.id },
              data: {
                status: row.status,
                marked_by_user_id: userId,
                marked_at: now,
              },
            });
          } else {
            await db.attendanceRecord.create({
              data: {
                tenant_id: tenantId,
                attendance_session_id: sessionId,
                student_id: row.student_id,
                status: row.status,
                marked_by_user_id: userId,
                marked_at: now,
              },
            });
          }

          recordsCreated++;
          affectedStudentIds.add(row.student_id);
        }
      }
    });

    // 9. Trigger daily summary recalculation for each affected student
    for (const studentId of affectedStudentIds) {
      await this.dailySummaryService.recalculate(tenantId, studentId, date);
    }

    return {
      valid: true,
      sessions_created: sessionsCreated,
      records_created: recordsCreated,
    };
  }

  // ─── Quick-Mark Text Parser ─────────────────────────────────────────────

  /**
   * Parse plain-text shorthand into structured entries.
   * Format: one entry per line — `{student_number} {status_code} {optional_reason}`
   * Status codes: A=absent_unexcused, AE=absent_excused, L=late, LE=left_early
   */
  parseQuickMarkText(text: string): QuickMarkEntry[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const entries: QuickMarkEntry[] = [];

    for (const [i, line] of lines.entries()) {
      const trimmed = line.trim();
      const parts = trimmed.split(/\s+/);

      if (parts.length < 2) {
        throw new BadRequestException({
          code: 'INVALID_QUICK_MARK_LINE',
          message: `Line ${i + 1}: expected at least student_number and status code, got "${trimmed}"`,
        });
      }

      const studentNumber = parts[0];
      const statusCode = parts[1];

      if (!studentNumber || !statusCode) {
        throw new BadRequestException({
          code: 'INVALID_QUICK_MARK_LINE',
          message: `Line ${i + 1}: missing student_number or status code`,
        });
      }

      const mappedStatus = EXCEPTION_STATUS_MAP[statusCode.toLowerCase()];
      if (!mappedStatus) {
        throw new BadRequestException({
          code: 'INVALID_QUICK_MARK_LINE',
          message: `Line ${i + 1}: invalid status code "${statusCode}". Valid codes: A, AE, L, LE`,
        });
      }

      const reason = parts.length > 2 ? parts.slice(2).join(' ') : undefined;

      entries.push({
        student_number: studentNumber,
        status: mappedStatus,
        reason,
      });
    }

    return entries;
  }

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

  // ─── Parsers ────────────────────────────────────────────────────────────

  /**
   * Parse a CSV buffer into an array of row objects.
   */
  private parseCsv(buffer: Buffer): ParsedRow[] {
    const content = buffer.toString('utf-8');
    const lines = content.split(/\r?\n/);
    const rows: ParsedRow[] = [];
    let headerFound = false;
    let headerMap = new Map<string, number>();

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed === '') continue;

      // Skip comment lines
      if (trimmed.startsWith('#')) continue;

      if (!headerFound) {
        // Parse header
        const headers = this.parseCsvLine(trimmed).map((h) => h.trim().toLowerCase());
        const missingHeaders = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
        if (missingHeaders.length > 0) {
          throw new BadRequestException({
            code: 'INVALID_HEADERS',
            message: `Missing required columns: ${missingHeaders.join(', ')}. Expected: ${EXPECTED_HEADERS.join(', ')}`,
          });
        }

        headerMap = new Map<string, number>();
        for (const h of EXPECTED_HEADERS) {
          headerMap.set(h, headers.indexOf(h));
        }
        headerFound = true;
        continue;
      }

      // Parse data row
      const values = this.parseCsvLine(trimmed);
      rows.push({
        student_number: values[getHeaderIndex(headerMap, 'student_number')] ?? '',
        student_name: values[getHeaderIndex(headerMap, 'student_name')] ?? '',
        class_name: values[getHeaderIndex(headerMap, 'class_name')] ?? '',
        status: values[getHeaderIndex(headerMap, 'status')] ?? '',
      });
    }

    if (!headerFound) {
      throw new BadRequestException({
        code: 'INVALID_HEADERS',
        message: `No header row found. Expected columns: ${EXPECTED_HEADERS.join(', ')}`,
      });
    }

    return rows;
  }

  /**
   * Parse a single CSV line, handling quoted fields.
   */
  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          // Check for escaped quote (double quote)
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = false;
          }
        } else {
          current += char ?? '';
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          fields.push(current);
          current = '';
        } else {
          current += char ?? '';
        }
      }
    }

    fields.push(current);
    return fields;
  }

  /**
   * Parse an XLSX buffer into an array of row objects.
   */
  private parseXlsx(buffer: Buffer): ParsedRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The uploaded Excel file contains no sheets',
      });
    }

    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The uploaded Excel file contains no sheets',
      });
    }

    // Convert sheet to array of arrays, preserving raw text
    const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    if (rawRows.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The uploaded Excel file contains no data',
      });
    }

    // Filter out comment rows (first cell starts with #)
    const filteredRows = rawRows.filter((row) => {
      const firstCell = String(row[0] ?? '').trim();
      return firstCell !== '' && !firstCell.startsWith('#');
    });

    if (filteredRows.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The uploaded file contains no data rows',
      });
    }

    // First non-comment row is the header
    const headerRow = filteredRows[0];
    if (!headerRow) {
      throw new BadRequestException({
        code: 'INVALID_HEADERS',
        message: `No header row found. Expected columns: ${EXPECTED_HEADERS.join(', ')}`,
      });
    }

    const headers = headerRow.map((h: string) => String(h).trim().toLowerCase());

    const missingHeaders = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_HEADERS',
        message: `Missing required columns: ${missingHeaders.join(', ')}. Expected: ${EXPECTED_HEADERS.join(', ')}`,
      });
    }

    const headerMap = new Map<string, number>();
    for (const h of EXPECTED_HEADERS) {
      headerMap.set(h, headers.indexOf(h));
    }

    // Parse data rows (skip header)
    const rows: ParsedRow[] = [];
    for (let i = 1; i < filteredRows.length; i++) {
      const rowData = filteredRows[i];
      if (!rowData) continue;

      const values = rowData.map((v: string) => String(v));
      // Skip completely empty rows
      const hasData = values.some((v: string) => v.trim() !== '');
      if (!hasData) continue;

      rows.push({
        student_number: values[getHeaderIndex(headerMap, 'student_number')] ?? '',
        student_name: values[getHeaderIndex(headerMap, 'student_name')] ?? '',
        class_name: values[getHeaderIndex(headerMap, 'class_name')] ?? '',
        status: values[getHeaderIndex(headerMap, 'status')] ?? '',
      });
    }

    return rows;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Escape a field value for CSV output. If it contains commas, quotes,
   * or newlines, wrap in double quotes and escape internal quotes.
   */
  private escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
