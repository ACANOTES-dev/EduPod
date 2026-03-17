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

interface YtdSummaryRow {
  staff_profile_id: string;
  staff_name: string;
  ytd_basic: number;
  ytd_bonus: number;
  ytd_total: number;
  months_paid: number;
}

interface YtdSummaryTableProps {
  data: YtdSummaryRow[];
}

function exportCsv(data: YtdSummaryRow[], headers: string[]) {
  const rows = data.map((r) => [r.staff_name, r.ytd_basic, r.ytd_bonus, r.ytd_total, r.months_paid].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ytd-summary.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function YtdSummaryTable({ data }: YtdSummaryTableProps) {
  const t = useTranslations('payroll');

  const grandTotals = React.useMemo(() => {
    return data.reduce(
      (acc, r) => ({
        ytd_basic: acc.ytd_basic + r.ytd_basic,
        ytd_bonus: acc.ytd_bonus + r.ytd_bonus,
        ytd_total: acc.ytd_total + r.ytd_total,
      }),
      { ytd_basic: 0, ytd_bonus: 0, ytd_total: 0 }
    );
  }, [data]);

  const headers = [t('staffName'), t('ytdBasic'), t('ytdBonus'), t('ytdTotal'), t('month')];

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">{t('ytdSummary')}</h3>
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
                {t('ytdBasic')}
              </th>
              <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('ytdBonus')}
              </th>
              <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('ytdTotal')}
              </th>
              <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('month')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-text-tertiary">
                  {t('noData')}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.staff_profile_id} className="border-b border-border last:border-b-0 hover:bg-surface-secondary">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.staff_name}</td>
                  <td className="px-4 py-3 text-sm text-text-primary text-end">{formatCurrency(row.ytd_basic)}</td>
                  <td className="px-4 py-3 text-sm text-text-primary text-end">{formatCurrency(row.ytd_bonus)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary text-end">{formatCurrency(row.ytd_total)}</td>
                  <td className="px-4 py-3 text-sm text-text-primary text-end">{row.months_paid}</td>
                </tr>
              ))
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-secondary">
                <td className="px-4 py-3 text-sm font-semibold text-text-primary">{t('grandTotal')}</td>
                <td className="px-4 py-3 text-sm font-semibold text-text-primary text-end">{formatCurrency(grandTotals.ytd_basic)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-text-primary text-end">{formatCurrency(grandTotals.ytd_bonus)}</td>
                <td className="px-4 py-3 text-sm font-bold text-text-primary text-end">{formatCurrency(grandTotals.ytd_total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </TableWrapper>
    </div>
  );
}
