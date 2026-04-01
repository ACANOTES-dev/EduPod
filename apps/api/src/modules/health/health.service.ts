import * as os from 'os';

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Client } from 'pg';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MeilisearchClient } from '../search/meilisearch.client';

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus = 'up' | 'down';
type MonitorStatus = ServiceStatus | 'not_configured';
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
type QueueName = 'notifications' | 'behaviour' | 'finance' | 'payroll' | 'pastoral';
type QueueHealthMap = Record<QueueName, QueueHealthMetrics>;
type QueueAlertThreshold = { waiting: number; delayed: number; failed: number };
type DeliveryProviderKey = 'resend_email' | 'twilio_sms' | 'twilio_whatsapp';
type PgbouncerRow = Record<string, unknown>;

interface DependencyCheck {
  status: ServiceStatus;
  latency_ms: number;
}

interface BullMQCheck {
  status: ServiceStatus;
  stuck_jobs: number;
  alerts: string[];
  queues: QueueHealthMap;
}

interface DiskCheck {
  status: ServiceStatus;
  free_gb: number;
  total_gb: number;
}

interface QueueHealthMetrics {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  stuck_jobs: number;
}

interface PgbouncerCheck {
  status: MonitorStatus;
  latency_ms: number;
  active_client_connections: number | null;
  waiting_client_connections: number | null;
  max_client_connections: number | null;
  utilization_percent: number | null;
  alert: string | null;
}

interface RedisMemoryCheck {
  status: MonitorStatus;
  used_memory_bytes: number | null;
  maxmemory_bytes: number | null;
  utilization_percent: number | null;
  alert: string | null;
}

interface WorkerCheck {
  status: ServiceStatus;
  latency_ms: number;
  url: string;
}

interface DeliveryProviderCheck {
  status: 'configured' | 'not_configured';
  details: string;
}

type DeliveryProviderMap = Record<DeliveryProviderKey, DeliveryProviderCheck>;

export interface FullHealthResult {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  checks: {
    postgresql: DependencyCheck;
    redis: DependencyCheck;
    meilisearch: DependencyCheck;
    bullmq: BullMQCheck;
    disk: DiskCheck;
    pgbouncer: PgbouncerCheck;
    redis_memory: RedisMemoryCheck;
  };
}

export interface AdminHealthResult {
  status: HealthStatus;
  timestamp: string;
  alerts: string[];
  api: FullHealthResult;
  worker: WorkerCheck;
  delivery_providers: DeliveryProviderMap;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Jobs active longer than this are considered stuck (5 minutes). */
const STUCK_JOB_THRESHOLD_MS = 5 * 60 * 1000;
const PGBOUNCER_UTILIZATION_ALERT_THRESHOLD = 80;
const REDIS_MAXMEMORY_ALERT_THRESHOLD = 80;
const DEFAULT_WORKER_HEALTH_URL = 'http://127.0.0.1:5556/health';

const QUEUE_ALERT_THRESHOLDS: Record<QueueName, QueueAlertThreshold> = {
  behaviour: { waiting: 50, delayed: 25, failed: 5 },
  finance: { waiting: 25, delayed: 25, failed: 5 },
  notifications: { waiting: 250, delayed: 100, failed: 10 },
  pastoral: { waiting: 50, delayed: 25, failed: 5 },
  payroll: { waiting: 10, delayed: 10, failed: 2 },
};

function buildEmptyQueueHealthMetrics(): QueueHealthMetrics {
  return {
    waiting: 0,
    active: 0,
    delayed: 0,
    failed: 0,
    stuck_jobs: 0,
  };
}

function buildEmptyQueueHealthMap(): QueueHealthMap {
  return {
    notifications: buildEmptyQueueHealthMetrics(),
    behaviour: buildEmptyQueueHealthMetrics(),
    finance: buildEmptyQueueHealthMetrics(),
    payroll: buildEmptyQueueHealthMetrics(),
    pastoral: buildEmptyQueueHealthMetrics(),
  };
}

function buildNotConfiguredPgbouncerCheck(): PgbouncerCheck {
  return {
    status: 'not_configured',
    latency_ms: 0,
    active_client_connections: null,
    waiting_client_connections: null,
    max_client_connections: null,
    utilization_percent: null,
    alert: null,
  };
}

function buildDownPgbouncerCheck(latencyMs: number): PgbouncerCheck {
  return {
    status: 'down',
    latency_ms: latencyMs,
    active_client_connections: null,
    waiting_client_connections: null,
    max_client_connections: null,
    utilization_percent: null,
    alert: 'pgbouncer:down',
  };
}

function buildDownRedisMemoryCheck(): RedisMemoryCheck {
  return {
    status: 'down',
    used_memory_bytes: null,
    maxmemory_bytes: null,
    utilization_percent: null,
    alert: null,
  };
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed > 0 ? parsed : null;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function readPgbouncerValue(row: PgbouncerRow, key: string): unknown {
  return row[key];
}

function sumPgbouncerMetric(rows: PgbouncerRow[], key: string): number {
  return rows.reduce((sum, row) => sum + toNumber(readPgbouncerValue(row, key)), 0);
}

function buildDeliveryProviderCheck(configured: boolean, details: string): DeliveryProviderCheck {
  return {
    status: configured ? 'configured' : 'not_configured',
    details,
  };
}

// ─── Disk stats (Node 19+) ────────────────────────────────────────────────────

interface StatfsResult {
  bsize: number;
  blocks: number;
  bfree: number;
}

/**
 * Attempts to call os.statfsSync, which was added in Node 19.
 * Returns null on older runtimes or unsupported platforms so that callers
 * can degrade gracefully without throwing.
 */
function tryStatfsSync(path: string): StatfsResult | null {
  // Cast os to an open record so we can access the non-standard method
  // without violating strict no-any rules — this is the sole cast needed.
  const statfsSync = (os as unknown as Record<string, unknown>)['statfsSync'] as
    | ((p: string) => StatfsResult)
    | undefined;
  if (typeof statfsSync !== 'function') return null;
  try {
    return statfsSync(path);
  } catch {
    return null;
  }
}

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly meilisearch: MeilisearchClient,
    private readonly configService: ConfigService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('behaviour') private readonly behaviourQueue: Queue,
    @InjectQueue('finance') private readonly financeQueue: Queue,
    @InjectQueue('payroll') private readonly payrollQueue: Queue,
    @InjectQueue('pastoral') private readonly pastoralQueue: Queue,
  ) {}

  // ─── Public Methods ─────────────────────────────────────────────────────────

  async check(): Promise<FullHealthResult> {
    return this.buildFullResult();
  }

  async getReadiness(): Promise<FullHealthResult> {
    return this.buildFullResult();
  }

  async getAdminDashboard(): Promise<AdminHealthResult> {
    const api = await this.buildFullResult();
    const worker = await this.checkWorker();
    const deliveryProviders = this.buildDeliveryProviders();
    const alerts = [
      ...api.checks.bullmq.alerts,
      ...(api.checks.pgbouncer.alert ? [api.checks.pgbouncer.alert] : []),
      ...(api.checks.redis_memory.alert ? [api.checks.redis_memory.alert] : []),
      ...(worker.status === 'down' ? ['worker:down'] : []),
    ];

    let status: HealthStatus = api.status;
    if (status !== 'unhealthy' && worker.status === 'down') {
      status = 'degraded';
    }

    return {
      status,
      timestamp: api.timestamp,
      alerts,
      api,
      worker,
      delivery_providers: deliveryProviders,
    };
  }

  getLiveness(): { status: 'alive'; timestamp: string } {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }

  // ─── Private: Orchestration ─────────────────────────────────────────────────

  private async buildFullResult(): Promise<FullHealthResult> {
    const [postgresql, redis, meilisearch, bullmq, disk, pgbouncer, redisMemory] =
      await Promise.all([
        this.checkPostgresql(),
        this.checkRedis(),
        this.checkMeilisearch(),
        this.checkBullMQ(),
        Promise.resolve(this.checkDisk()),
        this.checkPgbouncer(),
        this.checkRedisMemory(),
      ]);

    const criticalDown = postgresql.status === 'down' || redis.status === 'down';
    const nonCriticalDown =
      meilisearch.status === 'down' ||
      bullmq.status === 'down' ||
      disk.status === 'down' ||
      pgbouncer.status === 'down' ||
      redisMemory.status === 'down';
    const monitorAlertPresent =
      bullmq.alerts.length > 0 || Boolean(pgbouncer.alert) || Boolean(redisMemory.alert);

    let status: HealthStatus;
    if (criticalDown) {
      status = 'unhealthy';
    } else if (nonCriticalDown || monitorAlertPresent) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {
        postgresql,
        redis,
        meilisearch,
        bullmq,
        disk,
        pgbouncer,
        redis_memory: redisMemory,
      },
    };
  }

  // ─── Private: Dependency Checks ─────────────────────────────────────────────

  private async checkPostgresql(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latency_ms: Date.now() - start };
    } catch {
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      const ok = await this.redis.ping();
      return { status: ok ? 'up' : 'down', latency_ms: Date.now() - start };
    } catch {
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  private async checkMeilisearch(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      if (!this.meilisearch.available) {
        return { status: 'down', latency_ms: 0 };
      }
      // A search on a non-existent index proves connectivity.
      await this.meilisearch.search('_health_check', '', {});
      return { status: 'up', latency_ms: Date.now() - start };
    } catch {
      // If Meilisearch threw but was marked available, connectivity is confirmed.
      return { status: 'up', latency_ms: Date.now() - start };
    }
  }

  private async checkBullMQ(): Promise<BullMQCheck> {
    try {
      const queueChecks = await Promise.all([
        this.checkQueueHealth('notifications', this.notificationsQueue),
        this.checkQueueHealth('behaviour', this.behaviourQueue),
        this.checkQueueHealth('finance', this.financeQueue),
        this.checkQueueHealth('payroll', this.payrollQueue),
        this.checkQueueHealth('pastoral', this.pastoralQueue),
      ]);
      const queues = buildEmptyQueueHealthMap();
      const alerts = queueChecks.flatMap((queueCheck) => queueCheck.alerts);

      for (const queueCheck of queueChecks) {
        queues[queueCheck.name] = queueCheck.metrics;
      }

      const stuckCount = queueChecks.reduce(
        (total, queueCheck) => total + queueCheck.metrics.stuck_jobs,
        0,
      );

      return { status: 'up', stuck_jobs: stuckCount, alerts, queues };
    } catch {
      return {
        status: 'down',
        stuck_jobs: 0,
        alerts: [],
        queues: buildEmptyQueueHealthMap(),
      };
    }
  }

  private async checkPgbouncer(): Promise<PgbouncerCheck> {
    const adminUrl = this.configService.get<string>('PGBOUNCER_ADMIN_URL');
    if (!adminUrl) {
      return buildNotConfiguredPgbouncerCheck();
    }

    const client = new Client({ connectionString: adminUrl });
    const start = Date.now();

    try {
      await client.connect();

      const [poolsResult, configResult] = await Promise.all([
        client.query('SHOW POOLS'),
        client.query('SHOW CONFIG'),
      ]);

      const poolRows = poolsResult.rows as PgbouncerRow[];
      const configRows = configResult.rows as PgbouncerRow[];
      const activeClientConnections = sumPgbouncerMetric(poolRows, 'cl_active');
      const waitingClientConnections = sumPgbouncerMetric(poolRows, 'cl_waiting');
      const maxClientConnRow = configRows.find((row) => {
        const key = readPgbouncerValue(row, 'key');
        return typeof key === 'string' && key === 'max_client_conn';
      });
      const maxClientConnections = maxClientConnRow
        ? toNullableNumber(readPgbouncerValue(maxClientConnRow, 'value'))
        : null;
      const utilizationPercent =
        maxClientConnections && maxClientConnections > 0
          ? roundPercent(
              ((activeClientConnections + waitingClientConnections) / maxClientConnections) * 100,
            )
          : null;

      let alert: string | null = null;
      if (waitingClientConnections > 0) {
        alert = 'pgbouncer:waiting_connections>0';
      } else if (
        utilizationPercent !== null &&
        utilizationPercent > PGBOUNCER_UTILIZATION_ALERT_THRESHOLD
      ) {
        alert = `pgbouncer:utilization>${PGBOUNCER_UTILIZATION_ALERT_THRESHOLD}`;
      }

      return {
        status: 'up',
        latency_ms: Date.now() - start,
        active_client_connections: activeClientConnections,
        waiting_client_connections: waitingClientConnections,
        max_client_connections: maxClientConnections,
        utilization_percent: utilizationPercent,
        alert,
      };
    } catch {
      return buildDownPgbouncerCheck(Date.now() - start);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async checkRedisMemory(): Promise<RedisMemoryCheck> {
    try {
      const memory = await this.redis.getMemoryInfo();
      const utilizationPercent =
        memory.maxmemory_bytes && memory.maxmemory_bytes > 0
          ? roundPercent((memory.used_memory_bytes / memory.maxmemory_bytes) * 100)
          : null;

      return {
        status: 'up',
        used_memory_bytes: memory.used_memory_bytes,
        maxmemory_bytes: memory.maxmemory_bytes,
        utilization_percent: utilizationPercent,
        alert:
          utilizationPercent !== null && utilizationPercent > REDIS_MAXMEMORY_ALERT_THRESHOLD
            ? `redis_memory:utilization>${REDIS_MAXMEMORY_ALERT_THRESHOLD}`
            : null,
      };
    } catch {
      return buildDownRedisMemoryCheck();
    }
  }

  private async checkWorker(): Promise<WorkerCheck> {
    const url = this.configService.get<string>('WORKER_HEALTH_URL') ?? DEFAULT_WORKER_HEALTH_URL;
    const start = Date.now();

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return { status: 'down', latency_ms: Date.now() - start, url };
      }

      return { status: 'up', latency_ms: Date.now() - start, url };
    } catch {
      return { status: 'down', latency_ms: Date.now() - start, url };
    }
  }

  private async checkQueueHealth(
    name: QueueName,
    queue: Queue,
  ): Promise<{ name: QueueName; metrics: QueueHealthMetrics; alerts: string[] }> {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    const activeJobs = await queue.getActive();
    const now = Date.now();
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    const delayed = counts.delayed ?? 0;
    const failed = counts.failed ?? 0;
    const thresholds = QUEUE_ALERT_THRESHOLDS[name];
    const stuckJobs = activeJobs.filter((job) => {
      const startedAt = job.processedOn ?? job.timestamp;
      return now - startedAt > STUCK_JOB_THRESHOLD_MS;
    }).length;
    const alerts: string[] = [];

    if (waiting > thresholds.waiting) {
      alerts.push(`${name}:waiting>${thresholds.waiting}`);
    }
    if (delayed > thresholds.delayed) {
      alerts.push(`${name}:delayed>${thresholds.delayed}`);
    }
    if (failed > thresholds.failed) {
      alerts.push(`${name}:failed>${thresholds.failed}`);
    }
    if (stuckJobs > 0) {
      alerts.push(`${name}:stuck>${stuckJobs}`);
    }

    return {
      name,
      alerts,
      metrics: {
        waiting,
        active,
        delayed,
        failed,
        stuck_jobs: stuckJobs,
      },
    };
  }

  private checkDisk(): DiskCheck {
    const stats = tryStatfsSync(process.cwd());
    if (!stats) {
      // Node < 19 or unsupported platform — report up with unknown values.
      return { status: 'up', free_gb: 0, total_gb: 0 };
    }
    const freeBytes = stats.bfree * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    return {
      status: 'up',
      free_gb: Math.round((freeBytes / 1_073_741_824) * 10) / 10,
      total_gb: Math.round((totalBytes / 1_073_741_824) * 10) / 10,
    };
  }

  private buildDeliveryProviders(): DeliveryProviderMap {
    const resendConfigured = Boolean(this.configService.get<string>('RESEND_API_KEY'));
    const twilioSharedConfigured =
      Boolean(this.configService.get<string>('TWILIO_ACCOUNT_SID')) &&
      Boolean(this.configService.get<string>('TWILIO_AUTH_TOKEN'));
    const smsConfigured =
      twilioSharedConfigured && Boolean(this.configService.get<string>('TWILIO_SMS_FROM'));
    const whatsappConfigured =
      twilioSharedConfigured && Boolean(this.configService.get<string>('TWILIO_WHATSAPP_FROM'));

    return {
      resend_email: buildDeliveryProviderCheck(
        resendConfigured,
        resendConfigured ? 'Resend email delivery is configured.' : 'RESEND_API_KEY is missing.',
      ),
      twilio_sms: buildDeliveryProviderCheck(
        smsConfigured,
        smsConfigured
          ? 'Twilio SMS delivery is configured.'
          : 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_SMS_FROM is missing.',
      ),
      twilio_whatsapp: buildDeliveryProviderCheck(
        whatsappConfigured,
        whatsappConfigured
          ? 'Twilio WhatsApp delivery is configured.'
          : 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_FROM is missing.',
      ),
    };
  }
}
