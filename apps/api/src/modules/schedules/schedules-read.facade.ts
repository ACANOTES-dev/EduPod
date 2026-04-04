/**
 * SchedulesReadFacade — Centralized read service for schedule (timetable entry) data.
 *
 * PURPOSE:
 * The `schedule` table is heavily queried across the codebase: scheduling (17 files),
 * scheduling-runs (3 files), attendance, behaviour, payroll, regulatory, reports,
 * rooms, and period-grid all need to look up schedule entries. Today each module
 * queries `prisma.schedule` directly, duplicating select clauses and date-range
 * filters.
 *
 * This facade provides a single, well-typed entry point for all cross-module
 * schedule reads. Common patterns (effective-date filtering, teacher-busy checks,
 * pinned entries) are consolidated here so schema changes propagate through one file.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found (callers decide whether to throw).
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { $Enums } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Common effective-date filter ─────────────────────────────────────────────

/** Build a reusable effective-date filter fragment (fresh Date each call). */
function effectiveNow(): Prisma.ScheduleWhereInput {
  return {
    OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
  };
}

/** Build an effective-date filter anchored to a specific date (not "now"). */
function effectiveAt(date: Date): Prisma.ScheduleWhereInput {
  return {
    effective_start_date: { lte: date },
    OR: [{ effective_end_date: null }, { effective_end_date: { gte: date } }],
  };
}

// ─── Common select shapes ─────────────────────────────────────────────────────

const SCHEDULE_CORE_SELECT = {
  id: true,
  class_id: true,
  academic_year_id: true,
  room_id: true,
  teacher_staff_id: true,
  weekday: true,
  period_order: true,
  start_time: true,
  end_time: true,
  effective_start_date: true,
  effective_end_date: true,
  is_pinned: true,
  source: true,
  rotation_week: true,
} as const;

const SCHEDULE_WITH_CLASS_SUBJECT_SELECT = {
  ...SCHEDULE_CORE_SELECT,
  class_entity: {
    select: {
      name: true,
      year_group_id: true,
      subject_id: true,
      subject: { select: { name: true } },
    },
  },
  room: { select: { name: true } },
  teacher: {
    select: { user: { select: { first_name: true, last_name: true } } },
  },
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ScheduleCoreRow {
  id: string;
  class_id: string;
  academic_year_id: string;
  room_id: string | null;
  teacher_staff_id: string | null;
  weekday: number;
  period_order: number | null;
  start_time: Date;
  end_time: Date;
  effective_start_date: Date;
  effective_end_date: Date | null;
  is_pinned: boolean;
  source: string;
  rotation_week: number | null;
}

export interface ScheduleWithClassRow extends ScheduleCoreRow {
  class_entity: {
    name: string;
    year_group_id: string | null;
    subject_id: string | null;
    subject: { name: string } | null;
  } | null;
  room: { name: string } | null;
  teacher: { user: { first_name: string; last_name: string } } | null;
}

export interface BusyTeacherRow {
  teacher_staff_id: string | null;
}

export interface PinnedScheduleRow extends ScheduleCoreRow {
  class_entity: { year_group_id: string | null; subject_id: string | null } | null;
}

export interface ScheduleSubstitutionContextRow {
  id: string;
  teacher_staff_id: string | null;
  academic_year_id: string;
  weekday: number;
  start_time: Date;
  end_time: Date;
  class_entity: {
    name: string;
    year_group_id: string | null;
    subject_id: string | null;
    academic_year_id: string;
    subject: { name: string } | null;
    year_group: { name: string } | null;
  } | null;
  room: { name: string } | null;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class SchedulesReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Single-record lookups ──────────────────────────────────────────────────

  /**
   * Find a single schedule entry by ID with full class/subject/teacher/room details.
   * Returns `null` if not found.
   */
  async findById(tenantId: string, scheduleId: string): Promise<ScheduleWithClassRow | null> {
    return this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenant_id: tenantId },
      select: SCHEDULE_WITH_CLASS_SUBJECT_SELECT,
    }) as Promise<ScheduleWithClassRow | null>;
  }

  /**
   * Find a schedule by ID with minimal core fields only.
   */
  async findCoreById(tenantId: string, scheduleId: string): Promise<ScheduleCoreRow | null> {
    return this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenant_id: tenantId },
      select: SCHEDULE_CORE_SELECT,
    });
  }

  /**
   * Assert that a schedule entry exists. Returns the core row or `null`.
   */
  async existsById(tenantId: string, scheduleId: string): Promise<{ id: string } | null> {
    return this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenant_id: tenantId },
      select: { id: true },
    });
  }

  // ─── Teacher busy / availability checks ─────────────────────────────────────

  /**
   * Find all teacher IDs who are busy (scheduled) at a given weekday + time range.
   * Used by substitution, cover-teacher, and AI-substitution services to exclude
   * unavailable teachers.
   */
  async findBusyTeacherIds(
    tenantId: string,
    opts: {
      weekday: number;
      startTime: Date;
      endTime: Date;
      effectiveDate?: Date;
      academicYearId?: string;
    },
  ): Promise<Set<string>> {
    const where: Prisma.ScheduleWhereInput = {
      tenant_id: tenantId,
      weekday: opts.weekday,
      start_time: { lt: opts.endTime },
      end_time: { gt: opts.startTime },
      teacher_staff_id: { not: null },
    };

    if (opts.effectiveDate) {
      Object.assign(where, effectiveAt(opts.effectiveDate));
    } else {
      Object.assign(where, effectiveNow());
    }

    if (opts.academicYearId) {
      where.academic_year_id = opts.academicYearId;
    }

    const rows = await this.prisma.schedule.findMany({
      where,
      select: { teacher_staff_id: true },
    });

    return new Set(rows.map((r) => r.teacher_staff_id).filter((id): id is string => id !== null));
  }

  /**
   * Count total weekly schedule entries per teacher (for workload balancing).
   * Returns a Map from staff_profile_id to period count.
   */
  async countWeeklyPeriodsPerTeacher(
    tenantId: string,
    academicYearId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        teacher_staff_id: { not: null },
        ...effectiveNow(),
      },
      select: { teacher_staff_id: true },
    });

    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.teacher_staff_id) {
        map.set(r.teacher_staff_id, (map.get(r.teacher_staff_id) ?? 0) + 1);
      }
    }
    return map;
  }

  // ─── Timetable queries ──────────────────────────────────────────────────────

  /**
   * Find schedule entries for a teacher's timetable, including class/subject/room.
   * Filters by effective date range and optional rotation week.
   */
  async findTeacherTimetable(
    tenantId: string,
    staffId: string,
    opts: { asOfDate: Date; rotationWeek?: number },
  ): Promise<ScheduleWithClassRow[]> {
    const where: Prisma.ScheduleWhereInput = {
      tenant_id: tenantId,
      teacher_staff_id: staffId,
      ...effectiveAt(opts.asOfDate),
    };

    if (opts.rotationWeek !== undefined) {
      where.rotation_week = opts.rotationWeek;
    }

    return this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
      select: SCHEDULE_WITH_CLASS_SUBJECT_SELECT,
    }) as Promise<ScheduleWithClassRow[]>;
  }

  /**
   * Find schedule entries for a class timetable, including teacher/subject/room.
   */
  async findClassTimetable(
    tenantId: string,
    classId: string,
    opts: { asOfDate: Date; rotationWeek?: number },
  ): Promise<ScheduleWithClassRow[]> {
    const where: Prisma.ScheduleWhereInput = {
      tenant_id: tenantId,
      class_id: classId,
      ...effectiveAt(opts.asOfDate),
    };

    if (opts.rotationWeek !== undefined) {
      where.rotation_week = opts.rotationWeek;
    }

    return this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
      select: SCHEDULE_WITH_CLASS_SUBJECT_SELECT,
    }) as Promise<ScheduleWithClassRow[]>;
  }

  // ─── Scheduling domain reads ────────────────────────────────────────────────

  /**
   * Find pinned schedule entries for an academic year. Used by scheduler
   * orchestration and prerequisites to detect conflicts and build solver input.
   */
  async findPinnedEntries(tenantId: string, academicYearId: string): Promise<PinnedScheduleRow[]> {
    return this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        is_pinned: true,
        ...effectiveNow(),
      },
      select: {
        ...SCHEDULE_CORE_SELECT,
        class_entity: { select: { year_group_id: true, subject_id: true } },
      },
    }) as unknown as Promise<PinnedScheduleRow[]>;
  }

  /**
   * Count pinned entries for an academic year. Used to detect mode (auto vs hybrid).
   */
  async countPinnedEntries(tenantId: string, academicYearId: string): Promise<number> {
    return this.prisma.schedule.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        is_pinned: true,
        ...effectiveNow(),
      },
    });
  }

  /**
   * Find all effective schedule entries for an academic year. Used by the
   * scheduling dashboard for workload and room utilisation calculations.
   */
  async findByAcademicYear(
    tenantId: string,
    academicYearId: string,
    opts?: {
      teacherAssigned?: boolean;
      roomAssigned?: boolean;
      source?: $Enums.ScheduleSource;
    },
  ): Promise<ScheduleCoreRow[]> {
    const where: Prisma.ScheduleWhereInput = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
      ...effectiveNow(),
    };

    if (opts?.teacherAssigned) {
      where.teacher_staff_id = { not: null };
    }
    if (opts?.roomAssigned) {
      where.room_id = { not: null };
    }
    if (opts?.source) {
      where.source = opts.source;
    }

    return this.prisma.schedule.findMany({
      where,
      select: SCHEDULE_CORE_SELECT,
    });
  }

  /**
   * Group schedule entries by class_id and return the distinct class IDs.
   * Used by the dashboard to know how many classes are scheduled.
   */
  async findScheduledClassIds(
    tenantId: string,
    academicYearId: string,
    opts?: { source?: $Enums.ScheduleSource },
  ): Promise<string[]> {
    const where: Prisma.ScheduleWhereInput = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
      ...effectiveNow(),
    };

    if (opts?.source) {
      where.source = opts.source;
    }

    const groups = await this.prisma.schedule.groupBy({
      by: ['class_id'],
      where,
    });

    return groups.map((g) => g.class_id);
  }

  /**
   * Count schedule entries per class for an academic year.
   * Returns a Map from class_id to entry count.
   */
  async countEntriesPerClass(
    tenantId: string,
    academicYearId: string,
  ): Promise<Map<string, number>> {
    const groups = await this.prisma.schedule.groupBy({
      by: ['class_id'],
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        ...effectiveNow(),
      },
      _count: true,
    });

    const map = new Map<string, number>();
    for (const g of groups) {
      map.set(g.class_id, g._count);
    }
    return map;
  }

  // ─── Cross-module reads ─────────────────────────────────────────────────────

  /**
   * Count all schedule entries matching a filter. Used by reports, regulatory,
   * and rooms for existence checks before deletion.
   */
  async count(tenantId: string, where?: Prisma.ScheduleWhereInput): Promise<number> {
    return this.prisma.schedule.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  /**
   * Find schedule entries by weekday for a date range. Used by payroll
   * class-delivery auto-population and attendance session generation.
   */
  async findByWeekdayInDateRange(
    tenantId: string,
    opts: {
      weekday?: number;
      dateFrom: Date;
      dateTo: Date;
      classIds?: string[];
    },
  ): Promise<ScheduleCoreRow[]> {
    const where: Prisma.ScheduleWhereInput = {
      tenant_id: tenantId,
      effective_start_date: { lte: opts.dateTo },
      OR: [{ effective_end_date: null }, { effective_end_date: { gte: opts.dateFrom } }],
    };

    if (opts.weekday !== undefined) {
      where.weekday = opts.weekday;
    }
    if (opts.classIds) {
      where.class_id = { in: opts.classIds };
    }

    return this.prisma.schedule.findMany({
      where,
      select: SCHEDULE_CORE_SELECT,
    });
  }

  /**
   * Find schedule entries for a student's enrolled classes on a given weekday.
   * Used by behaviour sanctions to check timetable conflicts.
   */
  async findByStudentWeekday(
    tenantId: string,
    studentId: string,
    weekday: number,
  ): Promise<
    Array<{
      id: string;
      start_time: Date;
      end_time: Date;
      class_entity: { subject: { name: string } | null } | null;
    }>
  > {
    return this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        weekday,
        class_entity: {
          class_enrolments: {
            some: { student_id: studentId, status: 'active' },
          },
        },
      },
      select: {
        id: true,
        start_time: true,
        end_time: true,
        class_entity: {
          select: { subject: { select: { name: true } } },
        },
      },
    });
  }

  /**
   * Check if any schedule uses rotation weeks for an academic year.
   * Used by the rotation service to prevent deletion of in-use configs.
   */
  async hasRotationEntries(tenantId: string, academicYearId: string): Promise<boolean> {
    const found = await this.prisma.schedule.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        rotation_week: { not: null },
      },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Count schedules referencing a specific room. Used by the rooms service
   * to check if a room can be safely deleted.
   */
  async countByRoom(tenantId: string, roomId: string): Promise<number> {
    return this.prisma.schedule.count({
      where: { room_id: roomId, tenant_id: tenantId },
    });
  }

  /**
   * Find teacher schedule entries for an academic year (teacher_staff_id + weekday + period_order).
   * Used by scheduling dashboard for teacher utilisation and gap analysis.
   */
  async findTeacherScheduleEntries(
    tenantId: string,
    academicYearId: string,
  ): Promise<
    Array<{ teacher_staff_id: string | null; weekday: number; period_order: number | null }>
  > {
    return this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        teacher_staff_id: { not: null },
        ...effectiveNow(),
      },
      select: {
        teacher_staff_id: true,
        weekday: true,
        period_order: true,
      },
    });
  }

  /**
   * Find schedule entries with teacher details for workload calculation.
   * Used by scheduling dashboard workload endpoint.
   */
  async findTeacherWorkloadEntries(
    tenantId: string,
    academicYearId: string,
  ): Promise<
    Array<{
      teacher_staff_id: string | null;
      teacher: {
        id: string;
        user: { first_name: string; last_name: string };
      } | null;
    }>
  > {
    return this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        teacher_staff_id: { not: null },
        ...effectiveNow(),
      },
      select: {
        teacher_staff_id: true,
        teacher: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
  }

  /**
   * Count effective schedule entries with a room assigned for an academic year.
   * Used by scheduling dashboard for room utilisation calculations.
   */
  async countRoomAssignedEntries(tenantId: string, academicYearId: string): Promise<number> {
    return this.prisma.schedule.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        room_id: { not: null },
        ...effectiveNow(),
      },
    });
  }

  /**
   * Find a schedule entry with swap context: class name, year_group_id, subject_id, teacher, room.
   * Used by schedule-swap validation and execution.
   */
  async findByIdWithSwapContext(
    tenantId: string,
    scheduleId: string,
  ): Promise<{
    id: string;
    teacher_staff_id: string | null;
    room_id: string | null;
    weekday: number;
    period_order: number | null;
    start_time: Date;
    end_time: Date;
    rotation_week: number | null;
    class_entity: { name: string; year_group_id: string | null; subject_id: string | null } | null;
    teacher: { id: string; user: { first_name: string; last_name: string } } | null;
    room: { id: string; name: string } | null;
  } | null> {
    return this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenant_id: tenantId },
      select: {
        id: true,
        teacher_staff_id: true,
        room_id: true,
        weekday: true,
        period_order: true,
        start_time: true,
        end_time: true,
        rotation_week: true,
        class_entity: { select: { name: true, year_group_id: true, subject_id: true } },
        teacher: {
          select: { id: true, user: { select: { first_name: true, last_name: true } } },
        },
        room: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Check if a teacher or room has a scheduling conflict at a given time slot,
   * excluding specific schedule IDs. Used by schedule-swap validation.
   */
  async hasConflict(
    tenantId: string,
    opts: {
      excludeIds: string[];
      teacherStaffId?: string | null;
      roomId?: string | null;
      weekday: number;
      startTime: Date;
      endTime: Date;
    },
  ): Promise<boolean> {
    if (!opts.teacherStaffId && !opts.roomId) return false;

    const where: Prisma.ScheduleWhereInput = {
      tenant_id: tenantId,
      id: { notIn: opts.excludeIds },
      weekday: opts.weekday,
      start_time: { lt: opts.endTime },
      end_time: { gt: opts.startTime },
      OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
    };

    if (opts.teacherStaffId) {
      where.teacher_staff_id = opts.teacherStaffId;
    }
    if (opts.roomId) {
      where.room_id = opts.roomId;
    }

    const found = await this.prisma.schedule.findFirst({
      where,
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Find a schedule entry with full substitution context (class, subject, year group, room).
   * Used by substitution and AI-substitution services to load schedule context for coverage decisions.
   */
  async findByIdWithSubstitutionContext(
    tenantId: string,
    scheduleId: string,
  ): Promise<ScheduleSubstitutionContextRow | null> {
    return this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenant_id: tenantId },
      select: {
        id: true,
        teacher_staff_id: true,
        academic_year_id: true,
        weekday: true,
        start_time: true,
        end_time: true,
        class_entity: {
          select: {
            name: true,
            year_group_id: true,
            subject_id: true,
            academic_year_id: true,
            subject: { select: { name: true } },
            year_group: { select: { name: true } },
          },
        },
        room: { select: { name: true } },
      },
    }) as Promise<ScheduleSubstitutionContextRow | null>;
  }

  /**
   * Find room schedule entries for an academic year (room_id + weekday + period_order + period name).
   * Used by scheduling dashboard for room utilisation detail.
   */
  async findRoomScheduleEntries(
    tenantId: string,
    academicYearId: string,
  ): Promise<
    Array<{
      room_id: string | null;
      weekday: number;
      period_order: number | null;
      schedule_period_template: { period_name: string | null } | null;
    }>
  > {
    return this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        room_id: { not: null },
        ...effectiveNow(),
      },
      select: {
        room_id: true,
        weekday: true,
        period_order: true,
        schedule_period_template: {
          select: { period_name: true },
        },
      },
    });
  }

  /**
   * Find schedules effective within a date range.
   * Returns lightweight fields (id, teacher_staff_id, weekday) for payroll class-delivery.
   */
  async findEffectiveInRange(
    tenantId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<Array<{ id: string; teacher_staff_id: string | null; weekday: number }>> {
    return this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        effective_start_date: { lte: rangeEnd },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: rangeStart } }],
      },
      select: { id: true, teacher_staff_id: true, weekday: true },
    });
  }
}
