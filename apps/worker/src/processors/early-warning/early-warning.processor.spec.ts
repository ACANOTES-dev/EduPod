import { Job } from 'bullmq';

import {
  EARLY_WARNING_COMPUTE_DAILY_JOB,
  EARLY_WARNING_COMPUTE_STUDENT_JOB,
  EARLY_WARNING_WEEKLY_DIGEST_JOB,
} from '@school/shared/early-warning';

import { ComputeDailyProcessor } from './compute-daily.processor';
import { ComputeStudentProcessor } from './compute-student.processor';
import { EarlyWarningProcessor } from './early-warning.processor';
import { WeeklyDigestProcessor } from './weekly-digest.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('EarlyWarningProcessor', () => {
  function buildDispatcher() {
    const computeDaily = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ComputeDailyProcessor;
    const computeStudent = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ComputeStudentProcessor;
    const weeklyDigest = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as WeeklyDigestProcessor;

    const dispatcher = new EarlyWarningProcessor(computeDaily, computeStudent, weeklyDigest);

    return {
      dispatcher,
      computeDaily,
      computeStudent,
      weeklyDigest,
    };
  }

  it.each([
    [EARLY_WARNING_COMPUTE_DAILY_JOB, 'computeDaily'],
    [EARLY_WARNING_COMPUTE_STUDENT_JOB, 'computeStudent'],
    [EARLY_WARNING_WEEKLY_DIGEST_JOB, 'weeklyDigest'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = ['computeDaily', 'computeStudent', 'weeklyDigest'] as const;
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
