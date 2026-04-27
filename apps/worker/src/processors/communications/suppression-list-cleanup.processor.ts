import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

export const SUPPRESSION_LIST_CLEANUP_JOB = 'comms:suppression-list-cleanup';

/**
 * Daily cleanup cron — runs at 03:00 UTC.
 *
 * Hard-deletes `notification_suppression_list` rows whose `expires_at`
 * is in the past. Permanent suppressions (hard_bounce, complaint,
 * manual, unsubscribe) have `expires_at = NULL` and are never deleted
 * by this cron — only the soft-bounce-threshold rows (30-day expiry).
 *
 * Cross-tenant — empty payload. The deleteMany is filtered by
 * `expires_at` only, so it cannot leak across tenants by design.
 */
@Injectable()
export class SuppressionListCleanupProcessor {
  private readonly logger = new Logger(SuppressionListCleanupProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job): Promise<void> {
    if (job.name !== SUPPRESSION_LIST_CLEANUP_JOB) return;

    const removed = await this.prisma.notificationSuppressionList.deleteMany({
      where: {
        expires_at: { not: null, lt: new Date() } as never,
      },
    });

    this.logger.log(
      `${SUPPRESSION_LIST_CLEANUP_JOB} done — removed ${removed.count} expired suppression(s)`,
    );
  }
}
