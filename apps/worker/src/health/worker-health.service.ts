import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DependencyCheck {
  status: 'up' | 'down';
  latency_ms: number;
}

interface BullMQCheck {
  status: 'up' | 'down';
  stuck_jobs: number;
}

export interface WorkerHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: 'worker';
  timestamp: string;
  uptime: number;
  checks: {
    postgresql: DependencyCheck;
    redis: DependencyCheck;
    bullmq: BullMQCheck;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Jobs active longer than this are considered stuck (5 minutes). */
const STUCK_JOB_THRESHOLD_MS = 5 * 60 * 1000;

@Injectable()
export class WorkerHealthService {
  private readonly logger = new Logger(WorkerHealthService.name);
  private readonly startTime = Date.now();

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  async check(): Promise<WorkerHealthResult> {
    return this.buildResult();
  }

  getLiveness(): { status: 'alive'; service: 'worker'; timestamp: string } {
    return { status: 'alive', service: 'worker', timestamp: new Date().toISOString() };
  }

  // ─── Private: Orchestration ─────────────────────────────────────────────────

  private async buildResult(): Promise<WorkerHealthResult> {
    const [postgresql, redis, bullmq] = await Promise.all([
      this.checkPostgresql(),
      this.checkRedis(),
      this.checkBullMQ(),
    ]);

    const criticalDown = postgresql.status === 'down' || redis.status === 'down';

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (criticalDown) {
      status = 'unhealthy';
    } else if (bullmq.status === 'down') {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      service: 'worker',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: { postgresql, redis, bullmq },
    };
  }

  // ─── Private: Dependency Checks ─────────────────────────────────────────────

  private async checkPostgresql(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (err) {
      this.logger.error('[checkPostgresql]', err);
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      const redisClient = await this.notificationsQueue.client;
      await redisClient.ping();
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (err) {
      this.logger.error('[checkRedis]', err);
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  private async checkBullMQ(): Promise<BullMQCheck> {
    try {
      const activeJobs = await this.notificationsQueue.getActive();
      const now = Date.now();
      const stuckCount = activeJobs.filter((job) => {
        const startedAt = job.processedOn ?? job.timestamp;
        return now - startedAt > STUCK_JOB_THRESHOLD_MS;
      }).length;
      return { status: 'up', stuck_jobs: stuckCount };
    } catch (err) {
      this.logger.error('[checkBullMQ]', err);
      return { status: 'down', stuck_jobs: 0 };
    }
  }
}
