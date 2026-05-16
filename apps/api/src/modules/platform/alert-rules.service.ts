import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformAlertRule } from '@prisma/client';

import {
  createAlertRuleSchema,
  type CreateAlertRuleDto,
  type UpdateAlertRuleDto,
} from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

function toJsonValue(value: CreateAlertRuleDto['condition_config']): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function validateAlertRuleInput(input: unknown): CreateAlertRuleDto {
  const parsed = createAlertRuleSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'INVALID_ALERT_RULE_CONFIG',
      message: 'Alert rule condition is invalid.',
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
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
    const validated = validateAlertRuleInput(dto);
    const created = await this.prisma.platformAlertRule.create({
      data: {
        name: validated.name,
        metric: validated.metric,
        condition_config: toJsonValue(validated.condition_config),
        severity: validated.severity,
        cooldown_minutes: validated.cooldown_minutes,
        is_enabled: validated.is_enabled,
        is_security_critical: validated.is_security_critical,
        notify_emails: validated.notify_emails,
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

    const validated = validateAlertRuleInput({
      name: existing.name,
      metric: existing.metric,
      condition_config: existing.condition_config,
      severity: existing.severity,
      cooldown_minutes: existing.cooldown_minutes,
      is_enabled: existing.is_enabled,
      is_security_critical: existing.is_security_critical,
      notify_emails: existing.notify_emails,
      channel_ids: [],
      ...dto,
    });

    const data: Prisma.PlatformAlertRuleUpdateInput = {};
    if (dto.name !== undefined) data.name = validated.name;
    if (dto.metric !== undefined) data.metric = validated.metric;
    if (dto.condition_config !== undefined)
      data.condition_config = toJsonValue(validated.condition_config);
    if (dto.severity !== undefined) data.severity = validated.severity;
    if (dto.cooldown_minutes !== undefined) data.cooldown_minutes = validated.cooldown_minutes;
    if (dto.is_enabled !== undefined) data.is_enabled = validated.is_enabled;
    if (dto.is_security_critical !== undefined)
      data.is_security_critical = validated.is_security_critical;
    if (dto.notify_emails !== undefined) data.notify_emails = validated.notify_emails;

    if (Object.keys(data).length === 0) {
      return existing;
    }

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

  async toggle(
    id: string,
    isEnabled: boolean,
    audit?: PlatformAuditContext,
  ): Promise<PlatformAlertRule> {
    return this.update(id, { is_enabled: isEnabled }, audit);
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
