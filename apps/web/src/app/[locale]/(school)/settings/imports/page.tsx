'use client';

import { Download, Upload, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
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
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

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

const statusVariantMap: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  validating: 'info',
  validated: 'info',
  processing: 'warning',
  completed: 'success',
  failed: 'danger',
  confirmed: 'warning',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return;
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(t('fileTooLarge'));
      return;
    }
    if (!selectedFile.name.endsWith('.csv')) {
      setError(t('csvOnly'));
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
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(
        `${API_URL}/api/v1/imports/template?import_type=${importType}`,
        { credentials: 'include' },
      );
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${importType}_template.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError(t('templateDownloadFailed'));
    }
  };

  const handleUpload = async () => {
    if (!importType) { setError(t('selectTypeFirst')); return; }
    if (!file) { setError(t('selectFileFirst')); return; }

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('import_type', importType);

      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${API_URL}/api/v1/imports/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: { message: 'Upload failed' } }));
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
        <div className="w-56">
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
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="me-1.5 h-3.5 w-3.5" />
            {t('downloadTemplate')}
          </Button>
        )}
      </div>

      {/* Dropzone */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? 'border-primary-500 bg-primary-50/50'
            : 'border-border bg-surface-secondary/30'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
      >
        <Upload className="h-8 w-8 text-text-tertiary" />
        <p className="mt-2 text-sm text-text-secondary">
          {file ? file.name : t('dropzoneText')}
        </p>
        <p className="mt-1 text-xs text-text-tertiary">{t('csvMaxSize')}</p>
        <Input
          ref={fileInputRef}
          type="file"
          accept=".csv"
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
    } catch {
      // silently swallowed
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
                <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary">{t('row')}</th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary">{t('field')}</th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary">{t('errorMessage')}</th>
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
    } catch {
      // silently swallowed
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
        const updated = await apiClient<{ data: ImportJob }>(
          `/api/v1/imports/${activeJob.id}`,
        );
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
        <span className="font-medium text-text-primary">
          {row.import_type.replace(/_/g, ' ')}
        </span>
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
