import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  PAYROLL_APPROVAL_CALLBACK_JOB,
  PayrollApprovalCallbackProcessor,
} from './approval-callback.processor';
import { PAYROLL_MASS_EXPORT_JOB, PayrollMassExportProcessor } from './mass-export.processor';
import {
  PAYROLL_GENERATE_SESSIONS_JOB,
  PayrollSessionGenerationProcessor,
} from './session-generation.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

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
      case PAYROLL_APPROVAL_CALLBACK_JOB:
        await this.payrollApprovalCallback.process(job);
        return;
      case PAYROLL_MASS_EXPORT_JOB:
        await this.payrollMassExport.process(job);
        return;
      case PAYROLL_GENERATE_SESSIONS_JOB:
        await this.payrollSessionGeneration.process(job);
        return;
      default:
        this.logger.warn(`Unknown payroll job name "${job.name}" (id=${job.id})`);
        throw new Error(`No handler registered for payroll job "${job.name}"`);
    }
  }
}
