import { Job } from 'bullmq';

import {
  SAFEGUARDING_SCAN_MESSAGE_JOB,
  SafeguardingScanMessageProcessor,
} from './message-scan.processor';
import {
  SAFEGUARDING_NOTIFY_REVIEWERS_JOB,
  SafeguardingNotifyReviewersProcessor,
} from './notify-reviewers.processor';
import { SafeguardingQueueDispatcher } from './safeguarding-queue.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('SafeguardingQueueDispatcher', () => {
  function buildDispatcher() {
    const safeguardingScanMessage = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as SafeguardingScanMessageProcessor;
    const safeguardingNotifyReviewers = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as SafeguardingNotifyReviewersProcessor;

    const dispatcher = new SafeguardingQueueDispatcher(
      safeguardingScanMessage,
      safeguardingNotifyReviewers,
    );

    return {
      dispatcher,
      safeguardingScanMessage,
      safeguardingNotifyReviewers,
    };
  }

  it.each([
    [SAFEGUARDING_SCAN_MESSAGE_JOB, 'safeguardingScanMessage'],
    [SAFEGUARDING_NOTIFY_REVIEWERS_JOB, 'safeguardingNotifyReviewers'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = ['safeguardingScanMessage', 'safeguardingNotifyReviewers'] as const;
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
