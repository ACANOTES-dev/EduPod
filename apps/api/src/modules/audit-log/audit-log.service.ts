import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditLogFilterDto, PlatformAuditLogFilterDto, AuditLogEntry } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Non-blocking audit log write. Catches all errors and logs to console.
   * Never throws — callers should fire-and-forget.
   */
  async write(
    tenantId: string | null,
    actorUserId: string | null,
    entityType: string,
    entityId: string | null,
    action: string,
    metadata: Record<string, unknown>,
    ipAddress: string | null,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenant_id: tenantId ?? undefined,
          actor_user_id: actorUserId ?? undefined,
          entity_type: entityType,
          entity_id: entityId ?? undefined,
          action,
          metadata_json: metadata as Prisma.InputJsonValue,
          ip_address: ipAddress,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to write audit log: entity_type=${entityType} action=${action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * List audit logs for a specific tenant. Includes actor user name.
   */
  async list(
    tenantId: string,
    filters: AuditLogFilterDto,
  ): Promise<{ data: AuditLogEntry[]; meta: { page: number; pageSize: number; total: number } }> {
    const { page, pageSize, entity_type, actor_user_id, action, start_date, end_date } = filters;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditLogWhereInput = {
      tenant_id: tenantId,
      ...(entity_type ? { entity_type } : {}),
      ...(actor_user_id ? { actor_user_id } : {}),
      ...(action ? { action } : {}),
      ...(start_date || end_date
        ? {
            created_at: {
              ...(start_date ? { gte: new Date(start_date) } : {}),
              ...(end_date ? { lte: new Date(end_date) } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data: AuditLogEntry[] = logs.map((log) => ({
      id: log.id,
      tenant_id: log.tenant_id,
      actor_user_id: log.actor_user_id,
      actor_name: log.actor
        ? `${log.actor.first_name} ${log.actor.last_name}`
        : undefined,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      action: log.action,
      metadata_json: log.metadata_json as Record<string, unknown>,
      ip_address: log.ip_address,
      created_at: log.created_at.toISOString(),
    }));

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * List audit logs across all tenants (platform admin). Uses direct prisma
   * queries — not RLS-scoped. Includes actor name and tenant name.
   */
  async listPlatform(
    filters: PlatformAuditLogFilterDto,
  ): Promise<{ data: (AuditLogEntry & { tenant_name?: string })[]; meta: { page: number; pageSize: number; total: number } }> {
    const { page, pageSize, entity_type, actor_user_id, action, start_date, end_date, tenant_id } = filters;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditLogWhereInput = {
      ...(tenant_id ? { tenant_id } : {}),
      ...(entity_type ? { entity_type } : {}),
      ...(actor_user_id ? { actor_user_id } : {}),
      ...(action ? { action } : {}),
      ...(start_date || end_date
        ? {
            created_at: {
              ...(start_date ? { gte: new Date(start_date) } : {}),
              ...(end_date ? { lte: new Date(end_date) } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data = logs.map((log) => ({
      id: log.id,
      tenant_id: log.tenant_id,
      tenant_name: log.tenant?.name ?? undefined,
      actor_user_id: log.actor_user_id,
      actor_name: log.actor
        ? `${log.actor.first_name} ${log.actor.last_name}`
        : undefined,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      action: log.action,
      metadata_json: log.metadata_json as Record<string, unknown>,
      ip_address: log.ip_address,
      created_at: log.created_at.toISOString(),
    }));

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Lightweight engagement tracking. Writes a tracking entry via write().
   */
  async track(
    tenantId: string,
    userId: string,
    eventType: string,
    entityType: string | null,
    entityId: string | null,
    ip: string,
  ): Promise<void> {
    await this.write(
      tenantId,
      userId,
      entityType ?? 'engagement',
      entityId,
      eventType,
      { tracking: true },
      ip,
    );
  }
}
