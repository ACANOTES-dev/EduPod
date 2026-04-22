import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  SAFEGUARDING_SCAN_MESSAGE_JOB,
  SafeguardingScanMessageProcessor,
} from './message-scan.processor';
import {
  SAFEGUARDING_NOTIFY_REVIEWERS_JOB,
  SafeguardingNotifyReviewersProcessor,
} from './notify-reviewers.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.SAFEGUARDING, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SafeguardingQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(SafeguardingQueueDispatcher.name);

  constructor(
    private readonly safeguardingScanMessage: SafeguardingScanMessageProcessor,
    private readonly safeguardingNotifyReviewers: SafeguardingNotifyReviewersProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case SAFEGUARDING_SCAN_MESSAGE_JOB:
        await this.safeguardingScanMessage.process(job);
        return;
      case SAFEGUARDING_NOTIFY_REVIEWERS_JOB:
        await this.safeguardingNotifyReviewers.process(job);
        return;
      default:
        // Unknown jobs (incl. canary echoes, see DZ-48) complete silently;
        // log only non-canary for observability.
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown safeguarding job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
