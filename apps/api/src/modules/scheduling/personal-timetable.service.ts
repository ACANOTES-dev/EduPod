import { randomBytes } from 'crypto';

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreateSubscriptionTokenDto, TimetableQuery } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

export interface TimetableEntry {
  schedule_id: string;
  weekday: number;
  period_order: number | null;
  start_time: string;
  end_time: string;
  class_name: string;
  subject_name: string | null;
  teacher_name?: string | null;
  room_name: string | null;
  rotation_week: number | null;
  /** Set on entries that came from an exam-session invigilation shift overlay. */
  is_exam_invigilation?: boolean;
  /** Set on entries that represent a cover duty assigned from someone else's
   *  absence — the teacher is substituting, not teaching their own class. */
  is_cover_duty?: boolean;
  /** When `is_cover_duty` is set, the full name of the teacher being covered. */
  cover_for_name?: string | null;
}

export interface PeriodSlot {
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  period_type: string;
  year_group_id: string | null;
}

export interface TimetableResponse {
  data: TimetableEntry[];
  /** Full per-weekday period grid (teaching + break + lunch) for the year
   *  groups involved. Consumers render this alongside `data` so break/lunch
   *  rows don't disappear from the grid. */
  period_slots?: PeriodSlot[];
  /** True when the displayed week falls inside a published exam session. */
  exam_session_active?: boolean;
  /** Human-readable explanation shown in place of the weekly grid. */
  exam_session_message?: string;
}

const SUSPENSION_MESSAGE = 'No classes — exam session in progress';

@Injectable()
export class PersonalTimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Exam-session suspension helpers ──────────────────────────────────────

  private weekWindow(weekDateIso?: string | null): { weekStart: Date; weekEnd: Date } {
    const ref = weekDateIso ? new Date(weekDateIso) : new Date();
    const dow = ref.getUTCDay();
    const mondayOffset = (dow + 6) % 7;
    const weekStart = new Date(ref);
    weekStart.setUTCDate(ref.getUTCDate() - mondayOffset);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    return { weekStart, weekEnd };
  }

  private async sessionOverlappingWeek(
    tenantId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<{ id: string; name: string; start_date: Date; end_date: Date } | null> {
    return this.prisma.examSession.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'published',
        start_date: { lte: weekEnd },
        end_date: { gte: weekStart },
      },
      select: { id: true, name: true, start_date: true, end_date: true },
      orderBy: { start_date: 'asc' },
    });
  }

  private async buildTeacherInvigilationOverlay(
    tenantId: string,
    staffId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<TimetableEntry[]> {
    const invigilations = await this.prisma.examInvigilation.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: staffId,
        exam_slot: {
          date: { gte: weekStart, lte: weekEnd },
        },
      },
      select: {
        id: true,
        role: true,
        exam_slot: {
          select: {
            id: true,
            date: true,
            start_time: true,
            end_time: true,
            subject: { select: { name: true } },
            year_group: { select: { name: true } },
            room: { select: { name: true } },
          },
        },
      },
      orderBy: { exam_slot: { date: 'asc' } },
    });

    return invigilations
      .filter((row) => row.exam_slot != null)
      .map((row) => {
        const slot = row.exam_slot!;
        return {
          schedule_id: `invigilation-${row.id}`,
          weekday: slot.date.getUTCDay(),
          period_order: null,
          start_time: slot.start_time.toISOString().slice(11, 16),
          end_time: slot.end_time.toISOString().slice(11, 16),
          class_name: slot.year_group?.name
            ? `Invigilating · ${slot.year_group.name}`
            : 'Invigilating',
          subject_name: slot.subject?.name ?? null,
          room_name: slot.room?.name ?? null,
          rotation_week: null,
          is_exam_invigilation: true,
        };
      });
  }

  /**
   * Build overlay entries for class covers this teacher has been assigned to
   * within the week [weekStart, weekEnd]. Each SubstitutionRecord where
   * `substitute_staff_id` = this teacher produces one entry tagged
   * `is_cover_duty: true`, carrying the subject/class/room of the absent
   * teacher's original schedule so it slots cleanly into the grid.
   */
  private async buildTeacherCoverOverlay(
    tenantId: string,
    staffId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<TimetableEntry[]> {
    const records = await this.prisma.substitutionRecord.findMany({
      where: {
        tenant_id: tenantId,
        substitute_staff_id: staffId,
        status: { in: ['assigned', 'confirmed'] },
        absence_date: { gte: weekStart, lte: weekEnd },
      },
      select: {
        id: true,
        absence_date: true,
        absence: {
          select: {
            staff_profile: {
              select: { user: { select: { first_name: true, last_name: true } } },
            },
          },
        },
        schedule: {
          select: {
            id: true,
            weekday: true,
            period_order: true,
            start_time: true,
            end_time: true,
            class_id: true,
            scheduling_run_id: true,
            class_entity: {
              select: {
                name: true,
                subject: { select: { name: true } },
              },
            },
            room: { select: { name: true } },
          },
        },
      },
    });

    // Resolve subject for each covered slot via the scheduling run (the
    // schedule row itself has no subject_id for shared classes).
    const runLookupRows = records
      .filter((r) => r.schedule)
      .map((r) => ({
        id: r.schedule!.id,
        class_id: r.schedule!.class_id,
        weekday: r.schedule!.weekday,
        period_order: r.schedule!.period_order,
        scheduling_run_id: r.schedule!.scheduling_run_id,
      }));
    const subjectBySchedule = await this.resolveSubjectsFromRuns(tenantId, runLookupRows);

    return records
      .filter((r) => r.schedule != null)
      .map((r) => {
        const s = r.schedule!;
        const absentName = r.absence?.staff_profile?.user
          ? `${r.absence.staff_profile.user.first_name} ${r.absence.staff_profile.user.last_name}`.trim()
          : null;
        return {
          schedule_id: `cover-${r.id}`,
          weekday: s.weekday,
          period_order: s.period_order,
          start_time: s.start_time.toISOString().slice(11, 16),
          end_time: s.end_time.toISOString().slice(11, 16),
          class_name: s.class_entity?.name ?? '',
          subject_name: subjectBySchedule.get(s.id) ?? s.class_entity?.subject?.name ?? null,
          room_name: s.room?.name ?? null,
          rotation_week: null,
          is_cover_duty: true,
          cover_for_name: absentName,
        };
      });
  }

  // ─── Get Teacher Timetable ────────────────────────────────────────────────

  async getTeacherTimetable(
    tenantId: string,
    staffId: string,
    query: TimetableQuery,
  ): Promise<TimetableResponse> {
    const today = query.week_date ? new Date(query.week_date) : new Date();
    const { weekStart, weekEnd } = this.weekWindow(query.week_date);

    const activeSession = await this.sessionOverlappingWeek(tenantId, weekStart, weekEnd);
    if (activeSession) {
      const invigilationOverlay = await this.buildTeacherInvigilationOverlay(
        tenantId,
        staffId,
        weekStart,
        weekEnd,
      );
      return {
        data: invigilationOverlay,
        exam_session_active: true,
        exam_session_message: SUSPENSION_MESSAGE,
      };
    }

    const schedules = await this.schedulesReadFacade.findTeacherTimetable(tenantId, staffId, {
      asOfDate: today,
      rotationWeek: query.rotation_week,
    });

    const subjectBySchedule = await this.resolveSubjectsFromRuns(tenantId, schedules);

    const data: TimetableEntry[] = schedules.map((s) => ({
      schedule_id: s.id,
      weekday: s.weekday,
      period_order: s.period_order,
      start_time: s.start_time.toISOString().slice(11, 16),
      end_time: s.end_time.toISOString().slice(11, 16),
      class_name: s.class_entity?.name ?? '',
      subject_name: subjectBySchedule.get(s.id) ?? s.class_entity?.subject?.name ?? null,
      room_name: s.room?.name ?? null,
      rotation_week: s.rotation_week,
    }));

    // Overlay cover duties for the displayed week. A SubstitutionRecord with
    // this teacher as `substitute_staff_id` means they're covering someone
    // else's class — the schedule row it points to isn't on their own
    // timetable (it belongs to the absent teacher), so it has to be spliced in
    // explicitly. Without this overlay an assigned cover simply vanishes
    // from the substitute's "My Timetable" view.
    const coverOverlay = await this.buildTeacherCoverOverlay(tenantId, staffId, weekStart, weekEnd);
    data.push(...coverOverlay);

    const yearGroupIds = new Set<string>();
    for (const s of schedules) {
      if (s.class_entity?.year_group_id) yearGroupIds.add(s.class_entity.year_group_id);
    }
    const academicYearId = schedules[0]?.academic_year_id ?? null;
    const period_slots = academicYearId
      ? await this.loadPeriodSlots(tenantId, academicYearId, [...yearGroupIds])
      : [];

    return { data, period_slots };
  }

  // ─── Get Teacher Timetable By User ID ────────────────────────────────────

  async getTeacherTimetableByUserId(
    tenantId: string,
    userId: string,
    query: TimetableQuery,
  ): Promise<TimetableResponse> {
    const staffProfile = await this.staffProfileReadFacade.findByUserId(tenantId, userId);

    if (!staffProfile) {
      throw new NotFoundException({
        error: {
          code: 'STAFF_PROFILE_NOT_FOUND',
          message: 'Staff profile not found for this user',
        },
      });
    }

    return this.getTeacherTimetable(tenantId, staffProfile.id, query);
  }

  // ─── Get Class Timetable ──────────────────────────────────────────────────

  async getClassTimetable(
    tenantId: string,
    classId: string,
    query: TimetableQuery,
  ): Promise<TimetableResponse> {
    const today = query.week_date ? new Date(query.week_date) : new Date();
    const { weekStart, weekEnd } = this.weekWindow(query.week_date);

    const activeSession = await this.sessionOverlappingWeek(tenantId, weekStart, weekEnd);
    if (activeSession) {
      return {
        data: [],
        exam_session_active: true,
        exam_session_message: SUSPENSION_MESSAGE,
      };
    }

    const schedules = await this.schedulesReadFacade.findClassTimetable(tenantId, classId, {
      asOfDate: today,
      rotationWeek: query.rotation_week,
    });

    const subjectBySchedule = await this.resolveSubjectsFromRuns(tenantId, schedules);

    const data = schedules.map((s) => ({
      schedule_id: s.id,
      weekday: s.weekday,
      period_order: s.period_order,
      start_time: s.start_time.toISOString().slice(11, 16),
      end_time: s.end_time.toISOString().slice(11, 16),
      class_name: s.class_entity?.name ?? '',
      subject_name: subjectBySchedule.get(s.id) ?? s.class_entity?.subject?.name ?? null,
      teacher_name: s.teacher
        ? `${s.teacher.user.first_name} ${s.teacher.user.last_name}`.trim()
        : null,
      room_name: s.room?.name ?? null,
      rotation_week: s.rotation_week,
    }));

    const yearGroupIds = new Set<string>();
    for (const s of schedules) {
      if (s.class_entity?.year_group_id) yearGroupIds.add(s.class_entity.year_group_id);
    }
    const academicYearId = schedules[0]?.academic_year_id ?? null;
    const period_slots = academicYearId
      ? await this.loadPeriodSlots(tenantId, academicYearId, [...yearGroupIds])
      : [];

    return { data, period_slots };
  }

  // ─── Enrichment helpers ──────────────────────────────────────────────────

  private async resolveSubjectsFromRuns(
    tenantId: string,
    schedules: Array<{
      id: string;
      class_id: string;
      weekday: number;
      period_order: number | null;
      scheduling_run_id: string | null;
    }>,
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
      const name = nameMap.get(subjectId);
      if (name) result.set(s.id, name);
    }
    return result;
  }

  private async loadPeriodSlots(
    tenantId: string,
    academicYearId: string,
    yearGroupIds: string[],
  ): Promise<PeriodSlot[]> {
    const rows = await this.prisma.schedulePeriodTemplate.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        OR:
          yearGroupIds.length > 0
            ? [{ year_group_id: { in: yearGroupIds } }, { year_group_id: null }]
            : undefined,
      },
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
      start_time: r.start_time.toISOString().slice(11, 16),
      end_time: r.end_time.toISOString().slice(11, 16),
      period_type: r.schedule_period_type,
      year_group_id: r.year_group_id,
    }));
  }

  // ─── Generate ICS Calendar ────────────────────────────────────────────────

  async generateIcsCalendar(tenantId: string, token: string): Promise<string> {
    const subscriptionToken = await this.prisma.calendarSubscriptionToken.findFirst({
      where: { token, tenant_id: tenantId },
      select: {
        entity_type: true,
        entity_id: true,
        tenant: { select: { name: true } },
      },
    });

    if (!subscriptionToken) {
      throw new NotFoundException({
        error: { code: 'TOKEN_NOT_FOUND', message: 'Calendar subscription token not found' },
      });
    }

    const today = new Date();

    let schedules: Array<{
      id: string;
      weekday: number;
      period_order: number | null;
      start_time: Date;
      end_time: Date;
      class_entity: { name: string; subject: { name: string } | null } | null;
      room: { name: string } | null;
      teacher: { user: { first_name: string; last_name: string } } | null;
    }> = [];

    if (subscriptionToken.entity_type === 'teacher') {
      schedules = (await this.schedulesReadFacade.findTeacherTimetable(
        tenantId,
        subscriptionToken.entity_id,
        { asOfDate: today },
      )) as typeof schedules;
    } else {
      schedules = (await this.schedulesReadFacade.findClassTimetable(
        tenantId,
        subscriptionToken.entity_id,
        { asOfDate: today },
      )) as typeof schedules;
    }

    // Generate ICS content
    const schoolName = subscriptionToken.tenant.name;
    const icsLines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EduPod//Timetable//EN',
      `X-WR-CALNAME:${schoolName} Timetable`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    // Generate weekly recurring events for the next 90 days
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - startDate.getDay()); // Start of current week

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 90);

    for (const s of schedules) {
      // Find the next occurrence of this weekday
      const nextDay = new Date(startDate);
      const diff = (s.weekday - startDate.getDay() + 7) % 7;
      nextDay.setDate(nextDay.getDate() + diff);

      if (nextDay > endDate) continue;

      const dtStart = this.buildIcsDateTime(nextDay, s.start_time);
      const dtEnd = this.buildIcsDateTime(nextDay, s.end_time);

      const subjectName = s.class_entity?.subject?.name ?? 'Class';
      const className = s.class_entity?.name ?? '';
      const teacherName = s.teacher
        ? `${s.teacher.user.first_name} ${s.teacher.user.last_name}`.trim()
        : '';
      const roomName = s.room?.name ?? '';

      const summary = `${subjectName}${className ? ` — ${className}` : ''}`;
      const location = roomName;
      const description = [
        subjectName,
        className ? `Class: ${className}` : '',
        teacherName ? `Teacher: ${teacherName}` : '',
        roomName ? `Room: ${roomName}` : '',
      ]
        .filter(Boolean)
        .join('\\n');

      const uid = `schedule-${s.id}-${dtStart}@edupod`;

      icsLines.push('BEGIN:VEVENT');
      icsLines.push(`UID:${uid}`);
      icsLines.push(`DTSTART:${dtStart}`);
      icsLines.push(`DTEND:${dtEnd}`);
      icsLines.push(`RRULE:FREQ=WEEKLY;COUNT=13`); // ~13 weeks (~1 term)
      icsLines.push(`SUMMARY:${this.escapeIcs(summary)}`);
      if (location) icsLines.push(`LOCATION:${this.escapeIcs(location)}`);
      if (description) icsLines.push(`DESCRIPTION:${this.escapeIcs(description)}`);
      icsLines.push(`DTSTAMP:${this.formatIcsDate(new Date())}`);
      icsLines.push('END:VEVENT');
    }

    icsLines.push('END:VCALENDAR');

    return icsLines.join('\r\n');
  }

  // ─── Create Subscription Token ────────────────────────────────────────────

  async createSubscriptionToken(tenantId: string, userId: string, dto: CreateSubscriptionTokenDto) {
    const token = randomBytes(32).toString('hex'); // 64-char hex

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const record = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.calendarSubscriptionToken.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          token,
          entity_type: dto.entity_type,
          entity_id: dto.entity_id,
        },
      });
    })) as unknown as { id: string; token: string; created_at: Date };

    return {
      id: (record as { id: string }).id,
      token: (record as { token: string }).token,
      entity_type: dto.entity_type,
      entity_id: dto.entity_id,
      created_at: (record as { created_at: Date }).created_at.toISOString(),
    };
  }

  // ─── Revoke Subscription Token ────────────────────────────────────────────

  async revokeSubscriptionToken(tenantId: string, userId: string, tokenId: string) {
    const existing = await this.prisma.calendarSubscriptionToken.findFirst({
      where: { id: tokenId, tenant_id: tenantId },
      select: { id: true, user_id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        error: { code: 'TOKEN_NOT_FOUND', message: 'Subscription token not found' },
      });
    }

    // Only the owner can revoke, or admin (checked by caller)
    if (existing.user_id !== userId) {
      throw new ForbiddenException({
        error: { code: 'TOKEN_NOT_OWNED', message: 'You can only revoke your own tokens' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.calendarSubscriptionToken.delete({ where: { id: tokenId } });
    });

    return { revoked: true };
  }

  // ─── List Subscription Tokens ─────────────────────────────────────────────

  async listSubscriptionTokens(tenantId: string, userId: string) {
    const tokens = await this.prisma.calendarSubscriptionToken.findMany({
      where: { tenant_id: tenantId, user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        token: true,
        entity_type: true,
        entity_id: true,
        created_at: true,
      },
    });

    return {
      data: tokens.map((t) => ({
        id: t.id,
        token: t.token,
        entity_type: t.entity_type,
        entity_id: t.entity_id,
        created_at: t.created_at.toISOString(),
      })),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildIcsDateTime(date: Date, time: Date): string {
    const d = new Date(date);
    d.setHours(time.getUTCHours(), time.getUTCMinutes(), 0, 0);
    return this.formatIcsDate(d);
  }

  private formatIcsDate(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  }

  private escapeIcs(text: string): string {
    return text.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  }
}
