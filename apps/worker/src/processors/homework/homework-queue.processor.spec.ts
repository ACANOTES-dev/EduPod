import { Job } from 'bullmq';

import {
  HOMEWORK_COMPLETION_REMINDER_JOB,
  HomeworkCompletionReminderProcessor,
} from './completion-reminder.processor';
import { HOMEWORK_DIGEST_JOB, HomeworkDigestProcessor } from './digest-homework.processor';
import {
  HOMEWORK_GENERATE_RECURRING_JOB,
  HomeworkGenerateRecurringProcessor,
} from './generate-recurring.processor';
import { HomeworkQueueDispatcher } from './homework-queue.processor';
import {
  HOMEWORK_OVERDUE_DETECTION_JOB,
  HomeworkOverdueDetectionProcessor,
} from './overdue-detection.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('HomeworkQueueDispatcher', () => {
  function buildDispatcher() {
    const homeworkCompletionReminder = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as HomeworkCompletionReminderProcessor;
    const homeworkDigest = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as HomeworkDigestProcessor;
    const homeworkGenerateRecurring = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as HomeworkGenerateRecurringProcessor;
    const homeworkOverdueDetection = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as HomeworkOverdueDetectionProcessor;

    const dispatcher = new HomeworkQueueDispatcher(
      homeworkCompletionReminder,
      homeworkDigest,
      homeworkGenerateRecurring,
      homeworkOverdueDetection,
    );

    return {
      dispatcher,
      homeworkCompletionReminder,
      homeworkDigest,
      homeworkGenerateRecurring,
      homeworkOverdueDetection,
    };
  }

  it.each([
    [HOMEWORK_COMPLETION_REMINDER_JOB, 'homeworkCompletionReminder'],
    [HOMEWORK_DIGEST_JOB, 'homeworkDigest'],
    [HOMEWORK_GENERATE_RECURRING_JOB, 'homeworkGenerateRecurring'],
    [HOMEWORK_OVERDUE_DETECTION_JOB, 'homeworkOverdueDetection'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'homeworkCompletionReminder',
      'homeworkDigest',
      'homeworkGenerateRecurring',
      'homeworkOverdueDetection',
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
