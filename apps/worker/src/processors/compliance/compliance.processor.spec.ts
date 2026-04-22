import { Job } from 'bullmq';

import { ComplianceQueueDispatcher } from './compliance.processor';
import { DEADLINE_CHECK_JOB, DeadlineCheckProcessor } from './deadline-check.processor';
import {
  RETENTION_ENFORCEMENT_JOB,
  RetentionEnforcementProcessor,
} from './retention-enforcement.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('ComplianceQueueDispatcher', () => {
  function buildDispatcher() {
    const deadlineCheck = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as DeadlineCheckProcessor;
    const retentionEnforcement = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as RetentionEnforcementProcessor;

    const dispatcher = new ComplianceQueueDispatcher(deadlineCheck, retentionEnforcement);

    return {
      dispatcher,
      deadlineCheck,
      retentionEnforcement,
    };
  }

  it.each([
    [DEADLINE_CHECK_JOB, 'deadlineCheck'],
    [RETENTION_ENFORCEMENT_JOB, 'retentionEnforcement'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = ['deadlineCheck', 'retentionEnforcement'] as const;
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
