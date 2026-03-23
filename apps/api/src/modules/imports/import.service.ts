import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ImportFilterDto, ImportType } from '@school/shared';
import type { Queue } from 'bullmq';
import * as XLSX from 'xlsx';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

// ─── File parsing helpers ───────────────────────────────────────────────────

function normaliseHeader(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s*\*+$/, '').replace(/\s+/g, '_');
}

function parseFileBuffer(
  buffer: Buffer,
  fileName: string,
): { headers: string[]; rows: string[][] } {
  const isXlsx = fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');

  if (isXlsx) {
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
      const hasData = rawRow.some((cell) => String(cell ?? '').trim().length > 0);
      if (!hasData) continue;
      rows.push(rawRow.map((cell) => {
        if (cell instanceof Date) return cell.toISOString().split('T')[0] ?? '';
        return String(cell ?? '').trim();
      }));
    }

    return { headers, rows };
  }

  // CSV fallback
  const content = buffer.toString('utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = (lines[0] ?? '').split(',').map((h) => normaliseHeader(h));
  const rows = lines.slice(1).map((line) => line.split(',').map((v) => v.trim()));
  return { headers, rows };
}

// ─── Validation config ──────────────────────────────────────────────────────

const REQUIRED_HEADERS: Record<string, string[]> = {
  students: ['first_name', 'last_name', 'date_of_birth'],
  parents: ['first_name', 'last_name', 'email'],
  staff: ['first_name', 'last_name', 'email'],
  fees: ['fee_name', 'amount'],
  exam_results: ['student_number', 'subject', 'score', 'max_score'],
  staff_compensation: ['staff_number', 'compensation_type', 'base_salary'],
};

const EXAMPLE_NAMES = new Set(['aisha', 'omar', 'ahmed', 'sarah']);

function isExampleRow(headers: string[], row: string[]): boolean {
  const fnIdx = headers.indexOf('first_name');
  if (fnIdx === -1) return false;
  const fn = (row[fnIdx] ?? '').toLowerCase().trim();
  if (!EXAMPLE_NAMES.has(fn)) return false;
  const lnIdx = headers.indexOf('last_name');
  const ln = lnIdx !== -1 ? (row[lnIdx] ?? '').toLowerCase().trim() : '';
  if (fn === 'aisha' && ln === 'al-mansour') return true;
  if (fn === 'omar' && ln === 'al-mansour') return true;
  return row.some((cell) => /\(e\.g\.|example|sample/i.test(cell));
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    @InjectQueue('imports') private readonly importsQueue: Queue,
  ) {}

  async upload(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    fileName: string,
    importType: ImportType,
  ) {
    const ext = fileName.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
    const mimeType = ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

    // Create the job record
    const job = await this.prisma.importJob.create({
      data: {
        tenant_id: tenantId,
        import_type: importType,
        status: 'uploaded',
        created_by_user_id: userId,
        summary_json: {},
      },
    });

    // Upload file to S3
    const s3Key = `imports/${job.id}.${ext}`;
    const fullKey = await this.s3Service.upload(tenantId, s3Key, fileBuffer, mimeType);

    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { file_key: fullKey },
    });

    // ── Inline validation (avoids worker/RLS issues) ──────────────────
    try {
      const { headers, rows: allRows } = parseFileBuffer(fileBuffer, fileName);

      if (headers.length === 0) {
        await this.prisma.importJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            summary_json: { total_rows: 0, valid_rows: 0, invalid_rows: 0, error: 'File is empty or has no recognisable headers.' },
          },
        });
      } else {
        // Filter example rows
        const rows = allRows.filter((row) => !isExampleRow(headers, row));

        if (rows.length === 0) {
          await this.prisma.importJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              summary_json: {
                total_rows: 0,
                valid_rows: 0,
                invalid_rows: 0,
                error: allRows.length > 0 ? 'File contains only example rows.' : 'No data rows found.',
              },
            },
          });
        } else {
          // Validate rows
          const requiredFields = REQUIRED_HEADERS[importType] ?? [];
          const missingHeaders = requiredFields.filter((h) => !headers.includes(h));
          const rowErrors: Array<{ row: number; errors: string[] }> = [];
          let validCount = 0;

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i]!;
            const errors: string[] = [];

            for (const field of requiredFields) {
              const idx = headers.indexOf(field);
              if (idx === -1) continue;
              const val = row[idx];
              if (!val || val.trim().length === 0) {
                errors.push(`Missing required field "${field}"`);
              }
            }

            if (importType === 'students') {
              const dobIdx = headers.indexOf('date_of_birth');
              const dob = dobIdx !== -1 ? (row[dobIdx] ?? '').trim() : '';
              if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
                errors.push(`Invalid date format "${dob}" — expected YYYY-MM-DD`);
              }
            }

            if (errors.length > 0) {
              rowErrors.push({ row: i + 2, errors });
            } else {
              validCount++;
            }
          }

          const hasErrors = missingHeaders.length > 0 || rowErrors.length > 0;

          await this.prisma.importJob.update({
            where: { id: job.id },
            data: {
              status: hasErrors ? 'failed' : 'validated',
              summary_json: {
                total_rows: rows.length,
                valid_rows: validCount,
                invalid_rows: rowErrors.length,
                header_errors: missingHeaders.length > 0 ? [`Missing: ${missingHeaders.join(', ')}`] : [],
                row_errors: rowErrors.slice(0, 50),
              },
            },
          });
        }
      }
    } catch (err) {
      this.logger.error(`Validation failed for job ${job.id}: ${err instanceof Error ? err.message : String(err)}`);
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          summary_json: { error: `Validation error: ${err instanceof Error ? err.message : String(err)}` },
        },
      }).catch(() => { /* best effort */ });
    }

    // Return the final job state
    const finalJob = await this.prisma.importJob.findUnique({
      where: { id: job.id },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return this.serializeJob(finalJob ?? job);
  }

  async list(tenantId: string, filters: ImportFilterDto) {
    const { page, pageSize, status } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.importJob.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          created_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.importJob.count({ where }),
    ]);

    return {
      data: data.map((j) => this.serializeJob(j)),
      meta: { page, pageSize, total },
    };
  }

  async get(tenantId: string, jobId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, tenant_id: tenantId },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException({
        code: 'IMPORT_JOB_NOT_FOUND',
        message: `Import job with id "${jobId}" not found`,
      });
    }

    return this.serializeJob(job);
  }

  async confirm(tenantId: string, jobId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, tenant_id: tenantId },
    });

    if (!job) {
      throw new NotFoundException({
        code: 'IMPORT_JOB_NOT_FOUND',
        message: `Import job with id "${jobId}" not found`,
      });
    }

    if (job.status !== 'validated') {
      throw new BadRequestException({
        code: 'INVALID_IMPORT_STATUS',
        message: `Import job must be in "validated" status to confirm. Current status: "${job.status}"`,
      });
    }

    const summary = job.summary_json as Record<string, unknown>;
    const totalRows = typeof summary['total_rows'] === 'number' ? summary['total_rows'] : 0;
    const failedRows = typeof summary['failed'] === 'number' ? summary['failed'] : 0;

    if (totalRows > 0 && failedRows >= totalRows) {
      throw new BadRequestException({
        code: 'ALL_ROWS_FAILED',
        message: 'All rows have validation errors. Fix the file and re-upload.',
      });
    }

    const updatedJob = await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'processing' },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    await this.importsQueue.add('imports:process', {
      tenant_id: tenantId,
      import_job_id: jobId,
    });

    this.logger.log(`Import job ${jobId} confirmed for processing`);

    return this.serializeJob(updatedJob);
  }

  private serializeJob(job: Record<string, unknown>): Record<string, unknown> {
    const summary = (job.summary_json ?? {}) as Record<string, unknown>;
    return {
      ...job,
      total_rows: summary.total_rows ?? null,
      valid_rows: summary.valid_rows ?? null,
      invalid_rows: summary.invalid_rows ?? null,
      errors: [
        ...(Array.isArray(summary.header_errors) ? summary.header_errors.map((e: unknown) => ({ row: 0, field: '', message: String(e) })) : []),
        ...(Array.isArray(summary.row_errors) ? (summary.row_errors as Array<{ row: number; errors: string[] }>).flatMap((re) =>
          re.errors.map((msg) => ({ row: re.row, field: '', message: msg })),
        ) : []),
      ],
    };
  }
}
