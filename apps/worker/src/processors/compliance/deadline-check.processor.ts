import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { ComplianceRequestStatus, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { CrossTenantSystemJob } from '../../base/cross-tenant-system-job';
import { QUEUE_NAMES } from '../../base/queue.constants';
import { getRedisClient } from '../../base/redis.helpers';

// ─── Job name ───────────────────────────────────────────────────────────────
export const DEADLINE_CHECK_JOB = 'compliance:deadline-check';

// ─── Constants ──────────────────────────────────────────────────────────────

const TERMINAL_STATUSES: ComplianceRequestStatus[] = [
  ComplianceRequestStatus.completed,
  ComplianceRequestStatus.rejected,
];
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ─── Job ────────────────────────────────────────────────────────────────────
//
// Iterates all active tenants and checks compliance request deadlines.
// Extends CrossTenantSystemJob: intentionally no RLS context — the job
// iterates all tenants and sets tenant_id in each Prisma where clause directly.

class DeadlineCheckJob extends CrossTenantSystemJob {
  constructor(prisma: PrismaClient) {
    super(prisma, DeadlineCheckJob.name);
  }

  protected async runSystemJob(): Promise<void> {
    this.logger.log('Starting compliance deadline check');

    const { processed } = await this.forEachTenant(async (tenantId) => {
      await this.checkTenantDeadlines(tenantId);
    });

    this.logger.log(`Compliance deadline check complete — processed ${processed} tenants`);
  }

  // ─── Per-tenant deadline check ──────────────────────────────────────────

  private async checkTenantDeadlines(tenantId: string): Promise<void> {
    const now = new Date();

    const requests = await this.prisma.complianceRequest.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: TERMINAL_STATUSES },
        deadline_at: { not: null },
      },
    });

    let warnings = 0;
    let exceeded = 0;

    for (const request of requests) {
      const effectiveDeadline =
        request.extension_granted && request.extension_deadline_at
          ? request.extension_deadline_at
          : request.deadline_at!;

      const daysRemaining = Math.ceil((effectiveDeadline.getTime() - now.getTime()) / MS_PER_DAY);

      if (daysRemaining <= 0 && !request.deadline_exceeded) {
        // Deadline exceeded — flag and notify tenant admins, platform admins, + requester
        await this.prisma.complianceRequest.update({
          where: { id: request.id },
          data: { deadline_exceeded: true },
        });
        const adminUserIds = await this.getAdminUserIds(tenantId);
        const platformAdminUserIds = await this.getPlatformAdminUserIds();
        const exceededRecipients = new Set([
          ...adminUserIds,
          ...platformAdminUserIds,
          request.requested_by_user_id,
        ]);
        for (const userId of exceededRecipients) {
          await this.sendNotificationIfNew(
            tenantId,
            request.id,
            userId,
            'compliance_deadline_exceeded',
          );
        }
        exceeded++;
      } else if (daysRemaining > 0 && daysRemaining <= 3) {
        // 3-day warning — escalate to all admin-tier users
        const adminUserIds = await this.getAdminUserIds(tenantId);
        for (const userId of adminUserIds) {
          await this.sendNotificationIfNew(
            tenantId,
            request.id,
            userId,
            'compliance_deadline_3day',
          );
        }
        warnings++;
      } else if (daysRemaining > 3 && daysRemaining <= 7) {
        // 7-day warning window
        await this.sendNotificationIfNew(
          tenantId,
          request.id,
          request.requested_by_user_id,
          'compliance_deadline_7day',
        );
        warnings++;
      }
    }

    if (requests.length > 0) {
      this.logger.log(
        `Tenant ${tenantId}: checked ${requests.length} requests, ${warnings} warnings sent, ${exceeded} deadlines exceeded`,
      );
    }
  }

  // ─── Admin user resolution ──────────────────────────────────────────────

  private async getAdminUserIds(tenantId: string): Promise<string[]> {
    const adminMemberships = await this.prisma.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_tier: 'admin' },
        membership: { membership_status: 'active' },
      },
      select: {
        membership: { select: { user_id: true } },
      },
    });
    return [...new Set(adminMemberships.map((mr) => mr.membership.user_id))];
  }

  private async getPlatformAdminUserIds(): Promise<string[]> {
    try {
      const client = getRedisClient();
      const userIds = await client.smembers('platform_owner_user_ids');
      return [...new Set(userIds.filter(Boolean))];
    } catch (error) {
      this.logger.error(
        `Unable to resolve platform admin recipients for deadline escalation: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  // ─── Deduplicated notification creation ─────────────────────────────────

  private async sendNotificationIfNew(
    tenantId: string,
    requestId: string,
    recipientUserId: string,
    templateKey: string,
  ): Promise<void> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenant_id: tenantId,
        recipient_user_id: recipientUserId,
        template_key: templateKey,
        source_entity_type: 'compliance_request',
        source_entity_id: requestId,
      },
    });

    if (existing) return;

    await this.prisma.notification.create({
      data: {
        tenant_id: tenantId,
        recipient_user_id: recipientUserId,
        channel: 'in_app',
        template_key: templateKey,
        locale: 'en',
        status: 'delivered',
        payload_json: { request_id: requestId, template_key: templateKey },
        source_entity_type: 'compliance_request',
        source_entity_id: requestId,
        delivered_at: new Date(),
      },
    });
  }
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.COMPLIANCE, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class DeadlineCheckProcessor extends WorkerHost {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== DEADLINE_CHECK_JOB) return;

    await new DeadlineCheckJob(this.prisma).execute();
  }
}
