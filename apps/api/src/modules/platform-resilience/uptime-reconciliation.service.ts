import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma, type PlatformUptimeReconciliation } from '@prisma/client';

import { AlertRoutingService } from '../platform/alert-routing.service';
import { RedisPubSubService } from '../platform/redis-pubsub.service';
import { PrismaService } from '../prisma/prisma.service';

interface UptimeRobotMonitor {
  friendly_name?: string;
  id: number;
  status: number;
  url?: string;
}

interface UptimeRobotResponse {
  monitors?: UptimeRobotMonitor[];
  stat?: string;
}

const UPTIME_ROBOT_STATUSES = new Map<number, string>([
  [0, 'paused'],
  [1, 'unknown'],
  [2, 'up'],
  [8, 'down'],
  [9, 'down'],
]);

@Injectable()
export class UptimeReconciliationService {
  private readonly logger = new Logger(UptimeReconciliationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly alertRouting: AlertRoutingService,
    private readonly redisPubSub: RedisPubSubService,
  ) {}

  @Cron('*/5 * * * *')
  async reconcile(): Promise<void> {
    const apiKey = this.configService.get<string>('UPTIMEROBOT_API_KEY');
    if (!apiKey) {
      this.logger.debug('UPTIMEROBOT_API_KEY is not configured; skipping reconciliation.');
      return;
    }

    try {
      const [externalMonitors, definitions] = await Promise.all([
        this.fetchExternalMonitors(apiKey),
        this.prisma.platformSyntheticCheckDefinition.findMany({
          include: { results: { orderBy: { ran_at: 'desc' }, take: 1 } },
          where: { enabled: true },
        }),
      ]);

      for (const monitor of externalMonitors) {
        const target = monitor.url ?? monitor.friendly_name ?? `monitor:${monitor.id}`;
        const definition = definitions.find((candidate) =>
          syntheticTargetMatches(candidate.target as Record<string, unknown>, target),
        );
        if (!definition) {
          continue;
        }
        const latestResult = definition.results[0];
        const internalStatus = latestResult
          ? internalStatusFromResult(latestResult.status)
          : 'unknown';
        const externalStatus = UPTIME_ROBOT_STATUSES.get(monitor.status) ?? 'unknown';
        await this.recordComparison({
          external_status: externalStatus,
          external_target: target,
          internal_check_key: definition.key,
          internal_observed_at: latestResult?.ran_at ?? new Date(),
          internal_status: internalStatus,
        });
      }
    } catch (err: unknown) {
      this.logger.error(
        'UptimeRobot reconciliation failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async listDisagreements(opts: { active_only: boolean }): Promise<PlatformUptimeReconciliation[]> {
    return this.prisma.platformUptimeReconciliation.findMany({
      orderBy: { detected_at: 'desc' },
      take: 100,
      where: opts.active_only ? { acknowledged_at: null, in_disagreement: true } : undefined,
    });
  }

  async acknowledge(input: { id: string; user_id: string }): Promise<PlatformUptimeReconciliation> {
    const existing = await this.prisma.platformUptimeReconciliation.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'UPTIME_RECONCILIATION_NOT_FOUND',
        message: `Uptime reconciliation "${input.id}" not found.`,
      });
    }
    return this.prisma.platformUptimeReconciliation.update({
      where: { id: input.id },
      data: {
        acknowledged_at: new Date(),
        acknowledged_by_user_id: input.user_id,
      },
    });
  }

  private async fetchExternalMonitors(apiKey: string): Promise<UptimeRobotMonitor[]> {
    const form = new URLSearchParams();
    form.set('api_key', apiKey);
    form.set('format', 'json');
    const response = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
      body: form,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`UptimeRobot API returned HTTP ${response.status}`);
    }
    const payload = (await response.json()) as UptimeRobotResponse;
    if (payload.stat !== 'ok') {
      throw new Error('UptimeRobot API returned a non-ok response.');
    }
    return payload.monitors ?? [];
  }

  private async recordComparison(input: {
    external_status: string;
    external_target: string;
    internal_check_key: string;
    internal_observed_at: Date;
    internal_status: string;
  }): Promise<void> {
    const inDisagreement =
      input.external_status !== 'unknown' &&
      input.internal_status !== 'unknown' &&
      input.external_status !== input.internal_status;
    const previous = await this.prisma.platformUptimeReconciliation.findFirst({
      orderBy: { detected_at: 'desc' },
      where: {
        external_monitor_name: 'uptimerobot',
        external_target: input.external_target,
        internal_check_key: input.internal_check_key,
      },
    });
    const streak =
      inDisagreement && previous?.in_disagreement
        ? previous.disagreement_streak + 1
        : inDisagreement
          ? 1
          : 0;
    const created = await this.prisma.platformUptimeReconciliation.create({
      data: {
        disagreement_streak: streak,
        external_monitor_name: 'uptimerobot',
        external_observed_at: new Date(),
        external_status: input.external_status,
        external_target: input.external_target,
        in_disagreement: inDisagreement,
        internal_check_key: input.internal_check_key,
        internal_observed_at: input.internal_observed_at,
        internal_status: input.internal_status,
      },
    });

    if (inDisagreement && streak === 2) {
      await this.emitDisagreementAlert(created);
    }
  }

  private async emitDisagreementAlert(row: PlatformUptimeReconciliation): Promise<void> {
    const rule = await this.ensureRule();
    const message = `[WARNING] UptimeRobot disagrees with internal check ${row.internal_check_key}: external=${row.external_status}, internal=${row.internal_status}.`;
    const alert = await this.prisma.platformAlertHistory.create({
      data: {
        channels_notified: [],
        message,
        metric_value: new Prisma.Decimal(row.disagreement_streak),
        rule_id: rule.id,
        severity: 'warning',
        status: 'fired',
      },
    });
    await this.alertRouting.dispatchInitial(alert.id);
    await this.redisPubSub.publish('platform:alerts', {
      alert_id: alert.id,
      fired_at: alert.fired_at.toISOString(),
      message,
      metric_value: row.disagreement_streak,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: 'warning',
      type: 'alert_fired',
    });
  }

  private async ensureRule() {
    const metric = 'uptime.reconciliation.disagreement';
    const existing = await this.prisma.platformAlertRule.findFirst({ where: { metric } });
    if (existing) return existing;
    return this.prisma.platformAlertRule.create({
      data: {
        condition_config: { operator: 'gte', threshold: 2 },
        cooldown_minutes: 30,
        is_enabled: true,
        is_security_critical: false,
        metric,
        name: 'UptimeRobot reconciliation disagreement',
        notify_emails: [],
        severity: 'warning',
      },
    });
  }
}

function syntheticTargetMatches(target: Record<string, unknown>, externalTarget: string): boolean {
  const normalizedExternal = normalizeUrl(externalTarget);
  const url = typeof target.url === 'string' ? normalizeUrl(target.url) : null;
  const hostname = typeof target.hostname === 'string' ? normalizeUrl(target.hostname) : null;
  return normalizedExternal === url || normalizedExternal === hostname;
}

function normalizeUrl(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function internalStatusFromResult(status: string): string {
  if (status === 'passed') return 'up';
  if (status === 'failed' || status === 'error') return 'down';
  if (status === 'skipped_maintenance') return 'paused';
  return 'unknown';
}
