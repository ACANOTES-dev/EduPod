import { Job } from 'bullmq';

import {
  REGULATORY_DEADLINE_CHECK_JOB,
  RegulatoryDeadlineCheckProcessor,
} from './deadline-check.processor';
import {
  REGULATORY_DES_GENERATE_JOB,
  RegulatoryDesGenerateProcessor,
} from './des-returns-generate.processor';
import { REGULATORY_PPOD_IMPORT_JOB, RegulatoryPpodImportProcessor } from './ppod-import.processor';
import { REGULATORY_PPOD_SYNC_JOB, RegulatoryPpodSyncProcessor } from './ppod-sync.processor';
import { RegulatoryQueueDispatcher } from './regulatory-queue.processor';
import {
  REGULATORY_TUSLA_THRESHOLD_SCAN_JOB,
  RegulatoryTuslaThresholdScanProcessor,
} from './tusla-threshold-scan.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('RegulatoryQueueDispatcher', () => {
  function buildDispatcher() {
    const regulatoryDeadlineCheck = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegulatoryDeadlineCheckProcessor;
    const regulatoryDesGenerate = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegulatoryDesGenerateProcessor;
    const regulatoryPpodImport = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegulatoryPpodImportProcessor;
    const regulatoryPpodSync = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegulatoryPpodSyncProcessor;
    const regulatoryTuslaThresholdScan = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegulatoryTuslaThresholdScanProcessor;

    const dispatcher = new RegulatoryQueueDispatcher(
      regulatoryDeadlineCheck,
      regulatoryDesGenerate,
      regulatoryPpodImport,
      regulatoryPpodSync,
      regulatoryTuslaThresholdScan,
    );

    return {
      dispatcher,
      regulatoryDeadlineCheck,
      regulatoryDesGenerate,
      regulatoryPpodImport,
      regulatoryPpodSync,
      regulatoryTuslaThresholdScan,
    };
  }

  it.each([
    [REGULATORY_DEADLINE_CHECK_JOB, 'regulatoryDeadlineCheck'],
    [REGULATORY_DES_GENERATE_JOB, 'regulatoryDesGenerate'],
    [REGULATORY_PPOD_IMPORT_JOB, 'regulatoryPpodImport'],
    [REGULATORY_PPOD_SYNC_JOB, 'regulatoryPpodSync'],
    [REGULATORY_TUSLA_THRESHOLD_SCAN_JOB, 'regulatoryTuslaThresholdScan'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'regulatoryDeadlineCheck',
      'regulatoryDesGenerate',
      'regulatoryPpodImport',
      'regulatoryPpodSync',
      'regulatoryTuslaThresholdScan',
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
