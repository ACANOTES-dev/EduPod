import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { downloadBufferFromS3 } from '../../base/s3.helpers';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';
import { ClamavScannerService } from '../../services/clamav-scanner.service';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface AttachmentScanPayload extends TenantJobPayload {
  attachment_id: string;
  file_key: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ATTACHMENT_SCAN_JOB = 'behaviour:attachment-scan';

// ─── Processor ───────────────────────────────────────────────────────────────

@Injectable()
export class AttachmentScanProcessor {
  private readonly logger = new Logger(AttachmentScanProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly clamavScanner: ClamavScannerService,
  ) {}

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

    const scanJob = new AttachmentScanJob(this.prisma, this.clamavScanner);
    await scanJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class AttachmentScanJob extends TenantAwareJob<AttachmentScanPayload> {
  private readonly logger = new Logger(AttachmentScanJob.name);

  constructor(
    prisma: PrismaClient,
    private readonly clamavScanner: ClamavScannerService,
  ) {
    super(prisma);
  }

  protected async processJob(data: AttachmentScanPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, attachment_id, file_key } = data;

    // 1. Load attachment record
    const attachment = await tx.behaviourAttachment.findFirst({
      where: { id: attachment_id, tenant_id },
    });

    if (!attachment) {
      this.logger.warn(`Attachment ${attachment_id} not found for tenant ${tenant_id} — skipping`);
      return;
    }

    // 2. Idempotency: skip if not pending_scan
    if (attachment.scan_status !== 'pending_scan') {
      this.logger.log(
        `Attachment ${attachment_id} scan_status is "${attachment.scan_status}" (not pending_scan) — skipping`,
      );
      return;
    }

    // 3. ClamAV graceful fallback — dev environments without ClamAV daemon
    if (!this.clamavScanner.isAvailable()) {
      this.logger.warn(
        `ClamAV unavailable — auto-approving attachment ${attachment_id} as clean (development fallback)`,
      );

      await tx.behaviourAttachment.update({
        where: { id: attachment_id },
        data: {
          scan_status: 'clean',
          scanned_at: new Date(),
        },
      });

      this.logger.log(`Attachment ${attachment_id} marked as clean (ClamAV unavailable)`);
      return;
    }

    // 4. Download file from S3 for scanning
    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadBufferFromS3(file_key);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown S3 download error';
      this.logger.error(`Failed to download file for attachment ${attachment_id}: ${message}`);

      await tx.behaviourAttachment.update({
        where: { id: attachment_id },
        data: {
          scan_status: 'scan_failed',
          scanned_at: new Date(),
        },
      });
      return;
    }

    // 5. Scan the file buffer with ClamAV
    const scanResult = await this.clamavScanner.scanBuffer(fileBuffer);

    if (scanResult.clean) {
      // File is clean — mark as approved
      await tx.behaviourAttachment.update({
        where: { id: attachment_id },
        data: {
          scan_status: 'clean',
          scanned_at: new Date(),
        },
      });

      this.logger.log(`Attachment ${attachment_id} scan complete — clean`);
      return;
    }

    if (scanResult.virus_name) {
      // Malware detected — quarantine the file
      this.logger.warn(
        `Malware detected in attachment ${attachment_id}: ${scanResult.virus_name} — marking as infected`,
      );

      await tx.behaviourAttachment.update({
        where: { id: attachment_id },
        data: {
          scan_status: 'infected',
          scanned_at: new Date(),
        },
      });

      // WB-C-09 — Notify the uploader that their file was flagged so they
      // know to contact the DLP instead of wondering why it's stuck.
      try {
        await tx.notification.create({
          data: {
            tenant_id,
            recipient_user_id: attachment.uploaded_by_id,
            channel: 'in_app',
            template_key: null,
            locale: 'en',
            status: 'delivered',
            delivered_at: new Date(),
            payload_json: {
              title: 'Attachment flagged',
              body: `The file "${attachment.file_name}" was flagged by the security scanner (${scanResult.virus_name}). Contact your Designated Liaison Person for next steps.`,
              link: `/behaviour/${attachment.entity_type}s/${attachment.entity_id}`,
            },
            source_entity_type: 'behaviour_attachment',
            source_entity_id: attachment_id,
          },
        });
      } catch (notifErr) {
        this.logger.warn(
          `Failed to notify uploader of flagged attachment ${attachment_id}: ${
            notifErr instanceof Error ? notifErr.message : String(notifErr)
          }`,
        );
      }

      return;
    }

    // Scanner returned an error (socket failure, timeout, unexpected response)
    this.logger.error(
      `ClamAV scan error for attachment ${attachment_id}: ${scanResult.error ?? 'unknown error'}`,
    );

    await tx.behaviourAttachment.update({
      where: { id: attachment_id },
      data: {
        scan_status: 'scan_failed',
        scanned_at: new Date(),
      },
    });
  }
}
