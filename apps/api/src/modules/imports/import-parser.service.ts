import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

import type { ImportType } from '@school/shared';

/** Example data values from the XLSX template, used to detect and skip example rows. */
const EXAMPLE_FIRST_NAMES = new Set(['aisha', 'omar', 'ahmed', 'sarah', 'stf-001']);

@Injectable()
export class ImportParserService {
  // ─── Header Normalisation ──────────────────────────────────────────────────

  /**
   * Normalize a header: lowercase, trim, strip trailing asterisks.
   */
  normalizeHeader(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/\s*\*\s*$/, '')
      .trim();
  }

  // ─── CSV Parsing ───────────────────────────────────────────────────────────

  /**
   * Parse a CSV buffer into headers and data rows.
   */
  parseCsv(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
    const csvContent = buffer.toString('utf-8');
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
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

      const hasData = Object.values(row).some((v) => v.length > 0);
      if (hasData) {
        rows.push(row);
      }
    }

    return { headers, rows };
  }

  /**
   * Simple CSV line parser that handles quoted fields.
   */
  parseCsvLine(line: string): string[] {
    const result: string[] = [];
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

  // ─── XLSX Parsing ──────────────────────────────────────────────────────────

  /**
   * Parse an XLSX buffer into headers and data rows.
   */
  parseXlsx(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { headers: [], rows: [] };
    }

    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      return { headers: [], rows: [] };
    }

    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: true,
    });

    if (rawRows.length < 2) {
      return { headers: [], rows: [] };
    }

    const headerRow = rawRows[0];
    if (!headerRow) {
      return { headers: [], rows: [] };
    }

    const headers = (headerRow as unknown[]).map((h) => this.normalizeHeader(String(h)));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < rawRows.length; i++) {
      const rawRow = rawRows[i];
      if (!rawRow) continue;

      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (!header) continue;

        const cellValue = (rawRow as unknown[])[j];
        if (cellValue instanceof Date) {
          row[header] = this.formatDateToISO(cellValue);
        } else {
          row[header] = String(cellValue ?? '').trim();
        }
      }

      const hasData = Object.values(row).some((v) => v.length > 0);
      if (hasData) {
        rows.push(row);
      }
    }

    return { headers, rows };
  }

  // ─── Date Helpers ──────────────────────────────────────────────────────────

  /**
   * Parse a date string in multiple formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.
   */
  parseFlexibleDate(dateStr: string): Date | null {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (isoMatch) {
      const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }

    const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
    if (slashMatch) {
      const date = new Date(`${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }

    const dashMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr);
    if (dashMatch) {
      const date = new Date(`${dashMatch[3]}-${dashMatch[2]}-${dashMatch[1]}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  /**
   * Format a Date object to ISO date string (YYYY-MM-DD).
   */
  formatDateToISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ─── Example Row Detection ─────────────────────────────────────────────────

  /**
   * Detect if a row is the example/hint row from the template.
   * For students: checks if parent1_email contains "example.com" AND the row
   * appears in the first few data rows (row number <= 4, accounting for header + up to 2 example rows).
   * Also checks for known example first_name + last_name pairs.
   */
  isExampleRow(row: Record<string, string>, importType: ImportType): boolean {
    const keyFields: Record<ImportType, string> = {
      students: 'first_name',
      parents: 'first_name',
      staff: 'first_name',
      fees: 'household_name',
      exam_results: 'student_number',
      staff_compensation: 'staff_number',
    };

    const field = keyFields[importType];
    const value = (row[field] ?? '').toLowerCase().trim();
    if (!value) return false;

    if (EXAMPLE_FIRST_NAMES.has(value)) {
      if (importType === 'students' && (value === 'aisha' || value === 'omar')) {
        const lastName = (row['last_name'] ?? '').toLowerCase();
        if (lastName === 'al-mansour') return true;
      }
      if (importType === 'parents' && value === 'ahmed') {
        const lastName = (row['last_name'] ?? '').toLowerCase();
        if (lastName === 'al-mansour') return true;
      }
      if (importType === 'staff' && value === 'sarah') {
        const lastName = (row['last_name'] ?? '').toLowerCase();
        if (lastName === 'johnson') return true;
      }
    }

    // For students: detect example rows by checking if parent1_email uses example.com
    // and the known example names match. This catches both template example rows.
    if (importType === 'students') {
      const parent1Email = (row['parent1_email'] ?? '').toLowerCase().trim();
      const lastName = (row['last_name'] ?? '').toLowerCase().trim();
      if (
        parent1Email.endsWith('@example.com') &&
        lastName === 'al-mansour' &&
        (value === 'aisha' || value === 'omar')
      ) {
        return true;
      }
    }

    // Check for template hint patterns (parentheses in values)
    const allValues = Object.values(row).join(' ');
    if (allValues.includes('(') && allValues.includes(')') && EXAMPLE_FIRST_NAMES.has(value)) {
      return true;
    }

    return false;
  }
}
