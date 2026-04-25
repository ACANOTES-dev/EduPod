'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { REPORT_KPI_KEYS, type ReportKpiKey } from '@school/shared/reports';
import { Switch } from '@school/ui';

import { isKpiHidden } from './reports-settings.helpers';

/**
 * KPI Dashboard tab — one toggle per KPI in the canonical 10-KPI list. The
 * parent owns the optimistic-update + revert behaviour; this is purely
 * presentational. Hidden state is the negation of "show on dashboard".
 */
export function KpiDashboardTab({
  hiddenKpiKeys,
  onToggle,
}: {
  hiddenKpiKeys: ReportKpiKey[];
  onToggle: (kpiKey: ReportKpiKey, show: boolean) => void;
}) {
  const t = useTranslations('reportsSettings');
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border p-5">
        <p className="text-sm font-medium text-text-primary">{t('kpiDashboard.title')}</p>
        <p className="mt-1 text-xs text-text-tertiary">{t('kpiDashboard.description')}</p>
      </div>
      <ul className="divide-y divide-border">
        {REPORT_KPI_KEYS.map((kpiKey) => {
          const hidden = isKpiHidden(hiddenKpiKeys, kpiKey);
          return (
            <li key={kpiKey} className="flex items-start gap-3 p-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">
                  {t(`kpiDashboard.kpis.${kpiKey}.label`)}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">
                  {t(`kpiDashboard.kpis.${kpiKey}.tooltip`)}
                </p>
              </div>
              <Switch
                checked={!hidden}
                onCheckedChange={(next) => onToggle(kpiKey, next)}
                aria-label={t('kpiDashboard.toggleAria', {
                  kpi: t(`kpiDashboard.kpis.${kpiKey}.label`),
                })}
                className="mt-0.5 shrink-0"
                data-testid={`kpi-toggle-${kpiKey}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
