import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { ANOMALY_SCAN_JOB, AnomalyScanProcessor } from './anomaly-scan.processor';
import { BREACH_DEADLINE_JOB, BreachDeadlineProcessor } from './breach-deadline.processor';
import { KEY_ROTATION_JOB, KeyRotationProcessor } from './key-rotation.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.SECURITY, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SecurityQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(SecurityQueueDispatcher.name);

  constructor(
    private readonly anomalyScan: AnomalyScanProcessor,
    private readonly breachDeadline: BreachDeadlineProcessor,
    private readonly keyRotation: KeyRotationProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case ANOMALY_SCAN_JOB:
        await this.anomalyScan.process(job);
        return;
      case BREACH_DEADLINE_JOB:
        await this.breachDeadline.process(job);
        return;
      case KEY_ROTATION_JOB:
        await this.keyRotation.process(job);
        return;
      default:
        // Unknown jobs (incl. canary echoes, see DZ-48) complete silently;
        // log only non-canary for observability.
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown security job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
