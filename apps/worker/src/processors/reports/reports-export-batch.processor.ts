import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import type { TenantJobPayload } from '../../base/tenant-aware-job';
import { TenantAwareJob } from '../../base/tenant-aware-job';

// ─── Job Name ────────────────────────────────────────────────────────────────

export const REPORTS_EXPORT_BATCH_JOB = 'reports:export-batch';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ReportsExportBatchPayload extends TenantJobPayload {
  saved_report_id: string;
  format: 'pdf' | 'excel' | 'word';
  /**
   * Delivery channels. When set, the full impl 13 pipeline will email the
   * artifact and/or drop it into the inbox recipients' threads.
   */
  delivery?: {
    email?: string[];
    inbox_user_ids?: string[];
  };
}

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Stub processor for async report exports (impl 04 delivers wiring only;
 * impl 13 (report sharing) will implement the full render-upload-deliver
 * pipeline).
 *
 * The processor exists end-to-end so that:
 *   - the REPORTS queue has a registered consumer in production,
 *   - the API's `exportReport` flow can safely enqueue a
 *     `reports:export-batch` job when the row count exceeds 5 000 without the
 *     job dying with a "no handler" warning,
 *   - a future impl 13 session only has to replace this processor's body — no
 *     queue-registration plumbing.
 *
 * Guards `job.name` because BullMQ's REPORTS queue is shared with impl 08's
 * `reports:scheduled-run` and impl 09's `reports:alert-evaluate` jobs (see
 * `PLAN.md` §10.4); each processor must bail on jobs it does not own.
 */
@Processor(QUEUE_NAMES.REPORTS)
export class ReportsExportBatchProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsExportBatchProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ReportsExportBatchPayload>): Promise<void> {
    if (job.name !== REPORTS_EXPORT_BATCH_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in reports:export-batch payload');
    }

    this.logger.log(
      `Processing ${REPORTS_EXPORT_BATCH_JOB} — tenant=${tenant_id} report=${job.data.saved_report_id} format=${job.data.format}`,
    );

    // The TenantAwareJob base class wraps the actual work in a tenant-scoped
    // Prisma transaction so that when impl 13 fills in the render+deliver
    // body it inherits RLS context for free. Right now there is nothing to
    // persist, so the processJob body is a log-and-return.
    const worker = new ReportsExportBatchWork(this.prisma);
    await worker.execute(job.data);

    await job.updateProgress(100);
  }
}

class ReportsExportBatchWork extends TenantAwareJob<ReportsExportBatchPayload> {
  private readonly logger = new Logger(ReportsExportBatchWork.name);

  protected async processJob(data: ReportsExportBatchPayload, _tx: PrismaClient): Promise<void> {
    // IMPL 13 (report-sharing) will:
    //   1. Load the saved report
    //   2. Execute via query engine (impl 02)
    //   3. Call ReportExportService to render the artifact
    //   4. Upload artifact to object storage (S3)
    //   5. Deliver via email (data.delivery.email) and/or inbox
    //      (data.delivery.inbox_user_ids) using the existing inbox flow
    //   6. Append a row to `report_share_log` (impl 01 schema)
    this.logger.log(
      `Stub execution: tenant=${data.tenant_id} report=${data.saved_report_id} format=${data.format} (impl 13 will deliver).`,
    );
  }
}
