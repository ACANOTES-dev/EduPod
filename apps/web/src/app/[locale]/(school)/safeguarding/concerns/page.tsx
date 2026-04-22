'use client';

import { AlertTriangle, ChevronRight, Filter, Lock, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import {
  CONCERN_SEVERITIES,
  CONCERN_STATUSES,
  CONCERN_TYPES,
  SEVERITY_BADGE_STYLES,
  SLA_FILTER_VALUES,
  STATUS_BADGE_STYLES,
  type ConcernSeverity,
  type ConcernStatus,
  type ConcernType,
  type SlaFilter,
} from '../_components/concerns';
import { deriveSlaBucket, type SafeguardingConcernRow } from '../_components/summary';
import { canViewSafeguarding } from '../_components/visibility';

interface ListResponse {
  data: SafeguardingConcernRow[];
  meta: { page: number; pageSize: number; total: number };
  sla_summary: { overdue: number; due_within_24h: number; on_track: number };
}

const PAGE_SIZE = 20;

export default function SafeguardingConcernsListPage() {
  const t = useTranslations('safeguardingHub.concernsList');
  const tSev = useTranslations('safeguardingHub.severity');
  const tStatus = useTranslations('safeguardingHub.concernStatus');
  const tType = useTranslations('safeguardingHub.concernType');
  const tHub = useTranslations('safeguardingHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { roleKeys } = useRoleCheck();
  const canView = canViewSafeguarding(roleKeys);

  const [rows, setRows] = React.useState<SafeguardingConcernRow[]>([]);
  const [meta, setMeta] = React.useState<ListResponse['meta']>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const [slaSummary, setSlaSummary] = React.useState<ListResponse['sla_summary']>({
    overdue: 0,
    due_within_24h: 0,
    on_track: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<ConcernStatus | 'all'>('all');
  const [severityFilter, setSeverityFilter] = React.useState<ConcernSeverity | 'all'>('all');
  const [typeFilter, setTypeFilter] = React.useState<ConcernType | 'all'>('all');
  const [slaFilter, setSlaFilter] = React.useState<SlaFilter>('all');

  React.useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (severityFilter !== 'all') params.set('severity', severityFilter);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (slaFilter !== 'all') params.set('sla_status', slaFilter);

    apiClient<ListResponse>(`/api/v1/safeguarding/concerns?${params.toString()}`, { silent: true })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data ?? []);
        setMeta(res.meta ?? { page: 1, pageSize: PAGE_SIZE, total: 0 });
        setSlaSummary(res.sla_summary ?? { overdue: 0, due_within_24h: 0, on_track: 0 });
      })
      .catch((err) => {
        console.error('[SafeguardingConcerns] list failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, page, reloadKey, severityFilter, slaFilter, statusFilter, t, typeFilter]);

  const resetFilters = React.useCallback(() => {
    setStatusFilter('all');
    setSeverityFilter('all');
    setTypeFilter('all');
    setSlaFilter('all');
    setPage(1);
  }, []);

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{ href: `/${locale}/safeguarding`, label: tHub('denied.backToHub') }}
        />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{tHub('denied.body')}</p>
          <Link
            href={`/${locale}/safeguarding`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {tHub('denied.backToHub')}
          </Link>
        </section>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(meta.total / (meta.pageSize || PAGE_SIZE)));

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/safeguarding`, label: 'Back' }}
        actions={
          <Link
            href={`/${locale}/safeguarding/concerns/new`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('reportCta')}
          </Link>
        }
      />

      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {tHub('retry')}
          </button>
        </div>
      )}

      {/* SLA summary strip */}
      <section className="grid grid-cols-3 gap-3">
        <SummaryCard
          label={t('slaSummary.overdue')}
          value={slaSummary.overdue}
          tone="danger"
          isLoading={isLoading}
        />
        <SummaryCard
          label={t('slaSummary.dueWithin24')}
          value={slaSummary.due_within_24h}
          tone="warning"
          isLoading={isLoading}
        />
        <SummaryCard
          label={t('slaSummary.onTrack')}
          value={slaSummary.on_track}
          tone="success"
          isLoading={isLoading}
        />
      </section>

      {/* Filters */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">{t('filters.title')}</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            {t('filters.reset')}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label={t('filters.status')}
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as ConcernStatus | 'all');
              setPage(1);
            }}
            options={[
              { value: 'all', label: t('filters.allStatuses') },
              ...CONCERN_STATUSES.map((s) => ({ value: s, label: tStatus(s) })),
            ]}
          />
          <FilterSelect
            label={t('filters.severity')}
            value={severityFilter}
            onValueChange={(v) => {
              setSeverityFilter(v as ConcernSeverity | 'all');
              setPage(1);
            }}
            options={[
              { value: 'all', label: tSev('all') },
              ...CONCERN_SEVERITIES.map((s) => ({ value: s, label: tSev(s) })),
            ]}
          />
          <FilterSelect
            label={t('filters.type')}
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v as ConcernType | 'all');
              setPage(1);
            }}
            options={[
              { value: 'all', label: t('filters.allTypes') },
              ...CONCERN_TYPES.map((ct) => ({ value: ct, label: tType(ct) })),
            ]}
          />
          <FilterSelect
            label={t('filters.slaStatus')}
            value={slaFilter}
            onValueChange={(v) => {
              setSlaFilter(v as SlaFilter);
              setPage(1);
            }}
            options={SLA_FILTER_VALUES.map((v) => ({
              value: v,
              label: t(`filters.sla.${v}`),
            }))}
          />
        </div>
      </section>

      {/* Results */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-text-tertiary">
          <span>{t('resultCount', { count: meta.total })}</span>
          <span>{t('pagination.page', { page: meta.page, total: totalPages })}</span>
        </header>
        {isLoading ? (
          <ul className="divide-y divide-border/50">
            {Array.from({ length: 6 }).map((_, idx) => (
              <li key={idx} className="flex items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-border/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-border/40" />
                  <div className="h-2 w-1/3 animate-pulse rounded bg-border/30" />
                </div>
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="text-sm font-medium text-text-primary">{t('empty.title')}</p>
            <p className="text-xs text-text-tertiary">{t('empty.body')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((row) => {
              const bucket = deriveSlaBucket(row);
              const sevKey = (row.severity as ConcernSeverity) ?? 'unknown';
              const statusKey = (row.status as ConcernStatus) ?? 'unknown';
              const sevStyle = SEVERITY_BADGE_STYLES[sevKey] ?? SEVERITY_BADGE_STYLES.unknown;
              const statusStyle = STATUS_BADGE_STYLES[statusKey] ?? STATUS_BADGE_STYLES.unknown;
              return (
                <li key={row.id}>
                  <Link
                    href={`/${locale}/safeguarding/concerns/${row.id}`}
                    className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-surface-secondary sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {row.concern_number}
                        </p>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sevStyle}`}
                        >
                          {tSev(sevKey)}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusStyle}`}
                        >
                          {tStatus(statusKey)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-text-tertiary">
                        {row.student
                          ? `${row.student.first_name} ${row.student.last_name}`
                          : t('unknownStudent')}
                        {' · '}
                        {new Date(row.created_at).toLocaleDateString(locale)}
                        {row.assigned_to
                          ? ` · ${row.assigned_to.first_name} ${row.assigned_to.last_name}`
                          : ` · ${t('unassigned')}`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${slaBucketStyle(bucket)}`}
                    >
                      {t(`slaBucket.${bucket}`)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary rtl:rotate-180" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            {t('pagination.prev')}
          </Button>
          <span className="text-xs text-text-tertiary">
            {t('pagination.page', { page, total: totalPages })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
          >
            {t('pagination.next')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: number;
  tone: 'danger' | 'warning' | 'success';
  isLoading: boolean;
}

function SummaryCard({ label, value, tone, isLoading }: SummaryCardProps) {
  const toneClasses: Record<SummaryCardProps['tone'], string> = {
    danger: 'border-danger-200 bg-danger-50 text-danger-700',
    warning: 'border-warning-200 bg-warning-50 text-warning-700',
    success: 'border-success-200 bg-success-50 text-success-700',
  };
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {isLoading ? (
          <span className="inline-block h-6 w-10 animate-pulse rounded bg-white/40" />
        ) : (
          value
        )}
      </p>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}

function FilterSelect({ label, value, onValueChange, options }: FilterSelectProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="text-base sm:text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function slaBucketStyle(bucket: ReturnType<typeof deriveSlaBucket>): string {
  switch (bucket) {
    case 'breached':
      return 'bg-danger-100 text-danger-700 border border-danger-200';
    case 'due_soon':
      return 'bg-warning-100 text-warning-700 border border-warning-200';
    case 'on_track':
      return 'bg-success-100 text-success-700 border border-success-200';
    default:
      return 'bg-surface-secondary text-text-secondary border border-border';
  }
}
