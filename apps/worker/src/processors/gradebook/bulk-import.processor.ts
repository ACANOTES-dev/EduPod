import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface BulkImportPayload extends TenantJobPayload {
  rows: Array<{
    student_id: string;
    assessment_id: string;
    score: number;
  }>;
  imported_by_user_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const BULK_IMPORT_PROCESS_JOB = 'gradebook:bulk-import-process';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.GRADEBOOK)
export class BulkImportProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkImportProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<BulkImportPayload>): Promise<void> {
    if (job.name !== BULK_IMPORT_PROCESS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${BULK_IMPORT_PROCESS_JOB} — tenant ${tenant_id}, ${job.data.rows.length} rows`,
    );

    const importJob = new BulkImportJob(this.prisma);
    await importJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class BulkImportJob extends TenantAwareJob<BulkImportPayload> {
  private readonly logger = new Logger(BulkImportJob.name);

  protected async processJob(
    data: BulkImportPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, rows, imported_by_user_id } = data;
    const batchSize = 100;
    let processed = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      for (const row of batch) {
        // Verify assessment exists and is in a gradeable status
        const assessment = await tx.assessment.findFirst({
          where: {
            id: row.assessment_id,
            tenant_id,
            status: { in: ['draft', 'open'] },
          },
          select: { id: true, max_score: true },
        });

        if (!assessment) {
          skipped++;
          continue;
        }

        // Clamp score to max_score
        const maxScore = Number(assessment.max_score);
        const score = Math.min(row.score, maxScore);

        // Find existing grade
        const existing = await tx.grade.findFirst({
          where: {
            tenant_id,
            assessment_id: row.assessment_id,
            student_id: row.student_id,
          },
          select: { id: true, raw_score: true },
        });

        const now = new Date();

        if (existing) {
          await tx.grade.update({
            where: { id: existing.id },
            data: {
              raw_score: score,
              is_missing: false,
              entered_by_user_id: imported_by_user_id,
              entered_at: existing.raw_score === null ? now : undefined,
            },
          });
        } else {
          await tx.grade.create({
            data: {
              tenant_id,
              assessment_id: row.assessment_id,
              student_id: row.student_id,
              raw_score: score,
              is_missing: false,
              entered_by_user_id: imported_by_user_id,
              entered_at: now,
            },
          });
        }

        processed++;
      }
    }

    this.logger.log(
      `Bulk import complete for tenant ${tenant_id}: ${processed} processed, ${skipped} skipped`,
    );
  }
}
