'use client';

import { ArrowLeft, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState, Input, StatusBadge } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../_components/currency-display';
import { useTenantCurrency } from '../_components/use-tenant-currency';

// ─── Types ──────────────────────────────────────────────────────────────────

type HouseholdStatus = 'fully_paid' | 'partially_paid' | 'unpaid';

interface HouseholdOverviewRow {
  household_id: string;
  household_name: string;
  household_number: string | null;
  status: HouseholdStatus;
  total: number;
  paid: number;
  balance: number;
  overdue: boolean;
  invoice_count: number;
}

interface HouseholdOverviewResponse {
  data: HouseholdOverviewRow[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  HouseholdStatus,
  { semantic: 'success' | 'warning' | 'danger'; labelKey: string }
> = {
  fully_paid: { semantic: 'success', labelKey: 'overview.fullyPaid' },
  partially_paid: { semantic: 'warning', labelKey: 'overview.partiallyPaid' },
  unpaid: { semantic: 'danger', labelKey: 'overview.unpaid' },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function FinancialOverviewPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const currencyCode = useTenantCurrency();

  const [rows, setRows] = React.useState<HouseholdOverviewRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<HouseholdStatus | ''>('');
  const [overdueFilter, setOverdueFilter] = React.useState<'' | 'true' | 'false'>('');

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (overdueFilter) params.set('overdue', overdueFilter);

      const res = await apiClient<HouseholdOverviewResponse>(
        `/api/v1/finance/dashboard/household-overview?${params.toString()}`,
      );
      setRows(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[FinancialOverviewPage]', err);
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, overdueFilter]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter, overdueFilter]);

  // ─── Summary aggregates ─────────────────────────────────────────────────

  const summaryTotalExpected = rows.reduce((sum, r) => sum + r.total, 0);
  const summaryTotalReceived = rows.reduce((sum, r) => sum + r.paid, 0);
  const summaryTotalOutstanding = rows.reduce((sum, r) => sum + r.balance, 0);

  // ─── Columns ────────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'household_name',
      header: t('overview.colHousehold'),
      render: (row: HouseholdOverviewRow) => (
        <button
          type="button"
          className="text-start font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/finance/overview/${row.household_id}`);
          }}
        >
          {row.household_name}
        </button>
      ),
    },
    {
      key: 'household_number',
      header: t('overview.colHouseholdNumber'),
      render: (row: HouseholdOverviewRow) => (
        <span className="font-mono text-xs text-text-secondary">
          {row.household_number ?? '--'}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('overview.colStatus'),
      render: (row: HouseholdOverviewRow) => {
        const cfg = STATUS_CONFIG[row.status];
        return (
          <StatusBadge status={cfg.semantic} dot>
            {t(cfg.labelKey)}
          </StatusBadge>
        );
      },
    },
    {
      key: 'total',
      header: t('overview.colTotal'),
      className: 'text-end',
      render: (row: HouseholdOverviewRow) => (
        <CurrencyDisplay amount={row.total} currency_code={currencyCode} className="font-medium" />
      ),
    },
    {
      key: 'paid',
      header: t('overview.colPaid'),
      className: 'text-end',
      render: (row: HouseholdOverviewRow) => (
        <CurrencyDisplay
          amount={row.paid}
          currency_code={currencyCode}
          className="text-text-secondary"
        />
      ),
    },
    {
      key: 'balance',
      header: t('overview.colBalance'),
      className: 'text-end',
      render: (row: HouseholdOverviewRow) => (
        <CurrencyDisplay
          amount={row.balance}
          currency_code={currencyCode}
          className={row.balance > 0 ? 'font-medium text-danger-text' : 'text-text-secondary'}
        />
      ),
    },
    {
      key: 'overdue',
      header: t('overview.colOverdue'),
      render: (row: HouseholdOverviewRow) =>
        row.overdue ? (
          <span className="text-sm font-medium text-danger-text">{t('overview.yes')}</span>
        ) : (
          <span className="text-sm text-text-tertiary">{t('overview.no')}</span>
        ),
    },
  ];

  // ─── Toolbar ────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('searchHouseholds')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as HouseholdStatus | '')}
        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary"
      >
        <option value="">
          {t('overview.colStatus')}: {tCommon('all')}
        </option>
        <option value="fully_paid">{t('overview.fullyPaid')}</option>
        <option value="partially_paid">{t('overview.partiallyPaid')}</option>
        <option value="unpaid">{t('overview.unpaid')}</option>
      </select>

      {/* Overdue filter */}
      <select
        value={overdueFilter}
        onChange={(e) => setOverdueFilter(e.target.value as '' | 'true' | 'false')}
        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary"
      >
        <option value="">
          {t('overview.colOverdue')}: {tCommon('all')}
        </option>
        <option value="true">{t('overview.yes')}</option>
        <option value="false">{t('overview.no')}</option>
      </select>
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  const hasActiveFilters = search || statusFilter || overdueFilter;

  return (
    <div className="space-y-6 p-6">
      {/* Back button + Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/finance`}
          className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <PageHeader title={t('overview.title')} description={t('overview.description')} />
      </div>

      {/* Summary strip */}
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-secondary/50 px-5 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {t('overview.totalExpected')}
            </p>
            <CurrencyDisplay
              amount={summaryTotalExpected}
              currency_code={currencyCode}
              className="text-lg font-bold text-text-primary"
              locale={locale}
            />
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {t('overview.totalReceived')}
            </p>
            <CurrencyDisplay
              amount={summaryTotalReceived}
              currency_code={currencyCode}
              className="text-lg font-bold text-success-600"
              locale={locale}
            />
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {t('overview.totalOutstanding')}
            </p>
            <CurrencyDisplay
              amount={summaryTotalOutstanding}
              currency_code={currencyCode}
              className="text-lg font-bold text-danger-600"
              locale={locale}
            />
          </div>
        </div>
      )}

      {/* Status legend */}
      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {t('overview.legendTitle')}
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <StatusBadge status="success" dot>
              {t('overview.fullyPaid')}
            </StatusBadge>
            <span className="text-xs text-text-secondary">{t('overview.fullyPaidDesc')}</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status="warning" dot>
              {t('overview.partiallyPaid')}
            </StatusBadge>
            <span className="text-xs text-text-secondary">{t('overview.partiallyPaidDesc')}</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status="danger" dot>
              {t('overview.unpaid')}
            </StatusBadge>
            <span className="text-xs text-text-secondary">{t('overview.unpaidDesc')}</span>
          </div>
        </div>
      </div>

      {/* Data table */}
      {!isLoading && rows.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={Users}
          title={t('overview.noData')}
          description={t('overview.noDataDesc')}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/finance/overview/${row.household_id}`)}
          keyExtractor={(row) => row.household_id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
