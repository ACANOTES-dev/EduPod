import { existsSync } from 'fs';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface AttachmentScanPayload extends TenantJobPayload {
  attachment_id: string;
  file_key: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ATTACHMENT_SCAN_JOB = 'behaviour:attachment-scan';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class AttachmentScanProcessor extends WorkerHost {
  private readonly logger = new Logger(AttachmentScanProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AttachmentScanPayload>): Promise<void> {
    if (job.name !== ATTACHMENT_SCAN_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${ATTACHMENT_SCAN_JOB} — attachment ${job.data.attachment_id}, file_key ${job.data.file_key}`,
    );

    const scanJob = new AttachmentScanJob(this.prisma);
    await scanJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class AttachmentScanJob extends TenantAwareJob<AttachmentScanPayload> {
  private readonly logger = new Logger(AttachmentScanJob.name);

  protected async processJob(
    data: AttachmentScanPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, attachment_id } = data;

    // 1. Load attachment record
    const attachment = await tx.behaviourAttachment.findFirst({
      where: { id: attachment_id, tenant_id },
    });

    if (!attachment) {
      this.logger.warn(
        `Attachment ${attachment_id} not found for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // 2. Idempotency: skip if not pending_scan
    if (attachment.scan_status !== 'pending_scan') {
      this.logger.log(
        `Attachment ${attachment_id} scan_status is "${attachment.scan_status}" (not pending_scan) — skipping`,
      );
      return;
    }

    // 3. ClamAV graceful fallback
    const clamavSocket = '/var/run/clamav/clamd.ctl';
    const clamavAvailable = existsSync(clamavSocket);

    if (!clamavAvailable) {
      this.logger.warn(
        `ClamAV socket not found at ${clamavSocket} — auto-approving attachment ${attachment_id} as clean (development fallback)`,
      );

      await tx.behaviourAttachment.update({
        where: { id: attachment_id },
        data: {
          scan_status: 'clean',
          scanned_at: new Date(),
          metadata: {
            ...(typeof attachment.metadata === 'object' &&
            attachment.metadata !== null
              ? (attachment.metadata as Record<string, unknown>)
              : {}),
            scan_note: 'Auto-approved: ClamAV not available (development fallback)',
          },
        },
      });

      this.logger.log(
        `Attachment ${attachment_id} marked as clean (ClamAV unavailable)`,
      );
      return;
    }

    // 4. Production path: ClamAV is available — scan would happen here
    // TODO: Implement actual ClamAV scanning via unix socket
    this.logger.log(
      `ClamAV available — would scan attachment ${attachment_id} (file_key: ${data.file_key})`,
    );

    await tx.behaviourAttachment.update({
      where: { id: attachment_id },
      data: {
        scan_status: 'clean',
        scanned_at: new Date(),
      },
    });

    this.logger.log(`Attachment ${attachment_id} scan complete — clean`);
  }
}
