import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';

import type { CreateMaintenanceWindowDto } from '@school/shared';

import type { PlatformAuditContext } from '../platform-audit/platform-audit.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type TenantMaintenanceWindowRow = Prisma.TenantMaintenanceWindowGetPayload<{
  include: {
    creator: { select: { email: true; first_name: true; last_name: true } };
    tenant: { select: { id: true; name: true; slug: true; maintenance_mode: true } };
  };
}>;

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async toggleMaintenanceMode(
    tenantId: string,
    enabled: boolean,
    message?: string,
    audit?: PlatformAuditContext,
  ): Promise<Tenant> {
    const existing = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${tenantId}" not found`,
      });
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        maintenance_mode: enabled,
        maintenance_message: enabled ? (message ?? null) : null,
      },
    });
    await this.writeMaintenanceCache(tenantId, enabled, updated.maintenance_message);

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: enabled ? 'maintenance_mode_entered' : 'maintenance_mode_exited',
        target_resource_type: 'tenant',
        target_resource_id: tenantId,
        target_tenant_id: tenantId,
        payload: { before: existing, after: updated },
      });
    }

    return updated;
  }

  async listMaintenanceWindows(tenantId?: string): Promise<TenantMaintenanceWindowRow[]> {
    const now = new Date();
    return this.prisma.tenantMaintenanceWindow.findMany({
      where: {
        ...(tenantId ? { tenant_id: tenantId } : {}),
        ends_at: { gte: now },
      },
      orderBy: { starts_at: 'asc' },
      include: includeMaintenanceWindowRelations(),
    });
  }

  async createMaintenanceWindow(
    dto: CreateMaintenanceWindowDto,
    actorId: string,
    audit?: PlatformAuditContext,
  ): Promise<TenantMaintenanceWindowRow> {
    if (dto.starts_at <= new Date()) {
      throw new BadRequestException({
        code: 'MAINTENANCE_WINDOW_IN_PAST',
        message: 'Maintenance window start time must be in the future.',
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenant_id },
      select: { id: true, name: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${dto.tenant_id}" not found`,
      });
    }

    const created = await this.prisma.tenantMaintenanceWindow.create({
      data: {
        tenant_id: dto.tenant_id,
        starts_at: dto.starts_at,
        ends_at: dto.ends_at,
        message: dto.message ?? null,
        created_by: actorId,
      },
      include: includeMaintenanceWindowRelations(),
    });

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'maintenance_window_scheduled',
        target_resource_type: 'tenant_maintenance_window',
        target_resource_id: created.id,
        target_tenant_id: dto.tenant_id,
        payload: { after: created, extra: { tenant_name: tenant.name } },
      });
    }

    return created;
  }

  async deleteMaintenanceWindow(
    windowId: string,
    audit?: PlatformAuditContext,
  ): Promise<{ deleted: true }> {
    const existing = await this.prisma.tenantMaintenanceWindow.findUnique({
      where: { id: windowId },
      include: includeMaintenanceWindowRelations(),
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'MAINTENANCE_WINDOW_NOT_FOUND',
        message: `Maintenance window "${windowId}" not found`,
      });
    }

    await this.prisma.tenantMaintenanceWindow.delete({ where: { id: windowId } });

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'maintenance_window_cancelled',
        target_resource_type: 'tenant_maintenance_window',
        target_resource_id: windowId,
        target_tenant_id: existing.tenant_id,
        payload: { before: existing },
      });
    }

    return { deleted: true };
  }

  async processScheduledMaintenanceWindows(now = new Date()): Promise<{
    enabled: number;
    disabled: number;
    deleted_expired: number;
  }> {
    const starting = await this.prisma.tenantMaintenanceWindow.findMany({
      where: {
        starts_at: { lte: now },
        ends_at: { gt: now },
        tenant: { maintenance_mode: false },
      },
      include: { tenant: true },
    });

    for (const windowRow of starting) {
      await this.prisma.tenant.update({
        where: { id: windowRow.tenant_id },
        data: {
          maintenance_mode: true,
          maintenance_message: windowRow.message,
        },
      });
      await this.writeMaintenanceCache(windowRow.tenant_id, true, windowRow.message);
    }

    const ending = await this.prisma.tenantMaintenanceWindow.findMany({
      where: {
        ends_at: { lte: now },
        tenant: { maintenance_mode: true },
      },
      include: { tenant: true },
    });

    for (const windowRow of ending) {
      await this.prisma.tenant.update({
        where: { id: windowRow.tenant_id },
        data: { maintenance_mode: false, maintenance_message: null },
      });
      await this.writeMaintenanceCache(windowRow.tenant_id, false);
    }

    const cleanupCutoff = new Date(now.getTime() - 60 * 60 * 1000);
    const deleted = await this.prisma.tenantMaintenanceWindow.deleteMany({
      where: { ends_at: { lt: cleanupCutoff } },
    });

    return {
      enabled: starting.length,
      disabled: ending.length,
      deleted_expired: deleted.count,
    };
  }

  private async writeMaintenanceCache(
    tenantId: string,
    enabled: boolean,
    message?: string | null,
  ): Promise<void> {
    const client = this.redis.getClient();
    const key = `tenant:${tenantId}:maintenance`;
    if (!enabled) {
      await client.del(key);
      return;
    }

    await client.set(
      key,
      JSON.stringify({
        message:
          message ?? 'This school is currently undergoing maintenance. Please try again later.',
      }),
    );
  }
}

function includeMaintenanceWindowRelations() {
  return {
    creator: { select: { email: true, first_name: true, last_name: true } },
    tenant: { select: { id: true, maintenance_mode: true, name: true, slug: true } },
  } satisfies Prisma.TenantMaintenanceWindowInclude;
}
