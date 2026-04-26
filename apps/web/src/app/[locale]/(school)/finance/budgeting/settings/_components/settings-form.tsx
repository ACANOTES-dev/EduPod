'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  KPI_KEYS,
  budgetingTenantPreferencesSchema,
  type BudgetingExportFormat,
  type BudgetingHorizonYears,
  type BudgetingKpiKey,
  type BudgetingTenantPreferences,
} from '@school/shared/budgeting';
import { Button, Checkbox, Input, Label, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface Props {
  initialValues: BudgetingTenantPreferences;
}

const HORIZONS: BudgetingHorizonYears[] = [1, 3, 5];
const FORMATS: BudgetingExportFormat[] = ['pdf', 'excel', 'both'];

export function SettingsForm({ initialValues }: Props) {
  const t = useTranslations('financeBudgetingSettings');

  const form = useForm<BudgetingTenantPreferences>({
    resolver: zodResolver(budgetingTenantPreferencesSchema),
    defaultValues: initialValues,
    values: initialValues,
  });

  const onSubmit = async (values: BudgetingTenantPreferences): Promise<void> => {
    try {
      const updated = await apiClient<BudgetingTenantPreferences>(
        '/api/v1/budgeting/tenant-preferences',
        {
          method: 'PATCH',
          body: JSON.stringify(values),
          silent: true,
        },
      );
      // Re-sync to canonical server state (also clears the dirty flag).
      form.reset(updated);
      toast.success(t('saveSuccess'));
    } catch (err) {
      console.error('[SettingsForm.submit]', err);
      const apiErr = err as { error?: { message?: string } };
      toast.error(apiErr?.error?.message ?? t('saveError'));
    }
  };

  const onDiscard = (): void => {
    form.reset(initialValues);
  };

  const horizon = form.watch('default_horizon_years');
  const householdShare = form.watch('default_household_share_pct');
  const contingency = form.watch('default_contingency_pct');
  const format = form.watch('default_export_format');
  const maxDays = form.watch('shareable_link_max_days');
  const hiddenKpis = form.watch('hidden_kpi_keys') ?? [];
  const isSubmitting = form.formState.isSubmitting;
  const isDirty = form.formState.isDirty;

  const toggleKpi = (key: BudgetingKpiKey, hidden: boolean): void => {
    const current = form.getValues('hidden_kpi_keys') ?? [];
    const next = hidden
      ? Array.from(new Set<BudgetingKpiKey>([...current, key]))
      : current.filter((k) => k !== key);
    form.setValue('hidden_kpi_keys', next, { shouldDirty: true });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8 pb-32">
      {/* ─── Section: Financial models ─── */}
      <Section
        title={t('sections.financialModels.title')}
        description={t('sections.financialModels.description')}
      >
        <Field label={t('fields.defaultHorizon.label')} helper={t('fields.defaultHorizon.helper')}>
          <fieldset className="flex flex-wrap gap-2">
            {HORIZONS.map((y) => (
              <label
                key={y}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition-colors ${
                  horizon === y
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-border bg-surface text-text-primary hover:bg-surface-secondary'
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  value={y}
                  checked={horizon === y}
                  onChange={() => form.setValue('default_horizon_years', y, { shouldDirty: true })}
                />
                {t(`fields.defaultHorizon.option${y}` as 'fields.defaultHorizon.option1')}
              </label>
            ))}
          </fieldset>
        </Field>

        <Field label={t('fields.hiddenKpiKeys.label')} helper={t('fields.hiddenKpiKeys.helper')}>
          <div className="flex flex-col gap-2">
            {KPI_KEYS.map((key) => {
              const hidden = hiddenKpis.includes(key);
              return (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={!hidden}
                    onCheckedChange={(v) => toggleKpi(key, v !== true)}
                    aria-label={t(
                      `fields.hiddenKpiKeys.${key}` as 'fields.hiddenKpiKeys.revenue_per_student',
                    )}
                  />
                  <span>
                    {t(`fields.hiddenKpiKeys.${key}` as 'fields.hiddenKpiKeys.revenue_per_student')}
                  </span>
                  {hidden && (
                    <span className="ms-auto text-xs text-text-tertiary">
                      {t('fields.hiddenKpiKeys.hiddenLabel')}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </Field>
      </Section>

      {/* ─── Section: Event budgets ─── */}
      <Section
        title={t('sections.eventBudgets.title')}
        description={t('sections.eventBudgets.description')}
      >
        <Field
          label={t('fields.defaultHouseholdShare.label')}
          helper={t('fields.defaultHouseholdShare.helper')}
        >
          <SliderInput
            value={householdShare}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) => form.setValue('default_household_share_pct', v, { shouldDirty: true })}
          />
        </Field>

        <Field
          label={t('fields.defaultContingency.label')}
          helper={t('fields.defaultContingency.helper')}
        >
          <SliderInput
            value={contingency}
            min={0}
            max={30}
            step={1}
            suffix="%"
            onChange={(v) => form.setValue('default_contingency_pct', v, { shouldDirty: true })}
          />
        </Field>
      </Section>

      {/* ─── Section: Exports ─── */}
      <Section title={t('sections.exports.title')} description={t('sections.exports.description')}>
        <Field
          label={t('fields.defaultExportFormat.label')}
          helper={t('fields.defaultExportFormat.helper')}
        >
          <fieldset className="flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <label
                key={f}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition-colors ${
                  format === f
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-border bg-surface text-text-primary hover:bg-surface-secondary'
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  value={f}
                  checked={format === f}
                  onChange={() => form.setValue('default_export_format', f, { shouldDirty: true })}
                />
                {t(
                  `fields.defaultExportFormat.option_${f}` as 'fields.defaultExportFormat.option_pdf',
                )}
              </label>
            ))}
          </fieldset>
        </Field>
      </Section>

      {/* ─── Section: Shareable links ─── */}
      <Section
        title={t('sections.shareableLinks.title')}
        description={t('sections.shareableLinks.description')}
      >
        <Field
          label={t('fields.shareableLinkMaxDays.label')}
          helper={t('fields.shareableLinkMaxDays.helper')}
        >
          <Input
            type="number"
            min={1}
            max={365}
            step={1}
            value={Number.isFinite(maxDays) ? maxDays : ''}
            onChange={(e) => {
              const v = Number(e.target.value);
              form.setValue(
                'shareable_link_max_days',
                Number.isFinite(v) ? Math.max(1, Math.min(365, Math.round(v))) : 30,
                { shouldDirty: true },
              );
            }}
            className="w-32"
          />
        </Field>
      </Section>

      {/* ─── Sticky footer ─── */}
      {isDirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-6 py-4 backdrop-blur md:start-auto md:end-6 md:bottom-6 md:start-auto md:rounded-2xl md:border md:px-4 md:py-3 md:shadow-lg">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onDiscard} disabled={isSubmitting}>
              {t('discardChanges')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <p className="text-xs text-text-secondary">{description}</p>
      </header>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {helper && <p className="text-xs text-text-tertiary">{helper}</p>}
    </div>
  );
}

function SliderInput({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-surface-secondary accent-primary-700"
        aria-label={`Slider ${min}–${max}${suffix}`}
      />
      <span className="w-16 text-end font-mono text-sm text-text-primary">
        {value}
        {suffix}
      </span>
    </div>
  );
}
