import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type PlatformAlertSeverity } from '@prisma/client';

import { AlertRoutingService } from '../platform/alert-routing.service';
import { RedisPubSubService } from '../platform/redis-pubsub.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import type { ReadinessScoreResult } from './readiness-score.service';

const LIVE_WINDOW_KEY = 'platform:resilience:readiness:live-window';
const LIVE_STATE_KEY = 'platform:resilience:readiness:alert-state';
const LIVE_FAILURE_COUNT_KEY = 'platform:resilience:readiness:live-failures';

type ReadinessAlertState = 'healthy' | 'warning' | 'critical';

@Injectable()
export class ReadinessAlertEvaluatorService {
  private readonly logger = new Logger(ReadinessAlertEvaluatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly alertRouting: AlertRoutingService,
    private readonly redisPubSub: RedisPubSubService,
  ) {}

  async evaluate(result: ReadinessScoreResult, now = new Date()): Promise<void> {
    const client = this.redis.getClient();
    await client.lpush(
      LIVE_WINDOW_KEY,
      JSON.stringify({ score: result.score, at: now.toISOString() }),
    );
    await client.ltrim(LIVE_WINDOW_KEY, 0, 3);
    await client.del(LIVE_FAILURE_COUNT_KEY);
    await this.redisPubSub.publish('platform:resilience', {
      computed_at: result.computed_at,
      score: result.score,
      type: 'readiness_score_evaluated',
      worst_dimension: result.worst_dimension,
    });

    const recent = (await client.lrange(LIVE_WINDOW_KEY, 0, 1))
      .map(parseScoreWindowEntry)
      .filter((entry): entry is { score: number } => entry !== null);
    const currentState = await this.currentState();
    const nextState = debouncedState(recent);
    if (nextState === 'critical' && currentState !== 'critical') {
      await this.emitScoreAlert(
        {
          message: `[CRITICAL] Platform readiness score is ${result.score}/100. ${primaryReason(result)}`,
          metric: 'readiness.score.critical',
          score: result.score,
          severity: 'critical',
          suppressible: false,
        },
        now,
      );
      await client.set(LIVE_STATE_KEY, 'critical');
      return;
    }
    if (nextState === 'warning' && currentState === 'healthy') {
      await this.emitScoreAlert(
        {
          message: `[WARNING] Platform readiness score is ${result.score}/100. ${primaryReason(result)}`,
          metric: 'readiness.score.warning',
          score: result.score,
          severity: 'warning',
          suppressible: true,
        },
        now,
      );
      await client.set(LIVE_STATE_KEY, 'warning');
      return;
    }
    if (result.score >= 80 && currentState !== 'healthy') {
      await this.emitScoreAlert(
        {
          message: `[INFO] Platform readiness score recovered to ${result.score}/100.`,
          metric: 'readiness.score.recovered',
          score: result.score,
          severity: 'info',
          suppressible: true,
        },
        now,
      );
      await client.set(LIVE_STATE_KEY, 'healthy');
    }
  }

  async recordLiveFailure(error: unknown, now = new Date()): Promise<void> {
    const count = await this.redis.getClient().incr(LIVE_FAILURE_COUNT_KEY);
    await this.redis.getClient().expire(LIVE_FAILURE_COUNT_KEY, 30 * 60);
    if (count < 3) return;
    await this.emitScoreAlert(
      {
        message: `[CRITICAL] Readiness live evaluation failed for ${count} consecutive ticks: ${errorMessage(error)}.`,
        metric: 'readiness.score.live_evaluation_failed',
        score: count,
        severity: 'critical',
        suppressible: false,
      },
      now,
    );
  }

  async recordDailySnapshotFailure(error: unknown): Promise<void> {
    await this.emitScoreAlert({
      message: `[WARNING] Readiness daily snapshot failed: ${errorMessage(error)}.`,
      metric: 'readiness.score.daily_snapshot_failed',
      score: 1,
      severity: 'warning',
      suppressible: true,
    });
  }

  private async currentState(): Promise<ReadinessAlertState> {
    const raw = await this.redis.getClient().get(LIVE_STATE_KEY);
    return raw === 'warning' || raw === 'critical' ? raw : 'healthy';
  }

  private async emitScoreAlert(
    input: {
      message: string;
      metric: string;
      score: number;
      severity: PlatformAlertSeverity;
      suppressible: boolean;
    },
    now = new Date(),
  ): Promise<void> {
    const rule = await this.ensureRule(input);
    const activeWindow =
      input.suppressible && input.severity !== 'critical'
        ? await this.findActiveMaintenanceWindow(now)
        : null;
    const alert = await this.prisma.platformAlertHistory.create({
      data: {
        channels_notified: [],
        message: input.message,
        metric_value: new Prisma.Decimal(input.score),
        resolved_at: activeWindow ? now : undefined,
        rule_id: rule.id,
        severity: input.severity,
        status: activeWindow ? 'resolved' : 'fired',
        suppressed_by_maintenance_window_id: activeWindow?.id,
      },
    });
    if (!activeWindow) {
      await this.alertRouting.dispatchInitial(alert.id);
    }
    await this.redisPubSub.publish('platform:alerts', {
      alert_id: alert.id,
      fired_at: alert.fired_at.toISOString(),
      message: alert.message,
      metric_value: input.score,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: input.severity,
      suppressed_by_maintenance_window_id: activeWindow?.id,
      type: activeWindow ? 'alert_suppressed' : 'alert_fired',
    });
  }

  private async ensureRule(input: { metric: string; severity: PlatformAlertSeverity }) {
    const existing = await this.prisma.platformAlertRule.findFirst({
      where: { metric: input.metric },
    });
    if (existing) return existing;
    return this.prisma.platformAlertRule.create({
      data: {
        condition_config: { operator: 'lte', threshold: input.severity === 'critical' ? 40 : 80 },
        cooldown_minutes: 15,
        is_enabled: true,
        is_security_critical: input.severity === 'critical',
        metric: input.metric,
        name: readinessRuleName(input.metric),
        notify_emails: [],
        severity: input.severity,
      },
    });
  }

  private async findActiveMaintenanceWindow(now: Date) {
    try {
      return await this.prisma.platformMaintenanceWindow.findFirst({
        orderBy: { ends_at: 'asc' },
        where: { cancelled_at: null, ends_at: { gt: now }, starts_at: { lte: now } },
      });
    } catch (err: unknown) {
      this.logger.warn('Failed to read platform maintenance windows', err);
      return null;
    }
  }
}

function debouncedState(recent: Array<{ score: number }>): ReadinessAlertState {
  if (recent.length < 2) return 'healthy';
  if (recent.every((entry) => entry.score < 40)) return 'critical';
  if (recent.every((entry) => entry.score < 80)) return 'warning';
  return 'healthy';
}

function parseScoreWindowEntry(raw: string): { score: number } | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'score' in parsed) {
      const score = (parsed as { score?: unknown }).score;
      if (typeof score === 'number' && Number.isFinite(score)) return { score };
    }
  } catch {
    return null;
  }
  return null;
}

function primaryReason(result: ReadinessScoreResult): string {
  return result.reasons[0] ?? 'No specific reason was available.';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readinessRuleName(metric: string): string {
  if (metric.endsWith('critical')) return 'Readiness score critical threshold';
  if (metric.endsWith('warning')) return 'Readiness score warning threshold';
  if (metric.endsWith('recovered')) return 'Readiness score recovered';
  if (metric.endsWith('live_evaluation_failed')) return 'Readiness live evaluation failed';
  return 'Readiness daily snapshot failed';
}
