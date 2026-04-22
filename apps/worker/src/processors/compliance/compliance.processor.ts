import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { DEADLINE_CHECK_JOB, DeadlineCheckProcessor } from './deadline-check.processor';
import {
  RETENTION_ENFORCEMENT_JOB,
  RetentionEnforcementProcessor,
} from './retention-enforcement.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for the compliance queue — BullMQ creates exactly ONE
// Worker bound to this class, so jobs are never silently consumed by a
// sibling processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.COMPLIANCE, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ComplianceQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(ComplianceQueueDispatcher.name);

  constructor(
    private readonly deadlineCheck: DeadlineCheckProcessor,
    private readonly retentionEnforcement: RetentionEnforcementProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case DEADLINE_CHECK_JOB:
        await this.deadlineCheck.process(job);
        return;
      case RETENTION_ENFORCEMENT_JOB:
        await this.retentionEnforcement.process(job);
        return;
      default:
        this.logger.warn(`Unknown compliance job name "${job.name}" (id=${job.id})`);
        throw new Error(`No handler registered for compliance job "${job.name}"`);
    }
  }
}
