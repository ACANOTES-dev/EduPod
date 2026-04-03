import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { OVERDUE_ACTIONS_JOB } from './overdue-actions.processor';

// ─── Job name constant ────────────────────────────────────────────────────────

export const PASTORAL_CRON_DISPATCH_OVERDUE_JOB = 'pastoral:cron-dispatch-overdue';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron dispatcher for the pastoral overdue-actions backstop.
 *
 * Runs hourly. Queries all active tenants with the pastoral module enabled
 * and enqueues a `pastoral:overdue-actions` job per tenant. This ensures
 * safeguarding escalations are never missed even if the primary trigger fails.
 */
@Processor(QUEUE_NAMES.PASTORAL, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class PastoralCronDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(PastoralCronDispatchProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.PASTORAL) private readonly pastoralQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== PASTORAL_CRON_DISPATCH_OVERDUE_JOB) return;
    await this.dispatchOverdueActions();
  }

  // ─── Dispatch ────────────────────────────────────────────────────────────

  /**
   * Iterates all active tenants with pastoral enabled and enqueues
   * `pastoral:overdue-actions` for each. Errors per tenant are caught and
   * logged so a single failure does not block remaining tenants.
   */
  private async dispatchOverdueActions(): Promise<void> {
    this.logger.log(
      'Starting pastoral overdue-actions dispatch — scanning active pastoral tenants',
    );

    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: 'active',
        modules: { some: { module_key: 'pastoral', is_enabled: true } },
      },
      select: { id: true },
    });

    let enqueued = 0;

    for (const tenant of tenants) {
      try {
        await this.pastoralQueue.add(OVERDUE_ACTIONS_JOB, { tenant_id: tenant.id });
        enqueued++;
      } catch (err: unknown) {
        this.logger.error(
          `Overdue actions dispatch failed for tenant ${tenant.id}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `Pastoral overdue-actions dispatch complete: ${enqueued} job(s) enqueued across ${tenants.length} tenant(s)`,
    );
  }
}
