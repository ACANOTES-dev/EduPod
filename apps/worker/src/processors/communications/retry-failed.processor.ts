import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { DISPATCH_NOTIFICATIONS_JOB } from './dispatch-notifications.processor';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const RETRY_FAILED_NOTIFICATIONS_JOB = 'communications:retry-failed-notifications';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron processor — does NOT use TenantAwareJob.
 * Finds failed notifications eligible for retry across all tenants,
 * groups them by tenant, and re-enqueues dispatch jobs.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class RetryFailedNotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(RetryFailedNotificationsProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== RETRY_FAILED_NOTIFICATIONS_JOB) {
      return;
    }

    this.logger.log('Scanning for failed notifications eligible for retry...');

    const now = new Date();

    // Cross-tenant query — no RLS context set (system-level read)
    // max_attempts is stored per-row; we use a safe upper bound (schema default is 3, hard cap 10)
    const HARD_MAX_ATTEMPTS = 10;
    const failedNotifications = await this.prisma.notification.findMany({
      where: {
        status: 'failed',
        next_retry_at: { lte: now },
        // Only retry if below the row's own max_attempts ceiling
        // Prisma doesn't support column-reference comparisons; filter post-query or use raw
        // Safe approximation: exclude rows that have already hit the hard cap
        attempt_count: { lt: HARD_MAX_ATTEMPTS },
      },
      select: { id: true, tenant_id: true, attempt_count: true, max_attempts: true },
    });

    // Filter to respect per-row max_attempts
    const eligible = failedNotifications.filter((n: { attempt_count: number; max_attempts: number; id: string; tenant_id: string }) => n.attempt_count < n.max_attempts);

    if (eligible.length === 0) {
      this.logger.log('No failed notifications eligible for retry');
      return;
    }

    // Group by tenant_id
    const byTenant = new Map<string, string[]>();
    for (const n of eligible) {
      if (!byTenant.has(n.tenant_id)) {
        byTenant.set(n.tenant_id, []);
      }
      byTenant.get(n.tenant_id)!.push(n.id);
    }

    let reenqueued = 0;

    for (const [tenantId, ids] of byTenant.entries()) {
      // Reset status to 'queued' within an RLS-scoped transaction
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

        await tx.notification.updateMany({
          where: { id: { in: ids }, tenant_id: tenantId },
          data: { status: 'queued', next_retry_at: null },
        });
      });

      // Re-enqueue a dispatch job for this tenant's batch
      const BATCH_SIZE = 50;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        await this.notificationsQueue.add(
          DISPATCH_NOTIFICATIONS_JOB,
          { tenant_id: tenantId, notification_ids: batch },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
        );
      }

      reenqueued += ids.length;
      this.logger.log(
        `Re-enqueued ${ids.length} notifications for retry — tenant ${tenantId}`,
      );
    }

    this.logger.log(
      `Retry scan complete: ${reenqueued} notifications re-enqueued across ${byTenant.size} tenants`,
    );
  }
}
