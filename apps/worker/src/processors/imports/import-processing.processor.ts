import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import * as XLSX from 'xlsx';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { downloadBufferFromS3, deleteFromS3 } from '../../base/s3.helpers';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ImportProcessingPayload extends TenantJobPayload {
  import_job_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const IMPORT_PROCESSING_JOB = 'imports:process';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.IMPORTS, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ImportProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessingProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ImportProcessingPayload>): Promise<void> {
    if (job.name !== IMPORT_PROCESSING_JOB) {
      return;
    }

    const { tenant_id, import_job_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${IMPORT_PROCESSING_JOB} — tenant ${tenant_id}, import_job ${import_job_id}`,
    );

    // 1. Fetch import job metadata (outside transaction) to get file_key
    const importJob = await this.prisma.importJob.findFirst({
      where: { id: import_job_id, tenant_id },
      select: { file_key: true },
    });

    if (!importJob?.file_key) {
      // Let the transactional job handle the missing file_key / missing job case
      const processingJob = new ImportProcessingJob(this.prisma, null);
      await processingJob.execute(job.data);
      return;
    }

    // 2. Download file from S3 BEFORE entering the transaction
    let fileBuffer: Buffer | null = null;
    try {
      fileBuffer = await downloadBufferFromS3(importJob.file_key);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown S3 download error';
      this.logger.error(`Failed to download S3 file ${importJob.file_key}: ${message}`);
      // Pass null buffer — processJob will mark the import as failed
    }

    // 3. Run DB operations inside the RLS-scoped transaction
    const processingJob = new ImportProcessingJob(this.prisma, fileBuffer);
    await processingJob.execute(job.data);

    // 4. Delete S3 file AFTER the transaction completes successfully
    try {
      await deleteFromS3(importJob.file_key);
      this.logger.log(`Deleted S3 file ${importJob.file_key} after processing`);
    } catch (err) {
      this.logger.warn(
        `Failed to delete S3 file ${importJob.file_key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ─── File Parsing Helpers ────────────────────────────────────────────────────

function normaliseHeader(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s*\*+$/, '')
    .replace(/\s+/g, '_');
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

function parseFile(fileBuffer: Buffer, fileKey: string): { headers: string[]; rows: string[][] } {
  const isXlsx = fileKey.toLowerCase().endsWith('.xlsx') || fileKey.toLowerCase().endsWith('.xls');

  if (isXlsx) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [] };
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return { headers: [], rows: [] };

    const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    if (rawData.length === 0) return { headers: [], rows: [] };

    const headerRow = rawData[0] as string[];
    const headers = headerRow.map((h) => normaliseHeader(String(h ?? '')));

    const rows: string[][] = [];
    for (let i = 1; i < rawData.length; i++) {
      const rawRow = rawData[i] as unknown[];
      const hasData = rawRow.some((cell) => String(cell ?? '').trim().length > 0);
      if (!hasData) continue;
      const row = rawRow.map((cell) => {
        if (cell instanceof Date) return cell.toISOString().split('T')[0] ?? '';
        return String(cell ?? '').trim();
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  // CSV fallback
  const content = fileBuffer.toString('utf-8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const firstLine = lines[0];
  if (!firstLine) return { headers: [], rows: [] };
  const headers = parseCsvLine(firstLine).map((h) => normaliseHeader(h));
  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { headers, rows };
}

function getField(headers: string[], row: string[], fieldName: string): string | undefined {
  const index = headers.indexOf(fieldName);
  if (index === -1 || index >= row.length) return undefined;
  const val = row[index]?.trim();
  return val && val.length > 0 ? val : undefined;
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class ImportProcessingJob extends TenantAwareJob<ImportProcessingPayload> {
  private readonly logger = new Logger(ImportProcessingJob.name);

  /** Pre-fetched file buffer — S3 download happens outside the transaction */
  private readonly fileBuffer: Buffer | null;

  constructor(prisma: PrismaClient, fileBuffer: Buffer | null) {
    super(prisma);
    this.fileBuffer = fileBuffer;
  }

  protected async processJob(data: ImportProcessingPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, import_job_id } = data;

    // 1. Fetch the import job
    const importJob = await tx.importJob.findFirst({
      where: {
        id: import_job_id,
        tenant_id,
      },
    });

    if (!importJob) {
      throw new Error(`ImportJob ${import_job_id} not found for tenant ${tenant_id}`);
    }

    if (!importJob.file_key) {
      await tx.importJob.update({
        where: { id: import_job_id },
        data: {
          status: 'failed',
          summary_json: { error: 'No file_key associated with this import job.' },
        },
      });
      return;
    }

    // Mark as processing
    await tx.importJob.update({
      where: { id: import_job_id },
      data: { status: 'processing' },
    });

    // 2. Check pre-fetched buffer (S3 download already happened outside the transaction)
    if (!this.fileBuffer) {
      await tx.importJob.update({
        where: { id: import_job_id },
        data: {
          status: 'failed',
          summary_json: { error: 'Failed to download file from storage.' },
        },
      });
      return;
    }

    // 3. Parse file (XLSX or CSV)
    const { headers, rows } = parseFile(this.fileBuffer, importJob.file_key);

    if (rows.length === 0) {
      await tx.importJob.update({
        where: { id: import_job_id },
        data: {
          status: 'failed',
          summary_json: { error: 'CSV file has no data rows.' },
        },
      });
      return;
    }

    // 4. Process rows based on import type
    let successCount = 0;
    let failureCount = 0;
    const rowErrors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2; // 1-indexed + header row

      try {
        switch (importJob.import_type) {
          case 'students':
            await this.processStudentRow(tx, tenant_id, headers, row);
            break;
          case 'parents':
            await this.processParentRow(tx, tenant_id, headers, row);
            break;
          default:
            // Other import types are not yet implemented
            throw new Error(
              `Import type "${importJob.import_type}" processing not yet implemented`,
            );
        }
        successCount++;
      } catch (err) {
        failureCount++;
        const message = err instanceof Error ? err.message : String(err);
        if (rowErrors.length < 50) {
          rowErrors.push({ row: rowNum, error: message });
        }
        this.logger.warn(`Row ${rowNum} failed: ${message}`);
      }
    }

    // 5. Update import_job with final summary
    const finalStatus = failureCount === rows.length ? 'failed' : 'completed';
    const summary = {
      total_rows: rows.length,
      success_count: successCount,
      failure_count: failureCount,
      row_errors: rowErrors,
    };

    await tx.importJob.update({
      where: { id: import_job_id },
      data: {
        status: finalStatus,
        summary_json: summary,
      },
    });

    this.logger.log(
      `Import processing complete for job ${import_job_id}: ${successCount} succeeded, ${failureCount} failed out of ${rows.length} rows, tenant ${tenant_id}`,
    );
  }

  private async processStudentRow(
    tx: PrismaClient,
    tenantId: string,
    headers: string[],
    row: string[],
  ): Promise<void> {
    const firstName = getField(headers, row, 'first_name');
    const lastName = getField(headers, row, 'last_name');
    const dateOfBirth = getField(headers, row, 'date_of_birth');
    const gender = getField(headers, row, 'gender');
    const householdName = getField(headers, row, 'household_name');
    const firstNameAr = getField(headers, row, 'first_name_ar');
    const lastNameAr = getField(headers, row, 'last_name_ar');

    if (!firstName || !lastName || !dateOfBirth) {
      throw new Error('Missing required fields: first_name, last_name, or date_of_birth');
    }

    // Find or create household
    let householdId: string;
    if (householdName) {
      const existing = await tx.household.findFirst({
        where: { tenant_id: tenantId, household_name: householdName },
        select: { id: true },
      });
      if (existing) {
        householdId = existing.id;
      } else {
        const newHousehold = await tx.household.create({
          data: {
            tenant_id: tenantId,
            household_name: householdName,
            status: 'active',
          },
        });
        householdId = newHousehold.id;
      }
    } else {
      // Create a default household named after the student
      const newHousehold = await tx.household.create({
        data: {
          tenant_id: tenantId,
          household_name: `${lastName} Family`,
          status: 'active',
        },
      });
      householdId = newHousehold.id;
    }

    // Create student
    await tx.student.create({
      data: {
        tenant_id: tenantId,
        household_id: householdId,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        first_name_ar: firstNameAr || null,
        last_name_ar: lastNameAr || null,
        full_name_ar: firstNameAr && lastNameAr ? `${firstNameAr} ${lastNameAr}` : null,
        date_of_birth: new Date(dateOfBirth),
        gender: gender ? (gender.toLowerCase() as 'male' | 'female') : null,
        status: 'active',
        entry_date: new Date(),
      },
    });
  }

  private async processParentRow(
    tx: PrismaClient,
    tenantId: string,
    headers: string[],
    row: string[],
  ): Promise<void> {
    const firstName = getField(headers, row, 'first_name');
    const lastName = getField(headers, row, 'last_name');
    const email = getField(headers, row, 'email');
    const phone = getField(headers, row, 'phone');
    const relationshipLabel = getField(headers, row, 'relationship_label');

    if (!firstName || !lastName || !email) {
      throw new Error('Missing required fields: first_name, last_name, or email');
    }

    // Check for existing parent with same email
    const existing = await tx.parent.findFirst({
      where: { tenant_id: tenantId, email },
      select: { id: true },
    });

    if (existing) {
      throw new Error(`Parent with email "${email}" already exists`);
    }

    await tx.parent.create({
      data: {
        tenant_id: tenantId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        relationship_label: relationshipLabel || null,
        preferred_contact_channels: ['email'],
        status: 'active',
      },
    });
  }
}
