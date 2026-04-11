import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { INBOX_FALLBACK_SCAN_TENANT_JOB } from './inbox-fallback-scan-tenant.processor';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const INBOX_FALLBACK_CHECK_JOB = 'inbox:fallback-check';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron processor — does NOT use TenantAwareJob.
 *
 * Runs on a 15-minute repeatable schedule. Finds every tenant that has
 * inbox messaging enabled AND at least one fallback bucket enabled, then
 * fans out one `inbox:fallback-scan-tenant` job per tenant so a single
 * slow tenant cannot block the rest.
 *
 * The 15-minute cadence is the granularity floor for escalation: a tenant
 * with a 3-hour teacher SLA will see a message escalated between 3:00 and
 * 3:15 after send. That is intentional — the notifications queue cannot
 * sustain per-minute cross-tenant scans once many tenants are onboarded.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class InboxFallbackCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(InboxFallbackCheckProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== INBOX_FALLBACK_CHECK_JOB) {
      return;
    }

    this.logger.debug('Scanning tenants with inbox fallback enabled...');

    // Cross-tenant read — no RLS context needed. `tenant_settings_inbox`
    // is tenant-scoped and will be filtered to a single row per tenant,
    // but we want every eligible tenant in one pass.
    const eligibleTenants = await this.prisma.tenantSettingsInbox.findMany({
      where: {
        messaging_enabled: true,
        OR: [{ fallback_admin_enabled: true }, { fallback_teacher_enabled: true }],
      },
      select: { tenant_id: true },
    });

    if (eligibleTenants.length === 0) {
      this.logger.debug('No tenants have inbox fallback enabled — skipping fan-out');
      return;
    }

    for (const { tenant_id } of eligibleTenants) {
      await this.notificationsQueue.add(
        INBOX_FALLBACK_SCAN_TENANT_JOB,
        { tenant_id },
        {
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 2,
          backoff: { type: 'exponential', delay: 10_000 },
        },
      );
    }

    this.logger.log(
      `inbox-fallback fan-out complete: enqueued ${eligibleTenants.length} per-tenant scan job(s)`,
    );
  }
}
