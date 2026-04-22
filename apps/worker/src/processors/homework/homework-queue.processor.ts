import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  HOMEWORK_COMPLETION_REMINDER_JOB,
  HomeworkCompletionReminderProcessor,
} from './completion-reminder.processor';
import { HOMEWORK_DIGEST_JOB, HomeworkDigestProcessor } from './digest-homework.processor';
import {
  HOMEWORK_GENERATE_RECURRING_JOB,
  HomeworkGenerateRecurringProcessor,
} from './generate-recurring.processor';
import {
  HOMEWORK_OVERDUE_DETECTION_JOB,
  HomeworkOverdueDetectionProcessor,
} from './overdue-detection.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.HOMEWORK, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class HomeworkQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(HomeworkQueueDispatcher.name);

  constructor(
    private readonly homeworkCompletionReminder: HomeworkCompletionReminderProcessor,
    private readonly homeworkDigest: HomeworkDigestProcessor,
    private readonly homeworkGenerateRecurring: HomeworkGenerateRecurringProcessor,
    private readonly homeworkOverdueDetection: HomeworkOverdueDetectionProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case HOMEWORK_COMPLETION_REMINDER_JOB:
        await this.homeworkCompletionReminder.process(job);
        return;
      case HOMEWORK_DIGEST_JOB:
        await this.homeworkDigest.process(job);
        return;
      case HOMEWORK_GENERATE_RECURRING_JOB:
        await this.homeworkGenerateRecurring.process(job);
        return;
      case HOMEWORK_OVERDUE_DETECTION_JOB:
        await this.homeworkOverdueDetection.process(job);
        return;
      default:
        this.logger.warn(`Unknown homework job name "${job.name}" (id=${job.id})`);
        throw new Error(`No handler registered for homework job "${job.name}"`);
    }
  }
}
