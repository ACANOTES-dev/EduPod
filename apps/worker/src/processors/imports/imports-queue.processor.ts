import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
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

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.IMPORTS, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ImportsQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(ImportsQueueDispatcher.name);

  constructor(
    private readonly complianceExecution: ComplianceExecutionProcessor,
    private readonly importFileCleanup: ImportFileCleanupProcessor,
    private readonly importProcessing: ImportProcessingProcessor,
    private readonly importValidation: ImportValidationProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case COMPLIANCE_EXECUTION_JOB:
        await this.complianceExecution.process(job);
        return;
      case IMPORT_FILE_CLEANUP_JOB:
        await this.importFileCleanup.process(job);
        return;
      case IMPORT_PROCESSING_JOB:
        await this.importProcessing.process(job);
        return;
      case IMPORT_VALIDATION_JOB:
        await this.importValidation.process(job);
        return;
      default:
        this.logger.warn(`Unknown imports job name "${job.name}" (id=${job.id})`);
        throw new Error(`No handler registered for imports job "${job.name}"`);
    }
  }
}
