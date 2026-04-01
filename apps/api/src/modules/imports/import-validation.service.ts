import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';

import type { ImportType } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

/**
 * Required headers per import type (minimum columns that must be present in
 * the uploaded file). Additional columns from the template are accepted but
 * not mandatory for header validation.
 *
 * Headers are normalized: lowercase, trimmed, asterisks and spaces stripped.
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

/** Example data values from the XLSX template, used to detect and skip example rows. */
const EXAMPLE_FIRST_NAMES = new Set(['aisha', 'ahmed', 'sarah', 'stf-001']);

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
   * Validate an import job file (CSV or XLSX). Downloads from S3, parses,
   * checks headers and row-level required fields. Detects potential duplicates.
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
      // Download file from S3
      const fileBuffer = await this.s3Service.download(job.file_key);

      // Determine file type from the S3 key extension
      const isXlsx = job.file_key.toLowerCase().endsWith('.xlsx');

      // Parse file into header array + data rows
      let headers: string[];
      let dataRows: Record<string, string>[];

      if (isXlsx) {
        const parsed = this.parseXlsx(fileBuffer);
        headers = parsed.headers;
        dataRows = parsed.rows;
      } else {
        const parsed = this.parseCsv(fileBuffer);
        headers = parsed.headers;
        dataRows = parsed.rows;
      }

      if (headers.length === 0) {
        await this.updateJobStatus(jobId, 'failed', {
          total_rows: 0,
          successful: 0,
          failed: 0,
          warnings: 0,
          errors: [{ row: 0, field: '', error: 'File has no header row' }],
          warnings_list: [],
        });
        return;
      }

      const expectedHeaders = REQUIRED_HEADERS[importType];

      // Validate headers
      const missingHeaders = expectedHeaders.filter((h) => !headers.includes(h));
      if (missingHeaders.length > 0) {
        await this.updateJobStatus(jobId, 'failed', {
          total_rows: 0,
          successful: 0,
          failed: 0,
          warnings: 0,
          errors: [
            {
              row: 1,
              field: 'headers',
              error: `Missing required headers: ${missingHeaders.join(', ')}`,
            },
          ],
          warnings_list: [],
        });
        return;
      }

      if (dataRows.length === 0) {
        await this.updateJobStatus(jobId, 'failed', {
          total_rows: 0,
          successful: 0,
          failed: 0,
          warnings: 0,
          errors: [{ row: 0, field: '', error: 'File contains no data rows' }],
          warnings_list: [],
        });
        return;
      }

      // Filter out example/hint rows
      const filteredRows = dataRows.filter((row) => !this.isExampleRow(row, importType));
      const totalRows = filteredRows.length;

      if (totalRows === 0) {
        await this.updateJobStatus(jobId, 'failed', {
          total_rows: 0,
          successful: 0,
          failed: 0,
          warnings: 0,
          errors: [
            {
              row: 0,
              field: '',
              error: 'File contains only example rows. Delete the example row and add your data.',
            },
          ],
          warnings_list: [],
        });
        return;
      }

      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];
      let failedCount = 0;

      const requiredFields = REQUIRED_FIELDS[importType];

      // Duplicate detection sets
      const seenStudents = new Set<string>();
      const seenEmails = new Set<string>();

      for (let i = 0; i < filteredRows.length; i++) {
        const rowNumber = i + 2; // 1-indexed, headers are row 1
        const row = filteredRows[i];
        if (!row) {
          failedCount++;
          continue;
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
          rowHasError =
            this.validateStudentRow(row, rowNumber, errors, warnings, seenStudents) || rowHasError;
        }

        if (importType === 'parents' || importType === 'staff') {
          rowHasError =
            this.validateEmailRow(row, rowNumber, errors, warnings, seenEmails) || rowHasError;
        }

        if (importType === 'fees') {
          const amount = row['amount'] ?? '';
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
          rowHasError = this.validateStaffCompensationRow(row, rowNumber, errors) || rowHasError;
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

  // ─── Row-level Validators ──────────────────────────────────────────────

  private validateStudentRow(
    row: Record<string, string>,
    rowNumber: number,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    seenStudents: Set<string>,
  ): boolean {
    let hasError = false;
    const dob = row['date_of_birth'] ?? '';
    const gender = row['gender'] ?? '';
    const firstName = row['first_name'] ?? '';
    const lastName = row['last_name'] ?? '';
    const parent1Email = row['parent1_email'] ?? '';
    const parent1Phone = row['parent1_phone'] ?? '';
    const parent1Relationship = row['parent1_relationship'] ?? '';

    // Validate first_name / last_name length
    if (firstName.length > 100) {
      errors.push({
        row: rowNumber,
        field: 'first_name',
        error: 'First name must not exceed 100 characters',
      });
      hasError = true;
    }
    if (lastName.length > 100) {
      errors.push({
        row: rowNumber,
        field: 'last_name',
        error: 'Last name must not exceed 100 characters',
      });
      hasError = true;
    }

    // Validate date_of_birth: accept multiple formats and check age 3-25
    if (dob) {
      const parsedDate = this.parseFlexibleDate(dob);
      if (!parsedDate) {
        errors.push({
          row: rowNumber,
          field: 'date_of_birth',
          error: 'Invalid date format. Expected YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY.',
        });
        hasError = true;
      } else {
        const age = this.calculateAge(parsedDate);
        if (age < 3 || age > 25) {
          errors.push({
            row: rowNumber,
            field: 'date_of_birth',
            error: `Student age must be between 3 and 25 years. Calculated age: ${age}`,
          });
          hasError = true;
        }
      }
    }

    // Validate gender (accept m/f, male/female, case-insensitive)
    if (gender) {
      const gLower = gender.toLowerCase();
      if (!['male', 'female', 'm', 'f'].includes(gLower)) {
        errors.push({
          row: rowNumber,
          field: 'gender',
          error: 'Gender must be one of: male, female, m, f',
        });
        hasError = true;
      }
    }

    // Validate parent1 email format
    if (parent1Email && !this.isValidEmail(parent1Email)) {
      errors.push({
        row: rowNumber,
        field: 'parent1_email',
        error: 'Invalid email format for parent 1',
      });
      hasError = true;
    }

    // Validate parent1 phone format
    if (parent1Phone && !this.isValidPhone(parent1Phone)) {
      errors.push({
        row: rowNumber,
        field: 'parent1_phone',
        error: 'Phone must start with + or a digit',
      });
      hasError = true;
    }

    // Validate parent1 relationship
    if (parent1Relationship) {
      const rel = parent1Relationship.toLowerCase();
      if (!['father', 'mother', 'guardian', 'other'].includes(rel)) {
        errors.push({
          row: rowNumber,
          field: 'parent1_relationship',
          error: 'Relationship must be one of: father, mother, guardian, other',
        });
        hasError = true;
      }
    }

    // Duplicate detection: first_name + last_name + date_of_birth
    const studentKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${dob}`;
    if (seenStudents.has(studentKey)) {
      warnings.push({
        row: rowNumber,
        field: 'first_name',
        warning:
          'Possible duplicate: same first_name, last_name, and date_of_birth found in another row',
      });
    }
    seenStudents.add(studentKey);

    return hasError;
  }

  private validateEmailRow(
    row: Record<string, string>,
    rowNumber: number,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    seenEmails: Set<string>,
  ): boolean {
    let hasError = false;
    const emailVal = row['email'] ?? '';

    if (emailVal && !this.isValidEmail(emailVal)) {
      errors.push({
        row: rowNumber,
        field: 'email',
        error: 'Invalid email format',
      });
      hasError = true;
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

    return hasError;
  }

  private validateStaffCompensationRow(
    row: Record<string, string>,
    rowNumber: number,
    errors: ValidationError[],
  ): boolean {
    let hasError = false;
    const compType = row['compensation_type'] ?? '';
    const amount = row['amount'] ?? '';
    const baseSalary = row['base_salary'] ?? '';
    const perClassRate = row['per_class_rate'] ?? '';

    if (compType && !['salaried', 'per_class', 'hourly'].includes(compType.toLowerCase())) {
      errors.push({
        row: rowNumber,
        field: 'compensation_type',
        error: 'compensation_type must be one of: salaried, per_class, hourly',
      });
      hasError = true;
    }

    if (amount.length > 0 && isNaN(Number(amount))) {
      errors.push({ row: rowNumber, field: 'amount', error: 'amount must be a valid number' });
      hasError = true;
    }
    if (baseSalary.length > 0 && isNaN(Number(baseSalary))) {
      errors.push({
        row: rowNumber,
        field: 'base_salary',
        error: 'base_salary must be a valid number',
      });
      hasError = true;
    }
    if (perClassRate.length > 0 && isNaN(Number(perClassRate))) {
      errors.push({
        row: rowNumber,
        field: 'per_class_rate',
        error: 'per_class_rate must be a valid number',
      });
      hasError = true;
    }

    return hasError;
  }

  // ─── File Parsers ──────────────────────────────────────────────────────

  /**
   * Parse a CSV buffer into headers and data rows.
   */
  private parseCsv(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
    const csvContent = buffer.toString('utf-8');
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const headerLine = lines[0];
    if (!headerLine) {
      return { headers: [], rows: [] };
    }

    const headers = this.parseCsvLine(headerLine).map((h) => this.normalizeHeader(h));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const dataLine = lines[i];
      if (!dataLine) continue;

      const values = this.parseCsvLine(dataLine);
      const row: Record<string, string> = {};

      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (header) {
          row[header] = (values[j] ?? '').trim();
        }
      }

      // Skip completely empty rows
      const hasData = Object.values(row).some((v) => v.length > 0);
      if (hasData) {
        rows.push(row);
      }
    }

    return { headers, rows };
  }

  /**
   * Parse an XLSX buffer into headers and data rows.
   * Handles Excel date cells (which are Date objects from xlsx library).
   */
  private parseXlsx(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { headers: [], rows: [] };
    }

    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      return { headers: [], rows: [] };
    }

    // Convert sheet to array of arrays with raw values
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: true,
    });

    if (rawRows.length === 0) {
      return { headers: [], rows: [] };
    }

    // First row is headers
    const headerRow = rawRows[0];
    if (!headerRow) {
      return { headers: [], rows: [] };
    }

    const headers = headerRow.map((h) => this.normalizeHeader(String(h)));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < rawRows.length; i++) {
      const rawRow = rawRows[i];
      if (!rawRow) continue;

      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (!header) continue;

        const cellValue = rawRow[j];
        // Handle Date objects from Excel (xlsx library returns Date for date-formatted cells)
        if (cellValue instanceof Date) {
          row[header] = this.formatDateToISO(cellValue);
        } else {
          row[header] = String(cellValue ?? '').trim();
        }
      }

      // Skip completely empty rows
      const hasData = Object.values(row).some((v) => v.length > 0);
      if (hasData) {
        rows.push(row);
      }
    }

    return { headers, rows };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Normalize a header string: lowercase, trim whitespace, strip trailing
   * asterisks and leading/trailing spaces from template headers like "first_name *".
   */
  private normalizeHeader(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/\s*\*\s*$/, '')
      .trim();
  }

  /**
   * Detect if a row is the example/hint row from the template.
   * Checks if key fields match the known example values.
   */
  private isExampleRow(row: Record<string, string>, importType: ImportType): boolean {
    const firstField = REQUIRED_FIELDS[importType][0];
    if (!firstField) return false;

    const firstValue = (row[firstField] ?? '').toLowerCase().trim();
    if (!firstValue) return false;

    // Check if this looks like example data
    if (EXAMPLE_FIRST_NAMES.has(firstValue)) {
      // Extra check: if it contains parentheses or looks like template hints
      const allValues = Object.values(row).join(' ');
      if (allValues.includes('(') && allValues.includes(')')) {
        return true;
      }

      // For students, check if the example matches exactly
      if (importType === 'students' && firstValue === 'aisha') {
        const lastName = (row['last_name'] ?? '').toLowerCase();
        if (lastName === 'al-mansour') return true;
      }
      if (importType === 'parents' && firstValue === 'ahmed') {
        const lastName = (row['last_name'] ?? '').toLowerCase();
        if (lastName === 'al-mansour') return true;
      }
      if (importType === 'staff' && firstValue === 'sarah') {
        const lastName = (row['last_name'] ?? '').toLowerCase();
        if (lastName === 'johnson') return true;
      }
    }

    return false;
  }

  /**
   * Parse a date string in multiple formats.
   * Accepts: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
   */
  private parseFlexibleDate(dateStr: string): Date | null {
    // YYYY-MM-DD
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (isoMatch) {
      const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }

    // DD/MM/YYYY
    const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
    if (slashMatch) {
      const date = new Date(`${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }

    // DD-MM-YYYY
    const dashMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr);
    if (dashMatch) {
      const date = new Date(`${dashMatch[3]}-${dashMatch[2]}-${dashMatch[1]}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Format a Date object to ISO date string (YYYY-MM-DD).
   */
  private formatDateToISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidPhone(phone: string): boolean {
    return /^[+\d]/.test(phone);
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
