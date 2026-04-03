import * as crypto from 'crypto';

import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Job, Queue } from 'bullmq';

import {
  CANARY_CHECK_JOB,
  CANARY_CRITICAL_QUEUES,
  CANARY_ECHO_JOB,
  CANARY_PING_JOB,
  QUEUE_NAMES,
} from '../../base/queue.constants';

// ─── Redis key helpers ──────────────────────────────────────────────────────

const CANARY_PREFIX = 'canary:';
const pendingKey = (canaryId: string, queue: string) =>
  `${CANARY_PREFIX}pending:${canaryId}:${queue}`;
const ackKey = (canaryId: string, queue: string) => `${CANARY_PREFIX}ack:${canaryId}:${queue}`;

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 30_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class CanaryProcessor extends WorkerHost {
  private readonly logger = new Logger(CanaryProcessor.name);

  constructor(@InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case CANARY_PING_JOB:
        await this.handlePing();
        break;
      case CANARY_ECHO_JOB:
        await this.handleEcho(job);
        break;
      case CANARY_CHECK_JOB:
        await this.handleCheck(job);
        break;
      default:
        return;
    }
  }

  // ─── Ping: enqueue echo jobs into each critical queue ───────────────

  private async handlePing(): Promise<void> {
    const canaryId = crypto.randomUUID();
    const redis = await this.notificationsQueue.client;
    const queueNames = Object.keys(CANARY_CRITICAL_QUEUES);

    this.logger.log(`Canary ping ${canaryId}: enqueueing echoes to ${queueNames.length} queues`);

    for (const queueName of queueNames) {
      const sla = CANARY_CRITICAL_QUEUES[queueName] ?? 300_000; // default 5 min if missing
      const ttlSeconds = Math.ceil(sla / 1000) + 60; // SLA + 60s buffer

      // Mark pending in Redis
      await redis.set(pendingKey(canaryId, queueName), Date.now().toString(), 'EX', ttlSeconds);

      // Enqueue echo on the target queue
      const q = new Queue(queueName, { connection: redis });
      try {
        await q.add(
          CANARY_ECHO_JOB,
          { canary_id: canaryId, source_queue: queueName },
          { removeOnComplete: 5, removeOnFail: 10 },
        );
      } finally {
        await q.close();
      }
    }

    // Schedule the check job to run after the longest SLA
    const maxSla = Math.max(...Object.values(CANARY_CRITICAL_QUEUES));
    const checkDelay = maxSla + 30_000; // Max SLA + 30s grace

    await this.notificationsQueue.add(
      CANARY_CHECK_JOB,
      { canary_id: canaryId, queues: queueNames },
      { delay: checkDelay, removeOnComplete: 5, removeOnFail: 10 },
    );
  }

  // ─── Echo: ACK that this queue's worker is alive ────────────────────

  private async handleEcho(job: Job<{ canary_id: string; source_queue: string }>): Promise<void> {
    const { canary_id, source_queue } = job.data;
    const redis = await this.notificationsQueue.client;

    await redis.set(ackKey(canary_id, source_queue), Date.now().toString(), 'EX', 600);
    this.logger.debug(`Canary echo ACK: ${source_queue} for ping ${canary_id}`);
  }

  // ─── Check: verify all echoes completed within SLA ──────────────────

  private async handleCheck(job: Job<{ canary_id: string; queues: string[] }>): Promise<void> {
    const { canary_id, queues } = job.data;
    const redis = await this.notificationsQueue.client;
    const missed: string[] = [];

    for (const queueName of queues) {
      const ack = await redis.get(ackKey(canary_id, queueName));
      const pending = await redis.get(pendingKey(canary_id, queueName));

      if (!ack && pending) {
        // Pending was set but never ACK-ed — queue is not processing
        missed.push(queueName);
      }
    }

    if (missed.length > 0) {
      const summary = `Canary SLA missed for queues: ${missed.join(', ')} (ping ${canary_id})`;
      this.logger.error(summary);
      Sentry.captureMessage(summary, 'error');
    } else {
      this.logger.log(
        `Canary check passed — all ${queues.length} queues responded (ping ${canary_id})`,
      );
    }

    // Cleanup Redis keys
    for (const queueName of queues) {
      await redis.del(pendingKey(canary_id, queueName));
      await redis.del(ackKey(canary_id, queueName));
    }
  }
}
