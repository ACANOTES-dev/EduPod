'use client';

import { Check, ChevronLeft, Download, FileDown, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, cn } from '@school/ui';

import type { DesPreviewResponse } from './file-preview';
import { FilePreview } from './file-preview';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DesGenerateResponse {
  submission_id: string;
  file_type: string;
  academic_year: string;
  row_count: number;
  record_count: number;
  csv_content: string;
  generated_at: string;
  file_key: string;
  file_hash: string;
  validation_warnings: Array<{ field: string; message: string; severity: 'error' | 'warning' }>;
  validation_errors: Array<{
    row_index: number;
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

// ─── File Type Definitions ────────────────────────────────────────────────────

interface FileTypeOption {
  value: string;
  label: string;
  description: string;
}

const SUPPORTED_FILE_TYPES = ['file_a', 'file_c', 'file_d', 'file_e', 'form_tl'] as const;
type SupportedFileType = (typeof SUPPORTED_FILE_TYPES)[number];

// File B remains intentionally excluded until the backend pipeline is implemented.
const FILE_TYPE_OPTIONS: FileTypeOption[] = [
  { value: 'file_a', label: 'File A', description: 'Staff Returns' },
  { value: 'file_c', label: 'File C', description: 'Class Returns' },
  { value: 'file_d', label: 'File D', description: 'Subject Returns' },
  { value: 'file_e', label: 'File E', description: 'Student Returns' },
  { value: 'form_tl', label: 'Form TL', description: 'Timetable Returns' },
];

const FILE_TYPE_LABELS: Record<string, string> = {
  file_a: 'File A — Staff Returns',
  file_c: 'File C — Class Returns',
  file_d: 'File D — Subject Returns',
  file_e: 'File E — Student Returns',
  form_tl: 'Form TL — Timetable Returns',
};

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = ['selectFile', 'preview', 'generate'] as const;

// ─── CSV Download Helper ──────────────────────────────────────────────────────

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isSupportedFileType(fileType: string): fileType is SupportedFileType {
  return (SUPPORTED_FILE_TYPES as readonly string[]).includes(fileType);
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

interface StepIndicatorProps {
  currentStep: number;
  labels: readonly string[];
  t: (key: string) => string;
}

function StepIndicator({ currentStep, labels, t }: StepIndicatorProps) {
  return (
    <nav aria-label="Wizard steps" className="mb-6">
      {/* Desktop: horizontal */}
      <ol className="hidden items-center sm:flex">
        {labels.map((labelKey, idx) => {
          const stepNum = idx + 1;
          const isActive = stepNum === currentStep;
          const isComplete = stepNum < currentStep;

          return (
            <li key={labelKey} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    isComplete && 'bg-success-text text-white',
                    isActive && 'bg-primary-700 text-white',
                    !isComplete && !isActive && 'bg-surface-secondary text-text-secondary',
                  )}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {isComplete ? <Check className="h-4 w-4" aria-hidden="true" /> : stepNum}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-sm',
                    isActive ? 'font-semibold text-text-primary' : 'text-text-secondary',
                  )}
                >
                  {t(`desReturns.step.${labelKey}`)}
                </span>
              </div>
              {idx < labels.length - 1 && (
                <div
                  className={cn(
                    'mx-3 h-px flex-1',
                    stepNum < currentStep ? 'bg-success-text' : 'bg-border',
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: vertical */}
      <ol className="flex flex-col gap-3 sm:hidden">
        {labels.map((labelKey, idx) => {
          const stepNum = idx + 1;
          const isActive = stepNum === currentStep;
          const isComplete = stepNum < currentStep;

          return (
            <li key={labelKey} className="flex items-center gap-3">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  isComplete && 'bg-success-text text-white',
                  isActive && 'bg-primary-700 text-white',
                  !isComplete && !isActive && 'bg-surface-secondary text-text-secondary',
                )}
                aria-current={isActive ? 'step' : undefined}
              >
                {isComplete ? <Check className="h-4 w-4" aria-hidden="true" /> : stepNum}
              </span>
              <span
                className={cn(
                  'text-sm',
                  isActive ? 'font-semibold text-text-primary' : 'text-text-secondary',
                )}
              >
                {t(`desReturns.step.${labelKey}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─── Step 1: Select File Type ─────────────────────────────────────────────────

interface StepSelectProps {
  academicYear: string;
  onAcademicYearChange: (year: string) => void;
  selectedFileType: string | null;
  onFileTypeSelect: (type: string) => void;
  onNext: () => void;
  t: (key: string) => string;
}

function StepSelectFile({
  academicYear,
  onAcademicYearChange,
  selectedFileType,
  onFileTypeSelect,
  onNext,
  t,
}: StepSelectProps) {
  return (
    <div className="space-y-6">
      {/* Academic Year */}
      <div className="max-w-xs">
        <Label htmlFor="wizard-academic-year">{t('desReturns.academicYear')}</Label>
        <Input
          id="wizard-academic-year"
          value={academicYear}
          onChange={(e) => onAcademicYearChange(e.target.value)}
          placeholder="e.g. 2025-2026"
          className="mt-1.5"
        />
      </div>

      {/* File Type Selection */}
      <div>
        <Label>{t('desReturns.selectFileType')}</Label>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FILE_TYPE_OPTIONS.map((option) => {
            const isSelected = selectedFileType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onFileTypeSelect(option.value)}
                className={cn(
                  'flex flex-col gap-1 rounded-xl border-2 p-4 text-start transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                  'min-h-[44px]',
                  isSelected
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-border bg-surface-primary hover:border-primary-300 hover:bg-surface-secondary',
                )}
                aria-pressed={isSelected}
              >
                <span
                  className={cn(
                    'text-sm font-semibold',
                    isSelected ? 'text-primary-700' : 'text-text-primary',
                  )}
                >
                  {option.label}
                </span>
                <span className="text-xs text-text-secondary">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Next Button */}
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!selectedFileType || !academicYear.trim()}>
          {t('desReturns.next')}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Preview ──────────────────────────────────────────────────────────

interface StepPreviewProps {
  preview: DesPreviewResponse | null;
  isLoading: boolean;
  onBack: () => void;
  onGenerate: () => void;
  hasErrors: boolean;
  t: (key: string) => string;
}

function StepPreview({ preview, isLoading, onBack, onGenerate, hasErrors, t }: StepPreviewProps) {
  return (
    <div className="space-y-6">
      <FilePreview preview={preview} isLoading={isLoading} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="me-1.5 h-4 w-4" aria-hidden="true" />
          {t('desReturns.back')}
        </Button>
        <Button onClick={onGenerate} disabled={isLoading || hasErrors}>
          <FileDown className="me-1.5 h-4 w-4" aria-hidden="true" />
          {t('desReturns.generateFile')}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Generate & Download ──────────────────────────────────────────────

interface StepGenerateProps {
  result: DesGenerateResponse | null;
  isGenerating: boolean;
  onDownload: () => void;
  onRestart: () => void;
  t: (key: string) => string;
}

function StepGenerate({ result, isGenerating, onDownload, onRestart, t }: StepGenerateProps) {
  if (isGenerating) {
    return (
      <div className="flex flex-col items-center gap-4 py-12" aria-busy="true">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-700" />
        <p className="text-sm font-medium text-text-secondary">{t('desReturns.generating')}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-danger-200 bg-danger-50 p-6 text-center text-sm text-danger-700">
        {t('desReturns.generateFailed')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Card */}
      <div className="rounded-xl border border-success-200 bg-success-50 p-6">
        <div className="flex items-start gap-3">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-success-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-success-800">
              {t('desReturns.generateSuccess')}
            </p>
            <div className="mt-3 space-y-1 text-sm text-success-700">
              <p>
                <span className="font-medium">{t('desReturns.fileType')}:</span>{' '}
                {FILE_TYPE_LABELS[result.file_type] ?? result.file_type}
              </p>
              <p>
                <span className="font-medium">{t('desReturns.academicYear')}:</span>{' '}
                {result.academic_year}
              </p>
              <p>
                <span className="font-medium">{t('desReturns.rowCount')}:</span> {result.row_count}
              </p>
              <p>
                <span className="font-medium">{t('desReturns.generatedAt')}:</span>{' '}
                {new Date(result.generated_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onDownload}>
          <Download className="me-1.5 h-4 w-4" aria-hidden="true" />
          {t('desReturns.downloadCsv')}
        </Button>
        <Button variant="outline" onClick={onRestart}>
          <RefreshCw className="me-1.5 h-4 w-4" aria-hidden="true" />
          {t('desReturns.generateAnother')}
        </Button>
      </div>
    </div>
  );
}

// ─── Wizard Component ─────────────────────────────────────────────────────────

export function FileGenerationWizard() {
  const t = useTranslations('regulatory');

  // ─── State ─────────────────────────────────────────────────────────────────
  const [step, setStep] = React.useState(1);
  const [academicYear, setAcademicYear] = React.useState('2025-2026');
  const [selectedFileType, setSelectedFileType] = React.useState<string | null>(null);

  // Preview state
  const [preview, setPreview] = React.useState<DesPreviewResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);

  // Generate state
  const [generateResult, setGenerateResult] = React.useState<DesGenerateResponse | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);

  // ─── Preview fetch ─────────────────────────────────────────────────────────
  const fetchPreview = React.useCallback(async (fileType: SupportedFileType, year: string) => {
    setIsPreviewLoading(true);
    setPreview(null);
    try {
      const data = await apiClient<DesPreviewResponse>(
        `/api/v1/regulatory/des/preview/${encodeURIComponent(fileType)}?academic_year=${encodeURIComponent(year)}`,
        { silent: true },
      );
      setPreview(data);
    } catch (err) {
      console.error('[FileGenerationWizard.fetchPreview]', err);
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, []);

  // ─── Generate file ─────────────────────────────────────────────────────────
  const generateFile = React.useCallback(async (fileType: SupportedFileType, year: string) => {
    setIsGenerating(true);
    setGenerateResult(null);
    try {
      const data = await apiClient<DesGenerateResponse>(
        `/api/v1/regulatory/des/generate/${encodeURIComponent(fileType)}`,
        {
          method: 'POST',
          body: JSON.stringify({ academic_year: year }),
        },
      );
      setGenerateResult(data);
    } catch (err) {
      console.error('[FileGenerationWizard.generateFile]', err);
      setGenerateResult(null);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  function handleNextToPreview() {
    if (!selectedFileType || !academicYear.trim() || !isSupportedFileType(selectedFileType)) return;
    setStep(2);
    void fetchPreview(selectedFileType, academicYear);
  }

  function handleBackToSelect() {
    setStep(1);
    setPreview(null);
  }

  function handleGenerate() {
    if (!selectedFileType || !academicYear.trim() || !isSupportedFileType(selectedFileType)) return;
    setStep(3);
    void generateFile(selectedFileType, academicYear);
  }

  function handleDownload() {
    if (!generateResult) return;
    const filename = `${generateResult.file_type}_${generateResult.academic_year.replace(/\//g, '-')}_${generateResult.generated_at.slice(0, 10)}.csv`;
    downloadCsv(generateResult.csv_content, filename);
  }

  function handleRestart() {
    setStep(1);
    setSelectedFileType(null);
    setPreview(null);
    setGenerateResult(null);
  }

  // ─── Check for blocking errors in preview ──────────────────────────────────
  const hasErrors = React.useMemo(
    () =>
      (preview?.validation_warnings ?? preview?.validation_errors ?? []).some(
        (w) => w.severity === 'error',
      ),
    [preview],
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-border bg-surface-primary p-4 sm:p-6">
      <StepIndicator currentStep={step} labels={STEPS} t={t} />

      {step === 1 && (
        <StepSelectFile
          academicYear={academicYear}
          onAcademicYearChange={setAcademicYear}
          selectedFileType={selectedFileType}
          onFileTypeSelect={setSelectedFileType}
          onNext={handleNextToPreview}
          t={t}
        />
      )}

      {step === 2 && (
        <StepPreview
          preview={preview}
          isLoading={isPreviewLoading}
          onBack={handleBackToSelect}
          onGenerate={handleGenerate}
          hasErrors={hasErrors}
          t={t}
        />
      )}

      {step === 3 && (
        <StepGenerate
          result={generateResult}
          isGenerating={isGenerating}
          onDownload={handleDownload}
          onRestart={handleRestart}
          t={t}
        />
      )}
    </div>
  );
}
