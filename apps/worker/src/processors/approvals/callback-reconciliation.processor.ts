import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const APPROVAL_CALLBACK_RECONCILIATION_JOB = 'approvals:callback-reconciliation';

// ─── Callback dispatch map ──────────────────────────────────────────────────

interface CallbackMapping {
  queue: Queue;
  jobName: string;
}

// ─── Max reconciliation attempts before marking permanently failed ───────────

const MAX_CALLBACK_ATTEMPTS = 5;

/**
 * Minimum age (in minutes) an approved request must have before reconciliation
 * attempts a retry. Prevents racing with the normal callback pipeline.
 */
const STALE_THRESHOLD_MINUTES = 30;

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.APPROVALS, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ApprovalCallbackReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(ApprovalCallbackReconciliationProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FINANCE) private readonly financeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PAYROLL) private readonly payrollQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== APPROVAL_CALLBACK_RECONCILIATION_JOB) {
      return;
    }

    this.logger.log('Starting approval callback reconciliation scan');

    const callbackMap: Record<string, CallbackMapping> = {
      announcement_publish: {
        queue: this.notificationsQueue,
        jobName: 'communications:on-approval',
      },
      invoice_issue: { queue: this.financeQueue, jobName: 'finance:on-approval' },
      payroll_finalise: { queue: this.payrollQueue, jobName: 'payroll:on-approval' },
    };

    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

    // Find approved requests where callback hasn't succeeded:
    // 1. callback_status = 'pending' (dispatched but never completed)
    // 2. callback_status = 'failed' (explicitly failed, eligible for retry)
    // Both must be older than the stale threshold to avoid racing with normal processing.
    const stuckRequests = await this.prisma.approvalRequest.findMany({
      where: {
        status: 'approved',
        callback_status: { in: ['pending', 'failed'] },
        callback_attempts: { lt: MAX_CALLBACK_ATTEMPTS },
        decided_at: { lt: staleThreshold },
      },
      select: {
        id: true,
        tenant_id: true,
        action_type: true,
        target_entity_id: true,
        approver_user_id: true,
        callback_status: true,
        callback_attempts: true,
        decided_at: true,
      },
      orderBy: { decided_at: 'asc' },
      take: 100, // Process at most 100 per run to avoid overloading queues
    });

    if (stuckRequests.length === 0) {
      this.logger.log('No stuck approval callbacks found');
      return;
    }

    this.logger.warn(`Found ${stuckRequests.length} stuck approval callback(s) — retrying`);

    let retriedCount = 0;
    let maxedOutCount = 0;

    for (const request of stuckRequests) {
      const mapping = callbackMap[request.action_type];
      if (!mapping) {
        this.logger.warn(
          `No callback mapping for action_type "${request.action_type}" on request ${request.id} — skipping`,
        );
        continue;
      }

      const newAttemptCount = request.callback_attempts + 1;

      if (newAttemptCount >= MAX_CALLBACK_ATTEMPTS) {
        // Mark as permanently failed — manual intervention required
        await this.prisma.approvalRequest.update({
          where: { id: request.id },
          data: {
            callback_status: 'failed',
            callback_error: `Reconciliation exhausted after ${MAX_CALLBACK_ATTEMPTS} attempts`,
            callback_attempts: newAttemptCount,
          },
        });
        this.logger.error(
          `Approval ${request.id} (${request.action_type}) permanently failed after ${MAX_CALLBACK_ATTEMPTS} attempts — manual intervention required`,
        );
        maxedOutCount++;
        continue;
      }

      try {
        await mapping.queue.add(mapping.jobName, {
          tenant_id: request.tenant_id,
          approval_request_id: request.id,
          target_entity_id: request.target_entity_id,
          approver_user_id: request.approver_user_id,
        });

        // Update attempt count; keep status as 'pending' so the callback processor
        // can set it to 'executed' on success
        await this.prisma.approvalRequest.update({
          where: { id: request.id },
          data: {
            callback_status: 'pending',
            callback_attempts: newAttemptCount,
            callback_error: null,
          },
        });

        this.logger.log(
          `Re-enqueued callback for approval ${request.id} (${request.action_type}), attempt ${newAttemptCount}`,
        );
        retriedCount++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to re-enqueue callback for approval ${request.id}: ${errorMessage}`,
        );

        await this.prisma.approvalRequest.update({
          where: { id: request.id },
          data: {
            callback_status: 'failed',
            callback_error: `Reconciliation enqueue failed: ${errorMessage}`,
            callback_attempts: newAttemptCount,
          },
        });
      }
    }

    this.logger.log(
      `Reconciliation complete: ${retriedCount} retried, ${maxedOutCount} permanently failed, ${stuckRequests.length} total checked`,
    );
  }
}
