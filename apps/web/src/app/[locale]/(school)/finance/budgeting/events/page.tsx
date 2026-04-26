'use client';

import { Compass, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, Input, Skeleton } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../../_components/currency-display';
import { useTenantCurrency } from '../../_components/use-tenant-currency';

interface EventBudgetSummary {
  id: string;
  name: string;
  event_type: 'trip' | 'fundraiser' | 'sports_day' | 'performance' | 'capital_purchase' | 'other';
  event_date: string | null;
  participant_count: number;
  status: 'draft' | 'confirmed' | 'fees_generated' | 'completed' | 'cancelled';
  total_cost?: number | null;
  updated_at: string;
}

type EventTypeFilter = 'all' | EventBudgetSummary['event_type'];
type StatusFilter = 'all' | EventBudgetSummary['status'];

const TYPE_OPTIONS: EventTypeFilter[] = [
  'all',
  'trip',
  'fundraiser',
  'sports_day',
  'performance',
  'capital_purchase',
  'other',
];
const STATUS_OPTIONS: StatusFilter[] = [
  'all',
  'draft',
  'confirmed',
  'fees_generated',
  'completed',
  'cancelled',
];

export default function EventBudgetsListPage() {
  const t = useTranslations('financeBudgeting.events');
  const tHub = useTranslations('financeBudgeting');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const currency = useTenantCurrency();

  const [events, setEvents] = React.useState<EventBudgetSummary[] | null>(null);
  const [meta, setMeta] = React.useState<{ page: number; pageSize: number; total: number } | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<EventTypeFilter>('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [search, setSearch] = React.useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = React.useState<string>('');
  const [page, setPage] = React.useState<number>(1);

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
    if (typeFilter !== 'all') params.set('event_type', typeFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);

    apiClient<{
      data: EventBudgetSummary[];
      meta: { page: number; pageSize: number; total: number };
    }>(`/api/v1/budgeting/event-budgets?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setEvents(res.data);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[EventBudgetsList]', err);
        setError(err instanceof Error ? err.message : t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [typeFilter, statusFilter, debouncedSearch, page, t]);

  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
  const hasFilters = typeFilter !== 'all' || statusFilter !== 'all' || debouncedSearch !== '';

  return (
    <div className="flex min-w-0 flex-col gap-6 p-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/finance/budgeting`, label: tHub('backToHub') }}
        actions={
          <Button asChild>
            <Link href={`/${locale}/finance/budgeting/events/new`}>
              <Plus className="me-2 h-4 w-4" />
              {t('new')}
            </Link>
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t('filters.type')}
          </p>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => {
                  setTypeFilter(tp);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  typeFilter === tp
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {t(`types.${tp}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t('filters.status')}
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  statusFilter === s
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {t(`statuses.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-full max-w-xs">
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
      ) : !events || events.length === 0 ? (
        <EmptyState locale={locale} hasFilters={hasFilters} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-xs uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="px-4 py-3 text-start">{t('columns.name')}</th>
                  <th className="px-4 py-3 text-start">{t('columns.type')}</th>
                  <th className="px-4 py-3 text-start">{t('columns.date')}</th>
                  <th className="px-4 py-3 text-end font-mono">{t('columns.participants')}</th>
                  <th className="px-4 py-3 text-end font-mono">{t('columns.total')}</th>
                  <th className="px-4 py-3 text-start">{t('columns.status')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-border hover:bg-surface-secondary">
                    <td className="px-4 py-3">
                      <Link
                        href={`/${locale}/finance/budgeting/events/${e.id}`}
                        className="font-medium text-text-primary hover:text-primary-700"
                      >
                        {e.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{t(`types.${e.event_type}`)}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {e.event_date ? new Date(e.event_date).toLocaleDateString(locale) : '—'}
                    </td>
                    <td className="px-4 py-3 text-end font-mono">{e.participant_count}</td>
                    <td className="px-4 py-3 text-end font-mono">
                      {typeof e.total_cost === 'number' ? (
                        <CurrencyDisplay
                          amount={e.total_cost}
                          currency_code={currency}
                          locale={locale}
                        />
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{t(`statuses.${e.status}`)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/${locale}/finance/budgeting/events/${e.id}`}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-4 active:bg-surface-secondary"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{e.name}</p>
                    <p className="text-xs text-text-tertiary">
                      {t(`types.${e.event_type}`)}
                      {e.event_date
                        ? ` · ${new Date(e.event_date).toLocaleDateString(locale)}`
                        : ''}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {t(`statuses.${e.status}`)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-tertiary">
                    {e.participant_count} {t('columns.participants').toLowerCase()}
                  </span>
                  {typeof e.total_cost === 'number' && (
                    <span className="font-mono">
                      <CurrencyDisplay
                        amount={e.total_cost}
                        currency_code={currency}
                        locale={locale}
                      />
                    </span>
                  )}
                </div>
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
  const t = useTranslations('financeBudgeting.events');
  return (
    <div className="flex min-w-0 flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <Compass className="h-7 w-7" />
      </div>
      <p className="max-w-sm text-sm text-text-secondary">
        {hasFilters ? t('emptyFiltered') : t('empty')}
      </p>
      {!hasFilters && (
        <Button asChild>
          <Link href={`/${locale}/finance/budgeting/events/new`}>
            <Plus className="me-2 h-4 w-4" />
            {t('new')}
          </Link>
        </Button>
      )}
    </div>
  );
}
