'use client';

import { cn } from '@school/ui';
import { AlertTriangle, XCircle } from 'lucide-react';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DesPreviewResponse {
  file_type: string;
  academic_year: string;
  row_count?: number;
  record_count?: number;
  columns: Array<string | { header: string; field: string }>;
  sample_rows?: Array<Record<string, string | number | null>>;
  rows?: Array<Record<string, string | number | null>>;
  validation_warnings?: Array<{ field: string; message: string; severity: 'error' | 'warning' }>;
  validation_errors?: Array<{ row_index: number; field: string; message: string; severity: 'error' | 'warning' }>;
}

interface FilePreviewProps {
  preview: DesPreviewResponse | null;
  isLoading: boolean;
}

// ─── File Type Labels ─────────────────────────────────────────────────────────

const FILE_TYPE_LABELS: Record<string, string> = {
  file_a: 'File A — Staff Returns',
  file_c: 'File C — Class Returns',
  file_d: 'File D — Subject Returns',
  file_e: 'File E — Student Returns',
  form_tl: 'Form TL — Timetable Returns',
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PreviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading preview">
      {/* Header skeleton */}
      <div className="animate-pulse rounded-xl border border-border bg-surface-primary p-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 rounded bg-border" />
          <div className="h-4 w-24 rounded bg-border" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="animate-pulse rounded-xl border border-border bg-surface-primary p-4">
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-border" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-3 w-full rounded bg-border" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Validation Warnings ──────────────────────────────────────────────────────

function ValidationWarnings({
  warnings,
}: {
  warnings: Array<{ field: string; message: string; severity: 'error' | 'warning' }>;
}) {
  if (warnings.length === 0) return null;

  const errors = warnings.filter((w) => w.severity === 'error');
  const warningItems = warnings.filter((w) => w.severity === 'warning');

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-3">
          <p className="mb-1.5 text-sm font-medium text-danger-800">
            {errors.length} error{errors.length !== 1 ? 's' : ''} found
          </p>
          <ul className="space-y-1">
            {errors.map((err, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-danger-700">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-medium">{err.field}:</span> {err.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warningItems.length > 0 && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-3">
          <p className="mb-1.5 text-sm font-medium text-warning-800">
            {warningItems.length} warning{warningItems.length !== 1 ? 's' : ''}
          </p>
          <ul className="space-y-1">
            {warningItems.map((warn, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-warning-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-medium">{warn.field}:</span> {warn.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FilePreview({ preview, isLoading }: FilePreviewProps) {
  if (isLoading) {
    return <PreviewSkeleton />;
  }

  if (!preview) {
    return (
      <div className="rounded-xl border border-border bg-surface-secondary p-6 text-center text-sm text-text-secondary">
        No preview data available.
      </div>
    );
  }

  const rowCount = preview.row_count ?? preview.record_count ?? 0;
  const sampleRows = preview.sample_rows ?? preview.rows ?? [];
  const warnings = preview.validation_warnings ?? preview.validation_errors ?? [];
  const columnLabels = preview.columns.map((column) =>
    typeof column === 'string' ? column : column.header,
  );

  return (
    <div className="space-y-4">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-primary px-4 py-3">
        <p className="text-sm font-semibold text-text-primary">
          {FILE_TYPE_LABELS[preview.file_type] ?? preview.file_type}
        </p>
        <p className="text-sm text-text-secondary">
          {rowCount} row{rowCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ─── Validation Warnings ─────────────────────────────────────────── */}
      <ValidationWarnings warnings={warnings} />

      {/* ─── Data Table ──────────────────────────────────────────────────── */}
      {columnLabels.length > 0 && sampleRows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                {columnLabels.map((col) => (
                  <th
                    key={col}
                    className={cn(
                      'whitespace-nowrap px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-text-secondary',
                    )}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sampleRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="transition-colors hover:bg-surface-secondary"
                >
                  {columnLabels.map((col) => (
                    <td
                      key={col}
                      className="whitespace-nowrap px-3 py-2 text-text-primary"
                    >
                      {row[col] != null ? String(row[col]) : (
                        <span className="text-text-tertiary">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-secondary p-6 text-center text-sm text-text-secondary">
          No sample data to display.
        </div>
      )}

      {sampleRows.length > 0 && rowCount > sampleRows.length && (
        <p className="text-xs text-text-tertiary">
          Showing {sampleRows.length} of {rowCount} rows.
        </p>
      )}
    </div>
  );
}
