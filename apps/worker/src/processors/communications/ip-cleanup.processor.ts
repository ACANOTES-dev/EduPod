import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { CrossTenantSystemJob } from '../../base/cross-tenant-system-job';
import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const IP_CLEANUP_JOB = 'communications:ip-cleanup';

// ─── Retention period ─────────────────────────────────────────────────────────

const RETENTION_DAYS = 90;

// ─── Job ─────────────────────────────────────────────────────────────────────

/**
 * Cross-tenant nightly cron job — nullifies source_ip on
 * contact_form_submissions older than 90 days across all tenants.
 * Extends CrossTenantSystemJob: intentionally no RLS context.
 */
class IpCleanupJob extends CrossTenantSystemJob {
  constructor(prisma: PrismaClient) {
    super(prisma, IpCleanupJob.name);
  }

  protected async runSystemJob(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    this.logger.log(
      `Running IP address cleanup — nullifying source_ip older than ${RETENTION_DAYS} days...`,
    );

    // Cross-tenant bulk update — no RLS needed for a blanket privacy cleanup
    const result = await this.prisma.contactFormSubmission.updateMany({
      where: {
        source_ip: { not: null },
        created_at: { lt: cutoff },
      },
      data: { source_ip: null },
    });

    this.logger.log(
      `IP cleanup complete: nullified source_ip on ${result.count} contact form submissions older than ${RETENTION_DAYS} days`,
    );
  }
}

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class IpCleanupProcessor extends WorkerHost {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== IP_CLEANUP_JOB) {
      return;
    }

    await new IpCleanupJob(this.prisma).execute();
  }
}
