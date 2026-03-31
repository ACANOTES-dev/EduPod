import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ImportType } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import type { StudentImportStats } from './import-executor.service';
import { ImportExecutorService } from './import-executor.service';
import { ImportParserService } from './import-parser.service';

@Injectable()
export class ImportProcessingService {
  private readonly logger = new Logger(ImportProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly parser: ImportParserService,
    private readonly executor: ImportExecutorService,
  ) {}

  /**
   * Process a confirmed import job. Downloads file (CSV or XLSX), parses rows,
   * creates records in the DB for each valid row within an RLS-scoped transaction.
   * Updates the import_job with final counts and deletes S3 file on completion.
   */
  async process(tenantId: string, jobId: string): Promise<void> {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, tenant_id: tenantId },
    });

    if (!job || !job.file_key) {
      this.logger.error(`Import job ${jobId} not found or missing file_key`);
      return;
    }

    const importType = job.import_type as ImportType;
    const summary = job.summary_json as Record<string, unknown>;
    const validationErrors = Array.isArray(summary['errors'])
      ? (summary['errors'] as Array<{ row: number }>)
      : [];
    const errorRows = new Set(validationErrors.map((e) => e.row));
    const createdByUserId = job.created_by_user_id;

    try {
      // Download file from S3
      const fileBuffer = await this.s3Service.download(job.file_key);

      // Determine file type from S3 key
      const isXlsx = job.file_key.toLowerCase().endsWith('.xlsx');

      // Parse file into rows
      const { headers, rows: dataRows } = isXlsx
        ? this.parser.parseXlsx(fileBuffer)
        : this.parser.parseCsv(fileBuffer);

      // headers is used for reference only -- we already have parsed rows
      if (headers.length === 0 || dataRows.length === 0) {
        await this.updateJobFinal(jobId, 'failed', 0, 0);
        return;
      }

      // Filter out example rows
      const filteredRows = dataRows.filter((row) => !this.parser.isExampleRow(row, importType));

      let successCount = 0;
      let failCount = 0;
      let extraSummary: Partial<StudentImportStats> | undefined;

      const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

      if (importType === 'students') {
        // Students use family-grouped processing for deduplication
        const result = await this.executor.processStudentRows(
          rlsClient,
          tenantId,
          filteredRows,
          errorRows,
          jobId,
        );
        successCount = result.students_created;
        failCount = result.skipped_rows.filter(
          (r) =>
            r.reason.startsWith('Error:') ||
            r.reason.startsWith('Family group error:') ||
            r.reason.startsWith('Validation error'),
        ).length;
        extraSummary = {
          students_created: result.students_created,
          households_created: result.households_created,
          households_reused: result.households_reused,
          parents_created: result.parents_created,
          family_groups: result.family_groups,
        };
      } else {
        // Process each row in its own RLS transaction to avoid timeout issues
        // (staff imports do bcrypt + multiple DB operations per row)
        for (let i = 0; i < filteredRows.length; i++) {
          const rowNumber = i + 2; // 1-indexed, row 1 = headers

          if (errorRows.has(rowNumber)) {
            failCount++;
            continue;
          }

          const row = filteredRows[i];
          if (!row) {
            failCount++;
            continue;
          }

          try {
            await rlsClient.$transaction(async (tx) => {
              const db = tx as unknown as PrismaService;
              await this.executor.processRow(db, tenantId, importType, row, createdByUserId);
            });
            successCount++;
          } catch (err) {
            this.logger.warn(
              `Import job ${jobId} row ${rowNumber} processing error: ${String(err)}`,
            );
            failCount++;
          }
        }
      }

      const finalStatus = failCount > 0 && successCount === 0 ? 'failed' : 'completed';
      await this.updateJobFinal(jobId, finalStatus, successCount, failCount, extraSummary);

      // Delete S3 file on completion
      try {
        await this.s3Service.delete(job.file_key);
        this.logger.log(`Import job ${jobId}: deleted S3 file ${job.file_key}`);
      } catch (err) {
        this.logger.warn(`Import job ${jobId}: failed to delete S3 file: ${String(err)}`);
      }

      this.logger.log(
        `Import job ${jobId} processing complete: ${successCount} success, ${failCount} failed, status=${finalStatus}`,
      );
    } catch (err) {
      this.logger.error(`Import job ${jobId} processing error: ${String(err)}`);
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          summary_json: {
            ...(job.summary_json as Prisma.JsonObject),
            processing_error: String(err),
          },
        },
      });
    }
  }

  // ─── Job Finalisation ──────────────────────────────────────────────────────

  private async updateJobFinal(
    jobId: string,
    status: 'completed' | 'failed',
    successful: number,
    failed: number,
    extraSummary?: Partial<StudentImportStats>,
  ): Promise<void> {
    const existing = await this.prisma.importJob.findUnique({
      where: { id: jobId },
    });

    const existingSummary = (existing?.summary_json as Prisma.JsonObject) ?? {};

    const summaryData: Prisma.JsonObject = {
      ...existingSummary,
      successful,
      failed,
    };

    if (extraSummary) {
      summaryData['students_created'] = extraSummary.students_created ?? 0;
      summaryData['households_created'] = extraSummary.households_created ?? 0;
      summaryData['households_reused'] = extraSummary.households_reused ?? 0;
      summaryData['parents_created'] = extraSummary.parents_created ?? 0;
      if (extraSummary.family_groups) {
        summaryData['family_groups'] = extraSummary.family_groups as unknown as Prisma.JsonArray;
      }
    }

    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status,
        summary_json: summaryData,
      },
    });
  }
}
