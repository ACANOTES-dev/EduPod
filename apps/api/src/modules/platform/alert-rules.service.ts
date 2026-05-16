import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformAlertRule } from '@prisma/client';

import type { CreateAlertRuleDto, UpdateAlertRuleDto } from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

function toJsonValue(value: CreateAlertRuleDto['condition_config']): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class AlertRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async list(): Promise<PlatformAlertRule[]> {
    return this.prisma.platformAlertRule.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async create(dto: CreateAlertRuleDto, audit?: PlatformAuditContext): Promise<PlatformAlertRule> {
    const created = await this.prisma.platformAlertRule.create({
      data: {
        name: dto.name,
        metric: dto.metric,
        condition_config: toJsonValue(dto.condition_config),
        severity: dto.severity,
        cooldown_minutes: dto.cooldown_minutes,
        is_enabled: dto.is_enabled,
        notify_emails: dto.notify_emails,
      },
    });
    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'alert_rule_created',
        target_resource_type: 'alert_rule',
        target_resource_id: created.id,
        payload: { after: created },
      });
    }
    return created;
  }

  async update(
    id: string,
    dto: UpdateAlertRuleDto,
    audit?: PlatformAuditContext,
  ): Promise<PlatformAlertRule> {
    const existing = await this.prisma.platformAlertRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'ALERT_RULE_NOT_FOUND',
        message: `Alert rule with id "${id}" not found`,
      });
    }

    const data: Prisma.PlatformAlertRuleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.metric !== undefined) data.metric = dto.metric;
    if (dto.condition_config !== undefined)
      data.condition_config = toJsonValue(dto.condition_config);
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.cooldown_minutes !== undefined) data.cooldown_minutes = dto.cooldown_minutes;
    if (dto.is_enabled !== undefined) data.is_enabled = dto.is_enabled;
    if (dto.notify_emails !== undefined) data.notify_emails = dto.notify_emails;

    const updated = await this.prisma.platformAlertRule.update({
      where: { id },
      data,
    });
    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: dto.is_enabled === false ? 'alert_rule_disabled' : 'alert_rule_updated',
        target_resource_type: 'alert_rule',
        target_resource_id: id,
        payload: { before: existing, after: updated },
      });
    }
    return updated;
  }

  async remove(id: string, audit?: PlatformAuditContext): Promise<void> {
    const existing = await this.prisma.platformAlertRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'ALERT_RULE_NOT_FOUND',
        message: `Alert rule with id "${id}" not found`,
      });
    }

    await this.prisma.platformAlertRule.delete({ where: { id } });
    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'alert_rule_deleted',
        target_resource_type: 'alert_rule',
        target_resource_id: id,
        payload: { before: existing },
      });
    }
  }
}
