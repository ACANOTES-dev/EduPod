import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { CreateCpRecordDto, ListCpRecordsQuery, UpdateCpRecordDto } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CpRecordRow {
  id: string;
  tenant_id: string;
  student_id: string;
  concern_id: string | null;
  record_type: string;
  logged_by_user_id: string;
  narrative: string;
  mandated_report_status: string | null;
  mandated_report_ref: string | null;
  tusla_contact_name: string | null;
  tusla_contact_date: Date | null;
  legal_hold: boolean;
  created_at: Date;
  updated_at: Date;
  logged_by?: { first_name: string; last_name: string } | null;
  student?: { first_name: string; last_name: string } | null;
  concern?: { id: string; tier: number; category: string } | null;
}

export interface CpRecordSummary {
  id: string;
  student_id: string;
  record_type: string;
  narrative_preview: string;
  mandated_report_status: string | null;
  legal_hold: boolean;
  created_at: Date;
  logged_by_name: string | null;
}

export interface CpRecordResponse {
  id: string;
  tenant_id: string;
  student_id: string;
  concern_id: string | null;
  record_type: string;
  logged_by_user_id: string;
  logged_by_name: string | null;
  narrative: string;
  mandated_report_status: string | null;
  mandated_report_ref: string | null;
  tusla_contact_name: string | null;
  tusla_contact_date: Date | null;
  legal_hold: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CpRecordService {
  private readonly logger = new Logger(CpRecordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  /**
   * Create a CP record linked to a tier=3 pastoral concern.
   * Uses an interactive transaction with BOTH app.current_tenant_id
   * AND app.current_user_id set — activating the cp_records dual RLS policy.
   *
   * Generates pastoral_event: cp_record_accessed (entity_type: 'cp_record')
   * for the initial creation access.
   */
  async create(
    tenantId: string,
    userId: string,
    dto: CreateCpRecordDto,
    ipAddress: string | null,
  ): Promise<{ data: CpRecordResponse }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const record = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Verify the linked concern exists and is tier=3
      if (dto.concern_id) {
        const concern = await db.pastoralConcern.findFirst({
          where: { id: dto.concern_id, tenant_id: tenantId },
          select: { id: true, tier: true },
        });

        if (!concern) {
          throw new NotFoundException({
            code: 'CONCERN_NOT_FOUND',
            message: `Concern "${dto.concern_id}" not found`,
          });
        }

        if (concern.tier !== 3) {
          throw new NotFoundException({
            code: 'CONCERN_NOT_TIER3',
            message: 'CP records can only be linked to tier 3 concerns',
          });
        }
      }

      // Create the CP record
      const created = await db.cpRecord.create({
        data: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          concern_id: dto.concern_id ?? null,
          record_type: dto.record_type,
          logged_by_user_id: userId,
          narrative: dto.narrative,
        },
        include: {
          logged_by: { select: { first_name: true, last_name: true } },
        },
      });

      return created;
    })) as CpRecordRow;

    // Fire-and-forget: write cp_record_accessed audit event for creation
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'cp_record_accessed',
      entity_type: 'cp_record',
      entity_id: record.id,
      student_id: record.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        cp_record_id: record.id,
        student_id: record.student_id,
      },
      ip_address: ipAddress,
    });

    return { data: this.toResponse(record) };
  }

  // ─── LIST BY STUDENT ──────────────────────────────────────────────────────

  /**
   * List CP records for a student. DLP-only (enforced by RLS + guard).
   * Every call generates a pastoral_event: cp_record_accessed.
   *
   * Returns records ordered by created_at DESC.
   */
  async listByStudent(
    tenantId: string,
    userId: string,
    query: ListCpRecordsQuery,
    ipAddress: string | null,
  ): Promise<{ data: CpRecordSummary[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const skip = (query.page - 1) * query.pageSize;

    // Build where clause
    const where: Prisma.CpRecordWhereInput = {
      tenant_id: tenantId,
      student_id: query.student_id,
    };

    if (query.record_type) {
      where.record_type = query.record_type;
    }

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [records, total] = await Promise.all([
        db.cpRecord.findMany({
          where,
          include: {
            logged_by: { select: { first_name: true, last_name: true } },
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: query.pageSize,
        }),
        db.cpRecord.count({ where }),
      ]);

      return { records, total };
    });

    const { records, total } = result as {
      records: CpRecordRow[];
      total: number;
    };

    const data = records.map((r) => this.toSummary(r));

    // Fire-and-forget: log access event for listing CP records
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'cp_record_accessed',
      entity_type: 'cp_record',
      entity_id: query.student_id,
      student_id: query.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        cp_record_id: query.student_id,
        student_id: query.student_id,
      },
      ip_address: ipAddress,
    });

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  // ─── GET BY ID ──────────────────────────────────────────────────────────────

  /**
   * Get single CP record with full detail.
   * Generates pastoral_event: cp_record_accessed.
   */
  async getById(
    tenantId: string,
    userId: string,
    recordId: string,
    ipAddress: string | null,
  ): Promise<{ data: CpRecordResponse }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const record = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.cpRecord.findFirst({
        where: { id: recordId, tenant_id: tenantId },
        include: {
          logged_by: { select: { first_name: true, last_name: true } },
        },
      });
    })) as CpRecordRow | null;

    if (!record) {
      throw new NotFoundException({
        code: 'CP_RECORD_NOT_FOUND',
        message: `CP record "${recordId}" not found`,
      });
    }

    // Fire-and-forget: log access event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'cp_record_accessed',
      entity_type: 'cp_record',
      entity_id: record.id,
      student_id: record.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        cp_record_id: record.id,
        student_id: record.student_id,
      },
      ip_address: ipAddress,
    });

    return { data: this.toResponse(record) };
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────────────

  /**
   * Update CP record metadata. Only specific fields are updatable:
   * tusla_contact_name, tusla_contact_date, legal_hold.
   *
   * Generates pastoral_event: cp_record_accessed with changed fields.
   */
  async update(
    tenantId: string,
    userId: string,
    recordId: string,
    dto: UpdateCpRecordDto,
    ipAddress: string | null,
  ): Promise<{ data: CpRecordResponse }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.cpRecord.findFirst({
        where: { id: recordId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'CP_RECORD_NOT_FOUND',
          message: `CP record "${recordId}" not found`,
        });
      }

      const updateData: Prisma.CpRecordUpdateInput = {};

      if (dto.tusla_contact_name !== undefined) {
        updateData.tusla_contact_name = dto.tusla_contact_name;
      }
      if (dto.tusla_contact_date !== undefined) {
        updateData.tusla_contact_date = new Date(dto.tusla_contact_date);
      }
      if (dto.legal_hold !== undefined) {
        updateData.legal_hold = dto.legal_hold;
      }

      return db.cpRecord.update({
        where: { id: recordId },
        data: updateData,
        include: {
          logged_by: { select: { first_name: true, last_name: true } },
        },
      });
    })) as CpRecordRow;

    // Fire-and-forget: log access/update event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'cp_record_accessed',
      entity_type: 'cp_record',
      entity_id: updated.id,
      student_id: updated.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        cp_record_id: updated.id,
        student_id: updated.student_id,
      },
      ip_address: ipAddress,
    });

    return { data: this.toResponse(updated) };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  /**
   * Maps a raw CP record row to a response DTO.
   */
  private toResponse(record: CpRecordRow): CpRecordResponse {
    const loggedByName = record.logged_by
      ? `${record.logged_by.first_name} ${record.logged_by.last_name}`
      : null;

    return {
      id: record.id,
      tenant_id: record.tenant_id,
      student_id: record.student_id,
      concern_id: record.concern_id,
      record_type: record.record_type,
      logged_by_user_id: record.logged_by_user_id,
      logged_by_name: loggedByName,
      narrative: record.narrative,
      mandated_report_status: record.mandated_report_status,
      mandated_report_ref: record.mandated_report_ref,
      tusla_contact_name: record.tusla_contact_name,
      tusla_contact_date: record.tusla_contact_date,
      legal_hold: record.legal_hold,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  /**
   * Maps a raw CP record row to a summary DTO for list views.
   */
  private toSummary(record: CpRecordRow): CpRecordSummary {
    const loggedByName = record.logged_by
      ? `${record.logged_by.first_name} ${record.logged_by.last_name}`
      : null;

    // Truncate narrative for summary (first 200 chars)
    const narrativePreview =
      record.narrative.length > 200 ? `${record.narrative.slice(0, 200)}...` : record.narrative;

    return {
      id: record.id,
      student_id: record.student_id,
      record_type: record.record_type,
      narrative_preview: narrativePreview,
      mandated_report_status: record.mandated_report_status,
      legal_hold: record.legal_hold,
      created_at: record.created_at,
      logged_by_name: loggedByName,
    };
  }
}
