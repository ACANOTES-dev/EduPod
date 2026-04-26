import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  PAYROLL_MASS_EXPORT_JOB,
  PAYROLL_ON_APPROVAL_JOB,
  PAYROLL_SESSION_GENERATION_JOB,
} from '@school/shared/payroll';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { PayrollApprovalCallbackProcessor } from './approval-callback.processor';
import { PayrollMassExportProcessor } from './mass-export.processor';
import { PayrollSessionGenerationProcessor } from './session-generation.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.
//
// Wave 3 of the payroll-overhaul rebuild — every job-name string is now
// imported from `@school/shared/payroll`. The API enqueue site and the
// worker handler reference the SAME literal, so the historic
// `'payroll:mass-export-payslips'` (worker) vs `'payroll:mass-export'`
// (API) drift cannot recur.

@Processor(QUEUE_NAMES.PAYROLL, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class PayrollQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(PayrollQueueDispatcher.name);

  constructor(
    private readonly payrollApprovalCallback: PayrollApprovalCallbackProcessor,
    private readonly payrollMassExport: PayrollMassExportProcessor,
    private readonly payrollSessionGeneration: PayrollSessionGenerationProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case PAYROLL_ON_APPROVAL_JOB:
        await this.payrollApprovalCallback.process(job);
        return;
      case PAYROLL_MASS_EXPORT_JOB:
        await this.payrollMassExport.process(job);
        return;
      case PAYROLL_SESSION_GENERATION_JOB:
        await this.payrollSessionGeneration.process(job);
        return;
      default:
        // Unknown jobs (incl. canary echoes, see DZ-48) complete silently;
        // log only non-canary for observability.
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown payroll job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
