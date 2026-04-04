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
}

@Injectable()
export class PersonalTimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Get Teacher Timetable ────────────────────────────────────────────────

  async getTeacherTimetable(
    tenantId: string,
    staffId: string,
    query: TimetableQuery,
  ): Promise<{ data: TimetableEntry[] }> {
    const today = query.week_date ? new Date(query.week_date) : new Date();

    const where: {
      tenant_id: string;
      teacher_staff_id: string;
      effective_start_date: { lte: Date };
      OR: ({ effective_end_date: null } | { effective_end_date: { gte: Date } })[];
      rotation_week?: number;
    } = {
      tenant_id: tenantId,
      teacher_staff_id: staffId,
      effective_start_date: { lte: today },
      OR: [{ effective_end_date: null }, { effective_end_date: { gte: today } }],
    };

    if (query.rotation_week !== undefined) {
      where.rotation_week = query.rotation_week;
    }

    const schedules = await this.schedulesReadFacade.findTeacherTimetable(tenantId, staffId, {
      asOfDate: today,
      rotationWeek: query.rotation_week,
    });

    const data: TimetableEntry[] = schedules.map((s) => ({
      schedule_id: s.id,
      weekday: s.weekday,
      period_order: s.period_order,
      start_time: s.start_time.toISOString().slice(11, 16),
      end_time: s.end_time.toISOString().slice(11, 16),
      class_name: s.class_entity?.name ?? '',
      subject_name: s.class_entity?.subject?.name ?? null,
      room_name: s.room?.name ?? null,
      rotation_week: s.rotation_week,
    }));

    return { data };
  }

  // ─── Get Teacher Timetable By User ID ────────────────────────────────────

  async getTeacherTimetableByUserId(
    tenantId: string,
    userId: string,
    query: TimetableQuery,
  ): Promise<{ data: TimetableEntry[] }> {
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
  ): Promise<{ data: TimetableEntry[] }> {
    const today = query.week_date ? new Date(query.week_date) : new Date();

    const where: {
      tenant_id: string;
      class_id: string;
      effective_start_date: { lte: Date };
      OR: ({ effective_end_date: null } | { effective_end_date: { gte: Date } })[];
      rotation_week?: number;
    } = {
      tenant_id: tenantId,
      class_id: classId,
      effective_start_date: { lte: today },
      OR: [{ effective_end_date: null }, { effective_end_date: { gte: today } }],
    };

    if (query.rotation_week !== undefined) {
      where.rotation_week = query.rotation_week;
    }

    const schedules = await this.schedulesReadFacade.findClassTimetable(tenantId, classId, {
      asOfDate: today,
      rotationWeek: query.rotation_week,
    });

    const data = schedules.map((s) => ({
      schedule_id: s.id,
      weekday: s.weekday,
      period_order: s.period_order,
      start_time: s.start_time.toISOString().slice(11, 16),
      end_time: s.end_time.toISOString().slice(11, 16),
      class_name: s.class_entity?.name ?? '',
      subject_name: s.class_entity?.subject?.name ?? null,
      teacher_name: s.teacher
        ? `${s.teacher.user.first_name} ${s.teacher.user.last_name}`.trim()
        : null,
      room_name: s.room?.name ?? null,
      rotation_week: s.rotation_week,
    }));

    return { data };
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
