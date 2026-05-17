import { Injectable } from '@nestjs/common';
import { Prisma, type PlatformAlertSeverity } from '@prisma/client';

import { RedisPubSubService } from '../platform/redis-pubsub.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SyntheticAlertEmitterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisPubSub: RedisPubSubService,
  ) {}

  async emit(input: {
    definition_key: string;
    display_name: string;
    message: string;
    metric_value: number;
    severity: PlatformAlertSeverity;
    type: 'failed' | 'failed_critical' | 'recovered';
  }): Promise<void> {
    const rule = await this.ensureRule(input);
    if (input.type === 'recovered') {
      await this.resolveOpenFailureAlerts(input.definition_key);
    }
    const alert = await this.prisma.platformAlertHistory.create({
      data: {
        channels_notified: [],
        message: input.message,
        metric_value: new Prisma.Decimal(input.metric_value),
        rule_id: rule.id,
        severity: input.severity,
        status: input.type === 'recovered' ? 'resolved' : 'fired',
        resolved_at: input.type === 'recovered' ? new Date() : undefined,
      },
    });

    await this.redisPubSub.publish('platform:alerts', {
      alert_id: alert.id,
      channels_notified: [],
      fired_at: alert.fired_at.toISOString(),
      message: input.message,
      metric_value: input.metric_value,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: input.severity,
      type: input.type === 'recovered' ? 'alert_resolved' : 'alert_fired',
    });
  }

  private async ensureRule(input: {
    definition_key: string;
    display_name: string;
    severity: PlatformAlertSeverity;
    type: 'failed' | 'failed_critical' | 'recovered';
  }) {
    const metric = `synthetic.check.${input.type}:${input.definition_key}`;
    const existing = await this.prisma.platformAlertRule.findFirst({ where: { metric } });
    if (existing) return existing;
    return this.prisma.platformAlertRule.create({
      data: {
        condition_config: { operator: 'gte', threshold: 1 },
        cooldown_minutes: 15,
        is_enabled: true,
        is_security_critical: false,
        metric,
        name: `Synthetic ${input.display_name} ${input.type.replace('_', ' ')}`,
        notify_emails: [],
        severity: input.severity,
      },
    });
  }

  private async resolveOpenFailureAlerts(definitionKey: string): Promise<void> {
    const openAlerts = await this.prisma.platformAlertHistory.findMany({
      where: {
        rule: {
          metric: {
            in: [
              `synthetic.check.failed:${definitionKey}`,
              `synthetic.check.failed_critical:${definitionKey}`,
            ],
          },
        },
        status: { in: ['fired', 'acknowledged'] },
      },
      select: { id: true, rule_id: true },
    });
    const resolvedAt = new Date();
    for (const alert of openAlerts) {
      await this.prisma.platformAlertHistory.update({
        where: { id: alert.id },
        data: { resolved_at: resolvedAt, status: 'resolved' },
      });
      await this.redisPubSub.publish('platform:alerts', {
        alert_id: alert.id,
        resolved_at: resolvedAt.toISOString(),
        rule_id: alert.rule_id,
        type: 'alert_resolved',
      });
    }
  }
}
