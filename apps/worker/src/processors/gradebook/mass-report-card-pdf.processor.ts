import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface MassReportCardPdfPayload extends TenantJobPayload {
  academic_period_id: string;
  report_card_ids: string[];
  requested_by_user_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const MASS_REPORT_CARD_PDF_JOB = 'gradebook:mass-report-card-pdf';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.GRADEBOOK, { lockDuration: 60_000 })
export class MassReportCardPdfProcessor extends WorkerHost {
  private readonly logger = new Logger(MassReportCardPdfProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<MassReportCardPdfPayload>): Promise<void> {
    if (job.name !== MASS_REPORT_CARD_PDF_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${MASS_REPORT_CARD_PDF_JOB} — tenant ${tenant_id}, ${job.data.report_card_ids.length} report cards`,
    );

    const pdfJob = new MassReportCardPdfJob(this.prisma);
    await pdfJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class MassReportCardPdfJob extends TenantAwareJob<MassReportCardPdfPayload> {
  private readonly logger = new Logger(MassReportCardPdfJob.name);

  protected async processJob(data: MassReportCardPdfPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, report_card_ids } = data;

    // Load all report cards for the batch
    const reportCards = await tx.reportCard.findMany({
      where: {
        tenant_id,
        id: { in: report_card_ids },
        status: 'published',
      },
      select: {
        id: true,
        template_locale: true,
        snapshot_payload_json: true,
      },
    });

    this.logger.log(
      `Found ${reportCards.length} published report cards out of ${report_card_ids.length} requested for tenant ${tenant_id}`,
    );

    // NOTE: PDF concatenation using pdf-lib and S3 upload would be implemented here
    // in production. For now, this processor validates and logs the batch.
    // Individual PDF rendering is handled by PdfRenderingService in the API.

    const skipped = report_card_ids.length - reportCards.length;
    if (skipped > 0) {
      this.logger.warn(
        `Skipped ${skipped} report cards (not found or not published) for tenant ${tenant_id}`,
      );
    }
  }
}
