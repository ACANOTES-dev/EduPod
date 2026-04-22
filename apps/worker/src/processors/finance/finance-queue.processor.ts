import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  INVOICE_APPROVAL_CALLBACK_JOB,
  InvoiceApprovalCallbackProcessor,
} from './invoice-approval-callback.processor';
import { OVERDUE_DETECTION_JOB, OverdueDetectionProcessor } from './overdue-detection.processor';
import {
  FINANCE_RECONCILE_STRIPE_REFUNDS_JOB,
  StripeRefundReconciliationProcessor,
} from './stripe-refund-reconciliation.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.FINANCE, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class FinanceQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(FinanceQueueDispatcher.name);

  constructor(
    private readonly invoiceApprovalCallback: InvoiceApprovalCallbackProcessor,
    private readonly overdueDetection: OverdueDetectionProcessor,
    private readonly stripeRefundReconciliation: StripeRefundReconciliationProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case INVOICE_APPROVAL_CALLBACK_JOB:
        await this.invoiceApprovalCallback.process(job);
        return;
      case OVERDUE_DETECTION_JOB:
        await this.overdueDetection.process(job);
        return;
      case FINANCE_RECONCILE_STRIPE_REFUNDS_JOB:
        await this.stripeRefundReconciliation.process(job);
        return;
      default:
        // Unknown jobs (incl. canary echoes, see DZ-48) complete silently;
        // log only non-canary for observability.
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown finance job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
