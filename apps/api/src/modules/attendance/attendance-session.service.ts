import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchoolClosuresService } from '../school-closures/school-closures.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import type { CreateAttendanceSessionDto } from './dto/attendance.dto';

interface ListSessionsParams {
  page: number;
  pageSize: number;
  session_date?: string;
  start_date?: string;
  end_date?: string;
  class_id?: string;
  status?: string;
}

// ─── AttendanceSessionService ────────────────────────────────────────────────

/**
 * Handles attendance session lifecycle: creation, listing, retrieval,
 * cancellation, batch generation, and teacher dashboard queries.
 */
@Injectable()
export class AttendanceSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly closuresService: SchoolClosuresService,
    private readonly settingsService: SettingsService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Session Creation ────────────────────────────────────────────────────

  /**
   * Create an attendance session for a class on a given date.
   * Validates class ownership, staff assignment, work-day rules, academic
   * year bounds, closure overrides, and default-present settings.
   */
  async createSession(
    tenantId: string,
    userId: string,
    dto: CreateAttendanceSessionDto,
    userPermissions: string[],
    userStaffProfileId?: string,
  ): Promise<{ id: string; [key: string]: unknown }> {
    // 1. Validate class exists and belongs to tenant
    const classEntity = await this.classesReadFacade.findByIdWithAcademicYear(
      tenantId,
      dto.class_id,
    );

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${dto.class_id}" not found`,
      });
    }

    // 2. If user only has attendance.take (not attendance.manage), verify class assignment
    const hasManage = userPermissions.includes('attendance.manage');
    if (!hasManage && userStaffProfileId) {
      const isAssigned = await this.classesReadFacade.isStaffAssignedToClass(
        tenantId,
        userStaffProfileId,
        dto.class_id,
      );

      if (!isAssigned) {
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
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
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
      await this.createDefaultPresentRecords(tenantId, session.id, dto.class_id, userId);
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
    const enrolledStudentIds = await this.classesReadFacade.findEnrolledStudentIds(
      tenantId,
      classId,
    );

    if (enrolledStudentIds.length === 0) {
      return 0;
    }

    const now = new Date();
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.attendanceRecord.createMany({
        data: enrolledStudentIds.map((sid) => ({
          tenant_id: tenantId,
          attendance_session_id: sessionId,
          student_id: sid,
          status: 'present' as $Enums.AttendanceRecordStatus,
          marked_by_user_id: userId,
          marked_at: now,
        })),
        skipDuplicates: true,
      });
    })) as { count: number };

    return result.count;
  }

  // ─── Session Queries ─────────────────────────────────────────────────────

  /**
   * List attendance sessions with pagination and filters.
   */
  async findAllSessions(tenantId: string, params: ListSessionsParams, userStaffProfileId?: string) {
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
      const assignedClassIds = await this.classesReadFacade.findClassIdsByStaff(
        tenantId,
        userStaffProfileId,
      );

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
    const enrolledStudents = await this.classesReadFacade.findEnrolledStudentsWithNumber(
      tenantId,
      session.class_id,
    );

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

  // ─── Batch Generation ────────────────────────────────────────────────────

  /**
   * Batch generate sessions for a date (nightly job).
   * For each active schedule on the weekday, create a session if not exists.
   */
  async batchGenerateSessions(tenantId: string, date: Date) {
    // Convert JS weekday (0=Sunday) to schema weekday (0=Monday)
    const jsDay = date.getDay();
    const weekday = jsDay === 0 ? 6 : jsDay - 1;

    // Find all active schedules for this weekday
    const schedules = await this.schedulesReadFacade.findByWeekdayWithClassYearGroup(
      tenantId,
      weekday,
      date,
    );

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
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          skipped++;
        } else {
          throw err;
        }
      }
    }

    return { created, skipped, total_schedules: schedules.length };
  }

  // ─── Teacher Dashboard ───────────────────────────────────────────────────

  /**
   * Get teacher's dashboard data: today's schedule and sessions.
   */
  async getTeacherDashboard(tenantId: string, userId: string) {
    // Find the staff profile for the current user
    const staffProfileId = await this.staffProfileReadFacade.resolveProfileId(tenantId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Convert JS weekday (0=Sunday) to schema weekday (0=Monday)
    const todayJsDay = today.getDay();
    const weekday = todayJsDay === 0 ? 6 : todayJsDay - 1;

    // Get today's schedules for classes the teacher is assigned to
    const classIds = await this.classesReadFacade.findClassIdsByStaff(tenantId, staffProfileId);

    const schedules = await this.schedulesReadFacade.findByClassIdsAndWeekday(
      tenantId,
      classIds,
      weekday,
      today,
    );

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

  // ─── Officer dashboard ────────────────────────────────────────────────────
  // Tenant-wide view of every attendance session on a given date. Backs the
  // dedicated-taker dashboard introduced in Step 4. Caller auth is enforced
  // at the controller via @RequiresPermission('attendance.take_any_class').

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
    // Build the target date at UTC midnight so the date we echo back in
    // `meta.date` matches what the caller asked for, regardless of the
    // server's local timezone. attendance_sessions.session_date is a DATE
    // column, so we compare at UTC midnight.
    const target = params.session_date
      ? new Date(`${params.session_date}T00:00:00.000Z`)
      : (() => {
          const now = new Date();
          return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        })();

    const where: Prisma.AttendanceSessionWhereInput = {
      tenant_id: tenantId,
      session_date: target,
    };
    if (params.status) where.status = params.status as $Enums.AttendanceSessionStatus;
    if (params.class_id) where.class_id = params.class_id;
    if (params.teacher_staff_id) where.teacher_staff_id = params.teacher_staff_id;
    if (params.year_group_id) {
      where.class_entity = { year_group_id: params.year_group_id };
    }

    const [rows, total] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          class_entity: {
            select: {
              id: true,
              name: true,
              year_group: { select: { id: true, name: true } },
            },
          },
          teacher_staff: {
            select: {
              id: true,
              user: { select: { first_name: true, last_name: true } },
            },
          },
          schedule: {
            select: { id: true, start_time: true, end_time: true },
          },
          _count: { select: { records: true } },
        },
        orderBy: [{ schedule: { start_time: 'asc' } }, { class_entity: { name: 'asc' } }],
      }),
      this.prisma.attendanceSession.count({ where }),
    ]);

    // Get enrolment counts for each class via the classes facade (cross-module
    // Prisma access is lint-forbidden).
    const classIds = [...new Set(rows.map((r) => r.class_id))];
    const enrolmentByClass = await this.classesReadFacade.findEnrolmentCountsByClasses(
      tenantId,
      classIds,
    );

    const data = rows.map((r) => ({
      id: r.id,
      session_date: r.session_date.toISOString().slice(0, 10),
      status: r.status,
      default_present: r.default_present ?? false,
      class: r.class_entity
        ? {
            id: r.class_entity.id,
            name: r.class_entity.name,
            year_group: r.class_entity.year_group,
          }
        : null,
      teacher: r.teacher_staff
        ? {
            id: r.teacher_staff.id,
            first_name: r.teacher_staff.user.first_name,
            last_name: r.teacher_staff.user.last_name,
          }
        : null,
      schedule: r.schedule
        ? {
            id: r.schedule.id,
            start_time: r.schedule.start_time.toISOString().slice(11, 16),
            end_time: r.schedule.end_time.toISOString().slice(11, 16),
          }
        : null,
      record_count: r._count.records,
      enrolled_count: enrolmentByClass.get(r.class_id) ?? 0,
    }));

    return {
      data,
      meta: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        date: target.toISOString().slice(0, 10),
      },
    };
  }
}
