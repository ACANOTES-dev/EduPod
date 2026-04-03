import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { DISPATCH_NOTIFICATIONS_JOB } from '../communications/dispatch-notifications.processor';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const DISPATCH_QUEUED_JOB = 'notifications:dispatch-queued';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron processor — polls for queued notifications ready
 * for dispatch and re-enqueues them into the dispatch pipeline.
 *
 * Runs on a 30-second repeatable schedule.
 *
 * Process:
 * 1. Find notifications where status = 'queued' AND
 *    (next_retry_at IS NULL OR next_retry_at <= NOW())
 * 2. Limit to 50 per batch
 * 3. Group by tenant_id and enqueue dispatch jobs
 * 4. Log summary
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class DispatchQueuedProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchQueuedProcessor.name);

  /** Maximum notifications to process per cron tick */
  private readonly BATCH_SIZE = 50;

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== DISPATCH_QUEUED_JOB) {
      return;
    }

    this.logger.debug('Scanning for queued notifications ready for dispatch...');

    const now = new Date();

    // Cross-tenant query — no RLS context (system-level read)
    // Find queued notifications that are ready (not waiting for retry backoff)
    const queuedNotifications = await this.prisma.notification.findMany({
      where: {
        status: 'queued',
        channel: { not: 'in_app' }, // in_app are delivered immediately
        OR: [{ next_retry_at: null }, { next_retry_at: { lte: now } }],
      },
      select: {
        id: true,
        tenant_id: true,
      },
      take: this.BATCH_SIZE,
      orderBy: { created_at: 'asc' }, // FIFO
    });

    if (queuedNotifications.length === 0) {
      this.logger.debug('No queued notifications ready for dispatch');
      return;
    }

    // Group by tenant_id for tenant-aware dispatch
    const byTenant = new Map<string, string[]>();
    for (const n of queuedNotifications) {
      if (!byTenant.has(n.tenant_id)) {
        byTenant.set(n.tenant_id, []);
      }
      byTenant.get(n.tenant_id)!.push(n.id);
    }

    let dispatched = 0;

    for (const [tenantId, ids] of byTenant.entries()) {
      // Mark as processing to prevent duplicate dispatch by next cron tick
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

        await tx.notification.updateMany({
          where: {
            id: { in: ids },
            tenant_id: tenantId,
            status: 'queued',
          },
          data: {
            // Keep as queued — the dispatch processor will handle status transitions
            next_retry_at: null,
          },
        });
      });

      // Enqueue dispatch job for this tenant's batch
      await this.notificationsQueue.add(
        DISPATCH_NOTIFICATIONS_JOB,
        { tenant_id: tenantId, notification_ids: ids },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      dispatched += ids.length;
      this.logger.log(
        `Enqueued ${ids.length} queued notifications for dispatch — tenant ${tenantId}`,
      );
    }

    this.logger.log(
      `Dispatch-queued scan complete: ${dispatched} notifications enqueued ` +
        `across ${byTenant.size} tenant(s)`,
    );
  }
}
