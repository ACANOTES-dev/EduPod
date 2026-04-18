import { Injectable } from '@nestjs/common';
import { Prisma, SchedulePeriodType } from '@prisma/client';

import type { TimetableEntry, WorkloadEntry } from '@school/shared';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

interface TimetableQuery {
  academic_year_id: string;
  week_start?: string;
}

export interface PeriodSlot {
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  period_type: SchedulePeriodType;
  year_group_id: string | null;
}

export interface TimetableEnvelope {
  data: TimetableEntry[];
  period_slots: PeriodSlot[];
}

type ScheduleRow = {
  id: string;
  class_id: string;
  weekday: number;
  period_order: number | null;
  start_time: Date;
  end_time: Date;
  scheduling_run_id: string | null;
  class_entity: {
    id: string;
    name: string;
    year_group_id: string | null;
    subject: { name: string } | null;
  };
  room: { id: string; name: string } | null;
  teacher: {
    id: string;
    user: { first_name: string; last_name: string };
  } | null;
};

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
  ): Promise<TimetableEnvelope> {
    const where = this.buildEffectiveFilter(tenantId, query.academic_year_id, query.week_start);
    where.teacher_staff_id = staffProfileId;

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
      include: this.scheduleInclude(),
    });

    return this.buildEnvelope(tenantId, query.academic_year_id, schedules as ScheduleRow[]);
  }

  async getRoomTimetable(
    tenantId: string,
    roomId: string,
    query: TimetableQuery,
  ): Promise<TimetableEnvelope> {
    const where = this.buildEffectiveFilter(tenantId, query.academic_year_id, query.week_start);
    where.room_id = roomId;

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
      include: this.scheduleInclude(),
    });

    return this.buildEnvelope(tenantId, query.academic_year_id, schedules as ScheduleRow[]);
  }

  async getClassTimetable(
    tenantId: string,
    classId: string,
    query: TimetableQuery,
  ): Promise<TimetableEnvelope> {
    const where = this.buildEffectiveFilter(tenantId, query.academic_year_id, query.week_start);
    where.class_id = classId;

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
      include: this.scheduleInclude(),
    });

    return this.buildEnvelope(tenantId, query.academic_year_id, schedules as ScheduleRow[]);
  }

  async getStudentTimetable(
    tenantId: string,
    studentId: string,
    query: TimetableQuery,
  ): Promise<TimetableEnvelope> {
    const classIds = await this.classesReadFacade.findClassIdsForStudent(tenantId, studentId);

    if (classIds.length === 0) {
      return { data: [], period_slots: [] };
    }

    const where = this.buildEffectiveFilter(tenantId, query.academic_year_id, query.week_start);
    where.class_id = { in: classIds };

    const schedules = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
      include: this.scheduleInclude(),
    });

    return this.buildEnvelope(tenantId, query.academic_year_id, schedules as ScheduleRow[]);
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

      const startMinutes = s.start_time.getUTCHours() * 60 + s.start_time.getUTCMinutes();
      const endMinutes = s.end_time.getUTCHours() * 60 + s.end_time.getUTCMinutes();
      const duration = endMinutes - startMinutes;
      entry.totalMinutes += duration;

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

    result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private scheduleInclude() {
    return {
      class_entity: {
        select: {
          id: true,
          name: true,
          year_group_id: true,
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
    } as const;
  }

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

  private formatTime(date: Date): string {
    return date.toISOString().slice(11, 16);
  }

  private async buildEnvelope(
    tenantId: string,
    academicYearId: string,
    schedules: ScheduleRow[],
  ): Promise<TimetableEnvelope> {
    const subjectBySchedule = await this.resolveSubjectsFromRuns(tenantId, schedules);

    const yearGroupIds = new Set<string>();
    for (const s of schedules) {
      if (s.class_entity.year_group_id) yearGroupIds.add(s.class_entity.year_group_id);
    }

    const periodSlots = await this.loadPeriodSlots(
      tenantId,
      academicYearId,
      yearGroupIds.size > 0 ? [...yearGroupIds] : null,
    );

    const data = schedules.map((s) => this.toTimetableEntry(s, subjectBySchedule.get(s.id)));
    return { data, period_slots: periodSlots };
  }

  /**
   * Resolves per-schedule subject_name by consulting the scheduling run's
   * result_json/config_snapshot. The `Schedule` table does not carry
   * subject_id (subject lives per-lesson in the solver output), so this
   * lookup is the only way to recover it for applied timetables.
   */
  private async resolveSubjectsFromRuns(
    tenantId: string,
    schedules: ScheduleRow[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const runIds = new Set<string>();
    for (const s of schedules) if (s.scheduling_run_id) runIds.add(s.scheduling_run_id);
    if (runIds.size === 0) return result;

    // eslint-disable-next-line school/no-cross-module-prisma-access -- read-only lookup of scheduling_run result/config to recover subject_name for applied schedule entries (Schedule table has no subject_id column; subject lives per-lesson in the solver output)
    const runs = await this.prisma.schedulingRun.findMany({
      where: { tenant_id: tenantId, id: { in: [...runIds] } },
      select: { id: true, result_json: true, config_snapshot: true },
    });

    const subjectNameByRun = new Map<string, Map<string, string>>();
    const entrySubjectIdByRun = new Map<string, Map<string, string>>();

    for (const run of runs) {
      const snapshot = (run.config_snapshot ?? {}) as Record<string, unknown>;
      const subjects = Array.isArray(snapshot['subjects'])
        ? (snapshot['subjects'] as Array<Record<string, unknown>>)
        : [];
      const nameMap = new Map<string, string>();
      for (const s of subjects) {
        if (typeof s['subject_id'] === 'string' && typeof s['subject_name'] === 'string') {
          nameMap.set(s['subject_id'], s['subject_name']);
        }
      }
      // V2 fallback — curriculum entries carry subject_name too.
      const curriculum = Array.isArray(snapshot['curriculum'])
        ? (snapshot['curriculum'] as Array<Record<string, unknown>>)
        : [];
      for (const c of curriculum) {
        if (
          typeof c['subject_id'] === 'string' &&
          typeof c['subject_name'] === 'string' &&
          !nameMap.has(c['subject_id'])
        ) {
          nameMap.set(c['subject_id'], c['subject_name']);
        }
      }
      subjectNameByRun.set(run.id, nameMap);

      const resultJson = (run.result_json ?? {}) as Record<string, unknown>;
      const entries = Array.isArray(resultJson['entries'])
        ? (resultJson['entries'] as Array<Record<string, unknown>>)
        : [];
      const entryMap = new Map<string, string>();
      for (const e of entries) {
        const classId = typeof e['class_id'] === 'string' ? e['class_id'] : null;
        const weekday = Number(e['weekday'] ?? -1);
        const periodOrder = Number(e['period_order'] ?? -1);
        const subjectId = typeof e['subject_id'] === 'string' ? e['subject_id'] : null;
        if (classId && subjectId && weekday >= 0 && periodOrder >= 0) {
          entryMap.set(`${classId}|${weekday}|${periodOrder}`, subjectId);
        }
      }
      entrySubjectIdByRun.set(run.id, entryMap);
    }

    for (const s of schedules) {
      if (!s.scheduling_run_id || s.period_order === null) continue;
      const entryMap = entrySubjectIdByRun.get(s.scheduling_run_id);
      const nameMap = subjectNameByRun.get(s.scheduling_run_id);
      if (!entryMap || !nameMap) continue;
      const subjectId = entryMap.get(`${s.class_id}|${s.weekday}|${s.period_order}`);
      if (!subjectId) continue;
      const subjectName = nameMap.get(subjectId);
      if (subjectName) result.set(s.id, subjectName);
    }

    return result;
  }

  private async loadPeriodSlots(
    tenantId: string,
    academicYearId: string,
    yearGroupIds: string[] | null,
  ): Promise<PeriodSlot[]> {
    const where: Prisma.SchedulePeriodTemplateWhereInput = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };
    if (yearGroupIds) {
      // Include year_group-specific rows for the involved year groups plus
      // any shared rows (year_group_id NULL applies to every class).
      where.OR = [{ year_group_id: { in: yearGroupIds } }, { year_group_id: null }];
    }

    // eslint-disable-next-line school/no-cross-module-prisma-access -- read-only period-grid lookup needed inline to avoid a round-trip through the scheduling module for a pure metadata fetch that returns alongside schedule entries
    const rows = await this.prisma.schedulePeriodTemplate.findMany({
      where,
      select: {
        weekday: true,
        period_order: true,
        start_time: true,
        end_time: true,
        schedule_period_type: true,
        year_group_id: true,
      },
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
    });

    return rows.map((r) => ({
      weekday: r.weekday,
      period_order: r.period_order,
      start_time: this.formatTime(r.start_time),
      end_time: this.formatTime(r.end_time),
      period_type: r.schedule_period_type,
      year_group_id: r.year_group_id,
    }));
  }

  private toTimetableEntry(schedule: ScheduleRow, resolvedSubjectName?: string): TimetableEntry {
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

    const subjectName = resolvedSubjectName ?? schedule.class_entity.subject?.name;
    if (subjectName) {
      entry.subject_name = subjectName;
    }

    return entry;
  }
}
