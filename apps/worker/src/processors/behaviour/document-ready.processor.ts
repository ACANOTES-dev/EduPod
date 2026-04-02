import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, type TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const DOCUMENT_READY_JOB = 'behaviour:document-ready';

// ─── Payload ────────────────────────────────────────────────────────────────

export interface DocumentReadyPayload extends TenantJobPayload {
  document_id: string;
  output_key: string;
  pdf_size_bytes: number;
  sha256_hash: string;
  generated_by_id: string;
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR, { lockDuration: 300_000 })
export class DocumentReadyProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentReadyProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<DocumentReadyPayload>): Promise<void> {
    if (job.name !== DOCUMENT_READY_JOB) return;

    const readyJob = new DocumentReadyJob(this.prisma);
    await readyJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ──────────────────────────────────────────

class DocumentReadyJob extends TenantAwareJob<DocumentReadyPayload> {
  private readonly logger = new Logger(DocumentReadyJob.name);

  protected async processJob(data: DocumentReadyPayload, tx: PrismaClient): Promise<void> {
    const { document_id, output_key, pdf_size_bytes, sha256_hash, generated_by_id } = data;

    // Update document from 'generating' to 'draft_doc'
    const doc = await tx.behaviourDocument.findFirst({
      where: { id: document_id },
    });

    if (!doc) {
      this.logger.warn(`Document ${document_id} not found — may have been deleted`);
      return;
    }

    if (doc.status !== 'generating') {
      this.logger.warn(
        `Document ${document_id} status is "${doc.status}", not "generating" — skipping`,
      );
      return;
    }

    await tx.behaviourDocument.update({
      where: { id: document_id },
      data: {
        status: 'draft_doc',
        file_key: output_key,
        file_size_bytes: BigInt(pdf_size_bytes),
        sha256_hash,
      },
    });

    // Create in-app notification for the generating user
    await tx.notification.create({
      data: {
        tenant_id: data.tenant_id,
        recipient_user_id: generated_by_id,
        channel: 'in_app',
        template_key: 'behaviour_document_review',
        locale: 'en',
        status: 'delivered',
        payload_json: { document_id, document_type: doc.document_type },
        source_entity_type: 'behaviour_document',
        source_entity_id: document_id,
        delivered_at: new Date(),
      },
    });

    this.logger.log(`Document ${document_id} marked ready (draft_doc)`);
  }
}
