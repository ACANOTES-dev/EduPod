import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

/**
 * Cleanup worker for shareable links.
 *
 * Runs daily at 03:00 UTC (registered in CronSchedulerService). Hard-
 * deletes `shareable_links` rows whose `expires_at` is older than 30
 * days — keeps the table small and removes orphaned bcrypt hashes.
 *
 * Cross-tenant — payload is `{}`. There's no tenant context to attach
 * because cleanup is platform-level. The Prisma client used here is
 * the worker-level `PrismaClient` (NOT `PrismaService`) which connects
 * via `DATABASE_URL` and doesn't go through the API's RLS proxy.
 */
export const BUDGETING_SHAREABLE_LINK_CLEANUP_JOB = 'budgeting:shareable-link-cleanup';

const RETENTION_DAYS = 30;

@Injectable()
export class ShareableLinkCleanupProcessor {
  private readonly logger = new Logger(ShareableLinkCleanupProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job): Promise<void> {
    if (job.name !== BUDGETING_SHAREABLE_LINK_CLEANUP_JOB) return;

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const removed = await this.prisma.shareableLink.deleteMany({
      where: { expires_at: { lt: cutoff } },
    });
    this.logger.log(
      `${BUDGETING_SHAREABLE_LINK_CLEANUP_JOB} done — removed ${removed.count} expired link(s) (cutoff ${cutoff.toISOString()})`,
    );
  }
}
