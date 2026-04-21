'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Filter,
  Gauge,
  Lock,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import {
  deriveSlaBucket,
  slaProgressPct,
  type SafeguardingConcernRow,
} from '../_components/summary';
import { canViewSafeguarding } from '../_components/visibility';

// ─── Severity / SLA style ─────────────────────────────────────────────────────

const SEVERITY_OPTIONS = ['all', 'critical', 'high', 'medium', 'low'] as const;
type SeverityOption = (typeof SEVERITY_OPTIONS)[number];

const BUCKET_BAR: Record<ReturnType<typeof deriveSlaBucket>, string> = {
  breached: 'bg-danger-500',
  due_soon: 'bg-warning-500',
  on_track: 'bg-success-500',
  unknown: 'bg-border',
};

const BUCKET_PILL: Record<ReturnType<typeof deriveSlaBucket>, string> = {
  breached: 'bg-danger-100 text-danger-700',
  due_soon: 'bg-warning-100 text-warning-800',
  on_track: 'bg-success-100 text-success-700',
  unknown: 'bg-surface-secondary text-text-secondary',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SafeguardingSlaPage() {
  const t = useTranslations('safeguardingHub.sla');
  const tHub = useTranslations('safeguardingHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { roleKeys } = useRoleCheck();

  const [rows, setRows] = React.useState<SafeguardingConcernRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [severityFilter, setSeverityFilter] = React.useState<SeverityOption>('all');
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>('all');

  const canView = canViewSafeguarding(roleKeys);

  // ── Fetch ──────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!canView) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // Pull all open concerns so we can bucket them client-side. Cap at 100
    // (the API's max pageSize) — at that volume the list becomes a review
    // surface, not a triage board. Exclude closed states so sealed/resolved
    // concerns don't appear on the SLA board (they have no first-response
    // timer once closed).
    apiClient<{ data: SafeguardingConcernRow[] }>(
      '/api/v1/safeguarding/concerns?pageSize=100&sla_status=all&status=reported,under_investigation,monitoring,referred',
    )
      .then((res) => {
        if (!cancelled) setRows(res.data);
      })
      .catch((err) => {
        console.error('[SafeguardingSla] fetch failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, reloadKey, t]);

  // ── Derived ────────────────────────────────────────────────────────────
  const assignees = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (row.assigned_to) {
        const name = `${row.assigned_to.first_name} ${row.assigned_to.last_name}`.trim();
        seen.set(row.assigned_to.id, name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const visibleRows = React.useMemo(() => {
    return rows
      .filter((r) => severityFilter === 'all' || r.severity === severityFilter)
      .filter((r) => assigneeFilter === 'all' || r.assigned_to?.id === assigneeFilter)
      .slice()
      .sort((a, b) => {
        const aDue = a.sla_first_response_due ? new Date(a.sla_first_response_due).getTime() : null;
        const bDue = b.sla_first_response_due ? new Date(b.sla_first_response_due).getTime() : null;
        if (aDue === null && bDue === null) return 0;
        if (aDue === null) return 1;
        if (bDue === null) return -1;
        return aDue - bDue;
      });
  }, [rows, severityFilter, assigneeFilter]);

  // ── Permission-denied state ────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader title={t('title')} description={t('description')} />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-sm text-text-secondary">{tHub('denied.body')}</p>
          <Link
            href={`/${locale}/wellbeing`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {tHub('denied.backToHub')}
          </Link>
        </section>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link
            href={`/${locale}/safeguarding`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {t('backToHub')}
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

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          <Filter className="h-3.5 w-3.5" />
          {t('filters.title')}
        </span>

        <div className="relative">
          <label className="sr-only" htmlFor="sla-severity">
            {t('filters.severity')}
          </label>
          <select
            id="sla-severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityOption)}
            className="appearance-none rounded-lg border border-border bg-surface ps-3 pe-9 py-1.5 text-xs font-medium text-text-primary"
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {tHub(`severity.${opt === 'all' ? 'all' : opt}`)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
        </div>

        <div className="relative">
          <label className="sr-only" htmlFor="sla-assignee">
            {t('filters.assignee')}
          </label>
          <select
            id="sla-assignee"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="appearance-none rounded-lg border border-border bg-surface ps-3 pe-9 py-1.5 text-xs font-medium text-text-primary"
          >
            <option value="all">{t('filters.allAssignees')}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
        </div>

        <span className="ms-auto inline-flex items-center gap-1.5 text-xs text-text-tertiary">
          <Gauge className="h-3.5 w-3.5" />
          {t('resultCount', { count: visibleRows.length })}
        </span>
      </section>

      {/* Row list */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        {isLoading ? (
          <ul className="divide-y divide-border/50">
            {Array.from({ length: 4 }).map((_, idx) => (
              <li key={idx} className="flex items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-border/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-border/40" />
                  <div className="h-2 w-2/3 animate-pulse rounded bg-border/30" />
                </div>
              </li>
            ))}
          </ul>
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Gauge className="h-8 w-8 text-text-tertiary" />
            <p className="text-sm font-medium text-text-primary">{t('empty.title')}</p>
            <p className="text-xs text-text-tertiary">{t('empty.body')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {visibleRows.map((row) => {
              const bucket = deriveSlaBucket(row);
              const pct = slaProgressPct(row);
              const dueMs = row.sla_first_response_due
                ? new Date(row.sla_first_response_due).getTime()
                : null;
              const hoursLeft =
                dueMs !== null && !Number.isNaN(dueMs)
                  ? Math.round((dueMs - Date.now()) / (60 * 60 * 1000))
                  : null;

              return (
                <li key={row.id}>
                  <Link
                    href={`/${locale}/safeguarding/concerns/${row.id}`}
                    className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-secondary sm:flex-row sm:items-center"
                  >
                    <div className="flex items-center gap-3 sm:w-64 sm:shrink-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                        <Gauge className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {row.concern_number}
                        </p>
                        <p className="truncate text-xs text-text-tertiary">
                          {row.assigned_to
                            ? `${row.assigned_to.first_name} ${row.assigned_to.last_name}`
                            : t('unassigned')}
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
                        <div
                          className={`h-full rounded-full ${BUCKET_BAR[bucket]} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-text-tertiary">
                        {row.sla_first_response_met_at
                          ? t('met')
                          : hoursLeft !== null
                            ? hoursLeft < 0
                              ? t('overdueHours', { hours: Math.abs(hoursLeft) })
                              : t('hoursLeft', { hours: hoursLeft })
                            : t('noDueDate')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BUCKET_PILL[bucket]}`}
                      >
                        {t(`bucket.${bucket}`)}
                      </span>
                      <span className="inline-flex rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                        {tHub(`severity.${row.severity}`)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
