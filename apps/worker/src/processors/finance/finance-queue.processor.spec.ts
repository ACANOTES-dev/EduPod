import { Job } from 'bullmq';

import { FinanceQueueDispatcher } from './finance-queue.processor';
import {
  INVOICE_APPROVAL_CALLBACK_JOB,
  InvoiceApprovalCallbackProcessor,
} from './invoice-approval-callback.processor';
import { OVERDUE_DETECTION_JOB, OverdueDetectionProcessor } from './overdue-detection.processor';
import {
  FINANCE_RECONCILE_STRIPE_REFUNDS_JOB,
  StripeRefundReconciliationProcessor,
} from './stripe-refund-reconciliation.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('FinanceQueueDispatcher', () => {
  function buildDispatcher() {
    const invoiceApprovalCallback = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as InvoiceApprovalCallbackProcessor;
    const overdueDetection = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as OverdueDetectionProcessor;
    const stripeRefundReconciliation = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as StripeRefundReconciliationProcessor;

    const dispatcher = new FinanceQueueDispatcher(
      invoiceApprovalCallback,
      overdueDetection,
      stripeRefundReconciliation,
    );

    return {
      dispatcher,
      invoiceApprovalCallback,
      overdueDetection,
      stripeRefundReconciliation,
    };
  }

  it.each([
    [INVOICE_APPROVAL_CALLBACK_JOB, 'invoiceApprovalCallback'],
    [OVERDUE_DETECTION_JOB, 'overdueDetection'],
    [FINANCE_RECONCILE_STRIPE_REFUNDS_JOB, 'stripeRefundReconciliation'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'invoiceApprovalCallback',
      'overdueDetection',
      'stripeRefundReconciliation',
    ] as const;
    for (const key of targets) {
      const expected = key === targetKey ? 1 : 0;
      expect(harness[key].process).toHaveBeenCalledTimes(expected);
    }
  });

  it('completes unknown job names silently — canary pings depend on this', async () => {
    const { dispatcher } = buildDispatcher();
    const job = { id: 'job-unknown', name: 'monitoring:canary-ping', data: {} } as Job;

    await expect(dispatcher.process(job)).resolves.toBeUndefined();
  });

  it('completes non-canary unknown jobs silently (logs warning)', async () => {
    const { dispatcher } = buildDispatcher();
    const job = { id: 'job-weird', name: 'something:totally-unknown', data: {} } as Job;

    await expect(dispatcher.process(job)).resolves.toBeUndefined();
  });
});
