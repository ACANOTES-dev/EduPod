'use client';

import { Download, Upload, CheckCircle, AlertTriangle, FileText, Undo2, Home } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient, getAccessToken } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportPreview {
  summary: {
    total_rows: number;
    by_year_group?: Record<string, number>;
    by_gender?: Record<string, number>;
    household_count?: number;
  };
  sample_rows: Record<string, string>[];
  headers: string[];
}

interface RollbackSummary {
  deleted_count: number;
  skipped_count: number;
  skipped_details: Array<{ record_type: string; record_id: string; reason: string }>;
}

interface ImportJob {
  id: string;
  import_type: string;
  status: string;
  total_rows: number | null;
  valid_rows: number | null;
  invalid_rows: number | null;
  created_at: string;
  completed_at: string | null;
  errors: ImportError[] | null;
  preview_json: ImportPreview | null;
  rollback_summary?: RollbackSummary | null;
}

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ImportListResponse {
  data: ImportJob[];
  meta: { page: number; pageSize: number; total: number };
}

const IMPORT_TYPES = [
  'students',
  'parents',
  'staff',
  'fees',
  'exam_results',
  'staff_compensation',
] as const;

type ImportType = (typeof IMPORT_TYPES)[number];

/** File extensions accepted for upload. */
const ACCEPTED_FILE_EXTENSIONS = '.csv,.xlsx';

const statusVariantMap: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  uploaded: 'neutral',
  validating: 'info',
  validated: 'info',
  processing: 'warning',
  completed: 'success',
  failed: 'danger',
  confirmed: 'warning',
  rolled_back: 'neutral',
  partially_rolled_back: 'warning',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Download an XLSX template from the API.
 */
async function downloadXlsxTemplate(importType: ImportType): Promise<void> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/api/v1/imports/template?import_type=${importType}`, {
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to download template');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${importType}_import_template.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.csv') || name.endsWith('.xlsx');
}

// ─── Upload Section ──────────────────────────────────────────────────────────

interface UploadSectionProps {
  onUploadComplete: (job: ImportJob) => void;
}

function UploadSection({ onUploadComplete }: UploadSectionProps) {
  const t = useTranslations('imports');
  const tc = useTranslations('common');

  const [importType, setImportType] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return;
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(t('fileTooLarge'));
      return;
    }
    if (!isAcceptedFile(selectedFile)) {
      setError(t('xlsxOrCsvOnly'));
      return;
    }
    setError('');
    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0] ?? null;
    handleFileSelect(droppedFile);
  };

  const handleDownloadTemplate = async () => {
    if (!importType) return;
    setDownloading(true);
    try {
      await downloadXlsxTemplate(importType as ImportType);
    } catch {
      setError(t('templateDownloadFailed'));
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!importType) {
      setError(t('selectTypeFirst'));
      return;
    }
    if (!file) {
      setError(t('selectFileFirst'));
      return;
    }

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('import_type', importType);

      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/api/v1/imports/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers,
      });
      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({ error: { message: 'Upload failed' } }));
        throw errData;
      }
      const result = await response.json();
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploadComplete(result.data ?? result);
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setError(e?.error?.message ?? tc('noResults'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-primary p-6 space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">{t('newImport')}</h2>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-56">
          <Select value={importType} onValueChange={setImportType}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectImportType')} />
            </SelectTrigger>
            <SelectContent>
              {IMPORT_TYPES.map((it) => (
                <SelectItem key={it} value={it}>
                  {it.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {importType && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={downloading}
          >
            <Download className="me-1.5 h-3.5 w-3.5" />
            {downloading ? tc('loading') : t('downloadTemplate')}
          </Button>
        )}
      </div>

      {/* Dropzone */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          dragOver ? 'border-primary-500 bg-primary-50/50' : 'border-border bg-surface-secondary/30'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
      >
        <Upload className="h-8 w-8 text-text-tertiary" />
        <p className="mt-2 text-sm text-text-secondary">{file ? file.name : t('dropzoneText')}</p>
        <p className="mt-1 text-xs text-text-tertiary">{t('xlsxMaxSize')}</p>
        <Input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_EXTENSIONS}
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
        />
      </div>

      {error && <p className="text-sm text-danger-text">{error}</p>}

      {file && (
        <Button onClick={handleUpload} disabled={uploading}>
          <Upload className="me-2 h-4 w-4" />
          {uploading ? tc('loading') : t('upload')}
        </Button>
      )}
    </div>
  );
}

// ─── Validation Results ──────────────────────────────────────────────────────

interface ValidationResultsProps {
  job: ImportJob;
  onConfirm: () => void;
  onDismiss: () => void;
}

function ValidationResults({ job, onConfirm, onDismiss }: ValidationResultsProps) {
  const t = useTranslations('imports');
  const tc = useTranslations('common');
  const [confirming, setConfirming] = React.useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await apiClient(`/api/v1/imports/${job.id}/confirm`, { method: 'POST' });
      onConfirm();
    } catch (err) {
      // silently swallowed
      console.error('[onConfirm]', err);
    } finally {
      setConfirming(false);
    }
  };

  const isValidated = job.status === 'validated';
  const hasErrors = (job.invalid_rows ?? 0) > 0;

  return (
    <div className="rounded-xl border border-border bg-surface-primary p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">{t('validationResults')}</h2>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {tc('dismiss')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-text-tertiary" />
          <span className="text-text-secondary">{t('totalRows')}:</span>
          <span className="font-medium text-text-primary">{job.total_rows ?? 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-success-text" />
          <span className="text-text-secondary">{t('validRows')}:</span>
          <span className="font-medium text-success-text">{job.valid_rows ?? 0}</span>
        </div>
        {hasErrors && (
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger-text" />
            <span className="text-text-secondary">{t('invalidRows')}:</span>
            <span className="font-medium text-danger-text">{job.invalid_rows ?? 0}</span>
          </div>
        )}
      </div>

      {/* Error table */}
      {hasErrors && job.errors && job.errors.length > 0 && (
        <div className="max-h-60 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary">
                  {t('row')}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary">
                  {t('field')}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary">
                  {t('errorMessage')}
                </th>
              </tr>
            </thead>
            <tbody>
              {job.errors.map((err, idx) => (
                <tr key={idx} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-text-secondary">{err.row}</td>
                  <td className="px-3 py-2 text-text-secondary">{err.field}</td>
                  <td className="px-3 py-2 text-danger-text">{err.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview section */}
      {job.preview_json && (
        <div className="space-y-3">
          {/* Summary cards */}
          <h3 className="text-sm font-semibold text-text-primary">Preview</h3>
          <div className="flex flex-wrap gap-3">
            {job.preview_json.summary.by_year_group && (
              <div className="rounded-lg border border-border bg-surface-secondary p-3">
                <p className="text-xs font-medium text-text-tertiary mb-1">By Year Group</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(job.preview_json.summary.by_year_group).map(([yg, count]) => (
                    <span key={yg} className="text-xs text-text-secondary">
                      {yg}: <span className="font-medium text-text-primary">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {job.preview_json.summary.by_gender && (
              <div className="rounded-lg border border-border bg-surface-secondary p-3">
                <p className="text-xs font-medium text-text-tertiary mb-1">By Gender</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(job.preview_json.summary.by_gender).map(([g, count]) => (
                    <span key={g} className="text-xs text-text-secondary capitalize">
                      {g}: <span className="font-medium text-text-primary">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {job.preview_json.summary.household_count != null && (
              <div className="rounded-lg border border-border bg-surface-secondary p-3">
                <p className="text-xs font-medium text-text-tertiary mb-1">Households</p>
                <div className="flex items-center gap-1">
                  <Home className="h-3.5 w-3.5 text-text-tertiary" />
                  <span className="text-sm font-medium text-text-primary">
                    {job.preview_json.summary.household_count}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Sample table */}
          {job.preview_json.sample_rows.length > 0 && (
            <div>
              <p className="text-xs text-text-tertiary mb-1">
                Showing {job.preview_json.sample_rows.length} of{' '}
                {job.preview_json.summary.total_rows} rows
              </p>
              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      {job.preview_json.headers.slice(0, 8).map((h) => (
                        <th
                          key={h}
                          className="px-2 py-1.5 text-start font-semibold text-text-tertiary whitespace-nowrap"
                        >
                          {h.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {job.preview_json.sample_rows.map((row, idx) => (
                      <tr key={idx} className="border-b border-border last:border-b-0">
                        {job.preview_json!.headers.slice(0, 8).map((h) => (
                          <td
                            key={h}
                            className="px-2 py-1.5 text-text-secondary whitespace-nowrap max-w-[150px] truncate"
                          >
                            {row[h] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {isValidated && (job.valid_rows ?? 0) > 0 && (
        <Button onClick={handleConfirm} disabled={confirming}>
          <CheckCircle className="me-2 h-4 w-4" />
          {confirming ? tc('loading') : t('confirmImport')}
        </Button>
      )}

      {job.status === 'processing' && (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          {t('processing')}
        </div>
      )}

      {job.status === 'completed' && (
        <div className="rounded-lg border border-success-text/20 bg-success-fill px-4 py-3 text-sm text-success-text">
          {t('importCompleted')}
        </div>
      )}

      {job.status === 'failed' && (
        <div className="rounded-lg border border-danger-fill/20 bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
          {t('importFailed')}
        </div>
      )}
    </div>
  );
}

// ─── Rollback Button ─────────────────────────────────────────────────────────

function RollbackButton({ jobId, onRollback }: { jobId: string; onRollback: () => void }) {
  const [confirming, setConfirming] = React.useState(false);
  const [rolling, setRolling] = React.useState(false);
  const [result, setResult] = React.useState<RollbackSummary | null>(null);

  const handleRollback = async () => {
    setRolling(true);
    try {
      const res = await apiClient<{ data: ImportJob; rollback_summary: RollbackSummary }>(
        `/api/v1/imports/${jobId}/rollback`,
        { method: 'POST' },
      );
      setResult(
        res.rollback_summary ??
          (res.data as unknown as { rollback_summary?: RollbackSummary }).rollback_summary ??
          null,
      );
      onRollback();
    } catch (err) {
      // error handled by global handler
      console.error('[onRollback]', err);
    } finally {
      setRolling(false);
      setConfirming(false);
    }
  };

  if (result) {
    return (
      <div className="text-xs">
        <span className="text-success-text">{result.deleted_count} deleted</span>
        {result.skipped_count > 0 && (
          <span className="text-warning-text ms-2">{result.skipped_count} kept</span>
        )}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={rolling}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-danger-text border-danger-text"
          onClick={handleRollback}
          disabled={rolling}
        >
          {rolling ? 'Rolling back...' : 'Confirm'}
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
      <Undo2 className="me-1 h-3.5 w-3.5" />
      Rollback
    </Button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ImportsPage() {
  const t = useTranslations('imports');

  const [history, setHistory] = React.useState<ImportJob[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [activeJob, setActiveJob] = React.useState<ImportJob | null>(null);
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHistory = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const res = await apiClient<ImportListResponse>(
        `/api/v1/imports?page=${p}&pageSize=${PAGE_SIZE}`,
      );
      setHistory(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      // silently swallowed
      console.error('[setTotal]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchHistory(page);
  }, [page, fetchHistory]);

  // Poll active job status
  React.useEffect(() => {
    if (!activeJob) return;
    if (['completed', 'failed', 'validated'].includes(activeJob.status)) return;

    pollingRef.current = setInterval(async () => {
      try {
        const updated = await apiClient<{ data: ImportJob }>(`/api/v1/imports/${activeJob.id}`);
        const job = updated.data;
        setActiveJob(job);
        if (['completed', 'failed', 'validated'].includes(job.status)) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          void fetchHistory(page);
        }
      } catch {
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeJob, page, fetchHistory]);

  const handleUploadComplete = (job: ImportJob) => {
    setActiveJob(job);
  };

  const handleConfirmComplete = () => {
    if (activeJob) {
      setActiveJob({ ...activeJob, status: 'processing' });
    }
    void fetchHistory(page);
  };

  const columns = [
    {
      key: 'import_type',
      header: t('importType'),
      render: (row: ImportJob) => (
        <span className="font-medium text-text-primary">{row.import_type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: ImportJob) => (
        <StatusBadge status={statusVariantMap[row.status] ?? 'neutral'} dot>
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'total_rows',
      header: t('totalRows'),
      render: (row: ImportJob) => (
        <span className="text-text-secondary">{row.total_rows ?? '—'}</span>
      ),
    },
    {
      key: 'valid_rows',
      header: t('validRows'),
      render: (row: ImportJob) => (
        <span className="text-success-text">{row.valid_rows ?? '—'}</span>
      ),
    },
    {
      key: 'invalid_rows',
      header: t('invalidRows'),
      render: (row: ImportJob) => (
        <span className={row.invalid_rows ? 'text-danger-text' : 'text-text-secondary'}>
          {row.invalid_rows ?? '—'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: t('created'),
      render: (row: ImportJob) => (
        <span dir="ltr" className="text-text-secondary whitespace-nowrap">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: ImportJob) =>
        row.status === 'completed' ? (
          <RollbackButton jobId={row.id} onRollback={() => void fetchHistory(page)} />
        ) : row.status === 'rolled_back' ? (
          <span className="text-xs text-text-tertiary">Rolled back</span>
        ) : row.status === 'partially_rolled_back' ? (
          <span className="text-xs text-warning-text">Partial rollback</span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <UploadSection onUploadComplete={handleUploadComplete} />

      {activeJob && (
        <ValidationResults
          job={activeJob}
          onConfirm={handleConfirmComplete}
          onDismiss={() => setActiveJob(null)}
        />
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">{t('importHistory')}</h2>
        <DataTable
          columns={columns}
          data={history}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
