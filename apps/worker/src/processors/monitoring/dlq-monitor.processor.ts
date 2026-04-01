import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const DLQ_MONITOR_JOB = 'monitoring:dlq-scan';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DlqAlert {
  queue: string;
  failedCount: number;
}

// ─── Processor ────────────────────────────────────────────────────────────────

/**
 * Cross-tenant platform-level job — scans the failed (DLQ) depth of every
 * registered queue every 15 minutes.
 *
 * If any queue has non-zero failed jobs, logs a warning and sends a Sentry
 * alert so the platform team can investigate and replay/discard jobs.
 *
 * Uses the injected notifications queue's ioredis client to create temporary
 * Queue instances for each queue name, avoiding the need to inject all 20 queues.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class DlqMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(DlqMonitorProcessor.name);

  constructor(@InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== DLQ_MONITOR_JOB) return;
    await this.scanDlqDepths();
  }

  // ─── DLQ scan ─────────────────────────────────────────────────────────────

  private async scanDlqDepths(): Promise<void> {
    const redisClient = await this.notificationsQueue.client;
    const allQueueNames = Object.values(QUEUE_NAMES);
    const alerts: DlqAlert[] = [];

    for (const name of allQueueNames) {
      const q = new Queue(name, { connection: redisClient });
      try {
        const failedCount = await q.getFailedCount();
        if (failedCount > 0) {
          alerts.push({ queue: name, failedCount });
        }
      } catch (err: unknown) {
        this.logger.error(
          `[DlqMonitorProcessor] Failed to check DLQ depth for queue "${name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        await q.close();
      }
    }

    if (alerts.length > 0) {
      const summary = alerts.map((a) => `${a.queue}: ${a.failedCount}`).join(', ');
      this.logger.warn(`DLQ alert — non-zero failed jobs detected: ${summary}`);
      Sentry.captureMessage(`DLQ alert: ${summary}`, 'warning');
    } else {
      this.logger.log(`DLQ scan complete — all ${allQueueNames.length} queues clean`);
    }
  }
}
