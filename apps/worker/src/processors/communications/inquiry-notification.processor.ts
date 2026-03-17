import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface InquiryNotificationPayload extends TenantJobPayload {
  inquiry_id: string;
  message_id: string;
  notify_type: 'admin_notify' | 'parent_notify';
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const INQUIRY_NOTIFICATION_JOB = 'communications:inquiry-notification';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class InquiryNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(InquiryNotificationProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<InquiryNotificationPayload>): Promise<void> {
    if (job.name !== INQUIRY_NOTIFICATION_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${INQUIRY_NOTIFICATION_JOB} — inquiry ${job.data.inquiry_id} notify_type=${job.data.notify_type}`,
    );

    const inquiryNotifJob = new InquiryNotificationJob(this.prisma);
    await inquiryNotifJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class InquiryNotificationJob extends TenantAwareJob<InquiryNotificationPayload> {
  private readonly logger = new Logger(InquiryNotificationJob.name);

  protected async processJob(
    data: InquiryNotificationPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, inquiry_id, message_id, notify_type } = data;

    const inquiry = await tx.parentInquiry.findFirst({
      where: { id: inquiry_id, tenant_id },
      include: {
        parent: { select: { user_id: true, preferred_contact_channels: true } },
      },
    });

    if (!inquiry) {
      this.logger.warn(`Inquiry ${inquiry_id} not found for tenant ${tenant_id}`);
      return;
    }

    const now = new Date();

    if (notify_type === 'admin_notify') {
      // Find all users with inquiries.view permission within this tenant
      const adminUserIds = await this.getUsersWithPermission(tx, tenant_id, 'inquiries.view');

      if (adminUserIds.length === 0) {
        this.logger.log(`No admins with inquiries.view permission found for tenant ${tenant_id}`);
        return;
      }

      await tx.notification.createMany({
        data: adminUserIds.map((userId) => ({
          tenant_id,
          recipient_user_id: userId,
          channel: 'in_app' as const,
          template_key: 'inquiry.new_message',
          locale: 'en',
          status: 'delivered' as const,
          payload_json: { inquiry_id, message_id },
          source_entity_type: 'parent_inquiry',
          source_entity_id: inquiry_id,
          delivered_at: now,
        })),
      });

      this.logger.log(
        `Created admin notifications for inquiry ${inquiry_id} — ${adminUserIds.length} admins notified`,
      );
    } else {
      // parent_notify: notify the parent through their preferred channels
      const parentUserId = inquiry.parent.user_id;
      if (!parentUserId) {
        this.logger.log(
          `Parent for inquiry ${inquiry_id} has no user account, skipping parent notification`,
        );
        return;
      }

      const preferredChannels = (inquiry.parent.preferred_contact_channels as string[]) ?? ['in_app'];

      for (const channel of preferredChannels) {
        const normalizedChannel = channel as 'in_app' | 'email' | 'whatsapp';
        const isInApp = normalizedChannel === 'in_app';

        await tx.notification.create({
          data: {
            tenant_id,
            recipient_user_id: parentUserId,
            channel: normalizedChannel,
            template_key: 'inquiry.admin_replied',
            locale: 'en',
            status: isInApp ? 'delivered' : 'queued',
            payload_json: { inquiry_id, message_id },
            source_entity_type: 'parent_inquiry',
            source_entity_id: inquiry_id,
            ...(isInApp ? { delivered_at: now } : {}),
          },
        });
      }

      this.logger.log(
        `Created parent notifications for inquiry ${inquiry_id} — channels: ${preferredChannels.join(', ')}`,
      );
    }
  }

  /**
   * Find user IDs of active tenant members that hold a role with the given permission.
   */
  private async getUsersWithPermission(
    tx: PrismaClient,
    tenantId: string,
    permissionKey: string,
  ): Promise<string[]> {
    // Resolve permission id
    const permission = await tx.permission.findUnique({
      where: { permission_key: permissionKey },
      select: { id: true },
    });

    if (!permission) return [];

    // Find roles that have this permission within the tenant (or system roles)
    const rolePermissions = await tx.rolePermission.findMany({
      where: {
        permission_id: permission.id,
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
      select: { role_id: true },
    });

    if (rolePermissions.length === 0) return [];

    const roleIds = rolePermissions.map((rp) => rp.role_id);

    // Find memberships in this tenant that have one of these roles and are active
    const membershipRoles = await tx.membershipRole.findMany({
      where: {
        role_id: { in: roleIds },
        tenant_id: tenantId,
        membership: { tenant_id: tenantId, membership_status: 'active' },
      },
      select: { membership: { select: { user_id: true } } },
    });

    return [...new Set(membershipRoles.map((mr) => mr.membership.user_id))];
  }
}
