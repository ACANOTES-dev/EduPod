'use client';

import { EmptyState } from '@school/ui';
import { Calculator } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ---- Types ----

interface FeeGenerationRun {
  id: string;
  created_at: string;
  invoices_count: number;
  total_amount: number;
  households_affected: number;
  status: string;
}

interface PaginatedResponse {
  data: FeeGenerationRun[];
  meta?: { page: number; pageSize: number; total: number };
}

// ---- Page ----

export default function FeeGenerationReportPage() {
  const t = useTranslations('reports');

  const [runs, setRuns] = React.useState<FeeGenerationRun[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  React.useEffect(() => {
    setIsLoading(true);
    apiClient<PaginatedResponse>(
      `/api/v1/reports/fee-generation-runs?page=${page}&pageSize=${pageSize}`,
    )
      .then((res) => {
        setRuns(res.data);
        setTotal(res.meta?.total ?? 0);
      })
      .catch(() => setRuns([]))
      .finally(() => setIsLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6">
      <PageHeader title={t('feeGeneration')} />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title={t('noData')}
          description={t('noFeeGenerationRuns')}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('date')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('invoicesCount')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('totalAmount')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('householdsAffected')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary">
                    <td className="px-4 py-3 text-sm text-text-primary">{formatDate(run.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{run.invoices_count}</td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{formatCurrency(run.total_amount)}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{run.households_affected}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{run.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-tertiary">
                {t('pageOf', { page, total: totalPages })}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
                >
                  {t('previous')}
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
                >
                  {t('next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
