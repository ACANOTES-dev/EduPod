'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import type { GenerateTuslaSarDto } from '@school/shared';
import { generateTuslaSarSchema, TUSLA_SAR_PERIODS } from '@school/shared';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SarStudent {
  student_id: string;
  student_name: string;
  absent_days: number;
  categories: Record<string, number>;
}

interface SarGenerateResponse {
  academic_year: string;
  period: number;
  start_date: string;
  end_date: string;
  students: SarStudent[];
  total_students: number;
  generated_at: string;
}

// ─── Step Indicator ─────────────────────────────────────────────────────────

const STEPS = ['selectPeriod', 'preview', 'generate'] as const;

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              i + 1 < currentStep
                ? 'bg-success-text text-white'
                : i + 1 === currentStep
                  ? 'bg-primary-700 text-white'
                  : 'bg-surface-secondary text-text-tertiary'
            }`}
          >
            {i + 1 < currentStep ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`h-0.5 w-8 rounded-full transition-colors ${
                i + 1 < currentStep ? 'bg-success-text' : 'bg-border'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Date Helpers ───────────────────────────────────────────────────────────

function computeDatesFromAcademicYear(
  academicYear: string,
  period: number,
): { start_date: string; end_date: string } {
  // Academic year format: "2025-2026"
  const parts = academicYear.split('-');
  const firstYear = parts[0] ?? '';
  const secondYear = parts[1] ?? parts[0] ?? '';

  if (period === 1) {
    return {
      start_date: `${firstYear}-09-01`,
      end_date: `${firstYear}-12-31`,
    };
  }

  return {
    start_date: `${secondYear}-01-01`,
    end_date: `${secondYear}-06-30`,
  };
}

function getPeriodLabel(period: number): string {
  const found = TUSLA_SAR_PERIODS.find((p) => p.period === period);
  return found?.label ?? `Period ${period}`;
}

// ─── Wizard Component ───────────────────────────────────────────────────────

export function SarWizard() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';

  const [step, setStep] = React.useState(1);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generateError, setGenerateError] = React.useState('');
  const [result, setResult] = React.useState<SarGenerateResponse | null>(null);

  // ─── Form (Step 1) ─────────────────────────────────────────────────────

  const form = useForm<GenerateTuslaSarDto>({
    resolver: zodResolver(generateTuslaSarSchema),
    defaultValues: {
      academic_year: '',
      period: undefined,
      start_date: '',
      end_date: '',
    },
  });

  const academicYear = form.watch('academic_year');
  const selectedPeriod = form.watch('period');

  // Auto-populate dates when academic year and period change
  React.useEffect(() => {
    if (academicYear && selectedPeriod) {
      const { start_date, end_date } = computeDatesFromAcademicYear(academicYear, selectedPeriod);
      form.setValue('start_date', start_date);
      form.setValue('end_date', end_date);
    }
  }, [academicYear, selectedPeriod, form]);

  // ─── Navigation ─────────────────────────────────────────────────────────

  const handleNext = async () => {
    if (step === 1) {
      const valid = await form.trigger();
      if (!valid) return;
      setStep(2);
      return;
    }

    if (step === 2) {
      await handleGenerate();
    }
  };

  const handleBack = () => {
    setGenerateError('');
    if (step === 3) {
      // From result, go back to preview
      setResult(null);
      setStep(2);
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  };

  // ─── Generate Report ──────────────────────────────────────────────────

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError('');

    try {
      const values = form.getValues();
      const res = await apiClient<SarGenerateResponse>('/api/v1/regulatory/tusla/sar/generate', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setResult(res);
      setStep(3);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      setGenerateError(ex?.error?.message ?? ex?.message ?? t('tusla.sarGenerateError'));
      console.error('[SarWizard]', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetry = () => {
    setGenerateError('');
    void handleGenerate();
  };

  // ─── Step 1: Select Period ────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t('tusla.sarStepSelectDescription')}</p>

      {/* Academic Year */}
      <div className="space-y-1.5">
        <Label htmlFor="academic_year">{t('tusla.sarAcademicYear')}</Label>
        <Input
          id="academic_year"
          placeholder="2025-2026"
          className="w-full sm:w-64 text-base"
          {...form.register('academic_year')}
        />
        {form.formState.errors.academic_year && (
          <p className="text-xs text-danger-text">{form.formState.errors.academic_year.message}</p>
        )}
      </div>

      {/* Period Select */}
      <div className="space-y-1.5">
        <Label htmlFor="period">{t('tusla.sarPeriod')}</Label>
        <Select
          value={selectedPeriod ? String(selectedPeriod) : ''}
          onValueChange={(val) => form.setValue('period', Number(val), { shouldValidate: true })}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder={t('tusla.sarSelectPeriod')} />
          </SelectTrigger>
          <SelectContent>
            {TUSLA_SAR_PERIODS.map((p) => (
              <SelectItem key={p.period} value={String(p.period)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.period && (
          <p className="text-xs text-danger-text">{form.formState.errors.period.message}</p>
        )}
      </div>

      {/* Date Range Display */}
      {academicYear && selectedPeriod && (
        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3">
          <p className="text-xs font-medium text-text-tertiary">{t('tusla.sarDateRange')}</p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            {formatDate(form.getValues('start_date'))} &mdash;{' '}
            {formatDate(form.getValues('end_date'))}
          </p>
        </div>
      )}
    </div>
  );

  // ─── Step 2: Preview ──────────────────────────────────────────────────

  const renderStep2 = () => {
    const values = form.getValues();
    return (
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">{t('tusla.sarStepPreviewDescription')}</p>

        {/* Summary Card */}
        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.sarAcademicYear')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {values.academic_year}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.sarPeriod')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {getPeriodLabel(values.period)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.sarDateRange')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {formatDate(values.start_date)} &mdash; {formatDate(values.end_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Informational Text */}
        <div className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
          <p className="text-sm text-primary-800">{t('tusla.sarPreviewInfo')}</p>
        </div>

        {/* Error from a failed generation attempt */}
        {generateError && (
          <div className="flex items-start gap-3 rounded-xl border border-danger-text/20 bg-danger-fill px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
            <div>
              <p className="text-sm font-medium text-danger-text">{generateError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-[44px]"
                onClick={handleRetry}
              >
                {t('tusla.sarRetry')}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Step 3: Result ───────────────────────────────────────────────────

  const renderStep3 = () => {
    if (!result) return null;

    return (
      <div className="space-y-5">
        {/* Success Banner */}
        <div className="flex items-center gap-3 rounded-xl border border-success-text/20 bg-success-fill px-5 py-4">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success-text" />
          <div>
            <p className="font-semibold text-success-text">{t('tusla.sarGenerateSuccess')}</p>
            <p className="text-sm text-success-text/80">
              {t('tusla.sarGeneratedAt', { date: formatDate(result.generated_at) })}
            </p>
          </div>
        </div>

        {/* Report Details */}
        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.sarAcademicYear')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {result.academic_year}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.sarPeriod')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {getPeriodLabel(result.period)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.sarDateRange')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {formatDate(result.start_date)} &mdash; {formatDate(result.end_date)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.sarStudentCount')}</p>
              <p className="mt-0.5 text-2xl font-bold text-text-primary">{result.total_students}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" className="min-h-[44px]" disabled>
            <Download className="me-2 h-4 w-4" />
            {t('tusla.sarDownload')}
          </Button>
          <Link href={`/${locale}/regulatory/tusla`}>
            <Button variant="ghost" size="sm" className="min-h-[44px]">
              {t('tusla.sarBackToTusla')}
            </Button>
          </Link>
        </div>
      </div>
    );
  };

  // ─── Navigation Buttons ───────────────────────────────────────────────

  const renderNavigation = () => {
    if (step === 3) return null;

    return (
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 1 || isGenerating}
          className="min-h-[44px]"
        >
          <ChevronLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />
          {t('tusla.sarBack')}
        </Button>

        <Button onClick={handleNext} disabled={isGenerating} className="min-h-[44px]">
          {isGenerating ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('tusla.sarGenerating')}
            </>
          ) : step === 2 ? (
            t('tusla.sarGenerateReport')
          ) : (
            <>
              {t('tusla.sarNext')}
              <ChevronRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
            </>
          )}
        </Button>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={step} />

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>

      {renderNavigation()}
    </div>
  );
}
