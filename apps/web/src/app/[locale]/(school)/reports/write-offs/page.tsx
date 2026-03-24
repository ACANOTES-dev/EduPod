'use client';

import { EmptyState, Input, Label, StatCard } from '@school/ui';
import { DollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ---- Types ----

interface WriteOffSummary {
  total_written_off: number;
  total_discounts: number;
}

interface WriteOffEntry {
  id: string;
  date: string;
  student_name: string;
  household_name: string;
  type: string;
  amount: number;
  reason: string;
}

interface WriteOffReport {
  summary: WriteOffSummary;
  data: WriteOffEntry[];
}

// ---- Page ----

export default function WriteOffsReportPage() {
  const t = useTranslations('reports');

  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [report, setReport] = React.useState<WriteOffReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchReport = React.useCallback(() => {
    if (!startDate || !endDate) return;
    setIsLoading(true);
    apiClient<WriteOffReport>(
      `/api/v1/reports/write-offs?start_date=${startDate}&end_date=${endDate}`,
    )
      .then((res) => setReport(res))
      .catch(() => setReport(null))
      .finally(() => setIsLoading(false));
  }, [startDate, endDate]);

  React.useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6">
      <PageHeader title={t('writeOffs')} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-auto">
          <Label htmlFor="start-date">{t('startDate')}</Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full sm:w-44"
          />
        </div>
        <div className="w-full sm:w-auto">
          <Label htmlFor="end-date">{t('endDate')}</Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full sm:w-44"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
        </div>
      ) : !report ? (
        <EmptyState
          icon={DollarSign}
          title={t('selectDateRange')}
          description={t('selectDateRangeDescription')}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label={t('totalWrittenOff')} value={formatCurrency(report.summary.total_written_off)} />
            <StatCard label={t('totalDiscounts')} value={formatCurrency(report.summary.total_discounts)} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('date')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('studentName')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('household')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('type')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('amount')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('reason')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-text-tertiary">
                      {t('noData')}
                    </td>
                  </tr>
                ) : (
                  report.data.map((entry) => (
                    <tr key={entry.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary">
                      <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(entry.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">{entry.student_name}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{entry.household_name}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{entry.type}</td>
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">{formatCurrency(entry.amount)}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{entry.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
