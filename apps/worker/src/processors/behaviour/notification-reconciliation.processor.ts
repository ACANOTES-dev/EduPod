import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { BEHAVIOUR_PARENT_NOTIFICATION_JOB } from './parent-notification.processor';

// ─── Job name constant ────────────────────────────────────────────────────────

export const BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB = 'behaviour:notification-reconciliation';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant backstop cron for stale parent notification jobs.
 *
 * Runs daily at 05:00 UTC. Scans all active behaviour tenants for incidents
 * with `parent_notification_status = 'pending'` older than 4 hours and
 * re-enqueues `behaviour:parent-notification` for each one.
 *
 * This processor does NOT use TenantAwareJob — it is a read-only cross-tenant
 * scanner. Reads use direct Prisma with `tenant_id` in WHERE clauses (no RLS
 * transaction needed for reads per project convention). Enqueues are to the
 * notifications queue, which sets RLS context in the target processor.
 */
@Processor(QUEUE_NAMES.BEHAVIOUR, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class NotificationReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationReconciliationProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB) return;
    await this.reconcile();
  }

  // ─── Reconciliation logic ─────────────────────────────────────────────────

  private async reconcile(): Promise<void> {
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago

    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: 'active',
        modules: { some: { module_key: 'behaviour', is_enabled: true } },
      },
      select: { id: true },
    });

    let totalRequeued = 0;

    for (const tenant of tenants) {
      try {
        const staleIncidents = await this.prisma.behaviourIncident.findMany({
          where: {
            tenant_id: tenant.id,
            parent_notification_status: 'pending',
            created_at: { lt: cutoff },
            status: 'active',
          },
          select: {
            id: true,
            participants: {
              select: { student_id: true },
              where: { participant_type: 'student' },
            },
          },
        });

        for (const incident of staleIncidents) {
          const studentIds = incident.participants
            .map((p) => p.student_id)
            .filter((id): id is string => id !== null);

          await this.notificationsQueue.add(BEHAVIOUR_PARENT_NOTIFICATION_JOB, {
            tenant_id: tenant.id,
            incident_id: incident.id,
            student_ids: studentIds,
          });
          totalRequeued++;
        }

        if (staleIncidents.length > 0) {
          this.logger.log(
            `Reconciled ${staleIncidents.length} stale parent notification(s) for tenant ${tenant.id}`,
          );
        }
      } catch (err: unknown) {
        this.logger.error(
          `Notification reconciliation failed for tenant ${tenant.id}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `Notification reconciliation complete: ${totalRequeued} job(s) re-enqueued across ${tenants.length} tenant(s)`,
    );
  }
}
