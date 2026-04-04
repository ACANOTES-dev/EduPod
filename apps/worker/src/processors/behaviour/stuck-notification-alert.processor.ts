import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type StuckNotificationAlertPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB = 'behaviour:stuck-notification-alert';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR, {
  lockDuration: 30_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class StuckNotificationAlertProcessor extends WorkerHost {
  private readonly logger = new Logger(StuckNotificationAlertProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<StuckNotificationAlertPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB} — tenant ${tenant_id}`);

    const alertJob = new StuckNotificationAlertJob(this.prisma);
    await alertJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class StuckNotificationAlertJob extends TenantAwareJob<StuckNotificationAlertPayload> {
  private readonly logger = new Logger(StuckNotificationAlertJob.name);

  protected async processJob(data: StuckNotificationAlertPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id } = data;
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    // Find incidents with parent_notification_status = 'pending' older than 24 hours
    const stuckIncidents = await tx.behaviourIncident.findMany({
      where: {
        tenant_id,
        parent_notification_status: 'pending',
        created_at: { lt: cutoff },
        status: 'active',
      },
      select: {
        id: true,
        incident_number: true,
        reported_by_id: true,
        created_at: true,
      },
    });

    if (stuckIncidents.length === 0) {
      this.logger.log(`No stuck parent notifications found for tenant ${tenant_id}`);
      return;
    }

    let alertsCreated = 0;

    for (const incident of stuckIncidents) {
      // Idempotency: check if an alert was already sent for this incident
      const existingAlert = await tx.notification.findFirst({
        where: {
          tenant_id,
          source_entity_type: 'behaviour_stuck_notification',
          source_entity_id: incident.id,
        },
        select: { id: true },
      });

      if (existingAlert) {
        continue;
      }

      const hoursPending = Math.floor(
        (now.getTime() - new Date(incident.created_at).getTime()) / 3_600_000,
      );

      await tx.notification.create({
        data: {
          tenant_id,
          recipient_user_id: incident.reported_by_id,
          channel: 'in_app',
          template_key: 'behaviour_stuck_parent_notification',
          locale: 'en',
          status: 'delivered',
          delivered_at: now,
          source_entity_type: 'behaviour_stuck_notification',
          source_entity_id: incident.id,
          payload_json: {
            incident_id: incident.id,
            incident_number: incident.incident_number,
            hours_pending: hoursPending,
          },
        },
      });

      alertsCreated++;
    }

    this.logger.log(
      `Stuck notification alerts complete for tenant ${tenant_id}: ` +
        `${alertsCreated} alert(s) created, ${stuckIncidents.length - alertsCreated} skipped (already alerted)`,
    );
  }
}
