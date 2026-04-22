import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

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
import {
  REGULATORY_TUSLA_THRESHOLD_SCAN_JOB,
  RegulatoryTuslaThresholdScanProcessor,
} from './tusla-threshold-scan.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.REGULATORY, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class RegulatoryQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(RegulatoryQueueDispatcher.name);

  constructor(
    private readonly regulatoryDeadlineCheck: RegulatoryDeadlineCheckProcessor,
    private readonly regulatoryDesGenerate: RegulatoryDesGenerateProcessor,
    private readonly regulatoryPpodImport: RegulatoryPpodImportProcessor,
    private readonly regulatoryPpodSync: RegulatoryPpodSyncProcessor,
    private readonly regulatoryTuslaThresholdScan: RegulatoryTuslaThresholdScanProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case REGULATORY_DEADLINE_CHECK_JOB:
        await this.regulatoryDeadlineCheck.process(job);
        return;
      case REGULATORY_DES_GENERATE_JOB:
        await this.regulatoryDesGenerate.process(job);
        return;
      case REGULATORY_PPOD_IMPORT_JOB:
        await this.regulatoryPpodImport.process(job);
        return;
      case REGULATORY_PPOD_SYNC_JOB:
        await this.regulatoryPpodSync.process(job);
        return;
      case REGULATORY_TUSLA_THRESHOLD_SCAN_JOB:
        await this.regulatoryTuslaThresholdScan.process(job);
        return;
      default:
        this.logger.warn(`Unknown regulatory job name "${job.name}" (id=${job.id})`);
        throw new Error(`No handler registered for regulatory job "${job.name}"`);
    }
  }
}
