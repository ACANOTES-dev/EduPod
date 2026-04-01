import { Injectable } from '@nestjs/common';

import type { DesFileType } from '@school/shared';

import type {
  DesColumnDef,
  DesFileExporter,
  DesFileExportResult,
  DesFileRow,
} from './des-file-exporter.interface';

// ─── UTF-8 BOM ────────────────────────────────────────────────────────────────

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

// ─── CSV Adapter ──────────────────────────────────────────────────────────────

@Injectable()
export class DesFileExporterCsv implements DesFileExporter {
  export(fileType: DesFileType, rows: DesFileRow[], columns: DesColumnDef[]): DesFileExportResult {
    const headerRow = columns.map((col) => this.escapeCsvValue(col.header)).join(',');

    const dataRows = rows.map((row) =>
      columns.map((col) => this.escapeCsvValue(row[col.field] ?? null)).join(','),
    );

    const csvBody = [headerRow, ...dataRows].join('\r\n');
    const csvBuffer = Buffer.from(csvBody, 'utf-8');
    const content = Buffer.concat([UTF8_BOM, csvBuffer]);

    const now = new Date();
    const timestamp = [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '_',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');

    return {
      content,
      filename: `des_${fileType}_${timestamp}.csv`,
      content_type: 'text/csv',
      record_count: rows.length,
    };
  }

  private escapeCsvValue(value: string | number | null): string {
    if (value === null) {
      return '';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    // Wrap in quotes if the value contains a comma, double-quote, or newline
    if (
      value.includes(',') ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    }

    return value;
  }
}
