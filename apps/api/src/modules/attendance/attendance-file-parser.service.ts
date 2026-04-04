import { BadRequestException, Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import * as XLSX from 'xlsx';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedRow {
  student_number: string;
  student_name: string;
  class_name: string;
  status: string;
}

export interface QuickMarkEntry {
  student_number: string;
  status: string;
  reason?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const STATUS_MAP: Record<string, $Enums.AttendanceRecordStatus> = {
  p: 'present',
  a: 'absent_unexcused',
  ae: 'absent_excused',
  l: 'late',
  le: 'left_early',
};

export const EXCEPTION_STATUS_MAP: Record<string, $Enums.AttendanceRecordStatus> = {
  a: 'absent_unexcused',
  ae: 'absent_excused',
  l: 'late',
  le: 'left_early',
};

export const EXPECTED_HEADERS = ['student_number', 'student_name', 'class_name', 'status'] as const;

/** Safely get index from header map; returns -1 if missing. */
function getHeaderIndex(indices: Map<string, number>, key: string): number {
  return indices.get(key) ?? -1;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class AttendanceFileParserService {
  // ─── Quick-Mark Text Parser ─────────────────────────────────────────────

  /**
   * Parse plain-text shorthand into structured entries.
   * Format: one entry per line — `{student_number} {status_code} {optional_reason}`
   * Status codes: A=absent_unexcused, AE=absent_excused, L=late, LE=left_early
   */
  parseQuickMarkText(text: string): QuickMarkEntry[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const entries: QuickMarkEntry[] = [];

    for (const [i, line] of lines.entries()) {
      const trimmed = line.trim();
      const parts = trimmed.split(/\s+/);

      if (parts.length < 2) {
        throw new BadRequestException({
          code: 'INVALID_QUICK_MARK_LINE',
          message: `Line ${i + 1}: expected at least student_number and status code, got "${trimmed}"`,
        });
      }

      const studentNumber = parts[0];
      const statusCode = parts[1];

      if (!studentNumber || !statusCode) {
        throw new BadRequestException({
          code: 'INVALID_QUICK_MARK_LINE',
          message: `Line ${i + 1}: missing student_number or status code`,
        });
      }

      const mappedStatus = EXCEPTION_STATUS_MAP[statusCode.toLowerCase()];
      if (!mappedStatus) {
        throw new BadRequestException({
          code: 'INVALID_QUICK_MARK_LINE',
          message: `Line ${i + 1}: invalid status code "${statusCode}". Valid codes: A, AE, L, LE`,
        });
      }

      const reason = parts.length > 2 ? parts.slice(2).join(' ') : undefined;

      entries.push({
        student_number: studentNumber,
        status: mappedStatus,
        reason,
      });
    }

    return entries;
  }

  // ─── CSV Parser ─────────────────────────────────────────────────────────

  /**
   * Parse a CSV buffer into an array of row objects.
   */
  parseCsv(buffer: Buffer): ParsedRow[] {
    const content = buffer.toString('utf-8');
    const lines = content.split(/\r?\n/);
    const rows: ParsedRow[] = [];
    let headerFound = false;
    let headerMap = new Map<string, number>();

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed === '') continue;

      // Skip comment lines
      if (trimmed.startsWith('#')) continue;

      if (!headerFound) {
        // Parse header
        const headers = this.parseCsvLine(trimmed).map((h) => h.trim().toLowerCase());
        const missingHeaders = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
        if (missingHeaders.length > 0) {
          throw new BadRequestException({
            code: 'INVALID_HEADERS',
            message: `Missing required columns: ${missingHeaders.join(', ')}. Expected: ${EXPECTED_HEADERS.join(', ')}`,
          });
        }

        headerMap = new Map<string, number>();
        for (const h of EXPECTED_HEADERS) {
          headerMap.set(h, headers.indexOf(h));
        }
        headerFound = true;
        continue;
      }

      // Parse data row
      const values = this.parseCsvLine(trimmed);
      rows.push({
        student_number: values[getHeaderIndex(headerMap, 'student_number')] ?? '',
        student_name: values[getHeaderIndex(headerMap, 'student_name')] ?? '',
        class_name: values[getHeaderIndex(headerMap, 'class_name')] ?? '',
        status: values[getHeaderIndex(headerMap, 'status')] ?? '',
      });
    }

    if (!headerFound) {
      throw new BadRequestException({
        code: 'INVALID_HEADERS',
        message: `No header row found. Expected columns: ${EXPECTED_HEADERS.join(', ')}`,
      });
    }

    return rows;
  }

  /**
   * Parse a single CSV line, handling quoted fields.
   */
  parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          // Check for escaped quote (double quote)
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = false;
          }
        } else {
          current += char ?? '';
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          fields.push(current);
          current = '';
        } else {
          current += char ?? '';
        }
      }
    }

    fields.push(current);
    return fields;
  }

  // ─── XLSX Parser ────────────────────────────────────────────────────────

  /**
   * Parse an XLSX buffer into an array of row objects.
   */
  parseXlsx(buffer: Buffer): ParsedRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The uploaded Excel file contains no sheets',
      });
    }

    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The uploaded Excel file contains no sheets',
      });
    }

    // Convert sheet to array of arrays, preserving raw text
    const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    if (rawRows.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The uploaded Excel file contains no data',
      });
    }

    // Filter out comment rows (first cell starts with #)
    const filteredRows = rawRows.filter((row) => {
      const firstCell = String(row[0] ?? '').trim();
      return firstCell !== '' && !firstCell.startsWith('#');
    });

    if (filteredRows.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The uploaded file contains no data rows',
      });
    }

    // First non-comment row is the header
    const headerRow = filteredRows[0];
    if (!headerRow) {
      throw new BadRequestException({
        code: 'INVALID_HEADERS',
        message: `No header row found. Expected columns: ${EXPECTED_HEADERS.join(', ')}`,
      });
    }

    const headers = headerRow.map((h: string) => String(h).trim().toLowerCase());

    const missingHeaders = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_HEADERS',
        message: `Missing required columns: ${missingHeaders.join(', ')}. Expected: ${EXPECTED_HEADERS.join(', ')}`,
      });
    }

    const headerMap = new Map<string, number>();
    for (const h of EXPECTED_HEADERS) {
      headerMap.set(h, headers.indexOf(h));
    }

    // Parse data rows (skip header)
    const rows: ParsedRow[] = [];
    for (let i = 1; i < filteredRows.length; i++) {
      const rowData = filteredRows[i];
      if (!rowData) continue;

      const values = rowData.map((v: string) => String(v));
      // Skip completely empty rows
      const hasData = values.some((v: string) => v.trim() !== '');
      if (!hasData) continue;

      rows.push({
        student_number: values[getHeaderIndex(headerMap, 'student_number')] ?? '',
        student_name: values[getHeaderIndex(headerMap, 'student_name')] ?? '',
        class_name: values[getHeaderIndex(headerMap, 'class_name')] ?? '',
        status: values[getHeaderIndex(headerMap, 'status')] ?? '',
      });
    }

    return rows;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Escape a field value for CSV output. If it contains commas, quotes,
   * or newlines, wrap in double quotes and escape internal quotes.
   */
  escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
