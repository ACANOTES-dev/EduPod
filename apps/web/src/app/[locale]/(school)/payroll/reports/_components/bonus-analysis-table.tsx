'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, TableWrapper } from '@school/ui';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface BonusAnalysisRow {
  staff_profile_id: string;
  staff_name: string;
  months_with_bonus: number;
  total_bonus_amount: number;
  avg_bonus_per_month: number;
}

interface BonusAnalysisTableProps {
  data: BonusAnalysisRow[];
}

function exportCsv(data: BonusAnalysisRow[], headers: string[]) {
  const rows = data.map((r) =>
    [r.staff_name, r.months_with_bonus, r.total_bonus_amount, r.avg_bonus_per_month].join(','),
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bonus-analysis.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function BonusAnalysisTable({ data }: BonusAnalysisTableProps) {
  const t = useTranslations('payroll');

  const grandTotals = React.useMemo(() => {
    return data.reduce(
      (acc, r) => ({
        total_bonus_amount: acc.total_bonus_amount + r.total_bonus_amount,
      }),
      { total_bonus_amount: 0 },
    );
  }, [data]);

  const headers = [
    t('staffName'),
    t('monthsWithBonus'),
    t('totalBonusAmount'),
    t('avgBonusPerMonth'),
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">{t('bonusAnalysis')}</h3>
        <Button variant="outline" size="sm" onClick={() => exportCsv(data, headers)}>
          {t('exportCsv')}
        </Button>
      </div>
      <TableWrapper>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('staffName')}
              </th>
              <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('monthsWithBonus')}
              </th>
              <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('totalBonusAmount')}
              </th>
              <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('avgBonusPerMonth')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-text-tertiary">
                  {t('noData')}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.staff_profile_id}
                  className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {row.staff_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary text-end">
                    {row.months_with_bonus}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary text-end">
                    {formatCurrency(row.total_bonus_amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary text-end">
                    {formatCurrency(row.avg_bonus_per_month)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-secondary">
                <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                  {t('grandTotal')}
                </td>
                <td />
                <td className="px-4 py-3 text-sm font-bold text-text-primary text-end">
                  {formatCurrency(grandTotals.total_bonus_amount)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </TableWrapper>
    </div>
  );
}
