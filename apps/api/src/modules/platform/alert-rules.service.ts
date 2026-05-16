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

type PlatformAlertRuleWithChannels = PlatformAlertRule & {
  channels: Array<{ channel_id: string }>;
};

export type AlertRuleResponse = PlatformAlertRule & {
  channel_ids: string[];
};

@Injectable()
export class AlertRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async list(): Promise<AlertRuleResponse[]> {
    const rules = await this.prisma.platformAlertRule.findMany({
      include: { channels: { select: { channel_id: true } } },
      orderBy: { created_at: 'desc' },
    });
    return rules.map((rule) => this.toResponse(rule));
  }

  async create(dto: CreateAlertRuleDto, audit?: PlatformAuditContext): Promise<AlertRuleResponse> {
    const validated = validateAlertRuleInput(dto);
    const channelIds = this.uniqueChannelIds(validated.channel_ids);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertChannelsExist(tx, channelIds);
      const rule = await tx.platformAlertRule.create({
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
      if (channelIds.length > 0) {
        await tx.platformAlertRuleChannel.createMany({
          data: channelIds.map((channelId) => ({
            channel_id: channelId,
            rule_id: rule.id,
          })),
          skipDuplicates: true,
        });
      }
      return tx.platformAlertRule.findUniqueOrThrow({
        where: { id: rule.id },
        include: { channels: { select: { channel_id: true } } },
      });
    });
    const response = this.toResponse(created);
    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'alert_rule_created',
        target_resource_type: 'alert_rule',
        target_resource_id: created.id,
        payload: { after: response },
      });
    }
    return response;
  }

  async update(
    id: string,
    dto: UpdateAlertRuleDto,
    audit?: PlatformAuditContext,
  ): Promise<AlertRuleResponse> {
    const existing = await this.prisma.platformAlertRule.findUnique({
      where: { id },
      include: { channels: { select: { channel_id: true } } },
    });
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
      if (dto.channel_ids === undefined) {
        return this.toResponse(existing);
      }
    }

    const channelIds =
      dto.channel_ids === undefined ? undefined : this.uniqueChannelIds(dto.channel_ids);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (channelIds !== undefined) {
        await this.assertChannelsExist(tx, channelIds);
      }

      if (Object.keys(data).length > 0) {
        await tx.platformAlertRule.update({
          where: { id },
          data,
        });
      }

      if (channelIds !== undefined) {
        await tx.platformAlertRuleChannel.deleteMany({ where: { rule_id: id } });
        if (channelIds.length > 0) {
          await tx.platformAlertRuleChannel.createMany({
            data: channelIds.map((channelId) => ({
              channel_id: channelId,
              rule_id: id,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.platformAlertRule.findUniqueOrThrow({
        where: { id },
        include: { channels: { select: { channel_id: true } } },
      });
    });
    const before = this.toResponse(existing);
    const after = this.toResponse(updated);
    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: dto.is_enabled === false ? 'alert_rule_disabled' : 'alert_rule_updated',
        target_resource_type: 'alert_rule',
        target_resource_id: id,
        payload: { before, after },
      });
    }
    return after;
  }

  async toggle(
    id: string,
    isEnabled: boolean,
    audit?: PlatformAuditContext,
  ): Promise<AlertRuleResponse> {
    return this.update(id, { is_enabled: isEnabled }, audit);
  }

  async remove(id: string, audit?: PlatformAuditContext): Promise<void> {
    const existing = await this.prisma.platformAlertRule.findUnique({
      where: { id },
      include: { channels: { select: { channel_id: true } } },
    });
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
        payload: { before: this.toResponse(existing) },
      });
    }
  }

  private uniqueChannelIds(channelIds: string[]): string[] {
    return Array.from(new Set(channelIds));
  }

  private async assertChannelsExist(
    prisma: Pick<Prisma.TransactionClient, 'platformAlertChannel'>,
    channelIds: string[],
  ): Promise<void> {
    if (channelIds.length === 0) {
      return;
    }
    const found = await prisma.platformAlertChannel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true },
    });
    if (found.length !== channelIds.length) {
      throw new BadRequestException({
        code: 'ALERT_CHANNEL_NOT_FOUND',
        message: 'One or more selected alert channels do not exist.',
      });
    }
  }

  private toResponse(rule: PlatformAlertRuleWithChannels): AlertRuleResponse {
    const { channels, ...rest } = rule;
    return {
      ...rest,
      channel_ids: channels.map((channel) => channel.channel_id),
    };
  }
}
