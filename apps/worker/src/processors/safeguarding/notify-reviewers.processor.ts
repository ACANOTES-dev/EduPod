import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ───────────────────────────────────────────────────────────────

export const SAFEGUARDING_NOTIFY_REVIEWERS_JOB = 'safeguarding:notify-reviewers';

// ─── Payload ────────────────────────────────────────────────────────────────

export interface SafeguardingNotifyReviewersPayload {
  tenant_id: string;
  message_flag_id: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ADMIN_TIER_ROLE_KEYS = ['school_owner', 'school_principal', 'school_vice_principal'] as const;

const SAFEGUARDING_FLAG_TEMPLATE_KEY = 'safeguarding.flag.new';

// ─── Processor ──────────────────────────────────────────────────────────────

/**
 * Fans out a newly-raised safeguarding flag to the tenant's admin tier
 * (Owner / Principal / Vice Principal). Creates one `Notification` row
 * per reviewer using the existing platform notification table on
 * `channel = 'in_app'`, so the dashboard alerts widget (Wave 4 impl 14)
 * can surface them.
 *
 * Idempotency: uses `(tenant_id, idempotency_key)` via the existing
 * `idx_notifications_idempotency` unique index on the Notification
 * table, keyed by `safeguarding:<message_flag_id>:<user_id>`. Re-firing
 * on a rescan is a no-op — the admin already got an alert for this
 * flag, no duplicates should fire.
 */
@Processor(QUEUE_NAMES.SAFEGUARDING, {
  lockDuration: 30_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SafeguardingNotifyReviewersProcessor extends WorkerHost {
  private readonly logger = new Logger(SafeguardingNotifyReviewersProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SafeguardingNotifyReviewersPayload>): Promise<void> {
    if (job.name !== SAFEGUARDING_NOTIFY_REVIEWERS_JOB) return;

    const { tenant_id, message_flag_id } = job.data;
    if (!tenant_id || !message_flag_id) {
      throw new Error(
        `[${SAFEGUARDING_NOTIFY_REVIEWERS_JOB}] rejected: missing tenant_id/message_flag_id in payload`,
      );
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;

      // ─── 1. Resolve admin-tier user_ids for the tenant ──────────────
      const memberships = await tx.membershipRole.findMany({
        where: {
          tenant_id,
          role: { role_key: { in: [...ADMIN_TIER_ROLE_KEYS] } },
          membership: { membership_status: 'active' },
        },
        select: { membership: { select: { user_id: true } } },
      });

      const reviewerIds = Array.from(new Set(memberships.map((mr) => mr.membership.user_id)));
      if (reviewerIds.length === 0) {
        this.logger.warn(
          `[${SAFEGUARDING_NOTIFY_REVIEWERS_JOB}] no admin-tier reviewers for tenant ${tenant_id} — flag ${message_flag_id} raised without an alert target`,
        );
        return;
      }

      // ─── 2. Verify the flag still exists (may have been cleared) ────
      const flag = await tx.messageFlag.findFirst({
        where: { id: message_flag_id, tenant_id },
        select: { id: true, highest_severity: true, message_id: true },
      });
      if (!flag) {
        this.logger.debug(
          `[${SAFEGUARDING_NOTIFY_REVIEWERS_JOB}] flag ${message_flag_id} no longer exists — skipping`,
        );
        return;
      }

      // ─── 3. Create an in-app notification for each reviewer ────────
      for (const userId of reviewerIds) {
        const idempotencyKey = `safeguarding:${message_flag_id}:${userId}`;

        const existing = await tx.notification.findFirst({
          where: { tenant_id, idempotency_key: idempotencyKey },
          select: { id: true },
        });
        if (existing) continue;

        await tx.notification.create({
          data: {
            tenant_id,
            recipient_user_id: userId,
            channel: 'in_app',
            template_key: SAFEGUARDING_FLAG_TEMPLATE_KEY,
            locale: 'en',
            payload_json: {
              message_flag_id,
              message_id: flag.message_id,
              highest_severity: flag.highest_severity,
              review_url: `/inbox/oversight/conversations?flag=${message_flag_id}`,
            },
            source_entity_type: 'safeguarding_flag',
            source_entity_id: message_flag_id,
            idempotency_key: idempotencyKey,
          },
        });
      }

      this.logger.log(
        `[${SAFEGUARDING_NOTIFY_REVIEWERS_JOB}] notified ${reviewerIds.length} admin-tier reviewers for flag ${message_flag_id} (tenant ${tenant_id})`,
      );
    });
  }
}
