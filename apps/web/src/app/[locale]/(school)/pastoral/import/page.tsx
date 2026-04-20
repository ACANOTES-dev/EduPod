'use client';

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient, getAccessToken } from '@/lib/api-client';
import { getLocaleFromPathname } from '@/lib/pastoral';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportValidationResult {
  validation_token: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  skipped_rows: number;
  errors: Array<{ row: number; field: string; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  preview: Array<{
    row: number;
    student_name: string;
    date: string;
    category: string;
    severity: string;
    narrative_preview: string;
  }>;
}

interface ImportConfirmResult {
  total_imported: number;
  skipped_duplicates: number;
  audit_events_created: number;
}

type Step = 'upload' | 'review' | 'done';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS_HINT = 5000;

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(value: { data?: T } | T): T {
  if (value && typeof value === 'object' && 'data' in (value as object)) {
    const inner = (value as { data?: T }).data;
    if (inner !== undefined && inner !== null) return inner;
  }
  return value as T;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PastoralImportPage() {
  const t = useTranslations('pastoralImport');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);

  const [step, setStep] = React.useState<Step>('upload');
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [validation, setValidation] = React.useState<ImportValidationResult | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [result, setResult] = React.useState<ImportConfirmResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFile = React.useCallback(
    (next: File | null) => {
      setError(null);
      if (!next) {
        setFile(null);
        return;
      }
      if (next.size > MAX_FILE_SIZE) {
        setError(t('errors.fileTooLarge', { maxMb: 5 }));
        return;
      }
      const looksLikeCsv =
        next.type.includes('csv') ||
        next.type === 'text/plain' ||
        next.type === 'application/vnd.ms-excel' ||
        next.name.toLowerCase().endsWith('.csv');
      if (!looksLikeCsv) {
        setError(t('errors.invalidFileType'));
        return;
      }
      setFile(next);
    },
    [t],
  );

  const handleUpload = React.useCallback(async () => {
    if (!file) return;
    setValidating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = getAccessToken();
      const response = await fetch(`${API_URL}/api/v1/pastoral/import/validate`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? t('errors.validationFailed'));
      }

      const raw = (await response.json()) as
        | ImportValidationResult
        | { data: ImportValidationResult };
      const data = unwrap<ImportValidationResult>(raw);
      setValidation(data);
      setStep('review');
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message ?? t('errors.validationFailed'));
    } finally {
      setValidating(false);
    }
  }, [file, t]);

  const handleConfirm = React.useCallback(async () => {
    if (!validation?.validation_token) return;
    setConfirming(true);
    setError(null);
    try {
      const raw = await apiClient<ImportConfirmResult | { data: ImportConfirmResult }>(
        '/api/v1/pastoral/import/confirm',
        {
          method: 'POST',
          body: JSON.stringify({ validation_token: validation.validation_token }),
          silent: true,
        },
      );
      setResult(unwrap<ImportConfirmResult>(raw));
      setStep('done');
    } catch (err: unknown) {
      const apiError = err as { error?: { message?: string }; message?: string };
      setError(apiError.error?.message ?? apiError.message ?? t('errors.confirmFailed'));
    } finally {
      setConfirming(false);
    }
  }, [t, validation]);

  const handleReset = React.useCallback(() => {
    setStep('upload');
    setFile(null);
    setValidation(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleDownloadTemplate = React.useCallback(async () => {
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_URL}/api/v1/pastoral/import/template`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(t('errors.templateFailed'));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pastoral-import-template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error('[PastoralImportPage.template]', err);
      setError((err as { message?: string }).message ?? t('errors.templateFailed'));
    }
  }, [t]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <StepIndicator step={step} t={t} />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      {step === 'upload' ? (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('upload.title')}</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('upload.description')}</p>
              <p className="mt-2 text-xs text-text-tertiary">
                {t('upload.limits', { maxMb: 5, maxRows: MAX_ROWS_HINT })}
              </p>
            </div>
            <Button variant="outline" onClick={() => void handleDownloadTemplate()}>
              <Download className="me-2 h-4 w-4" aria-hidden="true" />
              {t('upload.downloadTemplate')}
            </Button>
          </div>

          <div
            className={`mt-5 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              isDragging
                ? 'border-emerald-400 bg-emerald-50/60'
                : 'border-border bg-surface-secondary/50'
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) handleFile(dropped);
            }}
          >
            <FileSpreadsheet className="mx-auto h-10 w-10 text-emerald-700" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-text-primary">
              {t('upload.dropzoneLabel')}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">{t('upload.dropzoneHint')}</p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <FileUp className="me-2 h-4 w-4" aria-hidden="true" />
                {t('upload.chooseFile')}
              </Button>

              {file ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs text-text-secondary">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  {t('upload.filePicked', {
                    name: file.name,
                    size: (file.size / 1024).toFixed(1),
                  })}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button disabled={!file || validating} onClick={() => void handleUpload()}>
              {validating ? t('upload.validating') : t('upload.validate')}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'review' && validation ? (
        <section className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                {t('review.stats.total')}
              </p>
              <p className="mt-2 text-xl font-semibold text-text-primary">
                {validation.total_rows}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-800">
                {t('review.stats.valid')}
              </p>
              <p className="mt-2 text-xl font-semibold text-emerald-900">{validation.valid_rows}</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-rose-800">
                {t('review.stats.errors')}
              </p>
              <p className="mt-2 text-xl font-semibold text-rose-900">{validation.error_rows}</p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-sky-800">
                {t('review.stats.skipped')}
              </p>
              <p className="mt-2 text-xl font-semibold text-sky-900">{validation.skipped_rows}</p>
            </div>
          </div>

          {validation.errors.length > 0 ? (
            <div className="rounded-3xl border border-rose-200 bg-surface p-5">
              <h3 className="text-sm font-semibold text-rose-800">
                {t('review.errorsTitle', { count: validation.errors.length })}
              </h3>
              <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
                {validation.errors.slice(0, 100).map((err, index) => (
                  <li
                    key={`${err.row}-${err.field}-${index}`}
                    className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/40 px-3 py-2"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-rose-700"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-mono text-xs text-text-tertiary">
                        {t('review.errorRow', { row: err.row, field: err.field })}
                      </p>
                      <p className="text-sm text-rose-900">{err.message}</p>
                    </div>
                  </li>
                ))}
                {validation.errors.length > 100 ? (
                  <li className="text-center text-xs text-text-tertiary">
                    {t('review.errorOverflow', { count: validation.errors.length - 100 })}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {validation.warnings.length > 0 ? (
            <div className="rounded-3xl border border-amber-200 bg-surface p-5">
              <h3 className="text-sm font-semibold text-amber-800">
                {t('review.warningsTitle', { count: validation.warnings.length })}
              </h3>
              <ul className="mt-3 space-y-1 text-sm">
                {validation.warnings.slice(0, 30).map((warn, index) => (
                  <li
                    key={`${warn.row}-${index}`}
                    className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2"
                  >
                    <span className="font-mono text-xs text-text-tertiary">
                      {t('review.warningRow', { row: warn.row })}
                    </span>
                    <span className="ms-2 text-amber-900">{warn.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {validation.preview.length > 0 ? (
            <div className="rounded-3xl border border-border bg-surface p-5">
              <h3 className="text-sm font-semibold text-text-primary">
                {t('review.previewTitle')}
              </h3>
              <p className="mt-1 text-xs text-text-tertiary">{t('review.previewHint')}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-[0.14em] text-text-tertiary">
                      <th className="py-2 text-start font-medium">{t('review.columns.row')}</th>
                      <th className="py-2 text-start font-medium">{t('review.columns.student')}</th>
                      <th className="py-2 text-start font-medium">{t('review.columns.date')}</th>
                      <th className="py-2 text-start font-medium">
                        {t('review.columns.category')}
                      </th>
                      <th className="py-2 text-start font-medium">
                        {t('review.columns.severity')}
                      </th>
                      <th className="py-2 text-start font-medium">
                        {t('review.columns.narrative')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.preview.map((row) => (
                      <tr key={row.row} className="border-b border-border/60">
                        <td className="py-2 font-mono text-xs text-text-tertiary">{row.row}</td>
                        <td className="py-2 text-text-primary">{row.student_name}</td>
                        <td className="py-2 text-text-secondary">{row.date}</td>
                        <td className="py-2 text-text-secondary">{row.category}</td>
                        <td className="py-2 text-text-secondary">{row.severity}</td>
                        <td className="py-2 text-text-secondary">{row.narrative_preview}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-5">
            <div>
              <p className="text-sm font-medium text-text-primary">
                {t('review.confirmSummary', { valid: validation.valid_rows })}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">{t('review.confirmHint')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset}>
                <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
                {t('review.startOver')}
              </Button>
              <Button
                disabled={validation.valid_rows <= 0 || confirming}
                onClick={() => void handleConfirm()}
              >
                {confirming
                  ? t('review.confirming')
                  : t('review.confirm', { valid: validation.valid_rows })}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 'done' && result ? (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold text-emerald-900">{t('done.title')}</h2>
          <p className="mt-2 text-sm text-emerald-800">
            {t('done.imported', { count: result.total_imported })}
          </p>
          {result.skipped_duplicates > 0 ? (
            <p className="mt-1 text-xs text-emerald-800">
              {t('done.skippedDuplicates', { count: result.skipped_duplicates })}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button variant="outline" onClick={handleReset}>
              {t('done.importAnother')}
            </Button>
            <Link href={`/${locale}/pastoral`}>
              <Button variant="default">{t('done.backToPastoral')}</Button>
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ─── StepIndicator ────────────────────────────────────────────────────────────

function StepIndicator({ step, t }: { step: Step; t: (key: string) => string }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'upload', label: t('steps.upload') },
    { key: 'review', label: t('steps.review') },
    { key: 'done', label: t('steps.done') },
  ];

  const currentIndex = steps.findIndex((s) => s.key === step);

  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, index) => {
        const active = index <= currentIndex;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                active ? 'bg-emerald-600 text-white' : 'bg-surface-secondary text-text-tertiary'
              }`}
            >
              {index + 1}
            </span>
            <span className={active ? 'font-medium text-text-primary' : 'text-text-tertiary'}>
              {s.label}
            </span>
            {index < steps.length - 1 ? (
              <span className="mx-1 h-px w-8 bg-border" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
