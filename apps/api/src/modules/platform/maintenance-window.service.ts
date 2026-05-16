import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformAlertRule } from '@prisma/client';

import {
  type AlertMaintenanceWindowQuery,
  type CancelAlertMaintenanceWindowDto,
  type CreateAlertMaintenanceWindowDto,
} from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

export type PlatformMaintenanceWindowRow = Prisma.PlatformMaintenanceWindowGetPayload<{
  include: {
    cancelled_by: { select: { email: true; first_name: true; last_name: true } };
    created_by: { select: { email: true; first_name: true; last_name: true } };
  };
}>;

@Injectable()
export class MaintenanceWindowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async list(query: AlertMaintenanceWindowQuery): Promise<PlatformMaintenanceWindowRow[]> {
    const now = new Date();
    return this.prisma.platformMaintenanceWindow.findMany({
      where: query.include_past ? {} : { ends_at: { gte: now } },
      orderBy: [{ cancelled_at: 'asc' }, { starts_at: 'asc' }],
      include: this.includeRelations(),
    });
  }

  async create(
    dto: CreateAlertMaintenanceWindowDto,
    actorUserId: string,
    audit?: PlatformAuditContext,
  ): Promise<PlatformMaintenanceWindowRow> {
    if (dto.ends_at <= dto.starts_at) {
      throw new BadRequestException({
        code: 'INVALID_MAINTENANCE_WINDOW',
        message: 'Maintenance window end time must be after start time.',
      });
    }

    const created = await this.prisma.platformMaintenanceWindow.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        starts_at: dto.starts_at,
        ends_at: dto.ends_at,
        created_by_user_id: actorUserId,
      },
      include: this.includeRelations(),
    });

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'maintenance_window_scheduled',
        target_resource_type: 'alert_maintenance_window',
        target_resource_id: created.id,
        payload: { after: created },
        reason: dto.title,
      });
    }

    return created;
  }

  async cancel(
    id: string,
    dto: CancelAlertMaintenanceWindowDto,
    actorUserId: string,
    audit?: PlatformAuditContext,
  ): Promise<PlatformMaintenanceWindowRow> {
    const existing = await this.prisma.platformMaintenanceWindow.findUnique({
      where: { id },
      include: this.includeRelations(),
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'MAINTENANCE_WINDOW_NOT_FOUND',
        message: `Alert maintenance window "${id}" not found`,
      });
    }
    if (existing.cancelled_at) {
      throw new BadRequestException({
        code: 'MAINTENANCE_WINDOW_ALREADY_CANCELLED',
        message: 'Alert maintenance window has already been cancelled.',
      });
    }

    const updated = await this.prisma.platformMaintenanceWindow.update({
      where: { id },
      data: { cancelled_at: new Date(), cancelled_by_user_id: actorUserId },
      include: this.includeRelations(),
    });

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'maintenance_window_cancelled',
        target_resource_type: 'alert_maintenance_window',
        target_resource_id: id,
        payload: { before: existing, after: updated, extra: { cancel_reason: dto.reason } },
        reason: dto.reason,
      });
    }

    return updated;
  }

  async findActiveWindowForRule(
    rule: PlatformAlertRule,
    now = new Date(),
  ): Promise<PlatformMaintenanceWindowRow | null> {
    if (rule.is_security_critical) {
      return null;
    }

    return this.prisma.platformMaintenanceWindow.findFirst({
      where: {
        cancelled_at: null,
        starts_at: { lte: now },
        ends_at: { gt: now },
      },
      orderBy: { ends_at: 'asc' },
      include: this.includeRelations(),
    });
  }

  private includeRelations() {
    return {
      cancelled_by: { select: { email: true, first_name: true, last_name: true } },
      created_by: { select: { email: true, first_name: true, last_name: true } },
    } satisfies Prisma.PlatformMaintenanceWindowInclude;
  }
}
