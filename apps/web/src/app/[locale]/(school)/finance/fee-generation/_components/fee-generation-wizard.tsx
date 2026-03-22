'use client';

import type { FeeGenerationPreview as PreviewData } from '@school/shared';
import {
  Button,
  Checkbox,
  Input,
  Label,
} from '@school/ui';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../../_components/currency-display';

import { FeeGenerationPreview } from './fee-generation-preview';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YearGroup {
  id: string;
  name: string;
}

interface FeeStructureOption {
  id: string;
  name: string;
}

type WizardStep = 1 | 2 | 3;

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  const t = useTranslations('finance');
  const steps = [
    { step: 1, label: t('feeGeneration.step1Label') },
    { step: 2, label: t('feeGeneration.step2Label') },
    { step: 3, label: t('feeGeneration.step3Label') },
  ] as const;

  return (
    <div className="flex items-center gap-2">
      {steps.map(({ step, label }, idx) => (
        <React.Fragment key={step}>
          {idx > 0 && (
            <ChevronRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" />
          )}
          <div
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              step === current
                ? 'bg-primary-50 text-primary-700'
                : step < current
                  ? 'bg-success-fill text-success-text'
                  : 'bg-surface-secondary text-text-tertiary'
            }`}
          >
            {step < current ? (
              <Check className="h-4 w-4" />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/10 text-xs">
                {step}
              </span>
            )}
            {label}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

export function FeeGenerationWizard() {
  const t = useTranslations('finance');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [step, setStep] = React.useState<WizardStep>(1);

  // Step 1 state
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [feeStructures, setFeeStructures] = React.useState<FeeStructureOption[]>([]);
  const [selectedYearGroups, setSelectedYearGroups] = React.useState<Set<string>>(new Set());
  const [selectedFeeStructures, setSelectedFeeStructures] = React.useState<Set<string>>(new Set());
  const [billingPeriodStart, setBillingPeriodStart] = React.useState('');
  const [billingPeriodEnd, setBillingPeriodEnd] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');

  // Step 2 state
  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [excludedHouseholds, setExcludedHouseholds] = React.useState<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState('');

  // Step 3 state
  const [confirmLoading, setConfirmLoading] = React.useState(false);
  const [confirmResult, setConfirmResult] = React.useState<{
    invoices_created: number;
    total_amount: number;
  } | null>(null);
  const [confirmError, setConfirmError] = React.useState('');

  // Currency code (default SAR, should come from tenant config ideally)
  const currencyCode = 'SAR';

  // Fetch reference data on mount
  React.useEffect(() => {
    apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100')
      .then((res) => setYearGroups(res.data))
      .catch(() => setYearGroups([]));

    apiClient<{ data: FeeStructureOption[] }>(
      '/api/v1/finance/fee-structures?pageSize=100&active=true',
    )
      .then((res) => setFeeStructures(res.data))
      .catch(() => setFeeStructures([]));
  }, []);

  const toggleYearGroup = (id: string) => {
    setSelectedYearGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFeeStructure = (id: string) => {
    setSelectedFeeStructures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExcludeHousehold = (householdId: string) => {
    setExcludedHouseholds((prev) => {
      const next = new Set(prev);
      if (next.has(householdId)) next.delete(householdId);
      else next.add(householdId);
      return next;
    });
  };

  const canProceedStep1 =
    selectedYearGroups.size > 0 &&
    selectedFeeStructures.size > 0 &&
    billingPeriodStart &&
    billingPeriodEnd &&
    dueDate;

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const payload = {
        year_group_ids: Array.from(selectedYearGroups),
        fee_structure_ids: Array.from(selectedFeeStructures),
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        due_date: dueDate,
      };
      const res = await apiClient<{ data: PreviewData }>(
        '/api/v1/finance/fee-generation/preview',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setPreview(res.data);
      setExcludedHouseholds(new Set());
      setStep(2);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setPreviewError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirm = async () => {
    setConfirmLoading(true);
    setConfirmError('');
    try {
      const payload = {
        year_group_ids: Array.from(selectedYearGroups),
        fee_structure_ids: Array.from(selectedFeeStructures),
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        due_date: dueDate,
        excluded_household_ids: Array.from(excludedHouseholds),
      };
      const res = await apiClient<{ data: { invoices_created: number; total_amount: number } }>(
        '/api/v1/finance/fee-generation/confirm',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setConfirmResult(res.data);
      setStep(3);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setConfirmError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setConfirmLoading(false);
    }
  };

  // Compute live summary from preview data
  const liveSummary = React.useMemo(() => {
    if (!preview) return null;

    const includedLines = preview.preview_lines.filter(
      (l) => !l.is_duplicate && !excludedHouseholds.has(l.household_id),
    );
    const uniqueHouseholds = new Set(includedLines.map((l) => l.household_id));
    const totalAmount = includedLines.reduce((sum, l) => sum + l.line_total, 0);

    return {
      households: uniqueHouseholds.size,
      lines: includedLines.length,
      totalAmount,
    };
  }, [preview, excludedHouseholds]);

  return (
    <div className="space-y-6">
      <StepIndicator current={step} />

      {/* Step 1: Configuration */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Year Groups */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-text-primary">
              {t('feeGeneration.selectYearGroups')}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {yearGroups.map((yg) => (
                <label
                  key={yg.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-surface-secondary transition-colors"
                >
                  <Checkbox
                    checked={selectedYearGroups.has(yg.id)}
                    onCheckedChange={() => toggleYearGroup(yg.id)}
                  />
                  <span className="text-sm text-text-primary">{yg.name}</span>
                </label>
              ))}
              {yearGroups.length === 0 && (
                <p className="text-sm text-text-tertiary col-span-full">
                  {t('feeGeneration.noYearGroups')}
                </p>
              )}
            </div>
          </div>

          {/* Fee Structures */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-text-primary">
              {t('feeGeneration.selectFeeStructures')}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {feeStructures.map((fs) => (
                <label
                  key={fs.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-surface-secondary transition-colors"
                >
                  <Checkbox
                    checked={selectedFeeStructures.has(fs.id)}
                    onCheckedChange={() => toggleFeeStructure(fs.id)}
                  />
                  <span className="text-sm text-text-primary">{fs.name}</span>
                </label>
              ))}
              {feeStructures.length === 0 && (
                <p className="text-sm text-text-tertiary col-span-full">
                  {t('feeGeneration.noFeeStructures')}
                </p>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-text-primary">
              {t('feeGeneration.billingPeriod')}
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="billing_start">{t('feeGeneration.fieldPeriodStart')}</Label>
                <Input
                  id="billing_start"
                  type="date"
                  value={billingPeriodStart}
                  onChange={(e) => setBillingPeriodStart(e.target.value)}
                  required
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing_end">{t('feeGeneration.fieldPeriodEnd')}</Label>
                <Input
                  id="billing_end"
                  type="date"
                  value={billingPeriodEnd}
                  onChange={(e) => setBillingPeriodEnd(e.target.value)}
                  required
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="due_date">{t('feeGeneration.fieldDueDate')}</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {previewError && <p className="text-sm text-danger-text">{previewError}</p>}

          <div className="flex items-center justify-end gap-3">
            <Button
              onClick={handlePreview}
              disabled={!canProceedStep1 || previewLoading}
            >
              {previewLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('feeGeneration.previewButton')}
              <ChevronRight className="ms-2 h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 2 && preview && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <p className="text-xs text-text-tertiary">{t('feeGeneration.totalHouseholds')}</p>
              <p className="mt-1 text-xl font-semibold text-text-primary">
                {liveSummary?.households ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <p className="text-xs text-text-tertiary">{t('feeGeneration.totalLines')}</p>
              <p className="mt-1 text-xl font-semibold text-text-primary">
                {liveSummary?.lines ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <p className="text-xs text-text-tertiary">{t('feeGeneration.totalAmount')}</p>
              <p className="mt-1 text-xl font-semibold text-text-primary">
                <CurrencyDisplay
                  amount={liveSummary?.totalAmount ?? 0}
                  currency_code={currencyCode}
                />
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <p className="text-xs text-text-tertiary">{t('feeGeneration.duplicatesExcluded')}</p>
              <p className="mt-1 text-xl font-semibold text-text-primary">
                {preview.summary.duplicates_excluded}
              </p>
            </div>
          </div>

          {/* Warnings */}
          {preview.summary.missing_billing_parent_count > 0 && (
            <div className="rounded-xl border border-warning-fill bg-warning-fill/30 p-4">
              <p className="text-sm font-medium text-warning-text">
                {t('feeGeneration.missingBillingParentWarning', {
                  count: preview.summary.missing_billing_parent_count,
                })}
              </p>
            </div>
          )}

          {/* Preview table */}
          <FeeGenerationPreview
            lines={preview.preview_lines}
            excludedHouseholds={excludedHouseholds}
            onToggleExclude={toggleExcludeHousehold}
            currencyCode={currencyCode}
          />

          {confirmError && <p className="text-sm text-danger-text">{confirmError}</p>}

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              {tc('back')}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={confirmLoading || (liveSummary?.lines ?? 0) === 0}
            >
              {confirmLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('feeGeneration.confirmButton')}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirmation */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-success-fill bg-success-fill/20 p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-fill">
              <Check className="h-6 w-6 text-success-text" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">
              {t('feeGeneration.successTitle')}
            </h3>
            {confirmResult && (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-text-secondary">
                  {t('feeGeneration.invoicesCreated', {
                    count: confirmResult.invoices_created,
                  })}
                </p>
                <p className="text-sm text-text-secondary">
                  {t('feeGeneration.totalGenerated')}:{' '}
                  <CurrencyDisplay
                    amount={confirmResult.total_amount}
                    currency_code={currencyCode}
                    className="font-semibold text-text-primary"
                  />
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push(`/${locale}/finance/invoices`)}
            >
              {t('feeGeneration.viewInvoices')}
            </Button>
            <Button
              onClick={() => {
                setStep(1);
                setSelectedYearGroups(new Set());
                setSelectedFeeStructures(new Set());
                setBillingPeriodStart('');
                setBillingPeriodEnd('');
                setDueDate('');
                setPreview(null);
                setExcludedHouseholds(new Set());
                setConfirmResult(null);
              }}
            >
              {t('feeGeneration.generateMore')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
