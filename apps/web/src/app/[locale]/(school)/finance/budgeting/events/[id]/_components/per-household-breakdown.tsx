'use client';

import { useTranslations } from 'next-intl';

import { CurrencyDisplay } from '../../../../_components/currency-display';

import type { PerHouseholdBreakdownRow } from './event-types';

interface Props {
  rows: PerHouseholdBreakdownRow[];
  currencyCode: string;
  locale: string;
  hasScope: boolean;
}

export function PerHouseholdBreakdown({ rows, currencyCode, locale, hasScope }: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.households');

  if (!hasScope) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">{t('noScope')}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">{t('empty')}</p>
      </div>
    );
  }

  return (
    <section aria-label={t('ariaLabel')} className="rounded-2xl border border-border bg-surface">
      <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">{t('header')}</h3>
        <p className="text-xs text-text-tertiary">
          {t('summary', {
            households: rows.length,
            students: rows.reduce((sum, r) => sum + r.student_count, 0),
          })}
        </p>
      </header>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary text-xs text-text-tertiary">
            <tr>
              <th scope="col" className="px-4 py-2 text-start">
                {t('cols.household')}
              </th>
              <th scope="col" className="px-4 py-2 text-end">
                {t('cols.students')}
              </th>
              <th scope="col" className="px-4 py-2 text-end">
                {t('cols.amount')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.household_id}>
                <th scope="row" className="px-4 py-2 text-start text-text-primary">
                  {row.household_name}
                </th>
                <td className="px-4 py-2 text-end text-text-secondary">{row.student_count}</td>
                <td
                  dir="ltr"
                  className="px-4 py-2 text-end font-mono tabular-nums text-text-primary"
                >
                  <CurrencyDisplay
                    amount={row.household_total}
                    currency_code={currencyCode}
                    locale={locale}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col divide-y divide-border md:hidden">
        {rows.map((row) => (
          <li key={row.household_id} className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary">{row.household_name}</span>
              <span className="text-xs text-text-tertiary">
                {t('cardStudents', { count: row.student_count })}
              </span>
            </div>
            <span dir="ltr" className="font-mono tabular-nums text-text-primary">
              <CurrencyDisplay
                amount={row.household_total}
                currency_code={currencyCode}
                locale={locale}
              />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
