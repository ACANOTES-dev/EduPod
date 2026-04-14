import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TimetableEntry, WorkloadEntry } from '@school/shared';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

interface TimetableQuery {
  academic_year_id: string;
  week_start?: string;
}

@Injectable()
export class TimetablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  async getTeacherTimetable(
    tenantId: string,
    staffProfileId: string,
    query: TimetableQuery,
  ): Promise<TimetableEntry[]> {
    const where = this.buildEffectiveFilter(tenantId, query.academic_year_id, query.week_start);
    where.teacher_staff_id = staffProfileId;

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
      include: {
        class_entity: {
          select: {
            id: true,
            name: true,
            subject: { select: { name: true } },
          },
        },
        room: { select: { id: true, name: true } },
        teacher: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    return schedules.map((s) => this.toTimetableEntry(s));
  }

  async getRoomTimetable(
    tenantId: string,
    roomId: string,
    query: TimetableQuery,
  ): Promise<TimetableEntry[]> {
    const where = this.buildEffectiveFilter(tenantId, query.academic_year_id, query.week_start);
    where.room_id = roomId;

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
      include: {
        class_entity: {
          select: {
            id: true,
            name: true,
            subject: { select: { name: true } },
          },
        },
        room: { select: { id: true, name: true } },
        teacher: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    return schedules.map((s) => this.toTimetableEntry(s));
  }

  async getClassTimetable(
    tenantId: string,
    classId: string,
    query: TimetableQuery,
  ): Promise<TimetableEntry[]> {
    const where = this.buildEffectiveFilter(tenantId, query.academic_year_id, query.week_start);
    where.class_id = classId;

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
      include: {
        class_entity: {
          select: {
            id: true,
            name: true,
            subject: { select: { name: true } },
          },
        },
        room: { select: { id: true, name: true } },
        teacher: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    return schedules.map((s) => this.toTimetableEntry(s));
  }

  async getStudentTimetable(
    tenantId: string,
    studentId: string,
    query: TimetableQuery,
  ): Promise<TimetableEntry[]> {
    // Find active class enrolments for the student
    const classIds = await this.classesReadFacade.findClassIdsForStudent(tenantId, studentId);

    if (classIds.length === 0) return [];

    const where = this.buildEffectiveFilter(tenantId, query.academic_year_id, query.week_start);
    where.class_id = { in: classIds };

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
      include: {
        class_entity: {
          select: {
            id: true,
            name: true,
            subject: { select: { name: true } },
          },
        },
        room: { select: { id: true, name: true } },
        teacher: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    return schedules.map((s) => this.toTimetableEntry(s));
  }

  async getWorkloadReport(tenantId: string, academicYearId: string): Promise<WorkloadEntry[]> {
    // Get all effective schedules for the academic year with teachers
    const where = this.buildEffectiveFilter(tenantId, academicYearId);
    where.teacher_staff_id = { not: null };

    const schedules = await this.prisma.schedule.findMany({
      where,
      select: {
        teacher_staff_id: true,
        weekday: true,
        start_time: true,
        end_time: true,
        teacher: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    // Aggregate per teacher
    const teacherMap = new Map<
      string,
      {
        name: string;
        totalPeriods: number;
        totalMinutes: number;
        perDay: Record<number, number>;
      }
    >();

    for (const s of schedules) {
      if (!s.teacher_staff_id || !s.teacher) continue;

      const teacherId = s.teacher_staff_id;
      const teacherName = `${s.teacher.user.first_name} ${s.teacher.user.last_name}`.trim();

      if (!teacherMap.has(teacherId)) {
        teacherMap.set(teacherId, {
          name: teacherName,
          totalPeriods: 0,
          totalMinutes: 0,
          perDay: {},
        });
      }

      const entry = teacherMap.get(teacherId)!;
      entry.totalPeriods += 1;

      // Calculate duration in minutes
      const startMinutes = s.start_time.getUTCHours() * 60 + s.start_time.getUTCMinutes();
      const endMinutes = s.end_time.getUTCHours() * 60 + s.end_time.getUTCMinutes();
      const duration = endMinutes - startMinutes;
      entry.totalMinutes += duration;

      // Count periods per day
      entry.perDay[s.weekday] = (entry.perDay[s.weekday] ?? 0) + 1;
    }

    const result: WorkloadEntry[] = [];
    for (const [staffId, entry] of teacherMap) {
      result.push({
        staff_profile_id: staffId,
        name: entry.name,
        total_periods: entry.totalPeriods,
        total_hours: Math.round((entry.totalMinutes / 60) * 100) / 100,
        per_day: entry.perDay,
      });
    }

    // Sort by name
    result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Build a Prisma where clause for currently effective schedules.
   * Filters by tenant, academic year, and ensures the schedule is active
   * (effective_start_date <= reference date AND (effective_end_date is null OR >= reference date)).
   */
  private buildEffectiveFilter(
    tenantId: string,
    academicYearId: string,
    weekStart?: string,
  ): Prisma.ScheduleWhereInput {
    const referenceDate = weekStart ? new Date(weekStart) : new Date();

    const where: Prisma.ScheduleWhereInput = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
      effective_start_date: { lte: referenceDate },
      OR: [{ effective_end_date: null }, { effective_end_date: { gte: referenceDate } }],
    };

    return where;
  }

  /**
   * Convert a Prisma Date (from @db.Time) to HH:mm string.
   */
  private formatTime(date: Date): string {
    return date.toISOString().slice(11, 16);
  }

  /**
   * Map a Prisma schedule record to a TimetableEntry.
   */
  private toTimetableEntry(schedule: {
    id: string;
    weekday: number;
    start_time: Date;
    end_time: Date;
    class_entity: {
      id: string;
      name: string;
      subject: { name: string } | null;
    };
    room: { id: string; name: string } | null;
    teacher: {
      id: string;
      user: { first_name: string; last_name: string };
    } | null;
  }): TimetableEntry {
    const entry: TimetableEntry = {
      schedule_id: schedule.id,
      weekday: schedule.weekday,
      start_time: this.formatTime(schedule.start_time),
      end_time: this.formatTime(schedule.end_time),
      class_id: schedule.class_entity.id,
      class_name: schedule.class_entity.name,
    };

    if (schedule.room) {
      entry.room_id = schedule.room.id;
      entry.room_name = schedule.room.name;
    }

    if (schedule.teacher) {
      entry.teacher_staff_id = schedule.teacher.id;
      entry.teacher_name =
        `${schedule.teacher.user.first_name} ${schedule.teacher.user.last_name}`.trim();
    }

    if (schedule.class_entity.subject) {
      entry.subject_name = schedule.class_entity.subject.name;
    }

    return entry;
  }
}
