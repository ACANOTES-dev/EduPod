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

// ─── Processor ──────────────────────────────────────────────────────────────
//
// Canary system: sends lightweight echo jobs to critical queues and verifies
// they are completed within SLA.  Any BullMQ processor on the target queue
// will pick up the echo job and return (unknown job name → `return` → job
// completes).  The check phase queries the echo job's completion state.
// No explicit ACK handling required in target processors.

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
        // Echo landed on NOTIFICATIONS queue — no-op, job completion is sufficient
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
      const jobId = `canary-echo:${canaryId}:${queueName}`;

      const q = new Queue(queueName, { connection: redis.duplicate() });
      try {
        await q.add(
          CANARY_ECHO_JOB,
          { canary_id: canaryId, source_queue: queueName },
          {
            jobId,
            removeOnComplete: false, // Keep for check phase
            removeOnFail: false,
          },
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

  // ─── Check: verify all echo jobs completed within SLA ──────────────

  private async handleCheck(job: Job<{ canary_id: string; queues: string[] }>): Promise<void> {
    const { canary_id, queues } = job.data;
    const redis = await this.notificationsQueue.client;
    const missed: string[] = [];

    for (const queueName of queues) {
      const jobId = `canary-echo:${canary_id}:${queueName}`;
      const q = new Queue(queueName, { connection: redis.duplicate() });

      try {
        const echoJob = await q.getJob(jobId);

        if (!echoJob) {
          // Job doesn't exist — either never created or already removed
          // Treat as missed since we set removeOnComplete: false
          missed.push(queueName);
          continue;
        }

        const state = await echoJob.getState();

        if (state === 'completed') {
          // Queue is alive — clean up the echo job
          await echoJob.remove();
        } else {
          // Job still waiting/active/delayed/failed — queue is stalled
          missed.push(queueName);
          // Clean up the stale echo job
          await echoJob.remove().catch(() => {
            /* job may be active, ignore */
          });
        }
      } finally {
        await q.close();
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
  }
}
