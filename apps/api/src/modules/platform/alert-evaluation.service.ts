import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, type PlatformAlertRule } from '@prisma/client';

import { alertConditionConfigSchema, type AlertConditionConfig } from '@school/shared';

import { HealthService, type FullHealthResult } from '../health/health.service';
import { PrismaService } from '../prisma/prisma.service';

import { AlertDispatchService } from './alert-dispatch.service';
import { AlertSilenceService } from './alert-silence.service';
import { MaintenanceWindowService } from './maintenance-window.service';
import { RedisPubSubService } from './redis-pubsub.service';

const ALERT_EVALUATION_INTERVAL_MS = 30_000;

type MetricMap = Map<string, number>;
type Operator = AlertConditionConfig['operator'];

@Injectable()
export class AlertEvaluationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertEvaluationService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly sustainedConditions = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly healthService: HealthService,
    private readonly redisPubSub: RedisPubSubService,
    private readonly alertDispatchService: AlertDispatchService,
    private readonly alertSilenceService: AlertSilenceService,
    private readonly maintenanceWindowService: MaintenanceWindowService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.evaluate();
    }, ALERT_EVALUATION_INTERVAL_MS);
    this.logger.log('Alert evaluation interval started (every 30s)');
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async evaluate(): Promise<void> {
    try {
      const rules = await this.prisma.platformAlertRule.findMany({
        where: { is_enabled: true },
      });

      if (rules.length === 0) {
        return;
      }

      const health = await this.healthService.check();
      const metrics = this.extractMetrics(health);

      for (const rule of rules) {
        await this.evaluateRule(rule, metrics);
      }
    } catch (err: unknown) {
      this.logger.error('[evaluate] Alert evaluation failed', err);
    }
  }

  extractMetrics(health: FullHealthResult): MetricMap {
    const metrics: MetricMap = new Map();
    const statusValue: Record<FullHealthResult['status'], number> = {
      degraded: 1,
      healthy: 0,
      unhealthy: 2,
    };

    metrics.set('health_status', statusValue[health.status]);
    metrics.set('component_latency:postgresql', health.checks.postgresql.latency_ms);
    metrics.set('component_latency:redis', health.checks.redis.latency_ms);
    metrics.set('component_latency:meilisearch', health.checks.meilisearch.latency_ms);
    metrics.set('component_status:postgresql', health.checks.postgresql.status === 'down' ? 1 : 0);
    metrics.set('component_status:redis', health.checks.redis.status === 'down' ? 1 : 0);
    metrics.set(
      'component_status:meilisearch',
      health.checks.meilisearch.status === 'down' ? 1 : 0,
    );
    metrics.set('component_status:bullmq', health.checks.bullmq.status === 'down' ? 1 : 0);
    metrics.set('component_status:disk', health.checks.disk.status === 'down' ? 1 : 0);
    metrics.set('bullmq_stuck_jobs', health.checks.bullmq.stuck_jobs);
    metrics.set('disk_free_gb', health.checks.disk.free_gb);

    return metrics;
  }

  checkCondition(value: number, operator: Operator, threshold: number): boolean {
    switch (operator) {
      case 'eq':
        return value === threshold;
      case 'gt':
        return value > threshold;
      case 'gte':
        return value >= threshold;
      case 'lt':
        return value < threshold;
      case 'lte':
        return value <= threshold;
      case 'neq':
        return value !== threshold;
    }
  }

  private async evaluateRule(rule: PlatformAlertRule, metrics: MetricMap): Promise<void> {
    const config = alertConditionConfigSchema.parse(rule.condition_config);
    const metricKey = this.resolveMetricKey(rule.metric, config);
    const currentValue = metrics.get(metricKey);
    if (currentValue === undefined) {
      return;
    }

    const conditionMet = this.checkCondition(currentValue, config.operator, config.threshold);
    if (!conditionMet) {
      this.sustainedConditions.delete(rule.id);
      await this.autoResolve(rule.id);
      return;
    }

    if (config.duration_minutes) {
      const firstTriggered = this.sustainedConditions.get(rule.id);
      if (!firstTriggered) {
        this.sustainedConditions.set(rule.id, new Date());
        return;
      }

      const elapsedMinutes = (Date.now() - firstTriggered.getTime()) / 60_000;
      if (elapsedMinutes < config.duration_minutes) {
        return;
      }
    }

    const inCooldown = await this.isInCooldown(rule);
    if (inCooldown) {
      return;
    }

    await this.fireAlert(rule, config, currentValue);
    this.sustainedConditions.delete(rule.id);
  }

  private resolveMetricKey(metric: string, config: AlertConditionConfig): string {
    if (config.component && (metric === 'component_latency' || metric === 'component_status')) {
      return `${metric}:${config.component}`;
    }
    return metric;
  }

  private async isInCooldown(rule: PlatformAlertRule): Promise<boolean> {
    const lastAlert = await this.prisma.platformAlertHistory.findFirst({
      where: { rule_id: rule.id },
      orderBy: { fired_at: 'desc' },
    });
    if (!lastAlert) {
      return false;
    }

    const minutesSinceLast = (Date.now() - lastAlert.fired_at.getTime()) / 60_000;
    return minutesSinceLast < rule.cooldown_minutes;
  }

  private async fireAlert(
    rule: PlatformAlertRule,
    config: AlertConditionConfig,
    metricValue: number,
  ): Promise<void> {
    const message = `[${rule.severity.toUpperCase()}] ${rule.name}: metric value ${metricValue} ${config.operator} ${config.threshold}`;
    const now = new Date();
    const [activeSilence, activeWindow] = await Promise.all([
      this.alertSilenceService.findActiveSilenceForRule(rule, now),
      this.maintenanceWindowService.findActiveWindowForRule(rule, now),
    ]);

    if (activeSilence || activeWindow) {
      const alert = await this.prisma.platformAlertHistory.create({
        data: {
          rule_id: rule.id,
          severity: rule.severity,
          message,
          metric_value: new Prisma.Decimal(metricValue),
          channels_notified: [],
          status: 'resolved',
          resolved_at: now,
          suppressed_by_silence_id: activeSilence?.id,
          suppressed_by_maintenance_window_id: activeWindow?.id,
        },
      });

      await this.redisPubSub.publish('platform:alerts', {
        type: 'alert_suppressed',
        alert_id: alert.id,
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        suppressed_by_silence_id: activeSilence?.id ?? null,
        suppressed_by_maintenance_window_id: activeWindow?.id ?? null,
        fired_at: alert.fired_at.toISOString(),
      });
      return;
    }

    const alert = await this.prisma.platformAlertHistory.create({
      data: {
        rule_id: rule.id,
        severity: rule.severity,
        message,
        metric_value: new Prisma.Decimal(metricValue),
        channels_notified: [],
        status: 'fired',
      },
    });

    const channelsNotified = await this.alertDispatchService.sendEmail(rule, alert, metricValue);
    if (channelsNotified.length > 0) {
      await this.prisma.platformAlertHistory.update({
        where: { id: alert.id },
        data: { channels_notified: channelsNotified },
      });
    }

    await this.redisPubSub.publish('platform:alerts', {
      type: 'alert_fired',
      alert_id: alert.id,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      message,
      metric_value: metricValue,
      fired_at: alert.fired_at.toISOString(),
    });

    this.logger.warn(`Alert fired: ${message}`);
  }

  private async autoResolve(ruleId: string): Promise<void> {
    const openAlert = await this.prisma.platformAlertHistory.findFirst({
      where: {
        rule_id: ruleId,
        status: { in: ['fired', 'acknowledged'] },
      },
      orderBy: { fired_at: 'desc' },
    });

    if (!openAlert) {
      return;
    }

    const resolvedAt = new Date();
    await this.prisma.platformAlertHistory.update({
      where: { id: openAlert.id },
      data: { status: 'resolved', resolved_at: resolvedAt },
    });

    await this.redisPubSub.publish('platform:alerts', {
      type: 'alert_resolved',
      alert_id: openAlert.id,
      rule_id: ruleId,
      resolved_at: resolvedAt.toISOString(),
    });
  }
}
