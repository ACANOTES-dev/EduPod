import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ImportType } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

/**
 * Required headers per import type (minimum columns that must be present in
 * the uploaded CSV). Additional columns from the template are accepted but
 * not mandatory for header validation.
 */
const REQUIRED_HEADERS: Record<ImportType, string[]> = {
  students: ['first_name', 'last_name', 'date_of_birth', 'gender'],
  parents: ['first_name', 'last_name', 'email'],
  staff: ['first_name', 'last_name', 'email'],
  fees: ['fee_structure_name', 'household_name', 'amount'],
  exam_results: ['student_number', 'subject', 'score'],
  staff_compensation: ['staff_number', 'compensation_type', 'amount'],
};

/**
 * Fields that must not be empty for each import type.
 */
const REQUIRED_FIELDS: Record<ImportType, string[]> = {
  students: ['first_name', 'last_name', 'date_of_birth'],
  parents: ['first_name', 'last_name', 'email'],
  staff: ['first_name', 'last_name', 'email'],
  fees: ['fee_structure_name', 'household_name', 'amount'],
  exam_results: ['student_number', 'subject', 'score'],
  staff_compensation: ['staff_number', 'compensation_type', 'amount'],
};

interface ValidationError {
  row: number;
  field: string;
  error: string;
}

interface ValidationWarning {
  row: number;
  field: string;
  warning: string;
}

interface ValidationSummary {
  total_rows: number;
  successful: number;
  failed: number;
  warnings: number;
  errors: ValidationError[];
  warnings_list: ValidationWarning[];
}

@Injectable()
export class ImportValidationService {
  private readonly logger = new Logger(ImportValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Validate a CSV import job. Downloads from S3, parses, checks headers
   * and row-level required fields. Detects potential duplicates.
   * Updates the import_job record with summary and status.
   */
  async validate(tenantId: string, jobId: string): Promise<void> {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, tenant_id: tenantId },
    });

    if (!job || !job.file_key) {
      this.logger.error(`Import job ${jobId} not found or missing file_key`);
      return;
    }

    const importType = job.import_type as ImportType;

    try {
      // Download CSV from S3
      const fileBuffer = await this.s3Service.download(job.file_key);
      const csvContent = fileBuffer.toString('utf-8');

      // Parse CSV (simple line-by-line)
      const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);

      if (lines.length === 0) {
        await this.updateJobStatus(jobId, 'failed', {
          total_rows: 0,
          successful: 0,
          failed: 0,
          warnings: 0,
          errors: [{ row: 0, field: '', error: 'CSV file is empty' }],
          warnings_list: [],
        });
        return;
      }

      // Parse headers (first row)
      const headerLine = lines[0];
      if (!headerLine) {
        await this.updateJobStatus(jobId, 'failed', {
          total_rows: 0,
          successful: 0,
          failed: 0,
          warnings: 0,
          errors: [{ row: 0, field: '', error: 'CSV file has no header row' }],
          warnings_list: [],
        });
        return;
      }

      const headers = this.parseCsvLine(headerLine).map((h) => h.trim().toLowerCase());
      const expectedHeaders = REQUIRED_HEADERS[importType];

      // Validate headers
      const missingHeaders = expectedHeaders.filter((h) => !headers.includes(h));
      if (missingHeaders.length > 0) {
        await this.updateJobStatus(jobId, 'failed', {
          total_rows: 0,
          successful: 0,
          failed: 0,
          warnings: 0,
          errors: [{
            row: 1,
            field: 'headers',
            error: `Missing required headers: ${missingHeaders.join(', ')}`,
          }],
          warnings_list: [],
        });
        return;
      }

      // Parse data rows
      const dataLines = lines.slice(1);
      const totalRows = dataLines.length;
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];
      let failedCount = 0;

      const requiredFields = REQUIRED_FIELDS[importType];

      // Duplicate detection sets
      const seenStudents = new Set<string>();
      const seenEmails = new Set<string>();

      for (let i = 0; i < dataLines.length; i++) {
        const rowNumber = i + 2; // 1-indexed, headers are row 1
        const dataLine = dataLines[i];
        if (!dataLine) {
          failedCount++;
          continue;
        }

        const values = this.parseCsvLine(dataLine);
        const row: Record<string, string> = {};

        // Map values to headers
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j];
          if (header) {
            row[header] = (values[j] ?? '').trim();
          }
        }

        let rowHasError = false;

        // Check required fields
        for (const field of requiredFields) {
          const value = row[field];
          if (!value || value.length === 0) {
            errors.push({
              row: rowNumber,
              field,
              error: `Required field "${field}" is empty`,
            });
            rowHasError = true;
          }
        }

        // Type-specific validations
        if (importType === 'students') {
          const dob = row['date_of_birth'] ?? '';
          const gender = row['gender'] ?? '';

          // Validate date_of_birth format
          if (dob && !this.isValidDate(dob)) {
            errors.push({
              row: rowNumber,
              field: 'date_of_birth',
              error: 'Invalid date format. Expected YYYY-MM-DD.',
            });
            rowHasError = true;
          }

          // Validate gender
          if (gender && !['male', 'female', 'm', 'f'].includes(gender.toLowerCase())) {
            errors.push({
              row: rowNumber,
              field: 'gender',
              error: 'Gender must be one of: male, female, m, f',
            });
            rowHasError = true;
          }

          // Duplicate detection: first_name + last_name + date_of_birth
          const studentKey = `${(row['first_name'] ?? '').toLowerCase()}|${(row['last_name'] ?? '').toLowerCase()}|${dob}`;
          if (seenStudents.has(studentKey)) {
            warnings.push({
              row: rowNumber,
              field: 'first_name',
              warning: 'Possible duplicate: same first_name, last_name, and date_of_birth found in another row',
            });
          }
          seenStudents.add(studentKey);
        }

        if (importType === 'parents' || importType === 'staff') {
          const emailVal = row['email'] ?? '';

          // Validate email format
          if (emailVal && !this.isValidEmail(emailVal)) {
            errors.push({
              row: rowNumber,
              field: 'email',
              error: 'Invalid email format',
            });
            rowHasError = true;
          }

          // Duplicate detection by email
          const emailLower = emailVal.toLowerCase();
          if (emailLower && seenEmails.has(emailLower)) {
            warnings.push({
              row: rowNumber,
              field: 'email',
              warning: 'Duplicate email found in another row',
            });
          }
          if (emailLower) {
            seenEmails.add(emailLower);
          }
        }

        if (importType === 'fees') {
          const amount = row['amount'] ?? '';
          // Validate amount is a number
          if (amount && isNaN(Number(amount))) {
            errors.push({
              row: rowNumber,
              field: 'amount',
              error: 'Amount must be a valid number',
            });
            rowHasError = true;
          }
        }

        if (importType === 'exam_results') {
          const score = row['score'] ?? '';
          // Validate score is a number
          if (score && isNaN(Number(score))) {
            errors.push({
              row: rowNumber,
              field: 'score',
              error: 'Score must be a valid number',
            });
            rowHasError = true;
          }
        }

        if (importType === 'staff_compensation') {
          const compType = row['compensation_type'] ?? '';
          const amount = row['amount'] ?? '';
          const baseSalary = row['base_salary'] ?? '';
          const perClassRate = row['per_class_rate'] ?? '';

          // Validate compensation_type
          if (compType && !['salaried', 'per_class'].includes(compType.toLowerCase())) {
            errors.push({
              row: rowNumber,
              field: 'compensation_type',
              error: 'compensation_type must be one of: salaried, per_class',
            });
            rowHasError = true;
          }

          // Validate numeric fields (amount, base_salary, per_class_rate)
          if (amount.length > 0 && isNaN(Number(amount))) {
            errors.push({
              row: rowNumber,
              field: 'amount',
              error: 'amount must be a valid number',
            });
            rowHasError = true;
          }
          if (baseSalary.length > 0 && isNaN(Number(baseSalary))) {
            errors.push({
              row: rowNumber,
              field: 'base_salary',
              error: 'base_salary must be a valid number',
            });
            rowHasError = true;
          }
          if (perClassRate.length > 0 && isNaN(Number(perClassRate))) {
            errors.push({
              row: rowNumber,
              field: 'per_class_rate',
              error: 'per_class_rate must be a valid number',
            });
            rowHasError = true;
          }
        }

        if (rowHasError) {
          failedCount++;
        }
      }

      const successfulCount = totalRows - failedCount;
      const finalStatus = failedCount === totalRows && totalRows > 0 ? 'failed' : 'validated';

      await this.updateJobStatus(jobId, finalStatus, {
        total_rows: totalRows,
        successful: successfulCount,
        failed: failedCount,
        warnings: warnings.length,
        errors,
        warnings_list: warnings,
      });

      this.logger.log(
        `Import job ${jobId} validation complete: ${successfulCount}/${totalRows} valid, status=${finalStatus}`,
      );
    } catch (err) {
      this.logger.error(`Import job ${jobId} validation error: ${String(err)}`);
      await this.updateJobStatus(jobId, 'failed', {
        total_rows: 0,
        successful: 0,
        failed: 0,
        warnings: 0,
        errors: [{ row: 0, field: '', error: `Validation error: ${String(err)}` }],
        warnings_list: [],
      });
    }
  }

  /**
   * Simple CSV line parser that handles quoted fields.
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          // Check for escaped quote
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // Skip next quote
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
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current);
    return result;
  }

  private isValidDate(dateStr: string): boolean {
    // Accept YYYY-MM-DD format
    const match = /^\d{4}-\d{2}-\d{2}$/.exec(dateStr);
    if (!match) return false;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private async updateJobStatus(
    jobId: string,
    status: 'validated' | 'failed',
    summary: ValidationSummary,
  ): Promise<void> {
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status,
        summary_json: summary as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
