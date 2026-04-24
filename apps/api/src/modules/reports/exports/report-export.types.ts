/**
 * Unified input/output shapes for the reports export pipeline.
 *
 * Every export (PDF, Excel, Word) takes the same `ExportInput` and returns a
 * `Buffer`. Callers — on-demand HTTP endpoint, scheduled-reports worker,
 * report-sharing service, batch export job — construct the input once and pick
 * the format-specific renderer.
 */
import type { TenantBranding } from './templates/branding';

export type ExportFormat = 'pdf' | 'excel' | 'word';

export type ExportColumnType = 'string' | 'number' | 'date' | 'boolean' | 'currency';

export interface ExportColumn {
  /** Stable id used as key into each row record. */
  id: string;
  /** Human-readable column header shown in the exported artifact. */
  label: string;
  /** Drives per-cell formatting (date layout, number alignment, etc). */
  type: ExportColumnType;
}

export interface ExportReportMeta {
  name: string;
  description?: string;
  /** Plain-English filter description, e.g. "Year 10 • this term". */
  filters_summary: string;
  /** Display name of the user who triggered the export. */
  generated_by: string;
  /** Wall-clock time the export was generated (UTC recommended). */
  generated_at: Date;
}

export interface ExportInput {
  tenantId: string;
  report: ExportReportMeta;
  data: {
    columns: ExportColumn[];
    rows: Record<string, unknown>[];
  };
  branding: TenantBranding;
}

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  pdf: 'pdf',
  excel: 'xlsx',
  word: 'docx',
};

/**
 * Rows above this count are pushed to the `reports:export-batch` worker job
 * instead of being rendered synchronously in the HTTP lifecycle. 5 000 is the
 * value called out in the implementation spec (04-export-service.md §7).
 */
export const SYNCHRONOUS_EXPORT_ROW_LIMIT = 5_000;

/** Sanitise a user-supplied report name for use in a Content-Disposition filename. */
export function safeExportFilename(reportName: string, format: ExportFormat): string {
  const safe =
    reportName
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .slice(0, 80) || 'report';
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `${safe}_${dateStamp}.${EXPORT_FILE_EXTENSIONS[format]}`;
}
