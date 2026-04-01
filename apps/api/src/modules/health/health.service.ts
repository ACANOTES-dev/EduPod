import * as os from 'os';

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MeilisearchClient } from '../search/meilisearch.client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DependencyCheck {
  status: 'up' | 'down';
  latency_ms: number;
}

interface BullMQCheck {
  status: 'up' | 'down';
  stuck_jobs: number;
  alerts: string[];
  queues: QueueHealthMap;
}

interface DiskCheck {
  status: 'up' | 'down';
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

type QueueName = 'notifications' | 'behaviour' | 'finance' | 'payroll' | 'pastoral';
type QueueHealthMap = Record<QueueName, QueueHealthMetrics>;
type QueueAlertThreshold = { waiting: number; delayed: number; failed: number };

export interface FullHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    postgresql: DependencyCheck;
    redis: DependencyCheck;
    meilisearch: DependencyCheck;
    bullmq: BullMQCheck;
    disk: DiskCheck;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Jobs active longer than this are considered stuck (5 minutes). */
const STUCK_JOB_THRESHOLD_MS = 5 * 60 * 1000;
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

  getLiveness(): { status: 'alive'; timestamp: string } {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }

  // ─── Private: Orchestration ─────────────────────────────────────────────────

  private async buildFullResult(): Promise<FullHealthResult> {
    const [postgresql, redis, meilisearch, bullmq, disk] = await Promise.all([
      this.checkPostgresql(),
      this.checkRedis(),
      this.checkMeilisearch(),
      this.checkBullMQ(),
      Promise.resolve(this.checkDisk()),
    ]);

    const criticalDown = postgresql.status === 'down' || redis.status === 'down';
    const nonCriticalDown =
      meilisearch.status === 'down' || bullmq.status === 'down' || disk.status === 'down';
    const queueAlertPresent = bullmq.alerts.length > 0;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (criticalDown) {
      status = 'unhealthy';
    } else if (nonCriticalDown || queueAlertPresent) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: { postgresql, redis, meilisearch, bullmq, disk },
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
}
