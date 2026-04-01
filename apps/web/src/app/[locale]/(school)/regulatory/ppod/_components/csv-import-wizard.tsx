'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, cn, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CsvImportWizardProps {
  databaseType: 'ppod' | 'pod';
  onComplete: () => void;
  onCancel: () => void;
}

interface ImportResult {
  records_created: number;
  records_updated: number;
  records_skipped: number;
  records_failed: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

interface ParsedCsv {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors',
                i < currentStep
                  ? 'bg-success-text text-white'
                  : i === currentStep
                    ? 'bg-primary-700 text-white'
                    : 'bg-surface-secondary text-text-tertiary',
              )}
            >
              {i < currentStep ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                'hidden text-sm sm:inline',
                i === currentStep ? 'font-medium text-text-primary' : 'text-text-tertiary',
              )}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'h-0.5 w-6 rounded-full sm:w-10',
                i < currentStep ? 'bg-success-text' : 'bg-border',
              )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────

function parseCsv(content: string): ParsedCsv {
  const lines = content.trim().split('\n');
  if (lines.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const headers = (lines[0] ?? '').split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines
    .slice(1)
    .map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')));

  return { headers, rows, totalRows: rows.length };
}

// ─── Wizard Component ────────────────────────────────────────────────────────

export function CsvImportWizard({ databaseType, onComplete, onCancel }: CsvImportWizardProps) {
  const t = useTranslations('regulatory');

  const STEPS = [
    t('ppod.stepUpload'),
    t('ppod.stepPreview'),
    t('ppod.stepConfirm'),
    t('ppod.stepResult'),
  ];

  const [currentStep, setCurrentStep] = React.useState(0);
  const [fileContent, setFileContent] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [fileSize, setFileSize] = React.useState(0);
  const [parsedCsv, setParsedCsv] = React.useState<ParsedCsv | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ─── File Upload Handler ───────────────────────────────────────────────

  const handleFileSelect = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith('.csv')) {
        toast.error(t('ppod.errorInvalidFileType'));
        return;
      }

      setFileName(file.name);
      setFileSize(file.size);

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setFileContent(content);
        setParsedCsv(parseCsv(content));
      };
      reader.onerror = () => {
        toast.error(t('ppod.errorFileRead'));
      };
      reader.readAsText(file);
    },
    [t],
  );

  const handleRemoveFile = React.useCallback(() => {
    setFileContent('');
    setFileName('');
    setFileSize(0);
    setParsedCsv(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // ─── Import Handler ────────────────────────────────────────────────────

  const handleImport = React.useCallback(async () => {
    setIsImporting(true);
    try {
      const result = await apiClient<ImportResult>('/api/v1/regulatory/ppod/import', {
        method: 'POST',
        body: JSON.stringify({
          database_type: databaseType,
          file_content: fileContent,
        }),
      });
      setImportResult(result);
      setCurrentStep(3);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      toast.error(ex?.error?.message ?? ex?.message ?? t('ppod.errorImportFailed'));
      console.error('[CsvImportWizard.handleImport]', err);
    } finally {
      setIsImporting(false);
    }
  }, [databaseType, fileContent, t]);

  // ─── Navigation ────────────────────────────────────────────────────────

  const handleNext = React.useCallback(() => {
    if (currentStep === 0) {
      if (!fileContent) {
        toast.error(t('ppod.errorNoFile'));
        return;
      }
      setCurrentStep(1);
    } else if (currentStep === 1) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      void handleImport();
    }
  }, [currentStep, fileContent, handleImport, t]);

  const handleBack = React.useCallback(() => {
    if (currentStep > 0 && currentStep < 3) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  // ─── Format file size ─────────────────────────────────────────────────

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ─── Step 0: Upload ───────────────────────────────────────────────────

  const renderUploadStep = () => (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t('ppod.importUploadDescription')}</p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {!fileName ? (
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-12 transition-colors hover:border-primary-300 hover:bg-surface-secondary"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          role="button"
          tabIndex={0}
        >
          <Upload className="h-8 w-8 text-text-tertiary" />
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary">{t('ppod.importClickToUpload')}</p>
            <p className="mt-1 text-xs text-text-tertiary">{t('ppod.importCsvOnly')}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-secondary px-4 py-3">
          <FileText className="h-5 w-5 shrink-0 text-primary-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{fileName}</p>
            <p className="text-xs text-text-tertiary">{formatFileSize(fileSize)}</p>
          </div>
          <button
            type="button"
            onClick={handleRemoveFile}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-primary hover:text-text-primary"
            aria-label={t('ppod.importRemoveFile')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );

  // ─── Step 1: Preview ──────────────────────────────────────────────────

  const renderPreviewStep = () => {
    if (!parsedCsv) return null;

    const previewRows = parsedCsv.rows.slice(0, 10);

    return (
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">{t('ppod.importPreviewDescription')}</p>

        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-text-tertiary">{t('ppod.importTotalRows')}: </span>
              <span className="font-semibold text-text-primary">{parsedCsv.totalRows}</span>
            </div>
            <div>
              <span className="text-text-tertiary">{t('ppod.importColumns')}: </span>
              <span className="font-semibold text-text-primary">{parsedCsv.headers.length}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                {parsedCsv.headers.map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap px-3 py-2 text-start text-xs font-medium text-text-tertiary"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-border last:border-b-0">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="whitespace-nowrap px-3 py-2 text-text-primary">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {parsedCsv.totalRows > 10 && (
          <p className="text-center text-xs text-text-tertiary">
            {t('ppod.importShowingPreview', {
              shown: 10,
              total: parsedCsv.totalRows,
            })}
          </p>
        )}
      </div>
    );
  };

  // ─── Step 2: Confirm ──────────────────────────────────────────────────

  const renderConfirmStep = () => (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t('ppod.importConfirmDescription')}</p>

      <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-text-tertiary">{t('ppod.importDatabaseType')}</p>
            <p className="mt-0.5 text-sm font-semibold text-text-primary uppercase">
              {databaseType}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-tertiary">{t('ppod.importFile')}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-text-primary">{fileName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-tertiary">{t('ppod.importRecordCount')}</p>
            <p className="mt-0.5 text-sm font-semibold text-text-primary">
              {parsedCsv?.totalRows ?? 0}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-warning-text/20 bg-warning-fill px-4 py-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-text" />
        <p className="text-sm text-warning-text">
          {t('ppod.importConfirmWarning', { count: parsedCsv?.totalRows ?? 0 })}
        </p>
      </div>
    </div>
  );

  // ─── Step 3: Result ───────────────────────────────────────────────────

  const renderResultStep = () => {
    if (!importResult) return null;

    const hasErrors = importResult.errors.length > 0;
    const totalProcessed =
      importResult.records_created +
      importResult.records_updated +
      importResult.records_skipped +
      importResult.records_failed;

    return (
      <div className="space-y-5">
        {/* Success/Warning Banner */}
        <div
          className={cn(
            'flex items-center gap-3 rounded-xl border px-5 py-4',
            hasErrors
              ? 'border-warning-text/20 bg-warning-fill'
              : 'border-success-text/20 bg-success-fill',
          )}
        >
          {hasErrors ? (
            <AlertTriangle className="h-6 w-6 shrink-0 text-warning-text" />
          ) : (
            <CheckCircle2 className="h-6 w-6 shrink-0 text-success-text" />
          )}
          <div>
            <p
              className={cn('font-semibold', hasErrors ? 'text-warning-text' : 'text-success-text')}
            >
              {hasErrors ? t('ppod.importCompleteWithErrors') : t('ppod.importCompleteSuccess')}
            </p>
            <p
              className={cn('text-sm', hasErrors ? 'text-warning-text/80' : 'text-success-text/80')}
            >
              {t('ppod.importProcessedCount', { count: totalProcessed })}
            </p>
          </div>
        </div>

        {/* Result Counts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-center">
            <p className="text-2xl font-bold text-success-text">{importResult.records_created}</p>
            <p className="text-xs text-text-tertiary">{t('ppod.importCreated')}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-center">
            <p className="text-2xl font-bold text-primary-600">{importResult.records_updated}</p>
            <p className="text-xs text-text-tertiary">{t('ppod.importUpdated')}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-center">
            <p className="text-2xl font-bold text-text-tertiary">{importResult.records_skipped}</p>
            <p className="text-xs text-text-tertiary">{t('ppod.importSkipped')}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-center">
            <p className="text-2xl font-bold text-danger-text">{importResult.records_failed}</p>
            <p className="text-xs text-text-tertiary">{t('ppod.importFailed')}</p>
          </div>
        </div>

        {/* Error Table */}
        {hasErrors && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('ppod.importErrorsTitle')}
            </h3>
            <div className="overflow-x-auto rounded-xl border border-danger-text/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-danger-text/10 bg-danger-fill">
                    <th className="px-3 py-2 text-start text-xs font-medium text-danger-text">
                      {t('ppod.importErrorRow')}
                    </th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-danger-text">
                      {t('ppod.importErrorField')}
                    </th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-danger-text">
                      {t('ppod.importErrorMessage')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.errors.map((error, idx) => (
                    <tr key={idx} className="border-b border-danger-text/10 last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-text-primary">
                        {error.row}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-text-primary">
                        {error.field}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{error.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <StepIndicator steps={STEPS} currentStep={currentStep} />

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        {currentStep === 0 && renderUploadStep()}
        {currentStep === 1 && renderPreviewStep()}
        {currentStep === 2 && renderConfirmStep()}
        {currentStep === 3 && renderResultStep()}
      </div>

      {/* ─── Navigation Buttons ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        {currentStep < 3 ? (
          <>
            <Button
              variant="outline"
              onClick={currentStep === 0 ? onCancel : handleBack}
              disabled={isImporting}
              className="min-h-[44px] w-full sm:w-auto"
            >
              {currentStep === 0 ? (
                t('ppod.cancel')
              ) : (
                <>
                  <ArrowLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />
                  {t('ppod.back')}
                </>
              )}
            </Button>
            <Button
              onClick={handleNext}
              disabled={isImporting || (currentStep === 0 && !fileContent)}
              className="min-h-[44px] w-full sm:w-auto"
            >
              {isImporting ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t('ppod.importing')}
                </>
              ) : currentStep === 2 ? (
                t('ppod.importConfirmButton')
              ) : (
                <>
                  {t('ppod.next')}
                  <ArrowRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </Button>
          </>
        ) : (
          <Button onClick={onComplete} className="min-h-[44px] w-full sm:w-auto">
            {t('ppod.done')}
          </Button>
        )}
      </div>
    </div>
  );
}
