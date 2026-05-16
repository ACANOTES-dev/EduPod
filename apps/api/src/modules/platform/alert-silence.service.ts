import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformAlertRule } from '@prisma/client';

import {
  alertConditionConfigSchema,
  type AlertSilenceQuery,
  type CreateAlertSilenceDto,
  type RemoveAlertSilenceDto,
} from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

export type PlatformAlertSilenceRow = Prisma.PlatformAlertSilenceGetPayload<{
  include: {
    alert_rule: { select: { id: true; name: true; severity: true } };
    created_by: { select: { email: true; first_name: true; last_name: true } };
    removed_by: { select: { email: true; first_name: true; last_name: true } };
  };
}>;

@Injectable()
export class AlertSilenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async list(query: AlertSilenceQuery): Promise<PlatformAlertSilenceRow[]> {
    const now = new Date();
    return this.prisma.platformAlertSilence.findMany({
      where: query.include_expired
        ? {}
        : {
            OR: [{ removed_at: null, ends_at: { gte: now } }, { created_at: { gte: daysAgo(14) } }],
          },
      orderBy: [{ removed_at: 'asc' }, { ends_at: 'desc' }],
      include: this.includeRelations(),
    });
  }

  async create(
    dto: CreateAlertSilenceDto,
    actorUserId: string,
    audit?: PlatformAuditContext,
  ): Promise<PlatformAlertSilenceRow> {
    const startsAt = dto.starts_at ?? new Date();
    if (dto.ends_at <= startsAt) {
      throw new BadRequestException({
        code: 'INVALID_SILENCE_WINDOW',
        message: 'Alert silence end time must be after start time.',
      });
    }

    if (dto.scope === 'single_rule') {
      const exists = await this.prisma.platformAlertRule.findUnique({
        where: { id: dto.alert_rule_id },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException({
          code: 'ALERT_RULE_NOT_FOUND',
          message: `Alert rule "${dto.alert_rule_id}" not found`,
        });
      }
    }

    const created = await this.prisma.platformAlertSilence.create({
      data: {
        scope: dto.scope,
        alert_rule_id: dto.scope === 'single_rule' ? dto.alert_rule_id : null,
        component: dto.scope === 'component' ? dto.component : null,
        reason: dto.reason,
        starts_at: startsAt,
        ends_at: dto.ends_at,
        created_by_user_id: actorUserId,
      },
      include: this.includeRelations(),
    });

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'alert_silenced',
        target_resource_type: 'alert_silence',
        target_resource_id: created.id,
        payload: { after: created },
        reason: dto.reason,
      });
    }

    return created;
  }

  async remove(
    id: string,
    dto: RemoveAlertSilenceDto,
    actorUserId: string,
    audit?: PlatformAuditContext,
  ): Promise<PlatformAlertSilenceRow> {
    const existing = await this.prisma.platformAlertSilence.findUnique({
      where: { id },
      include: this.includeRelations(),
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'ALERT_SILENCE_NOT_FOUND',
        message: `Alert silence "${id}" not found`,
      });
    }
    if (existing.removed_at) {
      throw new BadRequestException({
        code: 'ALERT_SILENCE_ALREADY_REMOVED',
        message: 'Alert silence has already been removed.',
      });
    }

    const updated = await this.prisma.platformAlertSilence.update({
      where: { id },
      data: {
        removed_at: new Date(),
        removed_by_user_id: actorUserId,
        removed_reason: dto.reason,
      },
      include: this.includeRelations(),
    });

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'alert_silenced',
        target_resource_type: 'alert_silence',
        target_resource_id: id,
        payload: { before: existing, after: updated, extra: { removed: true } },
        reason: dto.reason,
      });
    }

    return updated;
  }

  async findActiveSilenceForRule(
    rule: PlatformAlertRule,
    now = new Date(),
  ): Promise<PlatformAlertSilenceRow | null> {
    const component = this.componentForRule(rule);
    const candidates = await this.prisma.platformAlertSilence.findMany({
      where: {
        removed_at: null,
        starts_at: { lte: now },
        ends_at: { gt: now },
        OR: [
          { scope: 'single_rule', alert_rule_id: rule.id },
          ...(component ? [{ scope: 'component' as const, component }] : []),
          ...(rule.is_security_critical ? [] : [{ scope: 'global' as const }]),
        ],
      },
      orderBy: [{ scope: 'asc' }, { ends_at: 'asc' }],
      take: 1,
      include: this.includeRelations(),
    });

    return candidates[0] ?? null;
  }

  private componentForRule(rule: PlatformAlertRule): string | null {
    const parsed = alertConditionConfigSchema.safeParse(rule.condition_config);
    return parsed.success ? (parsed.data.component ?? null) : null;
  }

  private includeRelations() {
    return {
      alert_rule: { select: { id: true, name: true, severity: true } },
      created_by: { select: { email: true, first_name: true, last_name: true } },
      removed_by: { select: { email: true, first_name: true, last_name: true } },
    } satisfies Prisma.PlatformAlertSilenceInclude;
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
