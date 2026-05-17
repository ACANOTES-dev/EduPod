import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type PlatformAlertSeverity,
  type PlatformBackupRun,
  type PlatformOffsiteReplication,
  type PlatformRestoreDrill,
} from '@prisma/client';

import type {
  BackupReadinessListQuery,
  BackupReplicationListQuery,
  CaptureBackupEventDto,
  CreateRestoreDrillDto,
  RestoreDrillListQuery,
  UpdateRestoreDrillDto,
} from '@school/shared';

import { AlertRoutingService } from '../platform/alert-routing.service';
import { RedisPubSubService } from '../platform/redis-pubsub.service';
import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { deriveBackupKey } from './backup-key';

export type BackupReadinessStatus = 'green' | 'amber' | 'red';

export interface BackupReadinessSummary {
  last_successful_backup: BackupRunSummary | null;
  last_offsite_replication: ReplicationSummary | null;
  restore_point_age_seconds: number | null;
  last_restore_drill: RestoreDrillSummary | null;
  overall_status: BackupReadinessStatus;
  reasons: string[];
  computed_at: string;
}

interface BackupRunSummary {
  age_seconds: number;
  finished_at: string;
  id: string;
  integrity_check_passed: boolean | null;
  kind: string;
  size_bytes: string | null;
}

interface ReplicationSummary {
  age_seconds: number;
  id: string;
  lag_seconds: number;
  replicated_at: string;
  replication_target: string;
}

interface RestoreDrillSummary {
  age_seconds: number;
  drill_at: string;
  id: string;
  outcome: string;
}

type ReadinessSignal = {
  metric: string;
  name: string;
  severity: PlatformAlertSeverity;
  value: number;
  message: string;
  suppressible: boolean;
};

const READINESS_COMPUTED_REDIS_KEY = 'platform:resilience:backup-readiness:last_computed_at';
const BACKUP_SIGNAL_STATE_PREFIX = 'platform:resilience:backup-readiness:signal:';
const BACKUP_SIGNAL_METRICS = [
  'backups.freshness.amber',
  'backups.freshness.red',
  'backups.replication.amber',
  'backups.replication.red',
  'backups.restore_drill.amber',
  'backups.restore_drill.red',
  'backups.restore_drill.outcome_failed_blocking',
  'backups.restore_drill.outcome_failed_recoverable',
  'backups.integrity.failed',
] as const;

const DEFAULT_THRESHOLDS = {
  backupAmberSeconds: 25 * 60 * 60,
  backupRedSeconds: 36 * 60 * 60,
  drillAmberSeconds: 90 * 24 * 60 * 60,
  drillRedSeconds: 180 * 24 * 60 * 60,
  integrityAmberSeconds: 60 * 60,
  integrityRedSeconds: 24 * 60 * 60,
  replicationAmberSeconds: 6 * 60 * 60,
  replicationRedSeconds: 24 * 60 * 60,
};

@Injectable()
export class BackupReadinessService {
  private readonly logger = new Logger(BackupReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: PlatformAuditService,
    private readonly redis: RedisService,
    private readonly redisPubSub: RedisPubSubService,
    private readonly alertRouting: AlertRoutingService,
  ) {}

  verifyInternalToken(token: string | undefined): boolean {
    const expected =
      this.config.get<string>('BACKUP_EVENT_INTERNAL_TOKEN') ??
      this.config.get<string>('DEPLOY_EVENT_INTERNAL_TOKEN') ??
      this.config.get<string>('JWT_SECRET');
    return Boolean(expected && token && token === expected);
  }

  async capture(
    dto: CaptureBackupEventDto,
  ): Promise<{ id: string; backup_key: string; created: boolean }> {
    const backupKey =
      dto.backup_key ??
      deriveBackupKey({
        finished_at: dto.finished_at,
        location: dto.location,
        size_bytes: dto.size_bytes ?? null,
        started_at: dto.started_at,
        storage_kind: dto.storage_kind,
      });
    const existing = await this.prisma.platformBackupRun.findUnique({
      where: { backup_key: backupKey },
    });
    const saved = await this.prisma.platformBackupRun.upsert({
      where: { backup_key: backupKey },
      create: {
        backup_key: backupKey,
        deploy_event_id: dto.deploy_event_id ?? null,
        duration_seconds: dto.duration_seconds,
        failure_reason: dto.failure_reason ?? null,
        finished_at: dto.finished_at,
        integrity_check_at: dto.integrity_check_at ?? null,
        integrity_check_detail: toJsonOrPrismaNull(dto.integrity_check_detail),
        integrity_check_passed: dto.integrity_check_passed ?? null,
        kind: dto.kind,
        location: dto.location,
        size_bytes: toBigIntOrNull(dto.size_bytes),
        started_at: dto.started_at,
        status: dto.status,
        storage_kind: dto.storage_kind,
        trigger_source: dto.trigger_source,
        triggered_by_user_id: dto.triggered_by_user_id ?? null,
      },
      update: {
        deploy_event_id: dto.deploy_event_id ?? undefined,
        duration_seconds: dto.duration_seconds,
        failure_reason: dto.failure_reason ?? undefined,
        finished_at: dto.finished_at,
        integrity_check_at: dto.integrity_check_at ?? undefined,
        integrity_check_detail: toJsonOrUndefined(dto.integrity_check_detail),
        integrity_check_passed: dto.integrity_check_passed ?? undefined,
        size_bytes: toBigIntOrUndefined(dto.size_bytes),
        status: dto.status,
      },
    });
    await this.auditCapture(saved, existing);
    return { backup_key: backupKey, created: !existing, id: saved.id };
  }

  async getReadinessSummary(now = new Date()): Promise<BackupReadinessSummary> {
    const [lastSuccessfulBackup, lastRun, lastReplication, lastDrill] = await Promise.all([
      this.prisma.platformBackupRun.findFirst({
        where: { finished_at: { not: null }, status: 'succeeded' },
        orderBy: { finished_at: 'desc' },
      }),
      this.prisma.platformBackupRun.findFirst({ orderBy: { started_at: 'desc' } }),
      this.prisma.platformOffsiteReplication.findFirst({ orderBy: { replicated_at: 'desc' } }),
      this.prisma.platformRestoreDrill.findFirst({ orderBy: { drill_at: 'desc' } }),
    ]);
    const reasons = this.reasonsFor({
      lastDrill,
      lastReplication,
      lastRun,
      lastSuccessfulBackup,
      now,
    });
    const overallStatus = reasons.some((reason) => reason.startsWith('[red]'))
      ? 'red'
      : reasons.some((reason) => reason.startsWith('[amber]'))
        ? 'amber'
        : 'green';
    const restoreAnchor = newestDate(
      lastSuccessfulBackup?.finished_at ?? null,
      lastReplication?.replicated_at ?? null,
    );
    return {
      computed_at: now.toISOString(),
      last_offsite_replication: lastReplication
        ? {
            age_seconds: ageSeconds(lastReplication.replicated_at, now),
            id: lastReplication.id,
            lag_seconds: lastReplication.lag_seconds ?? 0,
            replicated_at: lastReplication.replicated_at.toISOString(),
            replication_target: lastReplication.replication_target,
          }
        : null,
      last_restore_drill: lastDrill
        ? {
            age_seconds: ageSeconds(lastDrill.drill_at, now),
            drill_at: lastDrill.drill_at.toISOString(),
            id: lastDrill.id,
            outcome: lastDrill.outcome,
          }
        : null,
      last_successful_backup:
        lastSuccessfulBackup && lastSuccessfulBackup.finished_at
          ? {
              age_seconds: ageSeconds(lastSuccessfulBackup.finished_at, now),
              finished_at: lastSuccessfulBackup.finished_at.toISOString(),
              id: lastSuccessfulBackup.id,
              integrity_check_passed: lastSuccessfulBackup.integrity_check_passed,
              kind: lastSuccessfulBackup.kind,
              size_bytes: lastSuccessfulBackup.size_bytes?.toString() ?? null,
            }
          : null,
      overall_status: overallStatus,
      reasons: reasons.map((reason) => reason.replace(/^\[(amber|red)\]\s*/, '')),
      restore_point_age_seconds: restoreAnchor ? ageSeconds(restoreAnchor, now) : null,
    };
  }

  async checkAndAlert(now = new Date()): Promise<BackupReadinessSummary> {
    const summary = await this.getReadinessSummary(now);
    const signals = this.signalsForSummary(summary, now);
    for (const signal of signals) {
      await this.emitSignalOnTransition(signal, now);
    }
    await this.clearRecoveredSignals(signals);
    await this.redis.getClient().set(READINESS_COMPUTED_REDIS_KEY, now.toISOString());
    await this.redisPubSub.publish('platform:resilience', {
      computed_at: summary.computed_at,
      overall_status: summary.overall_status,
      type: 'backup_readiness_computed',
    });
    return summary;
  }

  async listRuns(query: BackupReadinessListQuery) {
    const where: Prisma.PlatformBackupRunWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.status) where.status = query.status;
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformBackupRun.findMany({
        where,
        orderBy: [{ status: 'asc' }, { finished_at: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.platformBackupRun.count({ where }),
    ]);
    return {
      data: data.map(serializeBackupRun),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getRun(id: string) {
    const row = await this.prisma.platformBackupRun.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: 'BACKUP_RUN_NOT_FOUND',
        message: `Backup run "${id}" not found.`,
      });
    }
    return serializeBackupRun(row);
  }

  async listReplications(query: BackupReplicationListQuery) {
    const where: Prisma.PlatformOffsiteReplicationWhereInput = {};
    if (query.replication_target) where.replication_target = query.replication_target;
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformOffsiteReplication.findMany({
        where,
        orderBy: { replicated_at: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.platformOffsiteReplication.count({ where }),
    ]);
    return {
      data: data.map(serializeReplication),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async listRestoreDrills(query: RestoreDrillListQuery) {
    const where: Prisma.PlatformRestoreDrillWhereInput = {};
    if (query.outcome) where.outcome = query.outcome;
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformRestoreDrill.findMany({
        where,
        orderBy: { drill_at: 'desc' },
        skip,
        take: query.pageSize,
        include: { performed_by: { select: { email: true, first_name: true, last_name: true } } },
      }),
      this.prisma.platformRestoreDrill.count({ where }),
    ]);
    return {
      data: data.map((row) => ({ ...serializeRestoreDrill(row), performed_by: row.performed_by })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async createRestoreDrill(
    dto: CreateRestoreDrillDto,
    performedByUserId: string,
    audit: PlatformAuditContext,
  ) {
    const created = await this.prisma.platformRestoreDrill.create({
      data: {
        drill_at: dto.drill_at,
        duration_seconds: dto.duration_seconds,
        evidence_url: dto.evidence_url,
        follow_ups: dto.follow_ups ? toJson(dto.follow_ups) : undefined,
        notes: dto.notes,
        outcome: dto.outcome,
        performed_by_user_id: performedByUserId,
        restore_point: dto.restore_point,
        rpo_observed_seconds: dto.rpo_observed_seconds,
        rto_observed_seconds: dto.rto_observed_seconds,
      },
    });
    await this.audit.log({
      ...audit,
      action: 'backup_restore_drill_recorded',
      payload: { after: serializeRestoreDrill(created) },
      target_resource_id: created.id,
      target_resource_type: 'restore_drill',
    });
    return serializeRestoreDrill(created);
  }

  async updateRestoreDrill(
    id: string,
    dto: UpdateRestoreDrillDto,
    audit: PlatformAuditContext,
    ownerConfirmationId?: string,
  ) {
    const existing = await this.prisma.platformRestoreDrill.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'RESTORE_DRILL_NOT_FOUND',
        message: `Restore drill "${id}" not found.`,
      });
    }
    if (isDestructiveDrillUpdate(dto)) {
      await this.assertOwnerConfirmation({
        action: 'backup_restore_drill_updated',
        id: ownerConfirmationId,
        targetResourceId: id,
        message: 'Changing restore point, outcome, or drill time requires owner confirmation.',
      });
    }
    const updated = await this.prisma.platformRestoreDrill.update({
      where: { id },
      data: {
        drill_at: dto.drill_at,
        duration_seconds: dto.duration_seconds,
        evidence_url: dto.evidence_url,
        follow_ups: dto.follow_ups ? toJson(dto.follow_ups) : undefined,
        notes: dto.notes,
        outcome: dto.outcome,
        restore_point: dto.restore_point,
        rpo_observed_seconds: dto.rpo_observed_seconds,
        rto_observed_seconds: dto.rto_observed_seconds,
      },
    });
    await this.audit.log({
      ...audit,
      action: 'backup_restore_drill_updated',
      payload: { before: serializeRestoreDrill(existing), after: serializeRestoreDrill(updated) },
      target_resource_id: id,
      target_resource_type: 'restore_drill',
    });
    return serializeRestoreDrill(updated);
  }

  async deleteRestoreDrillWithConfirmation(
    id: string,
    ownerConfirmationId: string | undefined,
    audit: PlatformAuditContext,
  ): Promise<void> {
    await this.assertOwnerConfirmation({
      action: 'backup_restore_drill_deleted',
      id: ownerConfirmationId,
      targetResourceId: id,
      message: 'Deleting a restore drill requires owner confirmation.',
    });
    const existing = await this.prisma.platformRestoreDrill.findUnique({ where: { id } });
    if (!existing) return;
    await this.prisma.platformRestoreDrill.delete({ where: { id } });
    await this.audit.log({
      ...audit,
      action: 'backup_restore_drill_deleted',
      payload: {
        before: serializeRestoreDrill(existing),
        extra: { owner_confirmation_id: ownerConfirmationId },
      },
      target_resource_id: id,
      target_resource_type: 'restore_drill',
    });
  }

  private async assertOwnerConfirmation(input: {
    action: 'backup_restore_drill_deleted' | 'backup_restore_drill_updated';
    id: string | undefined;
    message: string;
    targetResourceId: string;
  }): Promise<void> {
    if (!input.id) {
      throw new UnauthorizedException({
        code: 'OWNER_CONFIRMATION_REQUIRED',
        message: input.message,
      });
    }
    const confirmation = await this.prisma.platformOwnerActionConfirmation.findUnique({
      where: { id: input.id },
    });
    if (
      !confirmation ||
      confirmation.action !== input.action ||
      confirmation.target_resource_id !== input.targetResourceId ||
      confirmation.execution_status !== 'executed'
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_OWNER_CONFIRMATION',
        message: 'Owner confirmation does not match this restore drill deletion.',
      });
    }
  }

  async latestReadinessComputedAt(): Promise<Date | null> {
    const raw = await this.redis.getClient().get(READINESS_COMPUTED_REDIS_KEY);
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private reasonsFor(input: {
    lastDrill: PlatformRestoreDrill | null;
    lastReplication: PlatformOffsiteReplication | null;
    lastRun: PlatformBackupRun | null;
    lastSuccessfulBackup: PlatformBackupRun | null;
    now: Date;
  }): string[] {
    const thresholds = this.thresholds();
    const reasons: string[] = [];
    if (!input.lastSuccessfulBackup?.finished_at) {
      reasons.push('[red] No successful backup has been captured.');
    } else {
      const backupAge = ageSeconds(input.lastSuccessfulBackup.finished_at, input.now);
      if (backupAge > thresholds.backupRedSeconds)
        reasons.push(`[red] Last backup is ${backupAge}s old.`);
      else if (backupAge > thresholds.backupAmberSeconds)
        reasons.push(`[amber] Last backup is ${backupAge}s old.`);
      if (input.lastSuccessfulBackup.integrity_check_passed === false) {
        reasons.push('[red] Latest successful backup failed its integrity check.');
      } else if (input.lastSuccessfulBackup.integrity_check_passed === null) {
        const finishedAge = ageSeconds(input.lastSuccessfulBackup.finished_at, input.now);
        if (finishedAge > thresholds.integrityRedSeconds)
          reasons.push('[red] Latest backup is missing integrity verification.');
        else if (finishedAge > thresholds.integrityAmberSeconds)
          reasons.push('[amber] Latest backup is awaiting integrity verification.');
      }
    }
    if (input.lastRun?.status === 'failed') {
      reasons.push('[red] Most recent backup run failed.');
    }
    if (!input.lastReplication) {
      reasons.push('[red] No off-site replication metadata has been captured.');
    } else {
      const lag =
        input.lastReplication.lag_seconds ??
        ageSeconds(input.lastReplication.replicated_at, input.now);
      if (lag > thresholds.replicationRedSeconds)
        reasons.push(`[red] Off-site replication lag is ${lag}s.`);
      else if (lag > thresholds.replicationAmberSeconds)
        reasons.push(`[amber] Off-site replication lag is ${lag}s.`);
    }
    if (!input.lastDrill) {
      reasons.push('[red] No restore drill has been recorded.');
    } else {
      const drillAge = ageSeconds(input.lastDrill.drill_at, input.now);
      if (drillAge > thresholds.drillRedSeconds)
        reasons.push(`[red] Last restore drill is ${drillAge}s old.`);
      else if (drillAge > thresholds.drillAmberSeconds)
        reasons.push(`[amber] Last restore drill is ${drillAge}s old.`);
      if (input.lastDrill.outcome === 'failed_blocking')
        reasons.push('[red] Last restore drill had a blocking failure.');
      if (input.lastDrill.outcome === 'failed_recoverable')
        reasons.push('[amber] Last restore drill had a recoverable failure.');
      if (input.lastDrill.outcome === 'inconclusive')
        reasons.push('[amber] Last restore drill was inconclusive.');
    }
    return reasons;
  }

  private signalsForSummary(summary: BackupReadinessSummary, now: Date): ReadinessSignal[] {
    const thresholds = this.thresholds();
    const signals: ReadinessSignal[] = [];
    const backupAge =
      summary.last_successful_backup?.age_seconds ?? thresholds.backupRedSeconds + 1;
    pushThresholdSignal(signals, {
      amber: thresholds.backupAmberSeconds,
      criticalMessage: `Last successful backup is ${backupAge}s old.`,
      criticalMetric: 'backups.freshness.red',
      metricValue: backupAge,
      name: 'Backup freshness SLO breach',
      red: thresholds.backupRedSeconds,
      suppressible: false,
      warningMessage: `Last successful backup is ${backupAge}s old.`,
      warningMetric: 'backups.freshness.amber',
    });
    const lag =
      summary.last_offsite_replication?.lag_seconds ?? thresholds.replicationRedSeconds + 1;
    pushThresholdSignal(signals, {
      amber: thresholds.replicationAmberSeconds,
      criticalMessage: `Off-site replication lag is ${lag}s.`,
      criticalMetric: 'backups.replication.red',
      metricValue: lag,
      name: 'Backup replication lag SLO breach',
      red: thresholds.replicationRedSeconds,
      suppressible: false,
      warningMessage: `Off-site replication lag is ${lag}s.`,
      warningMetric: 'backups.replication.amber',
    });
    const drillAge = summary.last_restore_drill?.age_seconds ?? thresholds.drillRedSeconds + 1;
    pushThresholdSignal(signals, {
      amber: thresholds.drillAmberSeconds,
      criticalMessage: `Last restore drill is ${drillAge}s old.`,
      criticalMetric: 'backups.restore_drill.red',
      metricValue: drillAge,
      name: 'Restore drill age SLO breach',
      red: thresholds.drillRedSeconds,
      suppressible: true,
      warningMessage: `Last restore drill is ${drillAge}s old.`,
      warningMetric: 'backups.restore_drill.amber',
    });
    if (summary.last_restore_drill?.outcome === 'failed_blocking') {
      signals.push({
        message: 'Last restore drill outcome was failed_blocking.',
        metric: 'backups.restore_drill.outcome_failed_blocking',
        name: 'Restore drill blocking failure',
        severity: 'critical',
        suppressible: false,
        value: 1,
      });
    } else if (summary.last_restore_drill?.outcome === 'failed_recoverable') {
      signals.push({
        message: 'Last restore drill outcome was failed_recoverable.',
        metric: 'backups.restore_drill.outcome_failed_recoverable',
        name: 'Restore drill recoverable failure',
        severity: 'warning',
        suppressible: true,
        value: 1,
      });
    }
    if (summary.last_successful_backup?.integrity_check_passed === false) {
      signals.push({
        message: 'Latest successful backup failed integrity verification.',
        metric: 'backups.integrity.failed',
        name: 'Backup integrity verification failed',
        severity: 'critical',
        suppressible: false,
        value: 1,
      });
    }
    void now;
    return signals;
  }

  private async emitSignalOnTransition(signal: ReadinessSignal, now: Date): Promise<void> {
    const stateKey = `${BACKUP_SIGNAL_STATE_PREFIX}${signal.metric}`;
    const nextState = signal.severity;
    const previousState = await this.redis.getClient().get(stateKey);
    if (previousState === nextState) return;
    await this.redis.getClient().set(stateKey, nextState);
    const rule = await this.ensureRule(signal);
    const activeWindow =
      signal.suppressible && signal.severity !== 'critical'
        ? await this.findActiveMaintenanceWindow(now)
        : null;
    const alert = await this.prisma.platformAlertHistory.create({
      data: {
        channels_notified: [],
        message: `[${signal.severity.toUpperCase()}] ${signal.message}`,
        metric_value: new Prisma.Decimal(signal.value),
        resolved_at: activeWindow ? now : undefined,
        rule_id: rule.id,
        severity: signal.severity,
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
      metric_value: signal.value,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: signal.severity,
      suppressed_by_maintenance_window_id: activeWindow?.id,
      type: activeWindow ? 'alert_suppressed' : 'alert_fired',
    });
  }

  private async clearRecoveredSignals(activeSignals: ReadinessSignal[]): Promise<void> {
    const activeMetrics = new Set(activeSignals.map((signal) => signal.metric));
    const staleKeys = BACKUP_SIGNAL_METRICS.filter((metric) => !activeMetrics.has(metric)).map(
      (metric) => `${BACKUP_SIGNAL_STATE_PREFIX}${metric}`,
    );
    if (staleKeys.length === 0) return;
    await this.redis.getClient().del(...staleKeys);
  }

  private async ensureRule(signal: ReadinessSignal) {
    const existing = await this.prisma.platformAlertRule.findFirst({
      where: { metric: signal.metric },
    });
    if (existing) return existing;
    return this.prisma.platformAlertRule.create({
      data: {
        condition_config: { operator: 'gte', threshold: 1 },
        cooldown_minutes: 15,
        is_enabled: true,
        is_security_critical: signal.severity === 'critical',
        metric: signal.metric,
        name: signal.name,
        notify_emails: [],
        severity: signal.severity,
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

  private thresholds() {
    return {
      backupAmberSeconds: envInt(
        this.config,
        'BACKUP_READINESS_BACKUP_AMBER_SECONDS',
        DEFAULT_THRESHOLDS.backupAmberSeconds,
      ),
      backupRedSeconds: envInt(
        this.config,
        'BACKUP_READINESS_BACKUP_RED_SECONDS',
        DEFAULT_THRESHOLDS.backupRedSeconds,
      ),
      drillAmberSeconds: envInt(
        this.config,
        'BACKUP_READINESS_DRILL_AMBER_SECONDS',
        DEFAULT_THRESHOLDS.drillAmberSeconds,
      ),
      drillRedSeconds: envInt(
        this.config,
        'BACKUP_READINESS_DRILL_RED_SECONDS',
        DEFAULT_THRESHOLDS.drillRedSeconds,
      ),
      integrityAmberSeconds: envInt(
        this.config,
        'BACKUP_READINESS_INTEGRITY_AMBER_SECONDS',
        DEFAULT_THRESHOLDS.integrityAmberSeconds,
      ),
      integrityRedSeconds: envInt(
        this.config,
        'BACKUP_READINESS_INTEGRITY_RED_SECONDS',
        DEFAULT_THRESHOLDS.integrityRedSeconds,
      ),
      replicationAmberSeconds: envInt(
        this.config,
        'BACKUP_READINESS_REPLICATION_AMBER_SECONDS',
        DEFAULT_THRESHOLDS.replicationAmberSeconds,
      ),
      replicationRedSeconds: envInt(
        this.config,
        'BACKUP_READINESS_REPLICATION_RED_SECONDS',
        DEFAULT_THRESHOLDS.replicationRedSeconds,
      ),
    };
  }

  private async auditCapture(
    saved: PlatformBackupRun,
    existing: PlatformBackupRun | null,
  ): Promise<void> {
    const actor = await this.prisma.platformUser.findFirst({
      where: { revoked_at: null, roles: { some: { role: { role_key: 'platform_owner' } } } },
      select: { user_id: true },
    });
    if (!actor) {
      this.logger.warn('Backup event captured without platform owner audit actor available.');
      return;
    }
    await this.audit.log({
      action: existing ? 'backup_updated' : 'backup_captured',
      actor_user_id: actor.user_id,
      payload: {
        after: serializeBackupRun(saved),
        before: existing ? serializeBackupRun(existing) : undefined,
      },
      target_resource_id: saved.id,
      target_resource_type: 'backup_run',
    });
  }
}

function pushThresholdSignal(
  signals: ReadinessSignal[],
  input: {
    amber: number;
    criticalMessage: string;
    criticalMetric: string;
    metricValue: number;
    name: string;
    red: number;
    suppressible: boolean;
    warningMessage: string;
    warningMetric: string;
  },
): void {
  if (input.metricValue > input.red) {
    signals.push({
      message: input.criticalMessage,
      metric: input.criticalMetric,
      name: input.name,
      severity: 'critical',
      suppressible: input.suppressible,
      value: input.metricValue,
    });
  } else if (input.metricValue > input.amber) {
    signals.push({
      message: input.warningMessage,
      metric: input.warningMetric,
      name: input.name,
      severity: 'warning',
      suppressible: input.suppressible,
      value: input.metricValue,
    });
  }
}

function ageSeconds(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
}

function newestDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function toBigIntOrNull(value: number | string | undefined): bigint | null {
  if (value === undefined) return null;
  return BigInt(value);
}

function toBigIntOrUndefined(value: number | string | undefined): bigint | undefined {
  if (value === undefined) return undefined;
  return BigInt(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toJsonOrPrismaNull(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return toJson(value);
}

function toJsonOrUndefined(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  return value === null ? Prisma.JsonNull : toJson(value);
}

function serializeBackupRun(row: PlatformBackupRun) {
  return {
    ...row,
    size_bytes: row.size_bytes?.toString() ?? null,
  };
}

function serializeReplication(row: PlatformOffsiteReplication) {
  return {
    ...row,
    size_bytes: row.size_bytes?.toString() ?? null,
  };
}

function serializeRestoreDrill(row: PlatformRestoreDrill) {
  return row;
}

function isDestructiveDrillUpdate(dto: UpdateRestoreDrillDto): boolean {
  return dto.drill_at !== undefined || dto.outcome !== undefined || dto.restore_point !== undefined;
}

function envInt(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
