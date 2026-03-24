import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolClosuresService } from '../school-closures/school-closures.service';

import { DailySummaryService } from './daily-summary.service';
import type { CreateAttendanceSessionDto, SaveAttendanceRecordsDto, AmendAttendanceRecordDto } from './dto/attendance.dto';

interface ListSessionsParams {
  page: number;
  pageSize: number;
  session_date?: string;
  start_date?: string;
  end_date?: string;
  class_id?: string;
  status?: string;
}

interface ExceptionsParams {
  date?: string;
  start_date?: string;
  end_date?: string;
}

interface StudentAttendanceParams {
  start_date?: string;
  end_date?: string;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly closuresService: SchoolClosuresService,
    private readonly dailySummaryService: DailySummaryService,
    private readonly settingsService: SettingsService,
  ) {}

  // ─── Session Management ─────────────────────────────────────────────────

  /**
   * Create an attendance session for a class on a given date.
   */
  async createSession(
    tenantId: string,
    userId: string,
    dto: CreateAttendanceSessionDto,
    userPermissions: string[],
    userStaffProfileId?: string,
  ) {
    // 1. Validate class exists and belongs to tenant
    const classEntity = await this.prisma.class.findFirst({
      where: { id: dto.class_id, tenant_id: tenantId },
      select: {
        id: true,
        academic_year_id: true,
        year_group_id: true,
        academic_year: {
          select: { start_date: true, end_date: true },
        },
      },
    });

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${dto.class_id}" not found`,
      });
    }

    // 2. If user only has attendance.take (not attendance.manage), verify class assignment
    const hasManage = userPermissions.includes('attendance.manage');
    if (!hasManage && userStaffProfileId) {
      const assignment = await this.prisma.classStaff.findFirst({
        where: {
          class_id: dto.class_id,
          staff_profile_id: userStaffProfileId,
          tenant_id: tenantId,
        },
        select: { class_id: true },
      });

      if (!assignment) {
        throw new ForbiddenException({
          code: 'NOT_ASSIGNED_TO_CLASS',
          message: 'You are not assigned to this class',
        });
      }
    }

    // 2.5 Validate session_date falls on a configured work day
    const sessionDate = new Date(dto.session_date);
    const tenantSettings = await this.settingsService.getSettings(tenantId);
    const dayOfWeek = sessionDate.getUTCDay(); // 0=Sun, 6=Sat
    if (!tenantSettings.attendance.workDays.includes(dayOfWeek)) {
      throw new BadRequestException({
        code: 'SESSION_DATE_NOT_WORK_DAY',
        message: 'The selected date is not a configured work day',
      });
    }

    // 3. Validate session_date is within the academic year range
    const yearStart = classEntity.academic_year.start_date;
    const yearEnd = classEntity.academic_year.end_date;

    if (sessionDate < yearStart || sessionDate > yearEnd) {
      throw new BadRequestException({
        code: 'DATE_OUTSIDE_ACADEMIC_YEAR',
        message: 'Session date is outside the academic year date range',
      });
    }

    // 4. Check for school closure
    const isClosure = await this.closuresService.isClosureDate(
      tenantId,
      sessionDate,
      dto.class_id,
      classEntity.year_group_id ?? undefined,
    );

    if (isClosure) {
      if (!dto.override_closure) {
        throw new ConflictException({
          code: 'DATE_IS_CLOSURE',
          message: 'The selected date is a school closure day',
        });
      }

      // Verify user has override permission
      if (!userPermissions.includes('attendance.override_closure')) {
        throw new ForbiddenException({
          code: 'OVERRIDE_NOT_PERMITTED',
          message: 'You do not have permission to override school closures',
        });
      }

      if (!dto.override_reason) {
        throw new BadRequestException({
          code: 'OVERRIDE_REASON_REQUIRED',
          message: 'An override reason is required when overriding a closure',
        });
      }
    }

    // 5. Determine effective default_present
    let effectiveDefaultPresent: boolean | null = null;
    if (dto.default_present === true || dto.default_present === false) {
      effectiveDefaultPresent = dto.default_present;
    } else {
      effectiveDefaultPresent = tenantSettings.attendance.defaultPresentEnabled || null;
    }

    // 6. Create session with race prevention via upsert-like approach
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    let session: { id: string; [key: string]: unknown };
    let isExisting = false;

    try {
      session = (await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        // Check if session already exists for this class + date + schedule
        const existing = await db.attendanceSession.findFirst({
          where: {
            tenant_id: tenantId,
            class_id: dto.class_id,
            session_date: sessionDate,
            schedule_id: dto.schedule_id ?? null,
            status: { not: 'cancelled' },
          },
        });

        if (existing) {
          isExisting = true;
          return existing;
        }

        return db.attendanceSession.create({
          data: {
            tenant_id: tenantId,
            class_id: dto.class_id,
            schedule_id: dto.schedule_id ?? null,
            session_date: sessionDate,
            status: 'open',
            override_reason: isClosure ? dto.override_reason : null,
            default_present: effectiveDefaultPresent,
          },
          include: {
            class_entity: {
              select: { id: true, name: true },
            },
          },
        });
      })) as { id: string; [key: string]: unknown };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Race condition: session was created between check and create
        const existing = await this.prisma.attendanceSession.findFirst({
          where: {
            tenant_id: tenantId,
            class_id: dto.class_id,
            session_date: sessionDate,
            schedule_id: dto.schedule_id ?? null,
            status: { not: 'cancelled' },
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw err;
    }

    // 7. If newly created and default_present is active, create present records
    if (!isExisting && effectiveDefaultPresent) {
      await this.createDefaultPresentRecords(
        tenantId,
        session.id,
        dto.class_id,
        userId,
      );
    }

    return session;
  }

  /**
   * Create "present" attendance records for all actively enrolled students in a class.
   * Used when a session is created with default_present enabled.
   */
  async createDefaultPresentRecords(
    tenantId: string,
    sessionId: string,
    classId: string,
    userId: string,
  ): Promise<number> {
    // Get all actively enrolled students in the class
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        status: 'active',
      },
      select: { student_id: true },
    });

    if (enrolments.length === 0) {
      return 0;
    }

    const now = new Date();
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.attendanceRecord.createMany({
        data: enrolments.map((e) => ({
          tenant_id: tenantId,
          attendance_session_id: sessionId,
          student_id: e.student_id,
          status: 'present' as $Enums.AttendanceRecordStatus,
          marked_by_user_id: userId,
          marked_at: now,
        })),
        skipDuplicates: true,
      });
    })) as { count: number };

    return result.count;
  }

  /**
   * List attendance sessions with pagination and filters.
   */
  async findAllSessions(
    tenantId: string,
    params: ListSessionsParams,
    userStaffProfileId?: string,
  ) {
    const { page, pageSize, session_date, start_date, end_date, class_id, status } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AttendanceSessionWhereInput = { tenant_id: tenantId };

    if (session_date) {
      where.session_date = new Date(session_date);
    } else if (start_date || end_date) {
      where.session_date = {};
      if (start_date) {
        where.session_date.gte = new Date(start_date);
      }
      if (end_date) {
        where.session_date.lte = new Date(end_date);
      }
    }

    if (class_id) {
      where.class_id = class_id;
    }

    if (status) {
      where.status = status as $Enums.AttendanceSessionStatus;
    }

    // If teacher, filter to their assigned classes
    if (userStaffProfileId) {
      const assignments = await this.prisma.classStaff.findMany({
        where: { staff_profile_id: userStaffProfileId, tenant_id: tenantId },
        select: { class_id: true },
      });
      const assignedClassIds = assignments.map((a) => a.class_id);

      if (where.class_id) {
        // If a specific class_id filter is provided, validate it's in their assignments
        if (!assignedClassIds.includes(where.class_id as string)) {
          return { data: [], meta: { page, pageSize, total: 0 } };
        }
      } else {
        where.class_id = { in: assignedClassIds };
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ session_date: 'desc' }, { created_at: 'desc' }],
        include: {
          class_entity: {
            select: { id: true, name: true },
          },
          _count: {
            select: { records: true },
          },
        },
      }),
      this.prisma.attendanceSession.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get a single attendance session with all records and enrolled students.
   */
  async findOneSession(tenantId: string, id: string) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        class_entity: {
          select: {
            id: true,
            name: true,
            academic_year: { select: { id: true, name: true } },
          },
        },
        schedule: {
          select: {
            id: true,
            weekday: true,
            start_time: true,
            end_time: true,
          },
        },
        submitted_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        records: {
          include: {
            student: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                student_number: true,
              },
            },
            marker: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
          orderBy: { student: { last_name: 'asc' } },
        },
      },
    });

    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `Attendance session with id "${id}" not found`,
      });
    }

    // Get enrolled students for the class (so the UI can show who's missing records)
    const enrolledStudents = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: session.class_id,
        status: 'active',
      },
      select: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
          },
        },
      },
      orderBy: { student: { last_name: 'asc' } },
    });

    // Format schedule times if present
    const formattedSchedule = session.schedule
      ? {
          id: session.schedule.id,
          weekday: session.schedule.weekday,
          start_time: session.schedule.start_time.toISOString().slice(11, 16),
          end_time: session.schedule.end_time.toISOString().slice(11, 16),
        }
      : null;

    return {
      ...session,
      schedule: formattedSchedule,
      enrolled_students: enrolledStudents.map((e) => e.student),
    };
  }

  /**
   * Cancel an open attendance session.
   */
  async cancelSession(tenantId: string, id: string) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `Attendance session with id "${id}" not found`,
      });
    }

    if (session.status !== 'open') {
      throw new ConflictException({
        code: 'SESSION_NOT_OPEN',
        message: `Cannot cancel session with status "${session.status}". Only open sessions can be cancelled.`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.attendanceSession.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });
  }

  // ─── Record Management ──────────────────────────────────────────────────

  /**
   * Save (upsert) attendance records for a session.
   */
  async saveRecords(
    tenantId: string,
    sessionId: string,
    userId: string,
    dto: SaveAttendanceRecordsDto,
  ) {
    // 1. Validate session exists and is open
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true, class_id: true },
    });

    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `Attendance session with id "${sessionId}" not found`,
      });
    }

    if (session.status !== 'open') {
      throw new ConflictException({
        code: 'SESSION_NOT_OPEN',
        message: `Cannot modify records for session with status "${session.status}". Session must be open.`,
      });
    }

    // 2. Validate all student_ids are actively enrolled in the class
    const studentIds = dto.records.map((r) => r.student_id);
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: session.class_id,
        student_id: { in: studentIds },
        status: 'active',
      },
      select: { student_id: true },
    });

    const enrolledStudentIds = new Set(enrolments.map((e) => e.student_id));
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

    const records = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const upsertedRecords = [];
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
    });

    return { data: records };
  }

  /**
   * Submit an attendance session (mark as submitted).
   * Triggers daily summary recalculation for all students.
   */
  async submitSession(tenantId: string, sessionId: string, userId: string) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true, session_date: true },
    });

    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: `Attendance session with id "${sessionId}" not found`,
      });
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
      await this.dailySummaryService.recalculate(
        tenantId,
        studentId,
        session.session_date,
      );
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

  // ─── Exceptions & Queries ───────────────────────────────────────────────

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
    const students = studentIds.length > 0
      ? await this.prisma.student.findMany({
          where: {
            id: { in: studentIds },
            tenant_id: tenantId,
          },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
          },
        })
      : [];

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

  /**
   * Get attendance records for a specific student across sessions.
   */
  async getStudentAttendance(
    tenantId: string,
    studentId: string,
    params: StudentAttendanceParams,
  ) {
    // Verify student exists
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { id: true, first_name: true, last_name: true },
    });

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

  // ─── Batch Operations ───────────────────────────────────────────────────

  /**
   * Batch generate sessions for a date (nightly job).
   * For each active schedule on the weekday, create a session if not exists.
   */
  async batchGenerateSessions(tenantId: string, date: Date) {
    // Convert JS weekday (0=Sunday) to schema weekday (0=Monday)
    const jsDay = date.getDay();
    const weekday = jsDay === 0 ? 6 : jsDay - 1;

    // Find all active schedules for this weekday
    const schedules = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        weekday,
        effective_start_date: { lte: date },
        OR: [
          { effective_end_date: null },
          { effective_end_date: { gte: date } },
        ],
      },
      select: {
        id: true,
        class_id: true,
        class_entity: {
          select: { year_group_id: true },
        },
      },
    });

    let created = 0;
    let skipped = 0;

    for (const schedule of schedules) {
      // Check closure for this class
      const isClosure = await this.closuresService.isClosureDate(
        tenantId,
        date,
        schedule.class_id,
        schedule.class_entity.year_group_id ?? undefined,
      );

      if (isClosure) {
        skipped++;
        continue;
      }

      // Check if session already exists
      const existing = await this.prisma.attendanceSession.findFirst({
        where: {
          tenant_id: tenantId,
          class_id: schedule.class_id,
          session_date: date,
          schedule_id: schedule.id,
          status: { not: 'cancelled' },
        },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
      try {
        await prismaWithRls.$transaction(async (tx) => {
          const db = tx as unknown as PrismaService;
          await db.attendanceSession.create({
            data: {
              tenant_id: tenantId,
              class_id: schedule.class_id,
              schedule_id: schedule.id,
              session_date: date,
              status: 'open',
            },
          });
        });
        created++;
      } catch (err) {
        // Ignore duplicate errors from races
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          skipped++;
        } else {
          throw err;
        }
      }
    }

    return { created, skipped, total_schedules: schedules.length };
  }

  /**
   * Auto-lock submitted sessions older than the configured threshold.
   */
  async lockExpiredSessions(tenantId: string) {
    // Read tenant settings for autoLockAfterDays
    const tenantSetting = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const settings = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
    const attendanceSettings = (settings['attendance'] ?? {}) as Record<string, unknown>;
    const autoLockAfterDays = attendanceSettings['autoLockAfterDays'] as number | undefined;
    if (autoLockAfterDays === undefined || autoLockAfterDays === null) {
      return { locked_count: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - autoLockAfterDays);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.attendanceSession.updateMany({
        where: {
          tenant_id: tenantId,
          status: 'submitted',
          session_date: { lte: cutoffDate },
        },
        data: { status: 'locked' },
      });
    })) as { count: number };

    return { locked_count: result.count };
  }

  // ─── Teacher Dashboard ──────────────────────────────────────────────────

  /**
   * Get teacher's dashboard data: today's schedule and sessions.
   */
  async getTeacherDashboard(tenantId: string, userId: string) {
    // Find the staff profile for the current user
    const staffProfile = await this.prisma.staffProfile.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!staffProfile) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: 'No staff profile found for the current user',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Convert JS weekday (0=Sunday) to schema weekday (0=Monday)
    const todayJsDay = today.getDay();
    const weekday = todayJsDay === 0 ? 6 : todayJsDay - 1;

    // Get today's schedules for classes the teacher is assigned to
    const assignments = await this.prisma.classStaff.findMany({
      where: {
        staff_profile_id: staffProfile.id,
        tenant_id: tenantId,
      },
      select: { class_id: true },
    });

    const classIds = assignments.map((a) => a.class_id);

    const schedules = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
        weekday,
        effective_start_date: { lte: today },
        OR: [
          { effective_end_date: null },
          { effective_end_date: { gte: today } },
        ],
      },
      include: {
        class_entity: {
          select: { id: true, name: true },
        },
        room: {
          select: { id: true, name: true },
        },
      },
      orderBy: { start_time: 'asc' },
    });

    // Get today's sessions for those classes
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
        session_date: today,
      },
      include: {
        class_entity: {
          select: { id: true, name: true },
        },
        _count: {
          select: { records: true },
        },
      },
    });

    // Format schedule times
    const formattedSchedules = schedules.map((s) => ({
      ...s,
      start_time: s.start_time.toISOString().slice(11, 16),
      end_time: s.end_time.toISOString().slice(11, 16),
    }));

    return {
      today: today.toISOString().slice(0, 10),
      schedules: formattedSchedules,
      sessions,
    };
  }

  // ─── Parent View ────────────────────────────────────────────────────────

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
    const tenantSetting = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const settings = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
    const generalSettings = (settings['general'] ?? {}) as Record<string, unknown>;
    const attendanceVisible = generalSettings['attendanceVisibleToParents'] !== false;

    if (!attendanceVisible) {
      throw new ForbiddenException({
        code: 'ATTENDANCE_NOT_VISIBLE',
        message: 'Attendance information is not available for parent viewing',
      });
    }

    // Verify the student is linked to the parent
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const studentParentLink = await this.prisma.studentParent.findUnique({
      where: {
        student_id_parent_id: {
          student_id: studentId,
          parent_id: parent.id,
        },
      },
    });

    if (!studentParentLink || studentParentLink.tenant_id !== tenantId) {
      throw new ForbiddenException({
        code: 'NOT_LINKED_TO_STUDENT',
        message: 'You are not linked to this student',
      });
    }

    // Get daily summaries for the student
    const summaries = await this.dailySummaryService.findForStudent(
      tenantId,
      studentId,
      params,
    );

    // Get recent records for detail
    const records = await this.getStudentAttendance(tenantId, studentId, params);

    return {
      summaries: summaries.data,
      records: records.data,
    };
  }
}
