import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DependencyCheck {
  status: 'up' | 'down';
  latency_ms: number;
}

interface QueueStatus {
  status: 'up' | 'down';
  stuck_jobs: number;
}

export interface BullMQCheck {
  status: 'up' | 'down';
  stuck_jobs: number;
  queues: Record<string, QueueStatus>;
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

/** Critical queues monitored by the health check. */
export const HEALTH_CRITICAL_QUEUES: string[] = [
  QUEUE_NAMES.APPROVALS,
  QUEUE_NAMES.ATTENDANCE,
  QUEUE_NAMES.BEHAVIOUR,
  QUEUE_NAMES.COMPLIANCE,
  QUEUE_NAMES.FINANCE,
  QUEUE_NAMES.NOTIFICATIONS,
  QUEUE_NAMES.PASTORAL,
  QUEUE_NAMES.PAYROLL,
  QUEUE_NAMES.SCHEDULING,
  QUEUE_NAMES.SECURITY,
];

@Injectable()
export class WorkerHealthService {
  private readonly logger = new Logger(WorkerHealthService.name);
  private readonly startTime = Date.now();
  private readonly queueMap: Map<string, Queue>;

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.APPROVALS) private readonly approvalsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ATTENDANCE) private readonly attendanceQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BEHAVIOUR) private readonly behaviourQueue: Queue,
    @InjectQueue(QUEUE_NAMES.COMPLIANCE) private readonly complianceQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FINANCE) private readonly financeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PASTORAL) private readonly pastoralQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PAYROLL) private readonly payrollQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SCHEDULING) private readonly schedulingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SECURITY) private readonly securityQueue: Queue,
  ) {
    this.queueMap = new Map<string, Queue>([
      [QUEUE_NAMES.APPROVALS, this.approvalsQueue],
      [QUEUE_NAMES.ATTENDANCE, this.attendanceQueue],
      [QUEUE_NAMES.BEHAVIOUR, this.behaviourQueue],
      [QUEUE_NAMES.COMPLIANCE, this.complianceQueue],
      [QUEUE_NAMES.FINANCE, this.financeQueue],
      [QUEUE_NAMES.NOTIFICATIONS, this.notificationsQueue],
      [QUEUE_NAMES.PASTORAL, this.pastoralQueue],
      [QUEUE_NAMES.PAYROLL, this.payrollQueue],
      [QUEUE_NAMES.SCHEDULING, this.schedulingQueue],
      [QUEUE_NAMES.SECURITY, this.securityQueue],
    ]);
  }

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
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- health check ping, not tenant-scoped
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
    const queues: Record<string, QueueStatus> = {};
    let totalStuck = 0;
    let anyDown = false;

    await Promise.all(
      HEALTH_CRITICAL_QUEUES.map(async (name) => {
        const queue = this.queueMap.get(name);
        if (!queue) {
          queues[name] = { status: 'down', stuck_jobs: 0 };
          anyDown = true;
          return;
        }
        try {
          const activeJobs = await queue.getActive();
          const now = Date.now();
          const stuckCount = activeJobs.filter((job) => {
            const startedAt = job.processedOn ?? job.timestamp;
            return now - startedAt > STUCK_JOB_THRESHOLD_MS;
          }).length;
          totalStuck += stuckCount;
          queues[name] = { status: 'up', stuck_jobs: stuckCount };
        } catch (err) {
          this.logger.error(`[checkBullMQ:${name}]`, err);
          queues[name] = { status: 'down', stuck_jobs: 0 };
          anyDown = true;
        }
      }),
    );

    return { status: anyDown ? 'down' : 'up', stuck_jobs: totalStuck, queues };
  }
}
