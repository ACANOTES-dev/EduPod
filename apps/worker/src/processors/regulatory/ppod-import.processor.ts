import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PodDatabaseType, PodSyncStatus, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import type { TenantJobPayload } from '../../base/tenant-aware-job';
import { TenantAwareJob } from '../../base/tenant-aware-job';

// ─── Payload ────────────────────────────────────────────────────────────────
export interface PpodImportPayload extends TenantJobPayload {
  database_type: 'ppod' | 'pod';
  csv_content: string;
}

// ─── Job name ───────────────────────────────────────────────────────────────
export const REGULATORY_PPOD_IMPORT_JOB = 'regulatory:ppod-import';

// ─── CSV row shape ──────────────────────────────────────────────────────────
interface PpodCsvRow {
  pps_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  ppod_id: string;
  [key: string]: string;
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.REGULATORY, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class RegulatoryPpodImportProcessor extends WorkerHost {
  private readonly logger = new Logger(RegulatoryPpodImportProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<PpodImportPayload>): Promise<void> {
    if (job.name !== REGULATORY_PPOD_IMPORT_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${REGULATORY_PPOD_IMPORT_JOB} — tenant ${tenant_id}, type ${job.data.database_type}`,
    );

    const innerJob = new PpodImportJob(this.prisma);
    await innerJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ──────────────────────────────────────────

class PpodImportJob extends TenantAwareJob<PpodImportPayload> {
  private readonly logger = new Logger(PpodImportJob.name);

  protected async processJob(data: PpodImportPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, database_type, csv_content } = data;
    const dbType = database_type as PodDatabaseType;
    const startedAt = new Date();

    // 1. Parse CSV content
    const rows = this.parseCsv(csv_content);

    this.logger.log(`Tenant ${tenant_id}: importing ${rows.length} rows for ${database_type}`);

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const row of rows) {
      try {
        // 2. Match student by PPS number (national_id) first, then by name + DOB
        const student = await this.matchStudent(tx, tenant_id, row);

        if (!student) {
          failedCount++;
          continue;
        }

        // 3. Create or update ppod_student_mapping
        const existingMapping = await tx.ppodStudentMapping.findFirst({
          where: {
            tenant_id,
            student_id: student.id,
            database_type: dbType,
          },
        });

        if (existingMapping) {
          await tx.ppodStudentMapping.update({
            where: { id: existingMapping.id },
            data: {
              external_id: row.ppod_id || existingMapping.external_id,
              sync_status: PodSyncStatus.synced,
              last_synced_at: new Date(),
            },
          });
          updatedCount++;
        } else {
          await tx.ppodStudentMapping.create({
            data: {
              tenant_id,
              student_id: student.id,
              database_type: dbType,
              external_id: row.ppod_id || null,
              sync_status: PodSyncStatus.synced,
              last_synced_at: new Date(),
            },
          });
          createdCount++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to import row: ${error instanceof Error ? error.message : String(error)}`,
        );
        failedCount++;
      }
    }

    // 4. Create sync log entry with results
    await tx.ppodSyncLog.create({
      data: {
        tenant_id,
        database_type: dbType,
        sync_type: 'full',
        triggered_by_id: data.user_id ?? null,
        started_at: startedAt,
        completed_at: new Date(),
        status: failedCount > 0 ? 'completed_with_errors' : 'sync_completed',
        records_pushed: 0,
        records_created: createdCount,
        records_updated: updatedCount,
        records_failed: failedCount,
        transport_used: 'csv_import',
      },
    });

    this.logger.log(
      `Tenant ${tenant_id}: ${database_type} import complete — ${createdCount} created, ${updatedCount} updated, ${failedCount} failed`,
    );
  }

  // ─── Student matching ───────────────────────────────────────────────────

  private async matchStudent(
    tx: PrismaClient,
    tenantId: string,
    row: PpodCsvRow,
  ): Promise<{ id: string } | null> {
    // Primary match: PPS number (stored as national_id in student table)
    if (row.pps_number) {
      const byNationalId = await tx.student.findFirst({
        where: {
          tenant_id: tenantId,
          national_id: row.pps_number.trim(),
          status: 'active',
        },
        select: { id: true },
      });
      if (byNationalId) return byNationalId;
    }

    // Fallback match: first_name + last_name + date_of_birth
    if (row.first_name && row.last_name && row.date_of_birth) {
      const dob = new Date(row.date_of_birth);
      if (!isNaN(dob.getTime())) {
        const byNameDob = await tx.student.findFirst({
          where: {
            tenant_id: tenantId,
            first_name: { equals: row.first_name.trim(), mode: 'insensitive' },
            last_name: { equals: row.last_name.trim(), mode: 'insensitive' },
            date_of_birth: dob,
            status: 'active',
          },
          select: { id: true },
        });
        if (byNameDob) return byNameDob;
      }
    }

    return null;
  }

  // ─── CSV parsing ────────────────────────────────────────────────────────

  private parseCsv(csvContent: string): PpodCsvRow[] {
    const lines = csvContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) return [];

    const headerLine = lines[0];
    if (!headerLine) return [];

    const headers = this.parseCsvLine(headerLine).map((h) => h.toLowerCase().replace(/\s+/g, '_'));

    const rows: PpodCsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const values = this.parseCsvLine(line);
      const row: Record<string, string> = {};

      for (let j = 0; j < headers.length; j++) {
        const key = headers[j];
        if (key) {
          row[key] = values[j]?.trim() ?? '';
        }
      }

      rows.push(row as PpodCsvRow);
    }

    return rows;
  }

  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    fields.push(current.trim());
    return fields;
  }
}
