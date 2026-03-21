import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { deleteFromS3 } from '../../base/s3.helpers';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const IMPORT_FILE_CLEANUP_JOB = 'imports:file-cleanup';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cleanup processor that runs across all tenants.
 * Does NOT extend TenantAwareJob since it is not tenant-scoped.
 *
 * Deletes S3 files for completed/failed import jobs, and any imports
 * older than 24 hours that still have a file_key.
 */
@Processor(QUEUE_NAMES.IMPORTS)
export class ImportFileCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportFileCleanupProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== IMPORT_FILE_CLEANUP_JOB) {
      return;
    }

    this.logger.log(`Processing ${IMPORT_FILE_CLEANUP_JOB} — cross-tenant file cleanup`);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find import jobs with file_key that are completed/failed or older than 24h
    const staleJobs = await this.prisma.importJob.findMany({
      where: {
        file_key: { not: null },
        OR: [
          { status: { in: ['completed', 'failed'] } },
          { created_at: { lt: twentyFourHoursAgo } },
        ],
      },
      select: {
        id: true,
        file_key: true,
        status: true,
        tenant_id: true,
      },
    });

    this.logger.log(`Found ${staleJobs.length} import jobs with stale S3 files`);

    let cleanedCount = 0;
    let failedCount = 0;

    for (const importJob of staleJobs) {
      if (!importJob.file_key) continue;

      try {
        await this.deleteS3File(importJob.file_key);
        cleanedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to delete S3 file "${importJob.file_key}" for job ${importJob.id}: ${message}`,
        );
        failedCount++;
      }

      // Clear file_key regardless of S3 delete success to prevent repeated attempts
      try {
        await this.prisma.importJob.update({
          where: { id: importJob.id },
          data: { file_key: null },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to clear file_key on import job ${importJob.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `File cleanup complete: ${cleanedCount} files deleted, ${failedCount} failed, ${staleJobs.length} jobs processed`,
    );
  }

  private async deleteS3File(fileKey: string): Promise<void> {
    await deleteFromS3(fileKey);
  }
}
