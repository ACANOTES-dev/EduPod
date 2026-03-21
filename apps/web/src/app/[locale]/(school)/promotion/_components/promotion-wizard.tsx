'use client';

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { apiClient } from '@/lib/api-client';

import {
  PromotionPreview,
  type PreviewStudent,
  type OverrideMap,
} from './promotion-preview';
import { PromotionSummary } from './promotion-summary';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
  status: string;
}

interface CommitResult {
  processed: number;
  promoted: number;
  held_back: number;
  graduated: number;
  withdrawn: number;
  skipped: number;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['selectYear', 'preview', 'override', 'summary', 'confirm'] as const;

function StepIndicator({ currentStep }: { currentStep: number }) {
  const t = useTranslations('promotion');
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => (
        <React.Fragment key={step}>
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
      <span className="ms-3 text-xs text-text-secondary">
        {t('stepLabel', { current: currentStep, total: STEPS.length })}
      </span>
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function PromotionWizard() {
  const t = useTranslations('promotion');
  const tc = useTranslations('common');

  const [step, setStep] = React.useState(1);
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = React.useState('');
  const [previewData, setPreviewData] = React.useState<PreviewStudent[]>([]);
  const [overrides, setOverrides] = React.useState<OverrideMap>({});
  const [commitResult, setCommitResult] = React.useState<CommitResult | null>(null);

  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [commitLoading, setCommitLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  // Load academic years on mount
  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=100&sort=start_date&order=desc')
      .then((res) => setAcademicYears(res.data))
      .catch(() => setAcademicYears([]));
  }, []);

  const handleOverride = (studentId: string, action: string) => {
    setOverrides((prev) => ({ ...prev, [studentId]: action }));
  };

  const handleNext = async () => {
    setError('');

    if (step === 1) {
      if (!selectedYearId) { setError(t('selectYearRequired')); return; }
      // Steps 2 and 3 both show preview — fetch on transition to step 2
      setPreviewLoading(true);
      try {
        const res = await apiClient<{ data: PreviewStudent[] }>(
          `/api/v1/promotion/preview?academic_year_id=${selectedYearId}`,
        );
        setPreviewData(Array.isArray(res.data) ? res.data : []);
        setOverrides({});
        setStep(2);
      } catch (err: unknown) {
        const ex = err as { error?: { message?: string } };
        setError(ex?.error?.message ?? tc('errorGeneric'));
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    if (step === 4) {
      // Commit
      setCommitLoading(true);
      try {
        const overridesList = previewData.map((s) => ({
          student_id: s.student_id,
          action: overrides[s.student_id] ?? s.proposed_action,
        }));
        const res = await apiClient<CommitResult>('/api/v1/promotion/commit', {
          method: 'POST',
          body: JSON.stringify({
            academic_year_id: selectedYearId,
            overrides: overridesList,
          }),
        });
        setCommitResult(res);
        setStep(5);
      } catch (err: unknown) {
        const ex = err as { error?: { message?: string } };
        setError(ex?.error?.message ?? tc('errorGeneric'));
      } finally {
        setCommitLoading(false);
      }
      return;
    }

    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setError('');
    setStep((s) => Math.max(1, s - 1));
  };

  const handleReset = () => {
    setStep(1);
    setSelectedYearId('');
    setPreviewData([]);
    setOverrides({});
    setCommitResult(null);
    setError('');
  };

  // ─── Step content ────────────────────────────────────────────────────────

  const renderStepContent = () => {
    if (step === 1) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t('step1Description')}</p>
          <div className="space-y-1.5">
            <Label>{t('selectAcademicYear')}</Label>
            <Select value={selectedYearId} onValueChange={setSelectedYearId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder={t('chooseYear')} />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name} ({y.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    if (step === 2 || step === 3) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {step === 2 ? t('step2Description') : t('step3Description')}
          </p>
          <PromotionPreview
            students={previewData}
            overrides={overrides}
            onOverride={handleOverride}
          />
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t('step4Description')}</p>
          <PromotionSummary students={previewData} overrides={overrides} />
        </div>
      );
    }

    if (step === 5 && commitResult) {
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-xl border border-success-text/20 bg-success-fill px-5 py-4">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-success-text" />
            <div>
              <p className="font-semibold text-success-text">{t('commitSuccess')}</p>
              <p className="text-sm text-success-text/80">{t('processedCount', { count: commitResult.processed })}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['promoted', commitResult.promoted],
              ['held_back', commitResult.held_back],
              ['graduated', commitResult.graduated],
              ['withdrawn', commitResult.withdrawn],
              ['skipped', commitResult.skipped],
            ].filter(([, v]) => (v as number) > 0).map(([key, value]) => (
              <div key={key as string} className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                <p className="text-2xl font-bold text-text-primary">{value as number}</p>
                <p className="text-sm text-text-secondary capitalize">{t(`action${(key as string).charAt(0).toUpperCase() + (key as string).slice(1).replace('_', '')}`)}</p>
              </div>
            ))}
          </div>

          <Button onClick={handleReset}>{t('runAgain')}</Button>
        </div>
      );
    }

    return null;
  };

  // ─── Navigation buttons ───────────────────────────────────────────────────

  const renderNavigation = () => {
    if (step === 5) return null;
    const isLastActionStep = step === 4;
    const isLoading = previewLoading || commitLoading;

    return (
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 1 || isLoading}
        >
          {tc('back')}
        </Button>
        <Button onClick={handleNext} disabled={isLoading}>
          {isLoading
            ? tc('loading')
            : isLastActionStep
            ? t('confirmAndCommit')
            : (
              <>
                {tc('next')}
                <ChevronRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
              </>
            )}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {step < 5 && <StepIndicator currentStep={step} />}

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        {renderStepContent()}
        {error && <p className="mt-4 text-sm text-danger-text">{error}</p>}
      </div>

      {renderNavigation()}
    </div>
  );
}
