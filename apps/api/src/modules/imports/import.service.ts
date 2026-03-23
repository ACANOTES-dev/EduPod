import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ImportFilterDto, ImportType } from '@school/shared';
import type { Queue } from 'bullmq';
import * as XLSX from 'xlsx';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { ImportProcessingService } from './import-processing.service';

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
    private readonly importProcessingService: ImportProcessingService,
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

          // Build preview data: summary stats + first 30 rows
          const previewJson = this.buildPreview(headers, rows, importType);

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
              preview_json: previewJson as unknown as Prisma.InputJsonValue,
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

    await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'processing' },
    });

    this.logger.log(`Import job ${jobId} confirmed — processing inline`);

    // Process inline instead of enqueuing to worker (worker BullMQ unreliable)
    try {
      await this.importProcessingService.process(tenantId, jobId);
    } catch (err) {
      this.logger.error(`Processing failed for job ${jobId}: ${err instanceof Error ? err.message : String(err)}`);
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'failed', summary_json: { error: `Processing error: ${err instanceof Error ? err.message : String(err)}` } },
      }).catch(() => { /* best effort */ });
    }

    // Re-fetch final state
    const finalJob = await this.prisma.importJob.findUnique({
      where: { id: jobId },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return this.serializeJob(finalJob ?? job);
  }

  async rollback(tenantId: string, jobId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, tenant_id: tenantId },
    });

    if (!job) {
      throw new NotFoundException({
        code: 'IMPORT_JOB_NOT_FOUND',
        message: `Import job with id "${jobId}" not found`,
      });
    }

    if (job.status !== 'completed') {
      throw new BadRequestException({
        code: 'INVALID_IMPORT_STATUS',
        message: `Only completed imports can be rolled back. Current status: "${job.status}"`,
      });
    }

    // Get all tracked records for this import
    const trackedRecords = await this.prisma.importJobRecord.findMany({
      where: { import_job_id: jobId, tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });

    if (trackedRecords.length === 0) {
      throw new BadRequestException({
        code: 'NO_TRACKED_RECORDS',
        message: 'No tracked records found for this import. Rollback is only available for imports processed after the tracking feature was added.',
      });
    }

    const students = trackedRecords.filter((r) => r.record_type === 'student');
    const parents = trackedRecords.filter((r) => r.record_type === 'parent');
    const households = trackedRecords.filter((r) => r.record_type === 'household');

    let deletedCount = 0;
    const skippedDetails: Array<{ record_type: string; record_id: string; reason: string }> = [];

    // Check and delete students
    for (const rec of students) {
      const deps = await this.prisma.student.findUnique({
        where: { id: rec.record_id },
        select: {
          id: true,
          _count: {
            select: {
              attendance_records: true,
              grades: true,
              class_enrolments: true,
              invoice_lines: true,
              report_cards: true,
            },
          },
        },
      });

      if (!deps) { deletedCount++; continue; } // already deleted

      const totalDeps = deps._count.attendance_records + deps._count.grades +
        deps._count.class_enrolments + deps._count.invoice_lines + deps._count.report_cards;

      if (totalDeps > 0) {
        const reasons: string[] = [];
        if (deps._count.attendance_records > 0) reasons.push(`${deps._count.attendance_records} attendance records`);
        if (deps._count.grades > 0) reasons.push(`${deps._count.grades} grades`);
        if (deps._count.class_enrolments > 0) reasons.push(`${deps._count.class_enrolments} class enrolments`);
        if (deps._count.invoice_lines > 0) reasons.push(`${deps._count.invoice_lines} invoice lines`);
        if (deps._count.report_cards > 0) reasons.push(`${deps._count.report_cards} report cards`);
        skippedDetails.push({
          record_type: 'student',
          record_id: rec.record_id,
          reason: `Has dependent data: ${reasons.join(', ')}`,
        });
        continue;
      }

      // Safe to delete — remove junction records first
      await this.prisma.studentParent.deleteMany({ where: { student_id: rec.record_id } });
      await this.prisma.householdFeeAssignment.deleteMany({ where: { student_id: rec.record_id } });
      await this.prisma.student.delete({ where: { id: rec.record_id } });
      deletedCount++;
    }

    // Check and delete parents
    for (const rec of parents) {
      const parent = await this.prisma.parent.findUnique({
        where: { id: rec.record_id },
        select: { id: true, user_id: true },
      });

      if (!parent) { deletedCount++; continue; }

      if (parent.user_id) {
        skippedDetails.push({
          record_type: 'parent',
          record_id: rec.record_id,
          reason: 'Linked to a platform user account',
        });
        continue;
      }

      await this.prisma.householdParent.deleteMany({ where: { parent_id: rec.record_id } });
      await this.prisma.studentParent.deleteMany({ where: { parent_id: rec.record_id } });
      await this.prisma.parent.delete({ where: { id: rec.record_id } });
      deletedCount++;
    }

    // Check and delete households
    for (const rec of households) {
      // Check if household has students NOT from this import
      const importStudentIds = new Set(students.map((s) => s.record_id));
      const remainingStudents = await this.prisma.student.findMany({
        where: { household_id: rec.record_id },
        select: { id: true },
      });

      const externalStudents = remainingStudents.filter((s) => !importStudentIds.has(s.id));
      if (externalStudents.length > 0) {
        skippedDetails.push({
          record_type: 'household',
          record_id: rec.record_id,
          reason: `Has ${externalStudents.length} student(s) not from this import`,
        });
        continue;
      }

      // Check if household still exists (might have been cascade-deleted)
      const hh = await this.prisma.household.findUnique({ where: { id: rec.record_id }, select: { id: true } });
      if (!hh) { deletedCount++; continue; }

      await this.prisma.householdEmergencyContact.deleteMany({ where: { household_id: rec.record_id } });
      await this.prisma.householdParent.deleteMany({ where: { household_id: rec.record_id } });
      await this.prisma.household.delete({ where: { id: rec.record_id } });
      deletedCount++;
    }

    // Update job status
    const newStatus = skippedDetails.length === 0 ? 'rolled_back' : 'partially_rolled_back';

    const updatedJob = await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: newStatus,
        summary_json: {
          ...(job.summary_json as Record<string, unknown>),
          rollback: {
            deleted_count: deletedCount,
            skipped_count: skippedDetails.length,
            skipped_details: skippedDetails,
          },
        },
      },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    this.logger.log(
      `Import job ${jobId} rollback: ${deletedCount} deleted, ${skippedDetails.length} skipped`,
    );

    return {
      ...this.serializeJob(updatedJob),
      rollback_summary: {
        deleted_count: deletedCount,
        skipped_count: skippedDetails.length,
        skipped_details: skippedDetails,
      },
    };
  }

  private buildPreview(
    headers: string[],
    rows: string[][],
    importType: string,
  ): Record<string, unknown> {
    // Summary stats
    const summary: Record<string, unknown> = { total_rows: rows.length };

    if (importType === 'students') {
      const ygIdx = headers.indexOf('year_group');
      const genderIdx = headers.indexOf('gender');
      const parentEmailIdx = headers.indexOf('parent1_email');

      if (ygIdx !== -1) {
        const byYearGroup: Record<string, number> = {};
        for (const row of rows) {
          const yg = (row[ygIdx] ?? '').trim() || 'Unknown';
          byYearGroup[yg] = (byYearGroup[yg] ?? 0) + 1;
        }
        summary.by_year_group = byYearGroup;
      }

      if (genderIdx !== -1) {
        const byGender: Record<string, number> = {};
        for (const row of rows) {
          const g = (row[genderIdx] ?? '').trim().toLowerCase() || 'unknown';
          byGender[g] = (byGender[g] ?? 0) + 1;
        }
        summary.by_gender = byGender;
      }

      if (parentEmailIdx !== -1) {
        const emails = new Set<string>();
        for (const row of rows) {
          const e = (row[parentEmailIdx] ?? '').trim().toLowerCase();
          if (e) emails.add(e);
        }
        summary.household_count = emails.size;
      }
    }

    // Sample rows (first 30) as objects
    const sampleRows = rows.slice(0, 30).map((row) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]!] = row[i] ?? '';
      }
      return obj;
    });

    return { summary, sample_rows: sampleRows, headers };
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
