import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { BULK_IMPORT_PROCESS_JOB, BulkImportProcessor } from './bulk-import.processor';
import {
  GRADEBOOK_DETECT_RISKS_JOB,
  GradebookRiskDetectionProcessor,
} from './gradebook-risk-detection.processor';
import {
  MASS_REPORT_CARD_PDF_JOB,
  MassReportCardPdfProcessor,
} from './mass-report-card-pdf.processor';
import {
  REPORT_CARD_AUTO_GENERATE_JOB,
  ReportCardAutoGenerateProcessor,
} from './report-card-auto-generate.processor';
import {
  REPORT_CARD_GENERATION_JOB,
  ReportCardGenerationProcessor,
} from './report-card-generation.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single @Processor for the gradebook queue. BullMQ creates exactly ONE
// `Worker` bound to this class, which eliminates the competitive-consumer
// race that used to silently drop jobs when multiple `@Processor(GRADEBOOK)`
// classes coexisted (wrong worker picked up the job, early-returned via
// `if (job.name !== X) return;`, BullMQ marked it completed).
//
// Routing is by `job.name` → the original processor class (now a plain
// @Injectable service) which still owns all of the business logic.
//
// `lockDuration` is set to the longest required by any gradebook job
// (report-card generation can render dozens of PDFs inside one transaction
// and needed 5 minutes historically). Shorter-running jobs are unaffected
// because the lock is released when `process()` returns.

@Processor(QUEUE_NAMES.GRADEBOOK, {
  lockDuration: 5 * 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class GradebookQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(GradebookQueueDispatcher.name);

  constructor(
    private readonly reportCardGeneration: ReportCardGenerationProcessor,
    private readonly reportCardAutoGenerate: ReportCardAutoGenerateProcessor,
    private readonly massReportCardPdf: MassReportCardPdfProcessor,
    private readonly bulkImport: BulkImportProcessor,
    private readonly gradebookRiskDetection: GradebookRiskDetectionProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case REPORT_CARD_GENERATION_JOB:
        await this.reportCardGeneration.process(job);
        return;
      case REPORT_CARD_AUTO_GENERATE_JOB:
        await this.reportCardAutoGenerate.process(job);
        return;
      case MASS_REPORT_CARD_PDF_JOB:
        await this.massReportCardPdf.process(job);
        return;
      case BULK_IMPORT_PROCESS_JOB:
        await this.bulkImport.process(job);
        return;
      case GRADEBOOK_DETECT_RISKS_JOB:
        await this.gradebookRiskDetection.process(job);
        return;
      default:
        this.logger.warn(
          `Unknown gradebook job name "${job.name}" (id=${job.id}) — no handler registered; failing loudly.`,
        );
        throw new Error(`No handler registered for gradebook job "${job.name}"`);
    }
  }
}
