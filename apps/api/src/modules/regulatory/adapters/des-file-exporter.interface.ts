import type { DesFileType } from '@school/shared';

// ─── DI Token ─────────────────────────────────────────────────────────────────

export const DES_FILE_EXPORTER = Symbol('DES_FILE_EXPORTER');

// ─── Types ────────────────────────────────────────────────────────────────────

/** Represents a single row of formatted DES data ready for export. */
export interface DesFileRow {
  [column: string]: string | number | null;
}

/** Result of exporting a DES file. */
export interface DesFileExportResult {
  content: Buffer;
  filename: string;
  content_type: string;
  record_count: number;
}

/** Column definition for DES file layout. */
export interface DesColumnDef {
  header: string;
  field: string;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface DesFileExporter {
  export(fileType: DesFileType, rows: DesFileRow[], columns: DesColumnDef[]): DesFileExportResult;
}
