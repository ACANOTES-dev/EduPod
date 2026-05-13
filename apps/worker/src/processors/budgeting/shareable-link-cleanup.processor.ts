import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { TenantModuleService } from '../../../../api/src/common/services/tenant-module.service';

/**
 * Cleanup worker for shareable links.
 *
 * Runs daily at 03:00 UTC (registered in CronSchedulerService). Hard-
 * deletes `shareable_links` rows whose `expires_at` is older than 30
 * days — keeps the table small and removes orphaned bcrypt hashes.
 *
 * Cross-tenant — payload is `{}`. Each expired link is checked against
 * its tenant's `budgeting` module state before deletion. The Prisma
 * client used here is the worker-level `PrismaClient` (NOT
 * `PrismaService`) which connects via `DATABASE_URL` and doesn't go
 * through the API's RLS proxy.
 */
export const BUDGETING_SHAREABLE_LINK_CLEANUP_JOB = 'budgeting:shareable-link-cleanup';

const RETENTION_DAYS = 30;

@Injectable()
export class ShareableLinkCleanupProcessor {
  private readonly logger = new Logger(ShareableLinkCleanupProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly tenantModuleService: TenantModuleService,
  ) {}

  async process(job: Job): Promise<void> {
    if (job.name !== BUDGETING_SHAREABLE_LINK_CLEANUP_JOB) return;

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const expiredLinks = await this.prisma.shareableLink.findMany({
      where: { expires_at: { lt: cutoff } },
      select: { id: true, tenant_id: true },
    });

    const deleteIds: string[] = [];
    let disabledCount = 0;
    for (const link of expiredLinks) {
      const enabled = await this.tenantModuleService.isEnabled(link.tenant_id, 'budgeting');
      if (enabled) {
        deleteIds.push(link.id);
      } else {
        disabledCount += 1;
      }
    }

    const removed =
      deleteIds.length > 0
        ? await this.prisma.shareableLink.deleteMany({ where: { id: { in: deleteIds } } })
        : { count: 0 };
    this.logger.log(
      `${BUDGETING_SHAREABLE_LINK_CLEANUP_JOB} done — removed ${removed.count} expired link(s), skipped ${disabledCount} disabled-tenant link(s) (cutoff ${cutoff.toISOString()})`,
    );
  }
}
