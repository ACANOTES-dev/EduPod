import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface AnnouncementApprovalCallbackPayload extends TenantJobPayload {
  approval_request_id: string;
  target_entity_id: string; // announcement.id
  approver_user_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ANNOUNCEMENT_APPROVAL_CALLBACK_JOB = 'communications:on-approval';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class AnnouncementApprovalCallbackProcessor extends WorkerHost {
  private readonly logger = new Logger(AnnouncementApprovalCallbackProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AnnouncementApprovalCallbackPayload>): Promise<void> {
    if (job.name !== ANNOUNCEMENT_APPROVAL_CALLBACK_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${ANNOUNCEMENT_APPROVAL_CALLBACK_JOB} — tenant ${tenant_id}, announcement ${job.data.target_entity_id}`,
    );

    const callbackJob = new AnnouncementApprovalCallbackJob(this.prisma);
    await callbackJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class AnnouncementApprovalCallbackJob extends TenantAwareJob<AnnouncementApprovalCallbackPayload> {
  private readonly logger = new Logger(AnnouncementApprovalCallbackJob.name);

  protected async processJob(
    data: AnnouncementApprovalCallbackPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, approval_request_id, target_entity_id } = data;

    // 1. Fetch the announcement and verify it is pending_approval
    const announcement = await tx.announcement.findFirst({
      where: {
        id: target_entity_id,
        tenant_id,
      },
      select: {
        id: true,
        status: true,
        title: true,
      },
    });

    if (!announcement) {
      throw new Error(`Announcement ${target_entity_id} not found for tenant ${tenant_id}`);
    }

    if (announcement.status !== 'pending_approval') {
      // Self-heal: update the approval request so it is no longer retried by reconciliation
      const isPostApproval = announcement.status === 'published';

      await tx.approvalRequest.update({
        where: { id: approval_request_id },
        data: {
          ...(isPostApproval ? { status: 'executed' as const, executed_at: new Date() } : {}),
          callback_status: isPostApproval ? 'already_completed' : 'skipped_unexpected_state',
          callback_error: `Self-healed: announcement was in status "${announcement.status}"`,
        },
      });

      this.logger.warn(
        `Announcement ${target_entity_id} is in status "${announcement.status}", expected "pending_approval". ` +
          `${isPostApproval ? 'Self-healed' : 'Skipped'}: approval request ${approval_request_id} updated.`,
      );
      return;
    }

    // 2. Update announcement: status → published, set published_at
    await tx.announcement.update({
      where: { id: announcement.id },
      data: {
        status: 'published',
        published_at: new Date(),
      },
    });

    // 3. Update the approval request to executed with callback tracking
    await tx.approvalRequest.update({
      where: { id: approval_request_id },
      data: {
        status: 'executed',
        executed_at: new Date(),
        callback_status: 'executed',
        callback_error: null,
      },
    });

    this.logger.log(
      `Announcement "${announcement.title}" (${target_entity_id}) published via approval, tenant ${tenant_id}`,
    );
  }
}
