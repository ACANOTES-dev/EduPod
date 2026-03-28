import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegulatorySubmissionStatus } from '@prisma/client';
import { DEFAULT_CALENDAR_EVENTS } from '@school/shared';
import type { CreateCalendarEventDto, UpdateCalendarEventDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const API_STATUS_TO_PRISMA: Record<string, RegulatorySubmissionStatus> = {
  not_started: RegulatorySubmissionStatus.reg_not_started,
  in_progress: RegulatorySubmissionStatus.reg_in_progress,
  ready_for_review: RegulatorySubmissionStatus.ready_for_review,
  submitted: RegulatorySubmissionStatus.reg_submitted,
  accepted: RegulatorySubmissionStatus.reg_accepted,
  rejected: RegulatorySubmissionStatus.reg_rejected,
  overdue: RegulatorySubmissionStatus.overdue,
};

interface ListCalendarEventsParams {
  page: number;
  pageSize: number;
  domain?: string;
  status?: string;
  academic_year?: string;
  from_date?: string;
  to_date?: string;
}

@Injectable()
export class RegulatoryCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, _userId: string, dto: CreateCalendarEventDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.regulatoryCalendarEvent.create({
        data: {
          tenant_id: tenantId,
          domain: dto.domain,
          event_type: dto.event_type,
          title: dto.title,
          description: dto.description ?? null,
          due_date: new Date(dto.due_date),
          academic_year: dto.academic_year ?? null,
          is_recurring: dto.is_recurring ?? false,
          recurrence_rule: dto.recurrence_rule ?? null,
          reminder_days: dto.reminder_days ?? [],
          notes: dto.notes ?? null,
        },
      });
    });
  }

  // ─── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, params: ListCalendarEventsParams) {
    const { page, pageSize, domain, status, academic_year, from_date, to_date } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.RegulatoryCalendarEventWhereInput = { tenant_id: tenantId };

    if (domain) where.domain = domain as Prisma.EnumRegulatoryDomainFilter;
    if (status) where.status = API_STATUS_TO_PRISMA[status];
    if (academic_year) where.academic_year = academic_year;
    if (from_date || to_date) {
      where.due_date = {};
      if (from_date) where.due_date.gte = new Date(from_date);
      if (to_date) where.due_date.lte = new Date(to_date);
    }

    const [data, total] = await Promise.all([
      this.prisma.regulatoryCalendarEvent.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { due_date: 'asc' },
        include: {
          completed_by: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.regulatoryCalendarEvent.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const event = await this.prisma.regulatoryCalendarEvent.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        completed_by: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: 'CALENDAR_EVENT_NOT_FOUND',
        message: `Regulatory calendar event with id "${id}" not found`,
      });
    }

    return event;
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, userId: string, dto: UpdateCalendarEventDto) {
    await this.findOne(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const data: Prisma.RegulatoryCalendarEventUncheckedUpdateInput = {};
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.due_date !== undefined) data.due_date = new Date(dto.due_date);
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.reminder_days !== undefined) data.reminder_days = dto.reminder_days;
      if (dto.completed_at !== undefined) {
        data.completed_at = dto.completed_at ? new Date(dto.completed_at) : null;
      }
      if (dto.status !== undefined) {
        data.status = API_STATUS_TO_PRISMA[dto.status];
        if (dto.status === 'accepted' || dto.status === 'submitted') {
          data.completed_at = new Date();
          data.completed_by_id = userId;
        }
      }

      return db.regulatoryCalendarEvent.update({ where: { id }, data });
    });
  }

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.regulatoryCalendarEvent.delete({ where: { id } });
    });
  }

  // ─── Seed Defaults ──────────────────────────────────────────────────────────

  async seedDefaults(tenantId: string, academicYear: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const events = DEFAULT_CALENDAR_EVENTS.map((template) => ({
      tenant_id: tenantId,
      domain: template.domain,
      event_type: template.event_type,
      title: template.title,
      due_date: new Date(new Date().getFullYear(), template.month - 1, template.day),
      academic_year: academicYear,
      is_recurring: true,
      reminder_days: [...template.reminder_days],
    }));

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      let created = 0;

      for (const event of events) {
        const existing = await db.regulatoryCalendarEvent.findFirst({
          where: { tenant_id: tenantId, title: event.title, academic_year: academicYear },
          select: { id: true },
        });

        if (!existing) {
          await db.regulatoryCalendarEvent.create({
            data: event as Prisma.RegulatoryCalendarEventUncheckedCreateInput,
          });
          created++;
        }
      }

      return { created, total: events.length };
    });
  }
}
