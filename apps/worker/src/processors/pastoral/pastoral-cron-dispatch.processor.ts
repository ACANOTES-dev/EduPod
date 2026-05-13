import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { TenantModuleService } from '../../../../api/src/common/services/tenant-module.service';
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
@Injectable()
export class PastoralCronDispatchProcessor {
  private readonly logger = new Logger(PastoralCronDispatchProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.PASTORAL) private readonly pastoralQueue: Queue,
    private readonly tenantModuleService: TenantModuleService,
  ) {}

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
    this.logger.log('Starting pastoral overdue-actions dispatch — scanning active tenants');

    // Query tenants table only (no RLS). Do NOT use relation filters on
    // tenant_modules here — that table has RLS, and this is a cross-tenant
    // job with no tenant context. The per-tenant overdue-actions processor
    // handles RLS correctly and returns zero rows for tenants without data.
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let enqueued = 0;

    for (const tenant of tenants) {
      try {
        const enabled = await this.tenantModuleService.isEnabled(tenant.id, 'pastoral');
        if (!enabled) {
          this.logger.log(`Skipping pastoral overdue-actions for tenant ${tenant.id} — disabled`);
          continue;
        }

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
