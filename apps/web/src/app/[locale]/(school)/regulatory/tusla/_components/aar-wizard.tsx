'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  type AcademicYearOption,
  type GenerateTuslaAarDto,
  generateTuslaAarSchema,
} from '@school/shared/regulatory';
import {
  Button,
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

interface AarGenerateResponse {
  submission_id: string;
  academic_year: string;
  total_students: number;
  total_days_lost: number;
  students_over_20_days: number;
  generated_at: string;
}

interface AarWizardProps {
  locale: string;
}

// ─── Step Indicator (teal accent) ───────────────────────────────────────────

const STEP_KEYS = ['selectYear', 'preview', 'result'] as const;

function StepIndicator({ currentStep }: { currentStep: number }) {
  const t = useTranslations('regulatory.tusla');
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label={t('aarSteps.ariaLabel')}>
      {STEP_KEYS.map((stepKey, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < currentStep;
        const isActive = stepNum === currentStep;
        return (
          <React.Fragment key={stepKey}>
            <li className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isDone
                    ? 'bg-teal-600 text-white'
                    : isActive
                      ? 'bg-teal-500 text-white'
                      : 'bg-surface-secondary text-text-tertiary'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
              </span>
              <span
                className={`hidden sm:inline text-xs font-medium ${
                  isActive ? 'text-teal-700' : 'text-text-tertiary'
                }`}
              >
                {t(`aarSteps.${stepKey}`)}
              </span>
            </li>
            {i < STEP_KEYS.length - 1 && (
              <span
                className={`h-0.5 w-6 rounded-full transition-colors ${
                  isDone ? 'bg-teal-500' : 'bg-border'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

export function AarWizard({ locale }: AarWizardProps) {
  const t = useTranslations('regulatory.tusla');

  const [step, setStep] = React.useState(1);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generateError, setGenerateError] = React.useState('');
  const [result, setResult] = React.useState<AarGenerateResponse | null>(null);
  const [academicYears, setAcademicYears] = React.useState<AcademicYearOption[]>([]);
  const [yearsLoading, setYearsLoading] = React.useState(true);
  const [downloading, setDownloading] = React.useState(false);

  const form = useForm<GenerateTuslaAarDto>({
    resolver: zodResolver(generateTuslaAarSchema),
    defaultValues: {
      academic_year: '',
    },
  });

  const academicYear = form.watch('academic_year');

  // ── Fetch academic years ────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setYearsLoading(true);

    apiClient<{ data: AcademicYearOption[] }>('/api/v1/regulatory/academic-years')
      .then((res) => {
        if (!cancelled) setAcademicYears(res.data ?? []);
      })
      .catch((err) => {
        console.error('[AarWizard] academic years failed', err);
        if (!cancelled) setAcademicYears([]);
      })
      .finally(() => {
        if (!cancelled) setYearsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Navigation ──────────────────────────────────────────────────────

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

  // ── Generate ────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError('');

    try {
      const values = form.getValues();
      const res = await apiClient<{ data: AarGenerateResponse }>(
        '/api/v1/regulatory/tusla/aar/generate',
        {
          method: 'POST',
          body: JSON.stringify(values),
        },
      );
      setResult(res.data);
      setStep(3);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      setGenerateError(ex?.error?.message ?? ex?.message ?? t('aarGenerateError'));
      console.error('[AarWizard] generate failed', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── CSV download (server-side generated) ────────────────────────────

  const handleDownloadCsv = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/v1/regulatory/tusla/aar/${result.submission_id}/export`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Export failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tusla-aar-${result.academic_year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[AarWizard] CSV download failed', err);
      setGenerateError(t('aarDownloadError'));
    } finally {
      setDownloading(false);
    }
  };

  // ── Step renderers ──────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t('aarStepSelectDescription')}</p>

      <div className="space-y-1.5">
        <Label htmlFor="academic_year">{t('aarAcademicYear')}</Label>
        <Select
          value={academicYear}
          onValueChange={(val) => form.setValue('academic_year', val, { shouldValidate: true })}
          disabled={yearsLoading}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue
              placeholder={yearsLoading ? t('aarLoadingYears') : t('aarSelectAcademicYear')}
            />
          </SelectTrigger>
          <SelectContent>
            {academicYears.map((ay) => (
              <SelectItem key={ay.id} value={ay.name}>
                {ay.name}
                {ay.status === 'active' ? ` · ${t('aarActive')}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.academic_year && (
          <p className="text-xs text-danger-text">{form.formState.errors.academic_year.message}</p>
        )}
      </div>
    </div>
  );

  const renderStep2 = () => {
    const values = form.getValues();
    return (
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">{t('aarStepPreviewDescription')}</p>

        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium text-text-tertiary">{t('aarAcademicYear')}</p>
            <p className="mt-0.5 text-sm font-semibold text-text-primary">{values.academic_year}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
          <p className="text-sm text-teal-800">{t('aarPreviewInfo')}</p>
        </div>

        {generateError && (
          <div className="flex items-start gap-3 rounded-xl border border-danger-text/20 bg-danger-fill px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
            <p className="text-sm font-medium text-danger-text">{generateError}</p>
          </div>
        )}
      </div>
    );
  };

  const renderStep3 = () => {
    if (!result) return null;
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl border border-success-text/20 bg-success-fill px-5 py-4">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success-text" />
          <div>
            <p className="font-semibold text-success-text">{t('aarGenerateSuccess')}</p>
            <p className="text-sm text-success-text/80">
              {t('aarGeneratedAt', { date: formatDate(result.generated_at) })}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('aarAcademicYear')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {result.academic_year}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('aarTotalStudents')}</p>
              <p className="mt-0.5 text-2xl font-bold text-text-primary">{result.total_students}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('aarTotalDaysLost')}</p>
              <p className="mt-0.5 text-2xl font-bold text-text-primary">
                {result.total_days_lost}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('aarStudentsOver20Days')}</p>
              <p className="mt-0.5 text-2xl font-bold text-text-primary">
                {result.students_over_20_days}
              </p>
            </div>
          </div>
        </div>

        {generateError && (
          <div className="flex items-start gap-3 rounded-xl border border-danger-text/20 bg-danger-fill px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
            <p className="text-sm font-medium text-danger-text">{generateError}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button className="min-h-[44px]" onClick={handleDownloadCsv} disabled={downloading}>
            {downloading ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t('aarDownloading')}
              </>
            ) : (
              <>
                <Download className="me-2 h-4 w-4" />
                {t('aarDownload')}
              </>
            )}
          </Button>
          <Link href={`/${locale}/regulatory/tusla`}>
            <Button variant="ghost" className="min-h-[44px]">
              {t('aarBackToTusla')}
            </Button>
          </Link>
        </div>
      </div>
    );
  };

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
          {t('aarBack')}
        </Button>

        <Button onClick={handleNext} disabled={isGenerating} className="min-h-[44px]">
          {isGenerating ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('aarGenerating')}
            </>
          ) : step === 2 ? (
            t('aarGenerateReport')
          ) : (
            <>
              {t('aarNext')}
              <ChevronRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
            </>
          )}
        </Button>
      </div>
    );
  };

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
