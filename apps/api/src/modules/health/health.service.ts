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

interface QueueCheck {
  status: 'up' | 'down';
  stuck_jobs: number;
}

interface BullMQCheck {
  status: 'up' | 'down';
  total_stuck_jobs: number;
  queues: Record<string, QueueCheck>;
}

interface DiskCheck {
  status: 'up' | 'down';
  free_gb: number;
  total_gb: number;
}

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

  private readonly criticalQueues: { name: string; queue: Queue }[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly meilisearch: MeilisearchClient,
    @InjectQueue('behaviour') private readonly behaviourQueue: Queue,
    @InjectQueue('compliance') private readonly complianceQueue: Queue,
    @InjectQueue('finance') private readonly financeQueue: Queue,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('pastoral') private readonly pastoralQueue: Queue,
  ) {
    this.criticalQueues = [
      { name: 'behaviour', queue: this.behaviourQueue },
      { name: 'compliance', queue: this.complianceQueue },
      { name: 'finance', queue: this.financeQueue },
      { name: 'notifications', queue: this.notificationsQueue },
      { name: 'pastoral', queue: this.pastoralQueue },
    ];
  }

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

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (criticalDown) {
      status = 'unhealthy';
    } else if (nonCriticalDown) {
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
    const results = await Promise.all(
      this.criticalQueues.map(async ({ name, queue }): Promise<[string, QueueCheck]> => {
        try {
          const activeJobs = await queue.getActive();
          const now = Date.now();
          const stuckCount = activeJobs.filter((job) => {
            const startedAt = job.processedOn ?? job.timestamp;
            return now - startedAt > STUCK_JOB_THRESHOLD_MS;
          }).length;
          return [name, { status: 'up', stuck_jobs: stuckCount }];
        } catch {
          return [name, { status: 'down', stuck_jobs: 0 }];
        }
      }),
    );

    const queues: Record<string, QueueCheck> = {};
    let totalStuck = 0;
    let anyDown = false;

    for (const [name, check] of results) {
      queues[name] = check;
      totalStuck += check.stuck_jobs;
      if (check.status === 'down') anyDown = true;
    }

    return {
      status: anyDown ? 'down' : 'up',
      total_stuck_jobs: totalStuck,
      queues,
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
