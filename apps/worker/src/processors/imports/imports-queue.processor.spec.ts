import { Job } from 'bullmq';

import {
  COMPLIANCE_EXECUTION_JOB,
  ComplianceExecutionProcessor,
} from '../compliance/compliance-execution.processor';

import {
  IMPORT_FILE_CLEANUP_JOB,
  ImportFileCleanupProcessor,
} from './import-file-cleanup.processor';
import { IMPORT_PROCESSING_JOB, ImportProcessingProcessor } from './import-processing.processor';
import { IMPORT_VALIDATION_JOB, ImportValidationProcessor } from './import-validation.processor';
import { ImportsQueueDispatcher } from './imports-queue.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('ImportsQueueDispatcher', () => {
  function buildDispatcher() {
    const complianceExecution = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ComplianceExecutionProcessor;
    const importFileCleanup = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ImportFileCleanupProcessor;
    const importProcessing = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ImportProcessingProcessor;
    const importValidation = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ImportValidationProcessor;

    const dispatcher = new ImportsQueueDispatcher(
      complianceExecution,
      importFileCleanup,
      importProcessing,
      importValidation,
    );

    return {
      dispatcher,
      complianceExecution,
      importFileCleanup,
      importProcessing,
      importValidation,
    };
  }

  it.each([
    [COMPLIANCE_EXECUTION_JOB, 'complianceExecution'],
    [IMPORT_FILE_CLEANUP_JOB, 'importFileCleanup'],
    [IMPORT_PROCESSING_JOB, 'importProcessing'],
    [IMPORT_VALIDATION_JOB, 'importValidation'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'complianceExecution',
      'importFileCleanup',
      'importProcessing',
      'importValidation',
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
