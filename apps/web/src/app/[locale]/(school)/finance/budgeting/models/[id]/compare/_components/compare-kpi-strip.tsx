'use client';

import { useTranslations } from 'next-intl';

import type { PerPupilEconomics, YearTotals } from '@school/shared/budgeting';

import { CurrencyDisplay } from '../../../../../_components/currency-display';

export interface ScenarioColumn {
  id: string | null; // null = base
  name: string;
  totals: YearTotals;
  perPupil: PerPupilEconomics;
}

interface Props {
  columns: ScenarioColumn[];
  baseTotals: YearTotals; // for delta calculation
  year: number;
  currencyCode: string;
  locale: string;
}

export function CompareKpiStrip({ columns, baseTotals, year, currencyCode, locale }: Props) {
  const t = useTranslations('financeBudgetingCompare.kpi');

  return (
    <section
      className="grid gap-3 overflow-x-auto lg:grid-cols-4"
      style={{
        gridTemplateColumns:
          columns.length > 4 ? `repeat(${columns.length}, minmax(220px, 1fr))` : undefined,
      }}
    >
      {columns.map((col, idx) => {
        const isBase = col.id === null;
        const deltaNet = col.totals.net_result - baseTotals.net_result;

        return (
          <div
            key={col.id ?? 'base'}
            className={`flex min-w-[220px] flex-col gap-2 rounded-2xl border p-4 shadow-sm ${
              isBase ? 'border-border bg-surface-secondary' : 'border-border bg-surface'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-text-primary">{col.name}</h3>
              {isBase ? (
                <span className="rounded-full bg-text-tertiary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-text-secondary">
                  {t('basePill')}
                </span>
              ) : (
                <DeltaBadge value={deltaNet} currencyCode={currencyCode} locale={locale} />
              )}
            </div>

            <KpiLine
              label={t('revenue')}
              value={col.totals.revenue}
              currencyCode={currencyCode}
              locale={locale}
            />
            <KpiLine
              label={t('expenditure')}
              value={col.totals.expenditure}
              currencyCode={currencyCode}
              locale={locale}
            />
            <KpiLine
              label={t('net')}
              value={col.totals.net_result}
              currencyCode={currencyCode}
              locale={locale}
              accent={col.totals.net_result >= 0 ? 'positive' : 'negative'}
              prominent
            />

            <div className="border-t border-border pt-2 text-xs text-text-tertiary">
              <span dir="ltr">
                <CurrencyDisplay
                  amount={col.perPupil.net_per_student}
                  currency_code={currencyCode}
                  locale={locale}
                />
              </span>{' '}
              {t('perPupil')} <span className="text-text-tertiary">· Y{year}</span>
            </div>
            <span className="sr-only">{idx === 0 ? '' : ''}</span>
          </div>
        );
      })}
    </section>
  );
}

function KpiLine({
  label,
  value,
  currencyCode,
  locale,
  accent,
  prominent,
}: {
  label: string;
  value: number;
  currencyCode: string;
  locale: string;
  accent?: 'positive' | 'negative';
  prominent?: boolean;
}) {
  const accentClass =
    accent === 'positive'
      ? 'text-emerald-700'
      : accent === 'negative'
        ? 'text-red-700'
        : 'text-text-primary';
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span
        dir="ltr"
        className={`font-mono tabular-nums ${prominent ? 'text-base font-semibold' : 'text-sm'} ${accentClass}`}
      >
        <CurrencyDisplay amount={value} currency_code={currencyCode} locale={locale} />
      </span>
    </div>
  );
}

function DeltaBadge({
  value,
  currencyCode,
  locale,
}: {
  value: number;
  currencyCode: string;
  locale: string;
}) {
  const t = useTranslations('financeBudgetingCompare.kpi');
  const positive = value >= 0;
  return (
    <span
      dir="ltr"
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        positive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {positive ? '+' : ''}
      <CurrencyDisplay amount={value} currency_code={currencyCode} locale={locale} />{' '}
      {t('deltaVsBase')}
    </span>
  );
}
