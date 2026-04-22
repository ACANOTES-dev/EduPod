import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  EARLY_WARNING_COMPUTE_DAILY_JOB,
  EARLY_WARNING_COMPUTE_STUDENT_JOB,
  EARLY_WARNING_WEEKLY_DIGEST_JOB,
} from '@school/shared/early-warning';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { ComputeDailyPayload, ComputeDailyProcessor } from './compute-daily.processor';
import { ComputeStudentPayload, ComputeStudentProcessor } from './compute-student.processor';
import { WeeklyDigestPayload, WeeklyDigestProcessor } from './weekly-digest.processor';

// ─── Dispatcher ─────────────────────────────────────────────────────────────
//
// This is the sole `@Processor` attached to the early-warning queue. It exists
// to route jobs by name to the correct handler. Attaching multiple `@Processor`
// classes to the same queue causes BullMQ workers to race for jobs; any worker
// that lands a job whose name its inner guard rejects will silently mark the
// job complete without running — observed as 1/20 effective hit rate when
// compute-daily, compute-student, and weekly-digest each owned a `@Processor`.
// Routing through a single dispatcher guarantees each job reaches its handler.

@Processor(QUEUE_NAMES.EARLY_WARNING, {
  lockDuration: 300_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class EarlyWarningProcessor extends WorkerHost {
  private readonly logger = new Logger(EarlyWarningProcessor.name);

  constructor(
    private readonly computeDaily: ComputeDailyProcessor,
    private readonly computeStudent: ComputeStudentProcessor,
    private readonly weeklyDigest: WeeklyDigestProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EARLY_WARNING_COMPUTE_DAILY_JOB:
        await this.computeDaily.process(job as Job<ComputeDailyPayload>);
        return;
      case EARLY_WARNING_COMPUTE_STUDENT_JOB:
        await this.computeStudent.process(job as Job<ComputeStudentPayload>);
        return;
      case EARLY_WARNING_WEEKLY_DIGEST_JOB:
        await this.weeklyDigest.process(job as Job<WeeklyDigestPayload>);
        return;
      default:
        this.logger.warn(`Unknown early-warning job name: ${job.name} (id=${job.id})`);
        return;
    }
  }
}
