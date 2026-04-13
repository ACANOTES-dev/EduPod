'use client';

import { ShieldCheck } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../../finance/_components/currency-display';
import { useTenantCurrency } from '../../finance/_components/use-tenant-currency';
import { QueueHeader } from '../_components/queue-header';

interface OverrideRow {
  id: string;
  application_id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  expected_amount_cents: number;
  actual_amount_cents: number;
  justification: string;
  override_type: 'full_waiver' | 'partial_waiver' | 'deferred_payment';
  created_at: string;
  approved_by_user_id: string;
  approved_by_name: string | null;
}

interface OverrideListResponse {
  data: OverrideRow[];
  meta: { page: number; pageSize: number; total: number };
}

export default function OverridesLogPage() {
  const t = useTranslations('admissionsOverrides');
  const tQueue = useTranslations('admissionsQueues');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const currencyCode = useTenantCurrency();

  const [rows, setRows] = React.useState<OverrideRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const [loading, setLoading] = React.useState(true);

  const fetchOverrides = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const res = await apiClient<OverrideListResponse>(
        `/api/v1/admission-overrides?${params.toString()}`,
      );
      setRows(res?.data ?? []);
      setTotal(res?.meta?.total ?? 0);
    } catch (err) {
      console.error('[OverridesLogPage]', err);
      toast.error(tQueue('errors.loadFailed'));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, tQueue]);

  React.useEffect(() => {
    void fetchOverrides();
  }, [fetchOverrides]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <QueueHeader
        title={t('title')}
        description={t('description')}
        count={total}
        countLabel={t('countLabel')}
      />

      {loading ? (
        <div className="text-sm text-text-secondary">{tQueue('common.loading')}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
              <tr>
                <th className="px-3 py-2 text-start">{t('col.applicationNumber')}</th>
                <th className="px-3 py-2 text-start">{t('col.student')}</th>
                <th className="px-3 py-2 text-start">{t('col.type')}</th>
                <th className="px-3 py-2 text-start">{t('col.expected')}</th>
                <th className="px-3 py-2 text-start">{t('col.actual')}</th>
                <th className="px-3 py-2 text-start">{t('col.approver')}</th>
                <th className="px-3 py-2 text-start">{t('col.justification')}</th>
                <th className="px-3 py-2 text-start">{t('col.createdAt')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const truncated =
                  row.justification.length > 80
                    ? `${row.justification.slice(0, 77)}…`
                    : row.justification;
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-3 font-mono text-xs text-text-secondary">
                      {row.application_number}
                    </td>
                    <td className="px-3 py-3 font-medium text-text-primary">
                      {row.student_first_name} {row.student_last_name}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">
                      {t(`type.${row.override_type}`)}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">
                      <CurrencyDisplay
                        amount={row.expected_amount_cents / 100}
                        currency_code={currencyCode}
                      />
                    </td>
                    <td className="px-3 py-3 text-text-secondary">
                      <CurrencyDisplay
                        amount={row.actual_amount_cents / 100}
                        currency_code={currencyCode}
                      />
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{row.approved_by_name ?? '—'}</td>
                    <td className="px-3 py-3 text-text-secondary" title={row.justification}>
                      {truncated}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                    <td className="px-3 py-3 text-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/${locale}/admissions/${row.application_id}`)}
                      >
                        {tQueue('common.view')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {tQueue('common.previous')}
          </Button>
          <span className="text-sm text-text-secondary">
            {tQueue('common.pageOf', { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {tQueue('common.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
