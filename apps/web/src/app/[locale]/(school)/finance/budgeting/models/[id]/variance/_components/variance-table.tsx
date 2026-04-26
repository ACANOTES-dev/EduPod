'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@school/ui';

import { CurrencyDisplay } from '../../../../../_components/currency-display';

import { VarianceDriversTooltip } from './variance-drivers-tooltip';
import { COST_CATEGORIES, type VarianceBand, type VarianceRow } from './variance-types';

interface Props {
  rows: VarianceRow[];
  currencyCode: string;
  locale: string;
  canManage: boolean;
  onLogManualActual: (row: VarianceRow) => void;
}

interface CategoryBlock {
  category: string;
  rows: VarianceRow[];
  totals: { planned: number; actual: number; variance: number; variance_pct: number };
}

const CATEGORY_ORDER = [
  'income',
  'staff_costs',
  'operations',
  'capital',
  'reserves_and_adjustments',
] as const;

/**
 * The variance worker (impl 08) populates `drivers_json` only for tuition
 * lines and manual entries. We label the source as Finance / Payroll /
 * Manual / Auto from the line_item_key + drivers_json so the user can see
 * where the actual came from.
 */
function inferSource(row: VarianceRow): 'finance' | 'payroll' | 'manual' | 'auto' {
  if (row.drivers_json && row.drivers_json.manual === true) return 'manual';
  if (row.category === 'staff_costs') return 'payroll';
  if (row.category === 'income') return 'finance';
  return 'auto';
}

/**
 * Manual entry is allowed for ops + capital lines that don't pull from
 * Finance/Payroll automatically (per impl 06's allowlist convention).
 * Frontend mirrors that allowlist defensively.
 */
function isManualEntryAllowed(row: VarianceRow): boolean {
  if (row.category === 'operations') return true;
  if (row.category === 'capital') return true;
  return false;
}

function bandFor(row: VarianceRow): VarianceBand {
  const absPct = Math.abs(row.variance_pct);
  if (absPct === 0 && row.variance === 0) return 'neutral';
  const isCost = COST_CATEGORIES.has(row.category);
  // For cost rows, "actual > planned" (positive variance) is bad → red.
  // For income rows, "actual < planned" (negative variance) is bad → red.
  const bad = isCost ? row.variance > 0 : row.variance < 0;
  if (absPct < 5) return bad ? 'amber' : 'green';
  if (absPct < 15) return 'amber';
  return bad ? 'red' : 'green';
}

const BAND_CLASSES: Record<VarianceBand, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  neutral: 'text-text-tertiary',
};

function buildBlocks(rows: VarianceRow[]): CategoryBlock[] {
  const grouped = new Map<string, VarianceRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.category) ?? [];
    list.push(row);
    grouped.set(row.category, list);
  }
  const out: CategoryBlock[] = [];
  for (const category of CATEGORY_ORDER) {
    const list = grouped.get(category);
    if (!list || list.length === 0) continue;
    const totals = list.reduce(
      (acc, r) => {
        acc.planned += r.planned;
        acc.actual += r.actual;
        acc.variance += r.variance;
        return acc;
      },
      { planned: 0, actual: 0, variance: 0, variance_pct: 0 },
    );
    totals.variance_pct = totals.planned !== 0 ? (totals.variance / totals.planned) * 100 : 0;
    out.push({ category, rows: list, totals });
  }
  return out;
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return '0.0%';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function VarianceTable({ rows, currencyCode, locale, canManage, onLogManualActual }: Props) {
  const t = useTranslations('financeBudgetingVariance.table');
  const tCat = useTranslations('financeBudgetingVariance.table.categories');
  const tTotals = useTranslations('financeBudgetingVariance.table.totals');

  const blocks = React.useMemo(() => buildBlocks(rows), [rows]);

  const grandTotals = React.useMemo(() => {
    const incomeBlock = blocks.find((b) => b.category === 'income');
    const revenue = incomeBlock?.totals ?? { planned: 0, actual: 0, variance: 0 };
    const expenditure = blocks
      .filter((b) => b.category !== 'income')
      .reduce(
        (acc, b) => {
          acc.planned += b.totals.planned;
          acc.actual += b.totals.actual;
          acc.variance += b.totals.variance;
          return acc;
        },
        { planned: 0, actual: 0, variance: 0 },
      );
    const net = {
      planned: revenue.planned - expenditure.planned,
      actual: revenue.actual - expenditure.actual,
      variance: revenue.variance - expenditure.variance,
    };
    return { revenue, expenditure, net };
  }, [blocks]);

  return (
    <div className="flex flex-col gap-4">
      {/* Grand totals strip */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GrandTotalCard
          label={tTotals('revenue')}
          totals={grandTotals.revenue}
          currencyCode={currencyCode}
          locale={locale}
          accent="emerald"
        />
        <GrandTotalCard
          label={tTotals('expenditure')}
          totals={grandTotals.expenditure}
          currencyCode={currencyCode}
          locale={locale}
          accent="red"
        />
        <GrandTotalCard
          label={tTotals('net')}
          totals={grandTotals.net}
          currencyCode={currencyCode}
          locale={locale}
          accent={grandTotals.net.actual >= grandTotals.net.planned ? 'emerald' : 'red'}
        />
      </section>

      {/* Categorised table */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="min-w-[680px] w-full text-sm">
          <thead className="bg-surface-secondary text-text-tertiary">
            <tr>
              <th
                scope="col"
                className="sticky start-0 z-10 bg-surface-secondary px-4 py-2 text-start font-medium"
              >
                {t('lineItem')}
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('planned')}
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('actual')}
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('variance')}
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('variancePct')}
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {blocks.map((block) => (
              <React.Fragment key={block.category}>
                <tr className="bg-surface-secondary">
                  <th
                    scope="row"
                    className="sticky start-0 bg-surface-secondary px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary"
                  >
                    {tCat(block.category)}
                  </th>
                  <td
                    dir="ltr"
                    className="px-4 py-2 text-end font-mono text-xs text-text-secondary"
                  >
                    <CurrencyDisplay
                      amount={block.totals.planned}
                      currency_code={currencyCode}
                      locale={locale}
                    />
                  </td>
                  <td
                    dir="ltr"
                    className="px-4 py-2 text-end font-mono text-xs text-text-secondary"
                  >
                    <CurrencyDisplay
                      amount={block.totals.actual}
                      currency_code={currencyCode}
                      locale={locale}
                    />
                  </td>
                  <td
                    dir="ltr"
                    className="px-4 py-2 text-end font-mono text-xs text-text-secondary"
                  >
                    <CurrencyDisplay
                      amount={block.totals.variance}
                      currency_code={currencyCode}
                      locale={locale}
                    />
                  </td>
                  <td
                    dir="ltr"
                    className="px-4 py-2 text-end font-mono text-xs text-text-secondary"
                  >
                    {formatPct(block.totals.variance_pct)}
                  </td>
                  <td className="px-4 py-2"></td>
                </tr>
                {block.rows.map((row) => (
                  <DataRow
                    key={`${row.line_item_key}-${row.period_label}`}
                    row={row}
                    currencyCode={currencyCode}
                    locale={locale}
                    canManage={canManage}
                    onLogManualActual={onLogManualActual}
                  />
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrandTotalCard({
  label,
  totals,
  currencyCode,
  locale,
  accent,
}: {
  label: string;
  totals: { planned: number; actual: number; variance: number };
  currencyCode: string;
  locale: string;
  accent: 'emerald' | 'red';
}) {
  const accentClass = accent === 'emerald' ? 'text-emerald-700' : 'text-red-700';
  const variancePct = totals.planned !== 0 ? (totals.variance / totals.planned) * 100 : 0;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-tertiary">{label}</p>
      <p dir="ltr" className={`mt-1 font-mono text-xl font-semibold tabular-nums ${accentClass}`}>
        <CurrencyDisplay amount={totals.actual} currency_code={currencyCode} locale={locale} />
      </p>
      <p dir="ltr" className="mt-1 font-mono text-xs text-text-tertiary tabular-nums">
        <CurrencyDisplay amount={totals.variance} currency_code={currencyCode} locale={locale} />
        {' · '}
        {formatPct(variancePct)}
      </p>
    </div>
  );
}

function DataRow({
  row,
  currencyCode,
  locale,
  canManage,
  onLogManualActual,
}: {
  row: VarianceRow;
  currencyCode: string;
  locale: string;
  canManage: boolean;
  onLogManualActual: (row: VarianceRow) => void;
}) {
  const t = useTranslations('financeBudgetingVariance.table');
  const band = bandFor(row);
  const source = inferSource(row);
  const manualAllowed = isManualEntryAllowed(row);
  const hasDriversTooltip = row.drivers_json !== null && row.drivers_json.manual !== true;

  const labelCell = (
    <th scope="row" className="sticky start-0 bg-surface px-4 py-2 text-start text-text-primary">
      <span className="block">{row.subcategory.replace(/_/g, ' ')}</span>
      <span className="block text-xs text-text-tertiary">{row.line_item_key}</span>
    </th>
  );

  return (
    <tr className="hover:bg-surface-secondary">
      {hasDriversTooltip ? (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="contents text-start">
              {labelCell}
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-80 max-w-[90vw] p-0">
            <VarianceDriversTooltip row={row} currencyCode={currencyCode} locale={locale} />
          </PopoverContent>
        </Popover>
      ) : (
        labelCell
      )}
      <td dir="ltr" className="px-4 py-2 text-end font-mono tabular-nums">
        <CurrencyDisplay amount={row.planned} currency_code={currencyCode} locale={locale} />
      </td>
      <td dir="ltr" className="px-4 py-2 text-end font-mono tabular-nums">
        <CurrencyDisplay amount={row.actual} currency_code={currencyCode} locale={locale} />
      </td>
      <td dir="ltr" className="px-4 py-2 text-end font-mono tabular-nums">
        <CurrencyDisplay amount={row.variance} currency_code={currencyCode} locale={locale} />
      </td>
      <td dir="ltr" className={`px-4 py-2 text-end font-mono tabular-nums ${BAND_CLASSES[band]}`}>
        {formatPct(row.variance_pct)}
      </td>
      <td className="px-4 py-2 text-end">
        {manualAllowed ? (
          <button
            type="button"
            onClick={() => onLogManualActual(row)}
            disabled={!canManage}
            className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('logActual')}
          </button>
        ) : (
          <span className="text-xs text-text-tertiary" title={t('autoTooltip', { source })}>
            {t('auto')}
          </span>
        )}
      </td>
    </tr>
  );
}
