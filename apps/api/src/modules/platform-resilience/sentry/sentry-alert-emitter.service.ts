import { Injectable } from '@nestjs/common';
import { Prisma, type PlatformAlertSeverity } from '@prisma/client';

import { AlertRoutingService } from '../../platform/alert-routing.service';
import { RedisPubSubService } from '../../platform/redis-pubsub.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SentryAlertEmitterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisPubSub: RedisPubSubService,
    private readonly alertRouting: AlertRoutingService,
  ) {}

  async emit(input: {
    key: string;
    message: string;
    metric_value?: number;
    severity: PlatformAlertSeverity;
  }): Promise<void> {
    const rule = await this.ensureRule(input.key, input.severity);
    const alert = await this.prisma.platformAlertHistory.create({
      data: {
        channels_notified: [],
        message: input.message,
        metric_value: new Prisma.Decimal(input.metric_value ?? 1),
        rule_id: rule.id,
        severity: input.severity,
        status: 'fired',
      },
    });
    await this.alertRouting.dispatchInitial(alert.id);
    await this.redisPubSub.publish('platform:alerts', {
      alert_id: alert.id,
      channels_notified: [],
      fired_at: alert.fired_at.toISOString(),
      message: input.message,
      metric_value: input.metric_value ?? 1,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: input.severity,
      type: 'alert_fired',
    });
  }

  private async ensureRule(key: string, severity: PlatformAlertSeverity) {
    const metric = `sentry.${key}`;
    const existing = await this.prisma.platformAlertRule.findFirst({ where: { metric } });
    if (existing) return existing;
    return this.prisma.platformAlertRule.create({
      data: {
        condition_config: { operator: 'gte', threshold: 1 },
        cooldown_minutes: 15,
        is_enabled: true,
        is_security_critical: severity === 'critical',
        metric,
        name: `Sentry ${key.replace(/\./g, ' ')}`,
        notify_emails: [],
        severity,
      },
    });
  }
}
