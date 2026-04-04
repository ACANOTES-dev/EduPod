/**
 * AuditLogReadFacade — Centralized read service for audit log and cron execution log data.
 *
 * PURPOSE:
 * Several modules (compliance, gdpr, finance, admissions, reports, child-protection)
 * need to query audit logs for DSAR exports, compliance reporting, finance audit trails,
 * and general log retrieval. This facade provides a single, well-typed entry point for
 * all cross-module audit log reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - `auditLog.tenant_id` is nullable (platform-level actions); cross-module reads always scope by tenant.
 * - Returns empty arrays when no records found.
 * - The `cronExecutionLog` table is also nullable on tenant_id; scoped reads include the tenant filter.
 */
import { Injectable } from '@nestjs/common';
import type { JsonValue } from '@prisma/client/runtime/library';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface AuditLogRow {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata_json: JsonValue;
  ip_address: string | null;
  created_at: Date;
}

export interface AuditLogWithActorRow extends AuditLogRow {
  actor: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class AuditLogReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find audit logs for a specific entity. Ordered by created_at descending.
   * Used by DSAR traversal for collecting all audit trail entries for a subject.
   */
  async findByEntityId(tenantId: string, entityId: string): Promise<AuditLogRow[]> {
    return this.prisma.auditLog.findMany({
      where: { entity_id: entityId, tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Find audit logs with flexible filters — supports entity_type, action, date range.
   * Used by finance-audit and reports-data-access for paginated audit trail queries.
   */
  async findMany(
    tenantId: string,
    options: {
      entityType?: string;
      entityId?: string;
      action?: string;
      actorUserId?: string;
      createdBefore?: Date;
      createdAfter?: Date;
      skip?: number;
      take?: number;
    } = {},
  ): Promise<AuditLogRow[]> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (options.entityType) where.entity_type = options.entityType;
    if (options.entityId) where.entity_id = options.entityId;
    if (options.action) where.action = options.action;
    if (options.actorUserId) where.actor_user_id = options.actorUserId;
    if (options.createdBefore || options.createdAfter) {
      const dateFilter: Record<string, Date> = {};
      if (options.createdAfter) dateFilter.gte = options.createdAfter;
      if (options.createdBefore) dateFilter.lt = options.createdBefore;
      where.created_at = dateFilter;
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      ...(options.skip !== undefined && { skip: options.skip }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }

  /**
   * Find audit logs with actor details. Used by finance-audit for display.
   */
  async findManyWithActor(
    tenantId: string,
    options: {
      entityType?: string;
      entityTypes?: string[];
      entityId?: string;
      action?: string;
      search?: string;
      dateFrom?: Date;
      dateTo?: Date;
      skip?: number;
      take?: number;
    } = {},
  ): Promise<AuditLogWithActorRow[]> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (options.entityType) where.entity_type = options.entityType;
    if (options.entityTypes) where.entity_type = { in: options.entityTypes };
    if (options.entityId) where.entity_id = options.entityId;
    if (options.action) where.action = options.action;
    if (options.dateFrom || options.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (options.dateFrom) dateFilter.gte = options.dateFrom;
      if (options.dateTo) dateFilter.lte = options.dateTo;
      where.created_at = dateFilter;
    }
    if (options.search) {
      where.OR = [
        { action: { contains: options.search, mode: 'insensitive' } },
        { entity_type: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      ...(options.skip !== undefined && { skip: options.skip }),
      ...(options.take !== undefined && { take: options.take }),
      include: {
        actor: {
          select: { id: true, email: true, first_name: true, last_name: true },
        },
      },
    }) as Promise<AuditLogWithActorRow[]>;
  }

  /**
   * Count audit logs with filters (including entity type arrays and date ranges).
   * Used by finance-audit for paginated total count.
   */
  async countWithFilters(
    tenantId: string,
    options: {
      entityType?: string;
      entityTypes?: string[];
      entityId?: string;
      search?: string;
      dateFrom?: Date;
      dateTo?: Date;
    } = {},
  ): Promise<number> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (options.entityType) where.entity_type = options.entityType;
    if (options.entityTypes) where.entity_type = { in: options.entityTypes };
    if (options.entityId) where.entity_id = options.entityId;
    if (options.dateFrom || options.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (options.dateFrom) dateFilter.gte = options.dateFrom;
      if (options.dateTo) dateFilter.lte = options.dateTo;
      where.created_at = dateFilter;
    }
    if (options.search) {
      where.OR = [
        { action: { contains: options.search, mode: 'insensitive' } },
        { entity_type: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.auditLog.count({ where });
  }

  /**
   * Find the first/most recent audit log matching filters.
   * Used by reports for finding latest activity timestamps.
   */
  async findFirst(
    tenantId: string,
    options: {
      entityType?: string;
      entityId?: string;
      action?: string;
    } = {},
  ): Promise<AuditLogRow | null> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (options.entityType) where.entity_type = options.entityType;
    if (options.entityId) where.entity_id = options.entityId;
    if (options.action) where.action = options.action;

    return this.prisma.auditLog.findFirst({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Count audit logs matching filters. Used by retention policies and reports.
   */
  async count(
    tenantId: string,
    options: {
      entityType?: string;
      action?: string;
      createdBefore?: Date;
    } = {},
  ): Promise<number> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (options.entityType) where.entity_type = options.entityType;
    if (options.action) where.action = options.action;
    if (options.createdBefore) {
      where.created_at = { lt: options.createdBefore };
    }

    return this.prisma.auditLog.count({ where });
  }
}
