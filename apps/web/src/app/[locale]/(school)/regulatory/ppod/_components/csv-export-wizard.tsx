'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CsvExportWizardProps {
  databaseType: 'ppod' | 'pod';
  onComplete: () => void;
  onCancel: () => void;
}

interface DiffPreview {
  new_records: number;
  updated_records: number;
  unchanged_records: number;
  records: Array<{
    student_id: string;
    student_name: string;
    status: 'new' | 'updated' | 'unchanged';
  }>;
}

interface ExportResult {
  csv_content: string;
  filename: string;
  record_count: number;
  exported_at: string;
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

// ─── Wizard Component ────────────────────────────────────────────────────────

export function CsvExportWizard({ databaseType, onComplete, onCancel }: CsvExportWizardProps) {
  const t = useTranslations('regulatory');

  const STEPS = [
    t('ppod.stepConfigure'),
    t('ppod.stepPreview'),
    t('ppod.stepGenerate'),
    t('ppod.stepDownload'),
  ];

  const [currentStep, setCurrentStep] = React.useState(0);
  const [scope, setScope] = React.useState<'full' | 'incremental'>('full');
  const [diffPreview, setDiffPreview] = React.useState<DiffPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [exportResult, setExportResult] = React.useState<ExportResult | null>(null);

  // ─── Fetch Diff Preview ────────────────────────────────────────────────

  const fetchDiffPreview = React.useCallback(async () => {
    setIsLoadingPreview(true);
    try {
      const data = await apiClient<DiffPreview>(
        `/api/v1/regulatory/ppod/diff?database_type=${encodeURIComponent(databaseType)}`,
      );
      setDiffPreview(data);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      toast.error(ex?.error?.message ?? ex?.message ?? t('ppod.errorPreviewFailed'));
      console.error('[CsvExportWizard.fetchDiffPreview]', err);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [databaseType, t]);

  // ─── Export Handler ────────────────────────────────────────────────────

  const handleExport = React.useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await apiClient<ExportResult>('/api/v1/regulatory/ppod/export-csv', {
        method: 'POST',
        body: JSON.stringify({
          database_type: databaseType,
          scope,
        }),
      });
      setExportResult(result);
      setCurrentStep(3);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      toast.error(ex?.error?.message ?? ex?.message ?? t('ppod.errorExportFailed'));
      console.error('[CsvExportWizard.handleExport]', err);
    } finally {
      setIsExporting(false);
    }
  }, [databaseType, scope, t]);

  // ─── Download Handler ──────────────────────────────────────────────────

  const handleDownload = React.useCallback(() => {
    if (!exportResult) return;

    const blob = new Blob([exportResult.csv_content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportResult.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportResult]);

  // ─── Navigation ────────────────────────────────────────────────────────

  const handleNext = React.useCallback(() => {
    if (currentStep === 0) {
      setCurrentStep(1);
      void fetchDiffPreview();
    } else if (currentStep === 1) {
      setCurrentStep(2);
      void handleExport();
    }
  }, [currentStep, fetchDiffPreview, handleExport]);

  const handleBack = React.useCallback(() => {
    if (currentStep > 0 && currentStep < 3) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  // ─── Status Badge helper ───────────────────────────────────────────────

  function statusColor(status: 'new' | 'updated' | 'unchanged'): string {
    switch (status) {
      case 'new':
        return 'text-success-text';
      case 'updated':
        return 'text-primary-600';
      case 'unchanged':
        return 'text-text-tertiary';
    }
  }

  // ─── Step 0: Configure ────────────────────────────────────────────────

  const renderConfigureStep = () => (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t('ppod.exportConfigureDescription')}</p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text-primary">{t('ppod.exportScope')}</label>
        <Select value={scope} onValueChange={(val) => setScope(val as 'full' | 'incremental')}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">{t('ppod.exportScopeFull')}</SelectItem>
            <SelectItem value="incremental">{t('ppod.exportScopeIncremental')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3">
        <p className="text-sm text-text-secondary">
          {scope === 'full'
            ? t('ppod.exportScopeFullDescription')
            : t('ppod.exportScopeIncrementalDescription')}
        </p>
      </div>
    </div>
  );

  // ─── Step 1: Preview ──────────────────────────────────────────────────

  const renderPreviewStep = () => {
    if (isLoadingPreview) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-secondary">{t('ppod.exportLoadingPreview')}</p>
        </div>
      );
    }

    if (!diffPreview) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <AlertTriangle className="h-8 w-8 text-warning-text" />
          <p className="text-sm text-text-secondary">{t('ppod.exportNoPreview')}</p>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">{t('ppod.exportPreviewDescription')}</p>

        {/* Counts Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-center">
            <p className="text-2xl font-bold text-success-text">{diffPreview.new_records}</p>
            <p className="text-xs text-text-tertiary">{t('ppod.exportNew')}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-center">
            <p className="text-2xl font-bold text-primary-600">{diffPreview.updated_records}</p>
            <p className="text-xs text-text-tertiary">{t('ppod.exportUpdated')}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-center">
            <p className="text-2xl font-bold text-text-tertiary">{diffPreview.unchanged_records}</p>
            <p className="text-xs text-text-tertiary">{t('ppod.exportUnchanged')}</p>
          </div>
        </div>

        {/* Records List */}
        {diffPreview.records.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-3 py-2 text-start text-xs font-medium text-text-tertiary">
                    {t('ppod.exportStudentId')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-medium text-text-tertiary">
                    {t('ppod.exportStudentName')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-medium text-text-tertiary">
                    {t('ppod.exportStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {diffPreview.records.map((record) => (
                  <tr key={record.student_id} className="border-b border-border last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-text-primary">
                      {record.student_id}
                    </td>
                    <td className="px-3 py-2 text-text-primary">{record.student_name}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn('text-xs font-medium capitalize', statusColor(record.status))}
                      >
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ─── Step 2: Generate ─────────────────────────────────────────────────

  const renderGenerateStep = () => (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      {isExporting ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-secondary">{t('ppod.exportGenerating')}</p>
        </>
      ) : (
        <>
          <AlertTriangle className="h-8 w-8 text-warning-text" />
          <p className="text-sm text-text-secondary">{t('ppod.exportGenerateFailed')}</p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => void handleExport()}
          >
            {t('ppod.exportRetry')}
          </Button>
        </>
      )}
    </div>
  );

  // ─── Step 3: Download ─────────────────────────────────────────────────

  const renderDownloadStep = () => {
    if (!exportResult) return null;

    return (
      <div className="space-y-5">
        {/* Success Banner */}
        <div className="flex items-center gap-3 rounded-xl border border-success-text/20 bg-success-fill px-5 py-4">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success-text" />
          <div>
            <p className="font-semibold text-success-text">{t('ppod.exportComplete')}</p>
            <p className="text-sm text-success-text/80">
              {t('ppod.exportRecordCount', { count: exportResult.record_count })}
            </p>
          </div>
        </div>

        {/* File Details */}
        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('ppod.exportFilename')}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-primary-600" />
                <p className="truncate text-sm font-semibold text-text-primary">
                  {exportResult.filename}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('ppod.exportRecords')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {exportResult.record_count}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('ppod.exportTimestamp')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {formatDateTime(exportResult.exported_at)}
              </p>
            </div>
          </div>
        </div>

        {/* Download Button */}
        <Button onClick={handleDownload} className="min-h-[44px] w-full sm:w-auto">
          <Download className="me-2 h-4 w-4" />
          {t('ppod.exportDownloadCsv')}
        </Button>
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <StepIndicator steps={STEPS} currentStep={currentStep} />

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        {currentStep === 0 && renderConfigureStep()}
        {currentStep === 1 && renderPreviewStep()}
        {currentStep === 2 && renderGenerateStep()}
        {currentStep === 3 && renderDownloadStep()}
      </div>

      {/* ─── Navigation Buttons ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        {currentStep === 0 && (
          <>
            <Button variant="outline" onClick={onCancel} className="min-h-[44px] w-full sm:w-auto">
              {t('ppod.cancel')}
            </Button>
            <Button onClick={handleNext} className="min-h-[44px] w-full sm:w-auto">
              {t('ppod.next')}
              <ArrowRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
            </Button>
          </>
        )}
        {currentStep === 1 && (
          <>
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={isLoadingPreview}
              className="min-h-[44px] w-full sm:w-auto"
            >
              <ArrowLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />
              {t('ppod.back')}
            </Button>
            <Button
              onClick={handleNext}
              disabled={isLoadingPreview || !diffPreview}
              className="min-h-[44px] w-full sm:w-auto"
            >
              {t('ppod.exportGenerateButton')}
              <ArrowRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
            </Button>
          </>
        )}
        {currentStep === 2 && (
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={isExporting}
            className="min-h-[44px] w-full sm:w-auto"
          >
            <ArrowLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />
            {t('ppod.back')}
          </Button>
        )}
        {currentStep === 3 && (
          <Button onClick={onComplete} className="min-h-[44px] w-full sm:w-auto">
            {t('ppod.done')}
          </Button>
        )}
      </div>
    </div>
  );
}
