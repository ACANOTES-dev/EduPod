import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { AttendanceFileParserService, STATUS_MAP } from './attendance-file-parser.service';
import type {
  UploadValidationError,
  UploadValidationFailure,
  UploadSuccess,
} from './attendance-upload.service';
import { DailySummaryService } from './daily-summary.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ValidatedRow {
  student_id: string;
  class_id: string;
  class_name: string;
  status: $Enums.AttendanceRecordStatus;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class AttendanceBulkUploadService {
  private readonly logger = new Logger(AttendanceBulkUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly dailySummaryService: DailySummaryService,
    private readonly fileParser: AttendanceFileParserService,
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
    const classes = await this.classesReadFacade.findActiveHomeroomClasses(
      tenantId,
      academicYearId,
    );

    // 5. For each class, load actively enrolled students
    const rows: string[] = [];

    for (const cls of classes) {
      const enrolments = await this.classesReadFacade.findEnrolledStudentsWithNumber(
        tenantId,
        cls.id,
      );

      for (const enrolment of enrolments) {
        const student = enrolment.student;
        const studentName = `${student.first_name} ${student.last_name}`;
        const studentNumber = student.student_number ?? '';
        rows.push(
          `${this.fileParser.escapeCsvField(studentNumber)},${this.fileParser.escapeCsvField(studentName)},${this.fileParser.escapeCsvField(cls.name)},`,
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
    let parsedRows: {
      student_number: string;
      student_name: string;
      class_name: string;
      status: string;
    }[];

    if (ext === 'xlsx' || ext === 'xls') {
      parsedRows = this.fileParser.parseXlsx(fileBuffer);
    } else if (ext === 'csv') {
      parsedRows = this.fileParser.parseCsv(fileBuffer);
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
    const classes = await this.classesReadFacade.findActiveHomeroomClasses(
      tenantId,
      academicYearId2,
    );
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
}
