'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { ComputedLineItem } from '@school/shared/budgeting';

import { CurrencyDisplay } from '../../../../../_components/currency-display';

import type { ScenarioColumn } from './compare-kpi-strip';

interface ScenarioWithLines extends ScenarioColumn {
  lineItems: ComputedLineItem[]; // for the active year
}

interface Props {
  columns: ScenarioWithLines[];
  year: number;
  currencyCode: string;
  locale: string;
}

const CATEGORY_ORDER = [
  'income',
  'staff_costs',
  'operations',
  'capital',
  'reserves_and_adjustments',
] as const;

type Cat = (typeof CATEGORY_ORDER)[number];

interface RowKey {
  category: Cat;
  subcategory: string;
  name: string;
}

export function CompareTable({ columns, year, currencyCode, locale }: Props) {
  const t = useTranslations('financeBudgetingCompare.table');

  const baseColumn = columns[0]; // first is always base
  const altColumns = columns.slice(1);
  const [mobileScenarioId, setMobileScenarioId] = React.useState<string | null>(
    altColumns[0]?.id ?? null,
  );

  const visibleColumns = React.useMemo(() => {
    if (!baseColumn) return [];
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      const alt = altColumns.find((c) => c.id === mobileScenarioId);
      return alt ? [baseColumn, alt] : [baseColumn];
    }
    return columns;
  }, [columns, baseColumn, altColumns, mobileScenarioId]);

  // Build the unique row set across all columns for the active year.
  const rowKeys = React.useMemo<RowKey[]>(() => {
    const seen = new Set<string>();
    const rows: RowKey[] = [];
    for (const col of columns) {
      for (const li of col.lineItems) {
        if (li.fiscal_year !== year) continue;
        const key = `${li.category}|${li.subcategory}|${li.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({
            category: li.category as Cat,
            subcategory: li.subcategory,
            name: li.name,
          });
        }
      }
    }
    return rows.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category);
      const bi = CATEGORY_ORDER.indexOf(b.category);
      if (ai !== bi) return ai - bi;
      return a.subcategory.localeCompare(b.subcategory);
    });
  }, [columns, year]);

  const lookupAmount = (col: ScenarioWithLines, row: RowKey): number =>
    col.lineItems.find(
      (li) =>
        li.fiscal_year === year &&
        li.category === row.category &&
        li.subcategory === row.subcategory &&
        li.name === row.name,
    )?.amount ?? 0;

  return (
    <section className="flex min-w-0 flex-col gap-3">
      {altColumns.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto md:hidden">
          <span className="shrink-0 text-xs text-text-tertiary">{t('mobilePicker')}:</span>
          {altColumns.map((alt) => (
            <button
              key={alt.id}
              type="button"
              onClick={() => setMobileScenarioId(alt.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                mobileScenarioId === alt.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
              }`}
            >
              {alt.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary text-xs uppercase tracking-wide text-text-tertiary">
            <tr>
              <th className="sticky start-0 z-10 bg-surface-secondary px-4 py-3 text-start">
                {t('linesHeader')}
              </th>
              {visibleColumns.map((col) => (
                <th key={col.id ?? 'base'} className="px-4 py-3 text-end font-mono">
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map((cat) => {
              const catRows = rowKeys.filter((r) => r.category === cat);
              if (catRows.length === 0) return null;
              return (
                <React.Fragment key={cat}>
                  <tr className="bg-surface-tertiary text-xs uppercase tracking-wide text-text-tertiary">
                    <th
                      colSpan={visibleColumns.length + 1}
                      className="sticky start-0 px-4 py-2 text-start"
                    >
                      {t(`categories.${cat}`)}
                    </th>
                  </tr>
                  {catRows.map((row) => (
                    <tr
                      key={`${row.category}|${row.subcategory}|${row.name}`}
                      className="border-t border-border"
                    >
                      <td className="sticky start-0 bg-surface px-4 py-2 text-text-primary">
                        {row.name}
                      </td>
                      {visibleColumns.map((col, i) => {
                        const amount = lookupAmount(col as ScenarioWithLines, row);
                        const baseAmount = baseColumn
                          ? lookupAmount(baseColumn as ScenarioWithLines, row)
                          : 0;
                        const delta = amount - baseAmount;
                        const isCost =
                          row.category === 'staff_costs' ||
                          row.category === 'operations' ||
                          row.category === 'capital';
                        const better = isCost ? delta < 0 : delta > 0;
                        const worse = isCost ? delta > 0 : delta < 0;
                        return (
                          <td
                            key={col.id ?? 'base'}
                            className="px-4 py-2 text-end align-top font-mono tabular-nums"
                          >
                            <span dir="ltr" className="block">
                              <CurrencyDisplay
                                amount={amount}
                                currency_code={currencyCode}
                                locale={locale}
                              />
                            </span>
                            {i > 0 && delta !== 0 && (
                              <span
                                dir="ltr"
                                className={`block text-[10px] ${
                                  better
                                    ? 'text-emerald-700'
                                    : worse
                                      ? 'text-red-700'
                                      : 'text-text-tertiary'
                                }`}
                              >
                                {delta >= 0 ? '+' : ''}
                                <CurrencyDisplay
                                  amount={delta}
                                  currency_code={currencyCode}
                                  locale={locale}
                                />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-secondary text-xs font-semibold">
              <th className="sticky start-0 bg-surface-secondary px-4 py-2 text-start uppercase">
                {t('totalsRow')}
              </th>
              {visibleColumns.map((col) => (
                <td
                  key={col.id ?? 'base'}
                  className="px-4 py-2 text-end font-mono tabular-nums text-text-primary"
                >
                  <span dir="ltr">
                    <CurrencyDisplay
                      amount={col.totals.net_result}
                      currency_code={currencyCode}
                      locale={locale}
                    />
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
