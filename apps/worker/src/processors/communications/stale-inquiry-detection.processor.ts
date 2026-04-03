import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const STALE_INQUIRY_DETECTION_JOB = 'communications:stale-inquiry-detection';

// ─── Default stale threshold ─────────────────────────────────────────────────

const DEFAULT_STALE_HOURS = 48;

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant repeatable cron processor — does NOT use TenantAwareJob.
 * Iterates over all active tenants, reads their inquiry stale threshold
 * from tenant settings, and counts inquiries with no recent activity.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class StaleInquiryDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(StaleInquiryDetectionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== STALE_INQUIRY_DETECTION_JOB) {
      return;
    }

    this.logger.log('Running stale inquiry detection across all tenants...');

    // Cross-tenant: fetch all active tenants
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let totalStale = 0;

    for (const tenant of tenants) {
      const staleCount = await this.detectStaleForTenant(tenant.id);
      totalStale += staleCount;
    }

    this.logger.log(
      `Stale inquiry detection complete: ${totalStale} stale inquiries across ${tenants.length} tenants`,
    );
  }

  private async detectStaleForTenant(tenantId: string): Promise<number> {
    // Read tenant-specific stale threshold from settings
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const settingsJson = (settings?.settings as Record<string, unknown>) ?? {};
    const staleHours =
      typeof settingsJson.inquiryStaleHours === 'number'
        ? settingsJson.inquiryStaleHours
        : DEFAULT_STALE_HOURS;

    const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);

    // Count open/in_progress inquiries with no messages newer than the cutoff
    const staleInquiries = await this.prisma.parentInquiry.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['open', 'in_progress'] },
        messages: {
          none: {
            created_at: { gt: cutoff },
          },
        },
      },
      select: { id: true },
    });

    const count = staleInquiries.length;

    if (count > 0) {
      this.logger.log(`Tenant ${tenantId}: ${count} stale inquiries (threshold: ${staleHours}h)`);
      // Cache result in Redis for dashboard quick-display (future enhancement).
      // For now, the API endpoint handles real-time queries.
    }

    return count;
  }
}
