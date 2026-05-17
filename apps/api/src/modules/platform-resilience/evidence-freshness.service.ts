import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type EvidencePipelineStatus,
  Prisma,
  type PlatformAlertSeverity,
  type PlatformEvidencePipeline,
  type PlatformEvidencePipelineStatus,
} from '@prisma/client';

import {
  type CreateEvidencePipelineDto,
  type EvidencePipelineListQuery,
  type UpdateEvidencePipelineDto,
} from '@school/shared';

import { AlertRoutingService } from '../platform/alert-routing.service';
import { RedisPubSubService } from '../platform/redis-pubsub.service';
import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { EvidenceQueryHandlersService } from './evidence-query-handlers.service';

type PipelineWithStatus = PlatformEvidencePipeline & {
  status: PlatformEvidencePipelineStatus | null;
};

type FreshnessSummaryStatus = 'all_fresh' | 'some_lagging' | 'some_silent' | 'some_stale';

@Injectable()
export class EvidenceFreshnessService {
  private readonly logger = new Logger(EvidenceFreshnessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queryHandlers: EvidenceQueryHandlersService,
    private readonly alertRouting: AlertRoutingService,
    private readonly redisPubSub: RedisPubSubService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(query: EvidencePipelineListQuery): Promise<PipelineWithStatus[]> {
    const rows = await this.prisma.platformEvidencePipeline.findMany({
      where: {
        enabled: query.enabled,
        status: query.status ? { is: { status: query.status } } : undefined,
      },
      include: { status: true },
      orderBy: [{ is_seeded: 'desc' }, { key: 'asc' }],
    });
    return rows;
  }

  async get(key: string): Promise<PipelineWithStatus> {
    const row = await this.prisma.platformEvidencePipeline.findUnique({
      where: { key },
      include: { status: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'EVIDENCE_PIPELINE_NOT_FOUND',
        message: `Evidence pipeline "${key}" not found.`,
      });
    }
    return row;
  }

  async create(
    dto: CreateEvidencePipelineDto,
    audit?: PlatformAuditContext,
  ): Promise<PipelineWithStatus> {
    this.queryHandlers.validate(dto.query_kind, dto.query_params);
    const row = await this.prisma.platformEvidencePipeline.create({
      data: {
        alert_severity_lagging: dto.alert_severity_lagging,
        alert_severity_silent: dto.alert_severity_silent,
        description: dto.description,
        display_name: dto.display_name,
        enabled: dto.enabled,
        expected_interval_seconds: dto.expected_interval_seconds,
        is_seeded: false,
        key: dto.key,
        lagging_threshold_seconds: dto.lagging_threshold_seconds,
        query_kind: dto.query_kind,
        query_params: dto.query_params as Prisma.InputJsonValue,
        related_component: dto.related_component,
        silent_threshold_seconds: dto.silent_threshold_seconds,
        stale_threshold_seconds: dto.stale_threshold_seconds,
      },
      include: { status: true },
    });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'evidence_pipeline_created',
        payload: { after: row },
        target_resource_id: row.id,
        target_resource_type: 'evidence_pipeline',
      });
    }
    return row;
  }

  async update(
    id: string,
    dto: UpdateEvidencePipelineDto,
    audit?: PlatformAuditContext,
  ): Promise<PipelineWithStatus> {
    const existing = await this.prisma.platformEvidencePipeline.findUnique({
      where: { id },
      include: { status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'EVIDENCE_PIPELINE_NOT_FOUND',
        message: `Evidence pipeline "${id}" not found.`,
      });
    }
    this.queryHandlers.validate(
      dto.query_kind ?? existing.query_kind,
      (dto.query_params ?? existing.query_params) as Record<string, unknown>,
    );
    const updated = await this.prisma.platformEvidencePipeline.update({
      where: { id },
      data: {
        alert_severity_lagging: dto.alert_severity_lagging,
        alert_severity_silent: dto.alert_severity_silent,
        description: dto.description,
        display_name: dto.display_name,
        enabled: dto.enabled,
        expected_interval_seconds: dto.expected_interval_seconds,
        lagging_threshold_seconds: dto.lagging_threshold_seconds,
        query_kind: dto.query_kind,
        query_params: dto.query_params as Prisma.InputJsonValue | undefined,
        related_component: dto.related_component,
        silent_threshold_seconds: dto.silent_threshold_seconds,
        stale_threshold_seconds: dto.stale_threshold_seconds,
      },
      include: { status: true },
    });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'evidence_pipeline_updated',
        payload: { before: existing, after: updated },
        target_resource_id: id,
        target_resource_type: 'evidence_pipeline',
      });
    }
    return updated;
  }

  async remove(id: string, audit?: PlatformAuditContext): Promise<void> {
    const existing = await this.prisma.platformEvidencePipeline.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'EVIDENCE_PIPELINE_NOT_FOUND',
        message: `Evidence pipeline "${id}" not found.`,
      });
    }
    if (existing.is_seeded) {
      throw new ConflictException({
        code: 'SEEDED_PIPELINE_UNDELETABLE',
        message: 'Seeded evidence pipelines cannot be deleted.',
      });
    }
    await this.prisma.platformEvidencePipeline.delete({ where: { id } });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'evidence_pipeline_deleted',
        payload: { before: existing },
        target_resource_id: id,
        target_resource_type: 'evidence_pipeline',
      });
    }
  }

  async checkAll(): Promise<void> {
    const pipelines = await this.prisma.platformEvidencePipeline.findMany({
      where: { enabled: true },
      include: { status: true },
    });

    for (const pipeline of pipelines) {
      await this.checkPipeline(pipeline);
    }
  }

  async checkOne(
    pipelineKey: string,
    opts?: { audit?: PlatformAuditContext; triggered_by_user_id?: string },
  ): Promise<PlatformEvidencePipelineStatus> {
    const pipeline = await this.prisma.platformEvidencePipeline.findUnique({
      where: { key: pipelineKey },
      include: { status: true },
    });
    if (!pipeline) {
      throw new NotFoundException({
        code: 'EVIDENCE_PIPELINE_NOT_FOUND',
        message: `Evidence pipeline "${pipelineKey}" not found.`,
      });
    }
    const status = await this.checkPipeline(pipeline);
    if (opts?.audit) {
      await this.audit.log({
        ...opts.audit,
        action: 'evidence_pipeline_check_run_now',
        payload: { after: status },
        target_resource_id: pipeline.id,
        target_resource_type: 'evidence_pipeline',
      });
    }
    return status;
  }

  async getCurrentStatusMap(): Promise<Map<string, EvidencePipelineStatus>> {
    const rows = await this.prisma.platformEvidencePipeline.findMany({
      include: { status: true },
      where: { enabled: true },
    });
    return new Map(rows.map((row) => [row.key, row.status?.status ?? 'unknown']));
  }

  async freshnessSummary(): Promise<{
    overall_status: FreshnessSummaryStatus;
    pipelines: Array<{
      key: string;
      display_name: string;
      status: EvidencePipelineStatus;
      lag_seconds: number | null;
      last_seen_at: Date | null;
    }>;
  }> {
    const rows = await this.prisma.platformEvidencePipeline.findMany({
      include: { status: true },
      where: { enabled: true },
      orderBy: { key: 'asc' },
    });
    const pipelines = rows.map((row) => ({
      display_name: row.display_name,
      key: row.key,
      lag_seconds: row.status?.lag_seconds ?? null,
      last_seen_at: row.status?.last_seen_at ?? null,
      status: row.status?.status ?? 'unknown',
    }));
    return { overall_status: summarize(pipelines.map((row) => row.status)), pipelines };
  }

  async emitMetaFailure(error: unknown): Promise<void> {
    const rule = await this.ensureRule({
      metric: 'evidence.freshness.task_failed',
      name: 'Evidence freshness scheduled task failed',
      severity: 'critical',
    });
    const message =
      error instanceof Error
        ? `[CRITICAL] Evidence freshness scheduled task failed: ${error.message}`
        : '[CRITICAL] Evidence freshness scheduled task failed.';
    const alert = await this.prisma.platformAlertHistory.create({
      data: {
        channels_notified: [],
        message,
        metric_value: new Prisma.Decimal(1),
        rule_id: rule.id,
        severity: 'critical',
        status: 'fired',
      },
    });
    await this.alertRouting.dispatchInitial(alert.id);
    await this.redisPubSub.publish('platform:alerts', {
      alert_id: alert.id,
      fired_at: alert.fired_at.toISOString(),
      message,
      metric_value: 1,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: 'critical',
      type: 'alert_fired',
    });
  }

  private async checkPipeline(
    pipeline: PlatformEvidencePipeline & { status: PlatformEvidencePipelineStatus | null },
  ): Promise<PlatformEvidencePipelineStatus> {
    const now = new Date();
    const lastSeenAt = await this.queryHandlers.lastSeenFor(
      pipeline.query_kind,
      pipeline.query_params as Record<string, unknown>,
    );
    const lagSeconds = lastSeenAt
      ? Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000))
      : null;
    const nextStatus = this.computeStatus(pipeline, lastSeenAt, lagSeconds);
    const previousStatus = pipeline.status?.status ?? 'unknown';
    const changed = previousStatus !== nextStatus;
    const breachCount =
      nextStatus === 'fresh' || nextStatus === 'unknown'
        ? 0
        : (pipeline.status?.breach_count ?? 0) + 1;

    const saved = await this.prisma.platformEvidencePipelineStatus.upsert({
      where: { pipeline_id: pipeline.id },
      update: {
        breach_count: breachCount,
        lag_seconds: lagSeconds,
        last_check_at: now,
        last_seen_at: lastSeenAt,
        last_status_change_at: changed ? now : pipeline.status?.last_status_change_at,
        status: nextStatus,
      },
      create: {
        breach_count: breachCount,
        lag_seconds: lagSeconds,
        last_check_at: now,
        last_seen_at: lastSeenAt,
        last_status_change_at: now,
        pipeline_id: pipeline.id,
        status: nextStatus,
      },
    });

    if (shouldEmitTransition(previousStatus, nextStatus)) {
      await this.emitTransitionAlert(pipeline, previousStatus, nextStatus, lagSeconds ?? 0, now);
    }

    return saved;
  }

  private computeStatus(
    pipeline: PlatformEvidencePipeline,
    lastSeenAt: Date | null,
    lagSeconds: number | null,
  ): EvidencePipelineStatus {
    if (!lastSeenAt || lagSeconds === null) {
      return emptyTableStatus(pipeline.query_params as Record<string, unknown>);
    }
    if (lagSeconds <= pipeline.lagging_threshold_seconds) return 'fresh';
    if (lagSeconds <= pipeline.stale_threshold_seconds) return 'lagging';
    if (lagSeconds <= pipeline.silent_threshold_seconds) return 'stale';
    return 'silent';
  }

  private async emitTransitionAlert(
    pipeline: PlatformEvidencePipeline,
    from: EvidencePipelineStatus,
    to: EvidencePipelineStatus,
    lagSeconds: number,
    now: Date,
  ): Promise<void> {
    if (from === to || to === 'unknown') return;
    const severity = transitionSeverity(pipeline, to);
    const rule = await this.ensureRule({
      metric: `evidence.pipeline.${to}:${pipeline.key}`,
      name: `Evidence pipeline ${pipeline.display_name} ${to}`,
      severity,
    });
    const message = `[${severity.toUpperCase()}] Evidence pipeline ${pipeline.display_name} transitioned ${from} -> ${to}; lag ${lagSeconds}s.`;
    const activeWindow =
      severity !== 'critical' && to !== 'silent'
        ? await this.findActiveMaintenanceWindow(now)
        : null;

    if (activeWindow) {
      const alert = await this.prisma.platformAlertHistory.create({
        data: {
          channels_notified: [],
          message,
          metric_value: new Prisma.Decimal(lagSeconds),
          resolved_at: now,
          rule_id: rule.id,
          severity,
          status: 'resolved',
          suppressed_by_maintenance_window_id: activeWindow.id,
        },
      });
      await this.redisPubSub.publish('platform:alerts', {
        alert_id: alert.id,
        fired_at: alert.fired_at.toISOString(),
        rule_id: rule.id,
        rule_name: rule.name,
        severity,
        suppressed_by_maintenance_window_id: activeWindow.id,
        type: 'alert_suppressed',
      });
      return;
    }

    const alert = await this.prisma.platformAlertHistory.create({
      data: {
        channels_notified: [],
        message,
        metric_value: new Prisma.Decimal(lagSeconds),
        rule_id: rule.id,
        severity,
        status: to === 'fresh' ? 'resolved' : 'fired',
        resolved_at: to === 'fresh' ? now : undefined,
      },
    });
    if (to !== 'fresh') {
      await this.alertRouting.dispatchInitial(alert.id);
    }
    await this.redisPubSub.publish('platform:alerts', {
      alert_id: alert.id,
      fired_at: alert.fired_at.toISOString(),
      message,
      metric_value: lagSeconds,
      rule_id: rule.id,
      rule_name: rule.name,
      severity,
      type: to === 'fresh' ? 'alert_resolved' : 'alert_fired',
    });
  }

  private async ensureRule(input: {
    metric: string;
    name: string;
    severity: PlatformAlertSeverity;
  }) {
    const existing = await this.prisma.platformAlertRule.findFirst({
      where: { metric: input.metric },
    });
    if (existing) return existing;
    return this.prisma.platformAlertRule.create({
      data: {
        condition_config: { operator: 'gte', threshold: 1 },
        cooldown_minutes: 15,
        is_enabled: true,
        is_security_critical: input.severity === 'critical',
        metric: input.metric,
        name: input.name,
        notify_emails: [],
        severity: input.severity,
      },
    });
  }

  private async findActiveMaintenanceWindow(now: Date) {
    try {
      return await this.prisma.platformMaintenanceWindow.findFirst({
        orderBy: { ends_at: 'asc' },
        where: {
          cancelled_at: null,
          ends_at: { gt: now },
          starts_at: { lte: now },
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        'Failed to check active platform maintenance windows',
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }
}

function emptyTableStatus(_params: Record<string, unknown>): EvidencePipelineStatus {
  return 'unknown';
}

function transitionSeverity(
  pipeline: PlatformEvidencePipeline,
  status: EvidencePipelineStatus,
): PlatformAlertSeverity {
  if (status === 'silent') return pipeline.alert_severity_silent as PlatformAlertSeverity;
  if (status === 'fresh') return 'info';
  return pipeline.alert_severity_lagging as PlatformAlertSeverity;
}

function summarize(statuses: EvidencePipelineStatus[]): FreshnessSummaryStatus {
  if (statuses.includes('silent')) return 'some_silent';
  if (statuses.includes('stale')) return 'some_stale';
  if (statuses.includes('lagging')) return 'some_lagging';
  return 'all_fresh';
}

function shouldEmitTransition(
  previousStatus: EvidencePipelineStatus,
  nextStatus: EvidencePipelineStatus,
): boolean {
  if (previousStatus === nextStatus) return false;
  if (nextStatus === 'unknown') return false;
  return previousStatus !== 'unknown' || nextStatus !== 'fresh';
}
