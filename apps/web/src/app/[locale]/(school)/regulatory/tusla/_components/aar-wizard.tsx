'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { generateTuslaAarSchema } from '@school/shared';
import type { GenerateTuslaAarDto } from '@school/shared';
import { Button, Input, Label } from '@school/ui';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AarGenerateResponse {
  academic_year: string;
  total_students: number;
  total_absent_days: number;
  average_attendance_rate: number;
  students_exceeding_threshold: number;
  generated_at: string;
}

// ─── Step Indicator ─────────────────────────────────────────────────────────

const STEPS = ['selectYear', 'preview', 'result'] as const;

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

// ─── Wizard Component ───────────────────────────────────────────────────────

export function AarWizard() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';

  const [step, setStep] = React.useState(1);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generateError, setGenerateError] = React.useState('');
  const [result, setResult] = React.useState<AarGenerateResponse | null>(null);

  // ─── Form (Step 1) ─────────────────────────────────────────────────────

  const form = useForm<GenerateTuslaAarDto>({
    resolver: zodResolver(generateTuslaAarSchema),
    defaultValues: {
      academic_year: '',
    },
  });

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
      const res = await apiClient<AarGenerateResponse>('/api/v1/regulatory/tusla/aar/generate', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setResult(res);
      setStep(3);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      setGenerateError(ex?.error?.message ?? ex?.message ?? t('tusla.aarGenerateError'));
      console.error('[AarWizard]', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetry = () => {
    setGenerateError('');
    void handleGenerate();
  };

  // ─── Step 1: Select Year ──────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t('tusla.aarStepSelectDescription')}</p>

      <div className="space-y-1.5">
        <Label htmlFor="academic_year">{t('tusla.aarAcademicYear')}</Label>
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
    </div>
  );

  // ─── Step 2: Preview ──────────────────────────────────────────────────

  const renderStep2 = () => {
    const values = form.getValues();
    return (
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">{t('tusla.aarStepPreviewDescription')}</p>

        {/* Summary Card */}
        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium text-text-tertiary">{t('tusla.aarAcademicYear')}</p>
            <p className="mt-0.5 text-sm font-semibold text-text-primary">{values.academic_year}</p>
          </div>
        </div>

        {/* Informational Text */}
        <div className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
          <p className="text-sm text-primary-800">
            {t('tusla.aarPreviewInfo')}
          </p>
        </div>

        {/* Error from a failed generation attempt */}
        {generateError && (
          <div className="flex items-start gap-3 rounded-xl border border-danger-text/20 bg-danger-fill px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
            <div>
              <p className="text-sm font-medium text-danger-text">{generateError}</p>
              <Button variant="outline" size="sm" className="mt-2 min-h-[44px]" onClick={handleRetry}>
                {t('tusla.aarRetry')}
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
            <p className="font-semibold text-success-text">{t('tusla.aarGenerateSuccess')}</p>
            <p className="text-sm text-success-text/80">
              {t('tusla.aarGeneratedAt', { date: formatDate(result.generated_at) })}
            </p>
          </div>
        </div>

        {/* Report Stats */}
        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.aarAcademicYear')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">{result.academic_year}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.aarTotalStudents')}</p>
              <p className="mt-0.5 text-2xl font-bold text-text-primary">{result.total_students}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.aarTotalAbsentDays')}</p>
              <p className="mt-0.5 text-2xl font-bold text-text-primary">{result.total_absent_days}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.aarAverageAttendance')}</p>
              <p className="mt-0.5 text-2xl font-bold text-text-primary">{result.average_attendance_rate}%</p>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('tusla.aarExceedingThreshold')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">{result.students_exceeding_threshold}</p>
            </div>
          </div>
        </div>

        {/* Back to Tusla */}
        <div>
          <Link href={`/${locale}/regulatory/tusla`}>
            <Button variant="ghost" size="sm" className="min-h-[44px]">
              {t('tusla.aarBackToTusla')}
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
          {t('tusla.aarBack')}
        </Button>

        <Button
          onClick={handleNext}
          disabled={isGenerating}
          className="min-h-[44px]"
        >
          {isGenerating ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('tusla.aarGenerating')}
            </>
          ) : step === 2 ? (
            t('tusla.aarGenerateReport')
          ) : (
            <>
              {t('tusla.aarNext')}
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
