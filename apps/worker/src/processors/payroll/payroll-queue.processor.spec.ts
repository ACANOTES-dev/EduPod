import { Job } from 'bullmq';

import {
  PAYROLL_MASS_EXPORT_JOB,
  PAYROLL_ON_APPROVAL_JOB,
  PAYROLL_SESSION_GENERATION_JOB,
} from '@school/shared/payroll';

import { PayrollApprovalCallbackProcessor } from './approval-callback.processor';
import { PayrollMassExportProcessor } from './mass-export.processor';
import { PayrollQueueDispatcher } from './payroll-queue.processor';
import { PayrollSessionGenerationProcessor } from './session-generation.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('PayrollQueueDispatcher', () => {
  function buildDispatcher() {
    const payrollApprovalCallback = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as PayrollApprovalCallbackProcessor;
    const payrollMassExport = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as PayrollMassExportProcessor;
    const payrollSessionGeneration = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as PayrollSessionGenerationProcessor;

    const dispatcher = new PayrollQueueDispatcher(
      payrollApprovalCallback,
      payrollMassExport,
      payrollSessionGeneration,
    );

    return {
      dispatcher,
      payrollApprovalCallback,
      payrollMassExport,
      payrollSessionGeneration,
    };
  }

  it.each([
    [PAYROLL_ON_APPROVAL_JOB, 'payrollApprovalCallback'],
    [PAYROLL_MASS_EXPORT_JOB, 'payrollMassExport'],
    [PAYROLL_SESSION_GENERATION_JOB, 'payrollSessionGeneration'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'payrollApprovalCallback',
      'payrollMassExport',
      'payrollSessionGeneration',
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
