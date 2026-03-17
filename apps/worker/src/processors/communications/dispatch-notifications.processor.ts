import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface DispatchNotificationsPayload extends TenantJobPayload {
  notification_ids: string[];
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const DISPATCH_NOTIFICATIONS_JOB = 'communications:dispatch-notifications';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class DispatchNotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchNotificationsProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<DispatchNotificationsPayload>): Promise<void> {
    if (job.name !== DISPATCH_NOTIFICATIONS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${DISPATCH_NOTIFICATIONS_JOB} — ${job.data.notification_ids.length} notifications for tenant ${tenant_id}`,
    );

    const dispatchJob = new DispatchNotificationsJob(this.prisma);
    await dispatchJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class DispatchNotificationsJob extends TenantAwareJob<DispatchNotificationsPayload> {
  private readonly logger = new Logger(DispatchNotificationsJob.name);

  protected async processJob(
    data: DispatchNotificationsPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, notification_ids } = data;

    if (notification_ids.length === 0) {
      this.logger.log('No notification IDs provided, nothing to dispatch');
      return;
    }

    const notifications = await tx.notification.findMany({
      where: {
        id: { in: notification_ids },
        tenant_id,
        status: { in: ['queued', 'failed'] },
      },
      select: { id: true, channel: true },
    });

    if (notifications.length === 0) {
      this.logger.log(`No dispatchable notifications found for IDs: ${notification_ids.join(', ')}`);
      return;
    }

    const now = new Date();
    let inAppCount = 0;
    let externalCount = 0;

    for (const notification of notifications) {
      if (notification.channel === 'in_app') {
        // in_app notifications are delivered immediately
        await tx.notification.update({
          where: { id: notification.id },
          data: {
            status: 'delivered',
            delivered_at: now,
            attempt_count: { increment: 1 },
          },
        });
        inAppCount++;
      } else {
        // email / whatsapp — mark as sent (actual provider integration deferred)
        await tx.notification.update({
          where: { id: notification.id },
          data: {
            status: 'sent',
            sent_at: now,
            attempt_count: { increment: 1 },
          },
        });
        externalCount++;
      }
    }

    this.logger.log(
      `Dispatched ${notifications.length} notifications for tenant ${tenant_id} — ` +
        `in_app: ${inAppCount}, external (placeholder): ${externalCount}`,
    );
  }
}
