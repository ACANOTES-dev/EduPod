import { BadRequestException, Injectable } from '@nestjs/common';
import { type EvidencePipelineQueryKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { BackupReadinessService } from './backup-readiness.service';
import { ReadinessScoreService } from './readiness-score.service';

type QueryParams = Record<string, unknown>;

const REDIS_KEY_PREFIX = 'platform:resilience:';

@Injectable()
export class EvidenceQueryHandlersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly backups: BackupReadinessService,
    private readonly readiness: ReadinessScoreService,
  ) {}

  async lastSeenFor(kind: EvidencePipelineQueryKind, params: QueryParams): Promise<Date | null> {
    this.validate(kind, params);
    switch (kind) {
      case 'max_completed_at_health_snapshot':
        return this.latestHealthSnapshot();
      case 'max_seen_redis_queue_heartbeat':
      case 'max_seen_redis_pubsub':
        return this.latestRedisHeartbeat(params);
      case 'max_deployed_at_deploy_event':
        return this.latestDeployEvent();
      case 'max_received_at_sentry_webhook':
        return this.latestSentryWebhook();
      case 'max_indexed_at_runbook_index':
        return this.latestRunbookIndex();
      case 'max_updated_at_topology':
        return this.latestTopologyUpdate();
      case 'max_updated_at_severity_policy':
        return this.latestSeverityPolicyUpdate();
      case 'max_logged_at_error_log':
        return this.latestErrorLog();
      case 'max_ran_at_synthetic_result':
        return this.latestSyntheticResult();
      case 'max_ran_at_route_health_check':
        return this.latestRouteHealthCheck();
      case 'max_occurred_at_table':
        return this.latestWhitelistedTableTimestamp(params);
      case 'max_received_at_backup_capture':
        return this.latestBackupCapture();
      case 'max_computed_at_backup_readiness':
        return this.backups.latestReadinessComputedAt();
      case 'max_snapshot_at_readiness_score':
        return this.readiness.latestSnapshotAt();
    }
  }

  validate(kind: EvidencePipelineQueryKind, params: QueryParams): void {
    if (kind === 'max_seen_redis_queue_heartbeat' || kind === 'max_seen_redis_pubsub') {
      const redisKey = params.redis_key;
      if (typeof redisKey !== 'string' || !redisKey.startsWith(REDIS_KEY_PREFIX)) {
        throw new BadRequestException({
          code: 'INVALID_EVIDENCE_QUERY_PARAMS',
          message: `Query kind "${kind}" requires a redis_key under ${REDIS_KEY_PREFIX}.`,
        });
      }
      return;
    }

    if (kind === 'max_occurred_at_table') {
      this.whitelistedTableColumn(params);
    }
  }

  private async latestHealthSnapshot(): Promise<Date | null> {
    const row = await this.prisma.platformHealthSnapshot.findFirst({
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });
    return row?.created_at ?? null;
  }

  private async latestRedisHeartbeat(params: QueryParams): Promise<Date | null> {
    const redisKey = params.redis_key;
    if (typeof redisKey !== 'string') return null;
    const raw = await this.redis.getClient().get(redisKey);
    return parseHeartbeatDate(raw);
  }

  private async latestDeployEvent(): Promise<Date | null> {
    const row = await this.prisma.platformDeployEvent.findFirst({
      orderBy: { deployed_at: 'desc' },
      select: { deployed_at: true },
    });
    return row?.deployed_at ?? null;
  }

  private async latestSentryWebhook(): Promise<Date | null> {
    const row = await this.prisma.platformSentryWebhookAudit.findFirst({
      orderBy: { received_at: 'desc' },
      select: { received_at: true },
    });
    return row?.received_at ?? null;
  }

  private async latestRunbookIndex(): Promise<Date | null> {
    const row = await this.prisma.platformRunbookIndex.findFirst({
      orderBy: { indexed_at: 'desc' },
      select: { indexed_at: true },
    });
    return row?.indexed_at ?? null;
  }

  private async latestTopologyUpdate(): Promise<Date | null> {
    const row = await this.prisma.platformServiceTopology.findFirst({
      orderBy: { updated_at: 'desc' },
      select: { updated_at: true },
    });
    return row?.updated_at ?? null;
  }

  private async latestSeverityPolicyUpdate(): Promise<Date | null> {
    const row = await this.prisma.platformSeverityPolicy.findFirst({
      orderBy: { updated_at: 'desc' },
      select: { updated_at: true },
    });
    return row?.updated_at ?? null;
  }

  private async latestErrorLog(): Promise<Date | null> {
    const row = await this.prisma.platformErrorLog.findFirst({
      orderBy: { last_seen_at: 'desc' },
      select: { last_seen_at: true },
    });
    return row?.last_seen_at ?? null;
  }

  private async latestSyntheticResult(): Promise<Date | null> {
    const row = await this.prisma.platformSyntheticCheckResult.findFirst({
      orderBy: { ran_at: 'desc' },
      select: { ran_at: true },
    });
    return row?.ran_at ?? null;
  }

  private async latestRouteHealthCheck(): Promise<Date | null> {
    const row = await this.prisma.platformAlertRouteHealthCheck.findFirst({
      orderBy: { ran_at: 'desc' },
      select: { ran_at: true },
    });
    return row?.ran_at ?? null;
  }

  private async latestBackupCapture(): Promise<Date | null> {
    const row = await this.prisma.platformBackupRun.findFirst({
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });
    return row?.created_at ?? null;
  }

  private async latestWhitelistedTableTimestamp(params: QueryParams): Promise<Date | null> {
    const key = this.whitelistedTableColumn(params);
    switch (key) {
      case 'platform_health_snapshots.created_at':
        return this.latestHealthSnapshot();
      case 'platform_deploy_events.deployed_at':
        return this.latestDeployEvent();
      case 'platform_sentry_webhook_audit.received_at':
        return this.latestSentryWebhook();
      case 'platform_runbook_index.indexed_at':
        return this.latestRunbookIndex();
      case 'platform_service_topology.updated_at':
        return this.latestTopologyUpdate();
      case 'platform_severity_policies.updated_at':
        return this.latestSeverityPolicyUpdate();
      case 'platform_error_log.last_seen_at':
        return this.latestErrorLog();
      case 'platform_synthetic_check_results.ran_at':
        return this.latestSyntheticResult();
      case 'platform_alert_route_health_checks.ran_at':
        return this.latestRouteHealthCheck();
    }
  }

  private whitelistedTableColumn(params: QueryParams): WhitelistedTableColumn {
    const table = params.table;
    const column = params.column;
    if (typeof table !== 'string' || typeof column !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_EVIDENCE_QUERY_PARAMS',
        message: 'max_occurred_at_table requires table and column parameters.',
      });
    }

    const key = `${table}.${column}`;
    if (!WHITELISTED_TABLE_COLUMNS.has(key as WhitelistedTableColumn)) {
      throw new BadRequestException({
        code: 'INVALID_EVIDENCE_QUERY_PARAMS',
        message: `Unsupported evidence query template target "${key}".`,
      });
    }
    return key as WhitelistedTableColumn;
  }
}

const WHITELISTED_TABLE_COLUMNS = new Set([
  'platform_health_snapshots.created_at',
  'platform_deploy_events.deployed_at',
  'platform_sentry_webhook_audit.received_at',
  'platform_runbook_index.indexed_at',
  'platform_service_topology.updated_at',
  'platform_severity_policies.updated_at',
  'platform_error_log.last_seen_at',
  'platform_synthetic_check_results.ran_at',
  'platform_alert_route_health_checks.ran_at',
] as const);

type WhitelistedTableColumn =
  typeof WHITELISTED_TABLE_COLUMNS extends Set<infer TValue> ? TValue : never;

function parseHeartbeatDate(raw: string | null): Date | null {
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'ts' in parsed) {
      const ts = (parsed as { ts?: unknown }).ts;
      if (typeof ts === 'number' && Number.isFinite(ts)) {
        return new Date(ts);
      }
      if (typeof ts === 'string') {
        const date = new Date(ts);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }
  } catch {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}
