import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateParentContactDto, ParentContactFilters } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

interface ParentContactRow {
  id: string;
  tenant_id: string;
  student_id: string;
  concern_id: string | null;
  case_id: string | null;
  parent_id: string;
  contacted_by_user_id: string;
  contact_method: string;
  contact_date: Date;
  outcome: string;
  parent_response: string | null;
  created_at: Date;
  student?: { first_name: string; last_name: string } | null;
  parent?: { first_name: string; last_name: string } | null;
  contacted_by?: { first_name: string; last_name: string } | null;
}

export interface ParentContactDto {
  id: string;
  student_id: string;
  student_name: string;
  concern_id: string | null;
  case_id: string | null;
  parent_id: string;
  parent_name: string;
  contacted_by_user_id: string;
  contacted_by_name: string;
  contact_method: string;
  contact_date: string;
  outcome: string;
  parent_response: string | null;
  created_at: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ParentContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── LOG CONTACT ──────────────────────────────────────────────────────────

  async logContact(
    tenantId: string,
    userId: string,
    dto: CreateParentContactDto,
  ): Promise<{ data: { id: string; created_at: string } }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const contact = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralParentContact.create({
        data: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          concern_id: dto.concern_id ?? null,
          case_id: dto.case_id ?? null,
          parent_id: dto.parent_id,
          contacted_by_user_id: userId,
          contact_method: dto.contact_method,
          contact_date: new Date(dto.contact_date),
          outcome: dto.outcome,
          parent_response: dto.parent_response ?? null,
        },
      });
    })) as ParentContactRow;

    // Fire-and-forget: write parent_contacted audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'parent_contacted',
      entity_type: 'parent_contact',
      entity_id: contact.id,
      student_id: dto.student_id,
      actor_user_id: userId,
      tier: 1,
      payload: {
        parent_contact_id: contact.id,
        student_id: dto.student_id,
        parent_id: dto.parent_id,
        method: dto.contact_method,
        outcome_summary: dto.outcome.slice(0, 200),
      },
      ip_address: null,
    });

    return {
      data: {
        id: contact.id,
        created_at: contact.created_at.toISOString(),
      },
    };
  }

  // ─── LIST CONTACTS ────────────────────────────────────────────────────────

  async listContacts(
    tenantId: string,
    query: ParentContactFilters,
  ): Promise<{ data: ParentContactDto[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: tenantId, // read-only listing; tenant context is sufficient
    });

    const skip = (query.page - 1) * query.pageSize;

    const where: Prisma.PastoralParentContactWhereInput = {
      tenant_id: tenantId,
    };

    if (query.student_id) where.student_id = query.student_id;
    if (query.concern_id) where.concern_id = query.concern_id;
    if (query.case_id) where.case_id = query.case_id;
    if (query.contact_method) where.contact_method = query.contact_method;

    if (query.date_from || query.date_to) {
      where.contact_date = {};
      if (query.date_from) where.contact_date.gte = new Date(query.date_from);
      if (query.date_to) where.contact_date.lte = new Date(query.date_to);
    }

    const orderBy: Prisma.PastoralParentContactOrderByWithRelationInput = {};
    if (query.sort === 'contact_date') orderBy.contact_date = query.order;
    else orderBy.created_at = query.order;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [contacts, total] = await Promise.all([
        db.pastoralParentContact.findMany({
          where,
          include: {
            student: { select: { first_name: true, last_name: true } },
            parent: { select: { first_name: true, last_name: true } },
            contacted_by: { select: { first_name: true, last_name: true } },
          },
          orderBy,
          skip,
          take: query.pageSize,
        }),
        db.pastoralParentContact.count({ where }),
      ]);

      const data = (contacts as ParentContactRow[]).map((c) =>
        this.toContactDto(c),
      );

      return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
    }) as Promise<{ data: ParentContactDto[]; meta: PaginationMeta }>;
  }

  // ─── GET SINGLE CONTACT ───────────────────────────────────────────────────

  async getContact(
    tenantId: string,
    contactId: string,
  ): Promise<{ data: ParentContactDto }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: tenantId,
    });

    const contact = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralParentContact.findUnique({
        where: { id: contactId },
        include: {
          student: { select: { first_name: true, last_name: true } },
          parent: { select: { first_name: true, last_name: true } },
          contacted_by: { select: { first_name: true, last_name: true } },
        },
      });
    })) as ParentContactRow | null;

    if (!contact) {
      throw new NotFoundException({
        code: 'PARENT_CONTACT_NOT_FOUND',
        message: `Parent contact "${contactId}" not found`,
      });
    }

    return { data: this.toContactDto(contact) };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  private toContactDto(row: ParentContactRow): ParentContactDto {
    const studentName = row.student
      ? `${row.student.first_name} ${row.student.last_name}`
      : 'Unknown Student';
    const parentName = row.parent
      ? `${row.parent.first_name} ${row.parent.last_name}`
      : 'Unknown Parent';
    const contactedByName = row.contacted_by
      ? `${row.contacted_by.first_name} ${row.contacted_by.last_name}`
      : 'Unknown User';

    return {
      id: row.id,
      student_id: row.student_id,
      student_name: studentName,
      concern_id: row.concern_id,
      case_id: row.case_id,
      parent_id: row.parent_id,
      parent_name: parentName,
      contacted_by_user_id: row.contacted_by_user_id,
      contacted_by_name: contactedByName,
      contact_method: row.contact_method,
      contact_date: row.contact_date.toISOString(),
      outcome: row.outcome,
      parent_response: row.parent_response,
      created_at: row.created_at.toISOString(),
    };
  }
}
