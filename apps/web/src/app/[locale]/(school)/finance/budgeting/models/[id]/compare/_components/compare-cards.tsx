'use client';

import { useTranslations } from 'next-intl';

import type { Drivers, PartialDrivers } from '@school/shared/budgeting';

import { CurrencyDisplay } from '../../../../../_components/currency-display';

import type { ScenarioColumn } from './compare-kpi-strip';

interface ScenarioWithDrivers extends ScenarioColumn {
  mergedDrivers: Drivers; // for non-base
  overrides: PartialDrivers | null; // null for base
}

interface Props {
  columns: ScenarioWithDrivers[];
  baseDrivers: Drivers;
  currencyCode: string;
  locale: string;
}

interface DriverDelta {
  key: string;
  baseValue: number;
  scenarioValue: number;
  delta: number;
}

const HEADLINE_KEYS: Array<keyof Drivers> = [
  'salary_uplift_pct',
  'discount_capture_pct',
  'scholarship_capture_pct',
  'utilities_inflation_pct',
  'materials_inflation_pct',
  'donations_forecast',
  'grants_forecast',
];

function computeHeadlineDeltas(base: Drivers, merged: Drivers): DriverDelta[] {
  const out: DriverDelta[] = [];
  for (const key of HEADLINE_KEYS) {
    const baseValue = Number(base[key] ?? 0);
    const scenarioValue = Number(merged[key] ?? 0);
    out.push({
      key: String(key),
      baseValue,
      scenarioValue,
      delta: scenarioValue - baseValue,
    });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
}

export function CompareCards({ columns, baseDrivers, currencyCode, locale }: Props) {
  const t = useTranslations('financeBudgetingCompare.cards');
  const tKpi = useTranslations('financeBudgetingCompare.kpi');

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      {columns.map((col) => {
        const isBase = col.id === null;
        const deltas = isBase ? [] : computeHeadlineDeltas(baseDrivers, col.mergedDrivers);
        const revenuePct =
          col.totals.revenue + col.totals.expenditure > 0
            ? (col.totals.revenue / (col.totals.revenue + col.totals.expenditure)) * 100
            : 50;

        return (
          <div
            key={col.id ?? 'base'}
            className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"
          >
            <h3 className="truncate text-sm font-semibold text-text-primary">{col.name}</h3>

            <dl className="flex flex-col gap-1 text-sm">
              <Row
                label={tKpi('revenue')}
                value={col.totals.revenue}
                currencyCode={currencyCode}
                locale={locale}
                accent="emerald"
              />
              <Row
                label={tKpi('expenditure')}
                value={col.totals.expenditure}
                currencyCode={currencyCode}
                locale={locale}
                accent="red"
              />
              <Row
                label={tKpi('net')}
                value={col.totals.net_result}
                currencyCode={currencyCode}
                locale={locale}
                prominent
                accent={col.totals.net_result >= 0 ? 'emerald' : 'red'}
              />
            </dl>

            {/* Mini horizontal bar (revenue/expenditure ratio) */}
            <div className="flex h-2 overflow-hidden rounded-full bg-red-200">
              <div
                className="bg-emerald-500"
                style={{ width: `${Math.min(100, Math.max(0, revenuePct))}%` }}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                {t('driversSummary')}
              </h4>
              {isBase ? (
                <p className="text-xs text-text-tertiary">{t('baseNote')}</p>
              ) : deltas.length === 0 || deltas.every((d) => d.delta === 0) ? (
                <p className="text-xs text-text-tertiary">{t('noChanges')}</p>
              ) : (
                <ul className="flex flex-col gap-0.5 text-xs">
                  {deltas
                    .filter((d) => d.delta !== 0)
                    .map((d) => (
                      <li key={d.key} className="flex items-center justify-between gap-2">
                        <span className="truncate text-text-secondary">
                          {d.key.replace(/_/g, ' ')}
                        </span>
                        <span
                          dir="ltr"
                          className={`shrink-0 font-mono ${
                            d.delta >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {d.scenarioValue}
                          {' ('}
                          {d.delta >= 0 ? '+' : ''}
                          {d.delta.toFixed(1)}
                          {')'}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Row({
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
  accent?: 'emerald' | 'red';
  prominent?: boolean;
}) {
  const accentClass =
    accent === 'emerald' ? 'text-emerald-700' : accent === 'red' ? 'text-red-700' : '';
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-text-tertiary">{label}</dt>
      <dd
        dir="ltr"
        className={`font-mono tabular-nums ${prominent ? 'text-base font-semibold' : 'text-sm'} ${accentClass}`}
      >
        <CurrencyDisplay amount={value} currency_code={currencyCode} locale={locale} />
      </dd>
    </div>
  );
}
