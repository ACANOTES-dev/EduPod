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
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  type AcademicYearOption,
  type GenerateTuslaSarDto,
  generateTuslaSarSchema,
  TUSLA_SAR_PERIODS,
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

import { apiClient, getAccessToken } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SarStudent {
  student_id: string;
  student_name: string;
  student_number: string | null;
  absent_days: number;
  categories: Record<string, number>;
}

interface SarGenerateResponse {
  submission_id: string;
  academic_year: string;
  period: number;
  start_date: string;
  end_date: string;
  students: SarStudent[];
  total_students: number;
  generated_at: string;
}

interface SarWizardProps {
  locale: string;
}

// ─── Step Indicator (teal accent) ───────────────────────────────────────────

const STEP_KEYS = ['selectPeriod', 'preview', 'result'] as const;

function StepIndicator({ currentStep }: { currentStep: number }) {
  const t = useTranslations('regulatory.tusla');
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label={t('sarSteps.ariaLabel')}>
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
                {t(`sarSteps.${stepKey}`)}
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

// ─── Date helpers ───────────────────────────────────────────────────────────

function computeDatesFromAcademicYear(
  academicYear: string,
  period: number,
): { start_date: string; end_date: string } {
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

// ─── Wizard ──────────────────────────────────────────────────────────────────

export function SarWizard({ locale }: SarWizardProps) {
  const t = useTranslations('regulatory.tusla');

  const [step, setStep] = React.useState(1);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generateError, setGenerateError] = React.useState('');
  const [result, setResult] = React.useState<SarGenerateResponse | null>(null);
  const [academicYears, setAcademicYears] = React.useState<AcademicYearOption[]>([]);
  const [yearsLoading, setYearsLoading] = React.useState(true);
  const [downloading, setDownloading] = React.useState(false);

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

  // ── Fetch academic years ────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setYearsLoading(true);

    apiClient<{ data: AcademicYearOption[] }>('/api/v1/regulatory/academic-years')
      .then((res) => {
        if (!cancelled) setAcademicYears(res.data ?? []);
      })
      .catch((err) => {
        console.error('[SarWizard] academic years failed', err);
        if (!cancelled) setAcademicYears([]);
      })
      .finally(() => {
        if (!cancelled) setYearsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-populate dates when academic year and period change
  React.useEffect(() => {
    if (academicYear && selectedPeriod) {
      const { start_date, end_date } = computeDatesFromAcademicYear(academicYear, selectedPeriod);
      form.setValue('start_date', start_date);
      form.setValue('end_date', end_date);
    }
  }, [academicYear, selectedPeriod, form]);

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
      const res = await apiClient<{ data: SarGenerateResponse }>(
        '/api/v1/regulatory/tusla/sar/generate',
        {
          method: 'POST',
          body: JSON.stringify(values),
        },
      );
      setResult(res.data);
      setStep(3);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      setGenerateError(ex?.error?.message ?? ex?.message ?? t('sarGenerateError'));
      console.error('[SarWizard] generate failed', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── CSV download (server-side generated) ────────────────────────────

  const handleDownloadCsv = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { Accept: 'text/csv' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/v1/regulatory/tusla/sar/${result.submission_id}/export`, {
        credentials: 'include',
        headers,
      });
      if (!res.ok) {
        throw new Error(`Export failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tusla-sar-${result.academic_year}-p${result.period}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[SarWizard] CSV download failed', err);
      setGenerateError(t('sarDownloadError'));
    } finally {
      setDownloading(false);
    }
  };

  // ── Step renderers ──────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t('sarStepSelectDescription')}</p>

      <div className="space-y-1.5">
        <Label htmlFor="academic_year">{t('sarAcademicYear')}</Label>
        <Select
          value={academicYear}
          onValueChange={(val) => form.setValue('academic_year', val, { shouldValidate: true })}
          disabled={yearsLoading}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue
              placeholder={yearsLoading ? t('sarLoadingYears') : t('sarSelectAcademicYear')}
            />
          </SelectTrigger>
          <SelectContent>
            {academicYears.map((ay) => (
              <SelectItem key={ay.id} value={ay.name}>
                {ay.name}
                {ay.status === 'active' ? ` · ${t('sarActive')}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.academic_year && (
          <p className="text-xs text-danger-text">{form.formState.errors.academic_year.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="period">{t('sarPeriod')}</Label>
        <Select
          value={selectedPeriod ? String(selectedPeriod) : ''}
          onValueChange={(val) => form.setValue('period', Number(val), { shouldValidate: true })}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder={t('sarSelectPeriod')} />
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

      {academicYear && selectedPeriod && (
        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3">
          <p className="text-xs font-medium text-text-tertiary">{t('sarDateRange')}</p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            {formatDate(form.getValues('start_date'))} &mdash;{' '}
            {formatDate(form.getValues('end_date'))}
          </p>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => {
    const values = form.getValues();
    return (
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">{t('sarStepPreviewDescription')}</p>

        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('sarAcademicYear')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {values.academic_year}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('sarPeriod')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {getPeriodLabel(values.period)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('sarDateRange')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {formatDate(values.start_date)} &mdash; {formatDate(values.end_date)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
          <p className="text-sm text-teal-800">{t('sarPreviewInfo')}</p>
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
            <p className="font-semibold text-success-text">{t('sarGenerateSuccess')}</p>
            <p className="text-sm text-success-text/80">
              {t('sarGeneratedAt', { date: formatDate(result.generated_at) })}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-secondary px-4 py-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('sarAcademicYear')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {result.academic_year}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('sarPeriod')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {getPeriodLabel(result.period)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('sarDateRange')}</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {formatDate(result.start_date)} &mdash; {formatDate(result.end_date)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('sarStudentCount')}</p>
              <p className="mt-0.5 text-2xl font-bold text-text-primary">{result.total_students}</p>
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
                {t('sarDownloading')}
              </>
            ) : (
              <>
                <Download className="me-2 h-4 w-4" />
                {t('sarDownload')}
              </>
            )}
          </Button>
          <Link href={`/${locale}/regulatory/tusla`}>
            <Button variant="ghost" className="min-h-[44px]">
              {t('sarBackToTusla')}
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
          {t('sarBack')}
        </Button>

        <Button onClick={handleNext} disabled={isGenerating} className="min-h-[44px]">
          {isGenerating ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('sarGenerating')}
            </>
          ) : step === 2 ? (
            t('sarGenerateReport')
          ) : (
            <>
              {t('sarNext')}
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
