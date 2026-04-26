'use client';

import { LineChart, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, Input, Skeleton } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../../_components/currency-display';
import { useTenantCurrency } from '../../_components/use-tenant-currency';

interface FinancialModelRow {
  id: string;
  name: string;
  description: string | null;
  fiscal_year_start: string;
  fiscal_year_end: string;
  horizon_years: 1 | 3 | 5;
  status: 'draft' | 'published' | 'archived';
  updated_at: string;
  current_snapshot_id: string | null;
  latest_net_result?: number | null;
}

type StatusFilter = 'all' | 'draft' | 'published' | 'archived';

const STATUS_OPTIONS: StatusFilter[] = ['all', 'draft', 'published', 'archived'];

export default function FinancialModelsListPage() {
  const t = useTranslations('financeBudgeting.models');
  const tHub = useTranslations('financeBudgeting');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const currency = useTenantCurrency();

  const [models, setModels] = React.useState<FinancialModelRow[] | null>(null);
  const [meta, setMeta] = React.useState<{ page: number; pageSize: number; total: number } | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [search, setSearch] = React.useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = React.useState<string>('');
  const [page, setPage] = React.useState<number>(1);

  // Debounce search input by 250ms.
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
    });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);

    apiClient<{
      data: FinancialModelRow[];
      meta: { page: number; pageSize: number; total: number };
    }>(`/api/v1/budgeting/financial-models?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setModels(res.data);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[FinancialModelsList]', err);
        setError(err instanceof Error ? err.message : t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [statusFilter, debouncedSearch, page, t]);

  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
  const hasFilters = statusFilter !== 'all' || debouncedSearch !== '';

  return (
    <div className="flex min-w-0 flex-col gap-6 p-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/finance/budgeting`, label: tHub('backToHub') }}
        actions={
          <Button asChild>
            <Link href={`/${locale}/finance/budgeting/models/new`}>
              <Plus className="me-2 h-4 w-4" />
              {t('new')}
            </Link>
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
              }`}
            >
              {t(`filters.${status}`)}
            </button>
          ))}
        </div>
        <div className="relative ms-auto w-full max-w-xs">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('filters.searchPlaceholder')}
            className="ps-9"
          />
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex min-w-0 flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : !models || models.length === 0 ? (
        <EmptyState locale={locale} hasFilters={hasFilters} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-xs uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="px-4 py-3 text-start">{t('columns.name')}</th>
                  <th className="px-4 py-3 text-start">{t('columns.fy')}</th>
                  <th className="px-4 py-3 text-start">{t('columns.horizon')}</th>
                  <th className="px-4 py-3 text-start">{t('columns.status')}</th>
                  <th className="px-4 py-3 text-end font-mono">{t('columns.netResult')}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className="border-t border-border hover:bg-surface-secondary">
                    <td className="px-4 py-3">
                      <Link
                        href={`/${locale}/finance/budgeting/models/${m.id}`}
                        className="font-medium text-text-primary hover:text-primary-700"
                      >
                        {m.name}
                      </Link>
                      {m.description ? (
                        <p className="mt-0.5 truncate text-xs text-text-tertiary">
                          {m.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatFiscalYear(m.fiscal_year_start, m.fiscal_year_end)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {t(`horizon.${String(m.horizon_years) as '1' | '3' | '5'}`)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={m.status === 'archived' ? 'default' : 'secondary'}>
                        {t(`filters.${m.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-end font-mono">
                      {typeof m.latest_net_result === 'number' ? (
                        <CurrencyDisplay
                          amount={m.latest_net_result}
                          currency_code={currency}
                          locale={locale}
                        />
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {models.map((m) => (
              <Link
                key={m.id}
                href={`/${locale}/finance/budgeting/models/${m.id}`}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-4 active:bg-surface-secondary"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{m.name}</p>
                    <p className="text-xs text-text-tertiary">
                      {formatFiscalYear(m.fiscal_year_start, m.fiscal_year_end)} ·{' '}
                      {t(`horizon.${String(m.horizon_years) as '1' | '3' | '5'}`)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {t(`filters.${m.status}`)}
                  </Badge>
                </div>
                {typeof m.latest_net_result === 'number' && (
                  <p className="font-mono text-sm">
                    <CurrencyDisplay
                      amount={m.latest_net_result}
                      currency_code={currency}
                      locale={locale}
                    />
                  </p>
                )}
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {meta && meta.total > meta.pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-text-tertiary">
                {t('pagination.summary', {
                  page: meta.page,
                  total: totalPages,
                  count: meta.total,
                })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('pagination.prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t('pagination.next')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ locale, hasFilters }: { locale: string; hasFilters: boolean }) {
  const t = useTranslations('financeBudgeting.models');
  return (
    <div className="flex min-w-0 flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
        <LineChart className="h-7 w-7" />
      </div>
      <p className="max-w-sm text-sm text-text-secondary">
        {hasFilters ? t('emptyFiltered') : t('empty')}
      </p>
      {!hasFilters && (
        <Button asChild>
          <Link href={`/${locale}/finance/budgeting/models/new`}>
            <Plus className="me-2 h-4 w-4" />
            {t('new')}
          </Link>
        </Button>
      )}
    </div>
  );
}

function formatFiscalYear(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  return sy === ey ? String(sy) : `${sy}/${String(ey).slice(2)}`;
}
