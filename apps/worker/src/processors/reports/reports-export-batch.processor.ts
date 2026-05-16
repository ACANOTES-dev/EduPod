import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import type { TenantJobPayload } from '../../base/tenant-aware-job';
import { TenantAwareJob } from '../../base/tenant-aware-job';

import {
  TENANT_MAINTENANCE_WINDOW_CHECK_JOB,
  TenantMaintenanceWindowCheckProcessor,
} from './maintenance-window-check.processor';
import {
  REPORTS_ALERT_EVALUATE_JOB,
  REPORTS_ALERT_EVALUATE_TENANT_JOB,
  ReportAlertsHandler,
} from './report-alerts.processor';
import {
  REPORTS_SCHEDULED_DELIVER_JOB,
  ScheduledReportsDeliverProcessor,
} from './scheduled-reports-deliver.processor';
import {
  REPORTS_SCHEDULED_RUN_JOB,
  ScheduledReportsTickProcessor,
} from './scheduled-reports-tick.processor';

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

// ─── Export-batch handler (impl 04 stub, impl 13 fills out) ─────────────────

/**
 * Stub handler for async report exports. Wired end-to-end so the REPORTS
 * queue has a registered consumer in production and the API's `exportReport`
 * flow can safely enqueue a `reports:export-batch` job when the row count
 * exceeds 5 000 without the job dying with a "no handler" warning. Impl 13
 * (report sharing) replaces the body with the render → upload → deliver
 * pipeline; until then this is a log-and-return.
 */
@Injectable()
export class ReportsExportBatchHandler {
  private readonly logger = new Logger(ReportsExportBatchHandler.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job<ReportsExportBatchPayload>): Promise<void> {
    if (job.name !== REPORTS_EXPORT_BATCH_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in reports:export-batch payload');
    }

    this.logger.log(
      `Processing ${REPORTS_EXPORT_BATCH_JOB} — tenant=${tenant_id} report=${job.data.saved_report_id} format=${job.data.format}`,
    );

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

// ─── REPORTS queue dispatcher ────────────────────────────────────────────────

/**
 * Single `@Processor` for the `reports` queue — BullMQ creates exactly ONE
 * Worker bound to this class, eliminating the competitive-consumer race that
 * silently drops jobs when multiple `@Processor(QUEUE_NAMES.REPORTS)` classes
 * coexist (DZ-48). Routes by `job.name` to per-job `@Injectable()` handlers.
 *
 * Until impl 08 the file held the `@Processor` decorator on the export-batch
 * class itself; that worked while the queue had a single registered job
 * (`reports:export-batch`). Impl 08 introduces `reports:scheduled-run` and
 * `reports:scheduled-deliver`, so the dispatcher pattern is now mandatory.
 *
 * The class name (and the export of `ReportsExportBatchProcessor`) is
 * preserved for backwards compatibility with `worker.module.ts` providers
 * lists that already reference it. The implementation is a thin router.
 *
 * Future impls (impl 09 alerts) extend this dispatcher by adding a new
 * job-name case + injecting their own `@Injectable()` handler. They MUST
 * NOT add a second `@Processor(QUEUE_NAMES.REPORTS)` decorator anywhere —
 * doing so reintroduces DZ-48.
 */
@Processor(QUEUE_NAMES.REPORTS, {
  lockDuration: 300_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ReportsExportBatchProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsExportBatchProcessor.name);

  constructor(
    private readonly exportBatch: ReportsExportBatchHandler,
    private readonly scheduledTick: ScheduledReportsTickProcessor,
    private readonly scheduledDeliver: ScheduledReportsDeliverProcessor,
    private readonly alertsHandler: ReportAlertsHandler,
    private readonly maintenanceWindowCheck: TenantMaintenanceWindowCheckProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case REPORTS_EXPORT_BATCH_JOB:
        await this.exportBatch.process(job as Job<ReportsExportBatchPayload>);
        return;
      case REPORTS_SCHEDULED_RUN_JOB:
        await this.scheduledTick.process(job);
        return;
      case REPORTS_SCHEDULED_DELIVER_JOB:
        await this.scheduledDeliver.process(
          job as Parameters<ScheduledReportsDeliverProcessor['process']>[0],
        );
        return;
      case REPORTS_ALERT_EVALUATE_JOB:
      case REPORTS_ALERT_EVALUATE_TENANT_JOB:
        // Impl 09 — both job names route to the same handler; the
        // handler branches internally on `job.name` to either dispatch
        // the per-tenant fan-out or run a single tenant's evaluation.
        await this.alertsHandler.process(job);
        return;
      case TENANT_MAINTENANCE_WINDOW_CHECK_JOB:
        await this.maintenanceWindowCheck.process(job);
        return;
      default:
        // Unknown jobs (incl. canary echoes, DZ-48) complete silently;
        // log only non-canary entries for observability.
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown reports job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
