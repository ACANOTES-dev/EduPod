import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import * as XLSX from 'xlsx';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { downloadBufferFromS3 } from '../../base/s3.helpers';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ImportValidationPayload extends TenantJobPayload {
  import_job_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const IMPORT_VALIDATION_JOB = 'imports:validate';

// ─── Expected headers per import type ────────────────────────────────────────

const EXPECTED_HEADERS: Record<string, string[]> = {
  students: ['first_name', 'last_name', 'date_of_birth', 'gender'],
  parents: ['first_name', 'last_name', 'email', 'phone', 'relationship_label'],
  staff: ['first_name', 'last_name', 'email', 'job_title', 'department'],
  fees: ['fee_name', 'amount', 'currency_code', 'academic_year'],
  exam_results: ['student_number', 'subject', 'score', 'max_score'],
  staff_compensation: ['staff_number', 'compensation_type', 'base_salary'],
};

const REQUIRED_FIELDS: Record<string, string[]> = {
  students: ['first_name', 'last_name', 'date_of_birth'],
  parents: ['first_name', 'last_name', 'email'],
  staff: ['first_name', 'last_name', 'email'],
  fees: ['fee_name', 'amount'],
  exam_results: ['student_number', 'subject', 'score', 'max_score'],
  staff_compensation: ['staff_number', 'compensation_type', 'base_salary'],
};

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.IMPORTS, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ImportValidationProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportValidationProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ImportValidationPayload>): Promise<void> {
    if (job.name !== IMPORT_VALIDATION_JOB) {
      return;
    }

    const { tenant_id, import_job_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${IMPORT_VALIDATION_JOB} — tenant ${tenant_id}, import_job ${import_job_id}`,
    );

    // 1. Fetch import job metadata (outside transaction) to get file_key
    const importJob = await this.prisma.importJob.findFirst({
      where: { id: import_job_id, tenant_id },
      select: { file_key: true },
    });

    if (!importJob?.file_key) {
      // Let the transactional job handle the missing file_key / missing job case
      const validationJob = new ImportValidationJob(this.prisma, null);
      await validationJob.execute(job.data);
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
    const validationJob = new ImportValidationJob(this.prisma, fileBuffer);
    await validationJob.execute(job.data);
  }
}

// ─── File Parsing ───────────────────────────────────────────────────────────

/** Normalise a header: lowercase, trim, strip trailing asterisks/spaces. */
function normaliseHeader(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s*\*+$/, '') // strip trailing " *" or " **"
    .replace(/\s+/g, '_'); // collapse spaces to underscores
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
    return parseXlsx(fileBuffer);
  }
  return parseCsv(fileBuffer.toString('utf-8'));
}

function parseXlsx(buffer: Buffer): { headers: string[]; rows: string[][] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
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
    // Skip completely empty rows
    const hasData = rawRow.some((cell) => {
      const val = String(cell ?? '').trim();
      return val.length > 0;
    });
    if (!hasData) continue;

    const row = rawRow.map((cell) => {
      if (cell instanceof Date) {
        return cell.toISOString().split('T')[0] ?? '';
      }
      return String(cell ?? '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const firstLine = lines[0];
  if (!firstLine) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(firstLine).map((h) => normaliseHeader(h));
  const rows = lines.slice(1).map((line) => parseCsvLine(line));

  return { headers, rows };
}

// ─── Example row detection ──────────────────────────────────────────────────

const EXAMPLE_FIRST_NAMES = new Set(['aisha', 'ahmed', 'omar', 'sarah', 'stf-001']);

function isExampleRow(headers: string[], row: string[]): boolean {
  const fnIndex = headers.indexOf('first_name');
  if (fnIndex === -1) return false;
  const firstName = (row[fnIndex] ?? '').toLowerCase().trim();
  if (!EXAMPLE_FIRST_NAMES.has(firstName)) return false;

  const lnIndex = headers.indexOf('last_name');
  const lastName = lnIndex !== -1 ? (row[lnIndex] ?? '').toLowerCase().trim() : '';
  // Match known template example rows
  if (firstName === 'aisha' && lastName === 'al-mansour') return true;
  if (firstName === 'omar' && lastName === 'al-mansour') return true;
  if (firstName === 'ahmed' && lastName === 'al-farsi') return true;

  // Check for template hint patterns like "(e.g. ...)"
  const hasHint = row.some((cell) => /\(e\.g\.|example|sample/i.test(cell));
  return hasHint;
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class ImportValidationJob extends TenantAwareJob<ImportValidationPayload> {
  private readonly logger = new Logger(ImportValidationJob.name);

  /** Pre-fetched file buffer — S3 download happens outside the transaction */
  private readonly fileBuffer: Buffer | null;

  constructor(prisma: PrismaClient, fileBuffer: Buffer | null) {
    super(prisma);
    this.fileBuffer = fileBuffer;
  }

  protected async processJob(data: ImportValidationPayload, tx: PrismaClient): Promise<void> {
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

    const importType = importJob.import_type;
    const expectedHeaders = EXPECTED_HEADERS[importType];
    const requiredFields = REQUIRED_FIELDS[importType];

    if (!expectedHeaders || !requiredFields) {
      await tx.importJob.update({
        where: { id: import_job_id },
        data: {
          status: 'failed',
          summary_json: { error: `Unsupported import type: ${importType}` },
        },
      });
      return;
    }

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

    // 3. Parse file (XLSX or CSV based on extension)
    const { headers, rows: allRows } = parseFile(this.fileBuffer, importJob.file_key);

    if (headers.length === 0) {
      await tx.importJob.update({
        where: { id: import_job_id },
        data: {
          status: 'failed',
          summary_json: { error: 'File is empty or has no recognisable headers.' },
        },
      });
      return;
    }

    // 4. Filter out example rows
    const rows = allRows.filter((row) => !isExampleRow(headers, row));

    if (rows.length === 0) {
      await tx.importJob.update({
        where: { id: import_job_id },
        data: {
          status: 'failed',
          summary_json: {
            error:
              allRows.length > 0
                ? 'File contains only example/template rows. Please replace them with real data.'
                : 'File has headers but no data rows.',
            total_rows: 0,
            valid_rows: 0,
            invalid_rows: 0,
          },
        },
      });
      return;
    }

    // 5. Validate headers
    const missingHeaders = expectedHeaders.filter((h) => !headers.includes(h));
    const headerErrors: string[] = [];
    if (missingHeaders.length > 0) {
      headerErrors.push(`Missing required headers: ${missingHeaders.join(', ')}`);
    }

    // 6. Validate each row
    const rowErrors: Array<{ row: number; errors: string[] }> = [];
    let validRowCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const errors: string[] = [];

      // Check required fields are non-empty
      for (const field of requiredFields) {
        const colIndex = headers.indexOf(field);
        if (colIndex === -1) {
          continue;
        }
        const value = row[colIndex];
        if (!value || value.trim().length === 0) {
          errors.push(`Missing required field "${field}"`);
        }
      }

      // Format validation for students
      if (importType === 'students') {
        const dobIndex = headers.indexOf('date_of_birth');
        const dobValue = dobIndex !== -1 ? row[dobIndex] : undefined;
        if (dobValue) {
          const dob = dobValue.trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            errors.push(`Invalid date_of_birth format "${dob}" — expected YYYY-MM-DD`);
          }
        }
      }

      // Email format validation for parents and staff
      if (importType === 'parents' || importType === 'staff') {
        const emailIndex = headers.indexOf('email');
        const emailValue = emailIndex !== -1 ? row[emailIndex] : undefined;
        if (emailValue) {
          const email = emailValue.trim();
          if (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push(`Invalid email format "${email}"`);
          }
        }
      }

      if (errors.length > 0) {
        rowErrors.push({ row: i + 2, errors }); // +2 for 1-indexed + header row
      } else {
        validRowCount++;
      }
    }

    // 7. Simple duplicate detection
    const duplicates: Array<{ row: number; match: string }> = [];
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;

        if (importType === 'students') {
          const fnIndex = headers.indexOf('first_name');
          const lnIndex = headers.indexOf('last_name');
          const fnValue = fnIndex !== -1 ? row[fnIndex] : undefined;
          const lnValue = lnIndex !== -1 ? row[lnIndex] : undefined;
          if (fnValue && lnValue) {
            const existing = await tx.student.findFirst({
              where: {
                tenant_id,
                first_name: fnValue.trim(),
                last_name: lnValue.trim(),
              },
              select: { id: true },
            });
            if (existing) {
              duplicates.push({
                row: i + 2,
                match: `Student "${fnValue.trim()} ${lnValue.trim()}" already exists`,
              });
            }
          }
        } else if (importType === 'parents' || importType === 'staff') {
          const emailIndex = headers.indexOf('email');
          const emailValue = emailIndex !== -1 ? row[emailIndex] : undefined;
          if (emailValue) {
            const email = emailValue.trim();
            if (email.length > 0) {
              if (importType === 'parents') {
                const existing = await tx.parent.findFirst({
                  where: { tenant_id, email },
                  select: { id: true },
                });
                if (existing) {
                  duplicates.push({
                    row: i + 2,
                    match: `Parent with email "${email}" already exists`,
                  });
                }
              } else {
                const existing = await tx.staffProfile.findFirst({
                  where: {
                    tenant_id,
                    user: { email },
                  },
                  select: { id: true },
                });
                if (existing) {
                  duplicates.push({
                    row: i + 2,
                    match: `Staff with email "${email}" already exists`,
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `Duplicate detection encountered an error — continuing without full duplicate check: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 8. Build summary and update import_job
    const hasErrors = headerErrors.length > 0 || rowErrors.length > 0;
    const summary = {
      total_rows: rows.length,
      valid_rows: validRowCount,
      invalid_rows: rowErrors.length,
      header_errors: headerErrors,
      row_errors: rowErrors.slice(0, 50),
      duplicates: duplicates.slice(0, 50),
      duplicate_count: duplicates.length,
    };

    await tx.importJob.update({
      where: { id: import_job_id },
      data: {
        status: hasErrors ? 'failed' : 'validated',
        summary_json: summary,
      },
    });

    this.logger.log(
      `Import validation complete for job ${import_job_id}: ${rows.length} rows, ${validRowCount} valid, ${rowErrors.length} invalid, ${duplicates.length} duplicates, tenant ${tenant_id}`,
    );
  }
}
