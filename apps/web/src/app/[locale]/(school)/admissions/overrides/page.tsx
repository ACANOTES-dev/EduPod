'use client';

import { ShieldCheck } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../../finance/_components/currency-display';
import { useTenantCurrency } from '../../finance/_components/use-tenant-currency';
import { QueueHeader } from '../_components/queue-header';

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface ApproverOption {
  user_id: string;
  name: string;
}

// ─── Sentinel value for "all approvers" ─────────────────────────────────────

const ALL_APPROVERS = '__all__';

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

  // ─── Filters ────────────────────────────────────────────────────────────────

  const [filterApprover, setFilterApprover] = React.useState<string>('');
  const [filterFrom, setFilterFrom] = React.useState<string>('');
  const [filterTo, setFilterTo] = React.useState<string>('');
  const [approverOptions, setApproverOptions] = React.useState<ApproverOption[]>([]);

  /** Fetch the full (un-filtered) first page once to seed the approver dropdown. */
  const approversFetchedRef = React.useRef(false);

  const fetchApproverOptions = React.useCallback(async () => {
    if (approversFetchedRef.current) return;
    approversFetchedRef.current = true;
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '200' });
      const res = await apiClient<OverrideListResponse>(
        `/api/v1/admission-overrides?${params.toString()}`,
      );
      const seen = new Map<string, string>();
      for (const row of res?.data ?? []) {
        if (!seen.has(row.approved_by_user_id)) {
          seen.set(row.approved_by_user_id, row.approved_by_name ?? row.approved_by_user_id);
        }
      }
      setApproverOptions(Array.from(seen.entries()).map(([user_id, name]) => ({ user_id, name })));
    } catch (err) {
      console.error('[OverridesPage.fetchApproverOptions]', err);
    }
  }, []);

  React.useEffect(() => {
    void fetchApproverOptions();
  }, [fetchApproverOptions]);

  const fetchOverrides = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });

      if (filterApprover) {
        params.set('approved_by_user_id', filterApprover);
      }
      if (filterFrom) {
        params.set('created_at_from', new Date(filterFrom).toISOString());
      }
      if (filterTo) {
        // End of the selected day
        const endOfDay = new Date(filterTo);
        endOfDay.setHours(23, 59, 59, 999);
        params.set('created_at_to', endOfDay.toISOString());
      }

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
  }, [page, filterApprover, filterFrom, filterTo, tQueue]);

  React.useEffect(() => {
    void fetchOverrides();
  }, [fetchOverrides]);

  /** Reset to page 1 whenever a filter changes. */
  const handleApproverChange = React.useCallback((value: string) => {
    setFilterApprover(value === ALL_APPROVERS ? '' : value);
    setPage(1);
  }, []);

  const handleFromChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterFrom(e.target.value);
    setPage(1);
  }, []);

  const handleToChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterTo(e.target.value);
    setPage(1);
  }, []);

  const handleClearFilters = React.useCallback(() => {
    setFilterApprover('');
    setFilterFrom('');
    setFilterTo('');
    setPage(1);
  }, []);

  const hasActiveFilters = filterApprover || filterFrom || filterTo;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <QueueHeader
        title={t('title')}
        description={t('description')}
        count={total}
        countLabel={t('countLabel')}
      />

      {/* ─── Filters ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-text-secondary">{t('filter.approver')}</Label>
          <Select value={filterApprover || ALL_APPROVERS} onValueChange={handleApproverChange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t('filter.allApprovers')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_APPROVERS}>{t('filter.allApprovers')}</SelectItem>
              {approverOptions.map((opt) => (
                <SelectItem key={opt.user_id} value={opt.user_id}>
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-text-secondary">{t('filter.dateFrom')}</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={handleFromChange}
            className="w-full sm:w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-text-secondary">{t('filter.dateTo')}</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={handleToChange}
            className="w-full sm:w-40"
          />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            {t('filter.clear')}
          </Button>
        )}
      </div>

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
