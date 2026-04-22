import { Job } from 'bullmq';

import { ANOMALY_SCAN_JOB, AnomalyScanProcessor } from './anomaly-scan.processor';
import { BREACH_DEADLINE_JOB, BreachDeadlineProcessor } from './breach-deadline.processor';
import { KEY_ROTATION_JOB, KeyRotationProcessor } from './key-rotation.processor';
import { SecurityQueueDispatcher } from './security-queue.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('SecurityQueueDispatcher', () => {
  function buildDispatcher() {
    const anomalyScan = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as AnomalyScanProcessor;
    const breachDeadline = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BreachDeadlineProcessor;
    const keyRotation = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as KeyRotationProcessor;

    const dispatcher = new SecurityQueueDispatcher(anomalyScan, breachDeadline, keyRotation);

    return {
      dispatcher,
      anomalyScan,
      breachDeadline,
      keyRotation,
    };
  }

  it.each([
    [ANOMALY_SCAN_JOB, 'anomalyScan'],
    [BREACH_DEADLINE_JOB, 'breachDeadline'],
    [KEY_ROTATION_JOB, 'keyRotation'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = ['anomalyScan', 'breachDeadline', 'keyRotation'] as const;
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
