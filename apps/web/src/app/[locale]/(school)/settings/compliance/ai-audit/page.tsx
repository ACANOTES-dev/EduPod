'use client';

import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Gauge,
  Hash,
  KeySquare,
  RefreshCw,
  Shield,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AiUsageStats {
  totalLogs: number;
  byService: Record<string, number>;
  acceptanceRate: number | null;
  avgProcessingTimeMs: number | null;
  tokenisationRate: number;
}

interface AiProcessingLog {
  id: string;
  ai_service: string;
  subject_type: string | null;
  subject_id: string | null;
  model_used: string;
  prompt_summary: string;
  response_summary: string | null;
  input_data_categories: string[];
  tokenised: boolean;
  confidence_score: number | string | null;
  processing_time_ms: number | null;
  output_used: boolean | null;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  rejected_reason: string | null;
  created_at: string;
}

interface ListResponse {
  data: AiProcessingLog[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

// ─── Known service keys — grows as the catalogue grows ──────────────────────

const KNOWN_SERVICES = [
  'behaviour_incident_parse',
  'pastoral_concern_classification',
  'pastoral_sst_agenda',
  'early_warning_summary',
  'staff_wellbeing_signal',
  'substitution_suggest',
  'exam_solver',
  'report_comment_draft',
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPct(value: number | null, locale: string): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(fmtLocale(locale), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function decisionState(log: AiProcessingLog): 'accepted' | 'rejected' | 'pending' {
  if (log.output_used === true) return 'accepted';
  if (log.output_used === false) return 'rejected';
  return 'pending';
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AiAuditSettingsPage() {
  const t = useTranslations('aiAuditSettings');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const canView = hasAnyRole(...ADMIN_ROLES);

  const translateService = React.useCallback(
    (service: string): string => {
      if ((KNOWN_SERVICES as readonly string[]).includes(service)) {
        return t(`service.${service}`);
      }
      return service;
    },
    [t],
  );

  const [stats, setStats] = React.useState<AiUsageStats | null>(null);
  const [logs, setLogs] = React.useState<AiProcessingLog[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [serviceFilter, setServiceFilter] = React.useState<string>('all');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [selected, setSelected] = React.useState<AiProcessingLog | null>(null);

  React.useEffect(() => {
    if (!canView) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const statsPromise = apiClient<AiUsageStats>('/api/v1/ai-audit/stats');

    // If a specific service is selected, list by service. Otherwise fall back
    // to a best-effort recent feed built by querying the most-used service.
    const listPromise: Promise<ListResponse> =
      serviceFilter === 'all'
        ? statsPromise.then((s) => {
            const services = Object.entries(s.byService ?? {}).sort((a, b) => b[1] - a[1]);
            const topService = services[0]?.[0];
            if (!topService) {
              return {
                data: [],
                meta: { page: 1, pageSize: PAGE_SIZE, total: 0 },
              };
            }
            return apiClient<ListResponse>(
              `/api/v1/ai-audit/service/${encodeURIComponent(topService)}?page=${page}&pageSize=${PAGE_SIZE}`,
            );
          })
        : apiClient<ListResponse>(
            `/api/v1/ai-audit/service/${encodeURIComponent(serviceFilter)}?page=${page}&pageSize=${PAGE_SIZE}`,
          );

    void Promise.all([statsPromise, listPromise])
      .then(([statsRes, listRes]) => {
        if (cancelled) return;
        setStats(statsRes);
        setLogs(listRes.data ?? []);
        setTotal(listRes.meta?.total ?? 0);
      })
      .catch((err) => {
        console.error('[AiAuditSettings] load failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, page, reloadKey, serviceFilter, t]);

  const serviceOptions = React.useMemo(() => {
    const fromStats = Object.keys(stats?.byService ?? {});
    const combined = Array.from(new Set([...KNOWN_SERVICES, ...fromStats]));
    return combined.sort();
  }, [stats]);

  // ── Permission denied ───────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{ href: `/${locale}/settings/compliance`, label: t('back') }}
        />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Shield className="h-6 w-6" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold text-text-primary">{t('denied.title')}</h2>
            <p className="text-sm text-text-secondary">{t('denied.body')}</p>
          </div>
        </section>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const topServices = Object.entries(stats?.byService ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/settings/compliance`, label: t('back') }}
      />

      {/* ── Regulatory banner ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-200/80 text-indigo-700">
            <KeySquare className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-indigo-900">{t('regulatoryBanner.title')}</p>
            <p className="text-xs text-indigo-700">{t('regulatoryBanner.body')}</p>
          </div>
        </div>
      </section>

      {/* ── Error banner ────────────────────────────────────────────────── */}
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
            {t('retry')}
          </button>
        </div>
      )}

      {/* ── KPI strip ──────────────────────────────────────────────────── */}
      <section aria-label={t('kpis.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={BrainCircuit}
          label={t('kpis.totalRuns')}
          value={stats?.totalLogs}
          isLoading={isLoading}
          accent="text-indigo-700"
          tooltip={t('kpis.tooltips.totalRuns')}
        />
        <KpiTile
          icon={CheckCircle2}
          label={t('kpis.acceptance')}
          value={stats ? formatPct(stats.acceptanceRate, locale) : undefined}
          isLoading={isLoading}
          accent="text-emerald-700"
          tooltip={t('kpis.tooltips.acceptance')}
        />
        <KpiTile
          icon={Clock}
          label={t('kpis.avgLatency')}
          value={stats ? formatMs(stats.avgProcessingTimeMs) : undefined}
          isLoading={isLoading}
          accent="text-amber-700"
          tooltip={t('kpis.tooltips.avgLatency')}
        />
        <KpiTile
          icon={Shield}
          label={t('kpis.tokenisation')}
          value={stats ? formatPct(stats.tokenisationRate, locale) : undefined}
          isLoading={isLoading}
          accent="text-slate-700"
          tooltip={t('kpis.tooltips.tokenisation')}
        />
      </section>

      {/* ── By service breakdown ────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-600" />
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-text-primary">{t('byService.title')}</h3>
          </div>
        </div>
        {isLoading && !stats ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700" />
          </div>
        ) : topServices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-text-primary">{t('byService.empty.title')}</p>
            <p className="max-w-md text-xs text-text-tertiary">{t('byService.empty.body')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {topServices.map(([service, count]) => {
              const pct = stats && stats.totalLogs > 0 ? count / stats.totalLogs : 0;
              return (
                <li
                  key={service}
                  className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                      <BrainCircuit className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {translateService(service)}
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${Math.round(pct * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 self-start sm:self-auto">
                    <span className="font-mono text-xs tabular-nums text-text-tertiary">
                      {formatPct(pct, locale)}
                    </span>
                    <span className="text-sm font-semibold text-text-primary">{count}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Filter + recent events list ─────────────────────────────────── */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">{t('filters.title')}</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={serviceFilter === 'all'}
            onClick={() => {
              setServiceFilter('all');
              setPage(1);
            }}
            label={t('filters.allServices')}
          />
          {serviceOptions.map((svc) => (
            <FilterChip
              key={svc}
              active={serviceFilter === svc}
              onClick={() => {
                setServiceFilter(svc);
                setPage(1);
              }}
              label={translateService(svc)}
            />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-text-tertiary">
          <span>{t('list.resultCount', { count: total })}</span>
          <span>{t('list.pagination', { page, total: totalPages })}</span>
        </header>
        {isLoading && logs.length === 0 ? (
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
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-text-primary">{t('list.empty.title')}</p>
            <p className="max-w-md text-xs text-text-tertiary">{t('list.empty.body')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {logs.map((log) => {
              const decision = decisionState(log);
              const decisionStyle =
                decision === 'accepted'
                  ? 'bg-success-100 text-success-700'
                  : decision === 'rejected'
                    ? 'bg-danger-100 text-danger-700'
                    : 'bg-surface-secondary text-text-secondary';
              return (
                <li key={log.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(log)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-start transition-colors hover:bg-surface-secondary"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                      <BrainCircuit className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {translateService(log.ai_service)}
                        </p>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${decisionStyle}`}
                        >
                          {t(`list.decision.${decision}`)}
                        </span>
                        {log.tokenised && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                            <Shield className="h-3 w-3" />
                            {t('list.tokenised')}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-tertiary">
                        {log.model_used}
                        {' · '}
                        {new Date(log.created_at).toLocaleString(fmtLocale(locale))}
                        {log.processing_time_ms !== null
                          ? ` · ${formatMs(log.processing_time_ms)}`
                          : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary rtl:rotate-180" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            {t('list.prev')}
          </Button>
          <span className="text-xs text-text-tertiary">
            {t('list.pagination', { page, total: totalPages })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
          >
            {t('list.next')}
          </Button>
        </div>
      )}

      {/* ── Detail drawer (inline card shown above list when open) ──────── */}
      {selected && (
        <AuditDetailPanel log={selected} locale={locale} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ─── Filter chip ────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
          : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Detail panel ───────────────────────────────────────────────────────────

function AuditDetailPanel({
  log,
  locale,
  onClose,
}: {
  log: AiProcessingLog;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations('aiAuditSettings.detail');
  const tRoot = useTranslations('aiAuditSettings');
  const decision = decisionState(log);
  const confidence = log.confidence_score !== null ? Number(log.confidence_score) : null;

  const translateService = (service: string): string => {
    if ((KNOWN_SERVICES as readonly string[]).includes(service)) {
      return tRoot(`service.${service}`);
    }
    return service;
  };

  return (
    <section
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/30 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary">
              {translateService(log.ai_service)}
            </h2>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {log.model_used}
              {' · '}
              {new Date(log.created_at).toLocaleString(fmtLocale(locale))}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
            aria-label={t('close')}
          >
            <XCircle className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <Row icon={Hash} label={t('fields.id')}>
            <span dir="ltr" className="font-mono text-xs text-text-secondary">
              {log.id}
            </span>
          </Row>
          {log.subject_type && log.subject_id && (
            <Row icon={ArrowRight} label={t('fields.subject')}>
              <span className="text-sm text-text-primary">
                {log.subject_type}{' '}
                <span dir="ltr" className="font-mono text-xs text-text-tertiary">
                  {log.subject_id}
                </span>
              </span>
            </Row>
          )}
          <Row icon={Gauge} label={t('fields.latency')}>
            <span className="text-sm text-text-primary">{formatMs(log.processing_time_ms)}</span>
          </Row>
          {confidence !== null && (
            <Row icon={Gauge} label={t('fields.confidence')}>
              <span className="text-sm text-text-primary">
                {new Intl.NumberFormat(fmtLocale(locale), {
                  style: 'percent',
                  maximumFractionDigits: 0,
                }).format(confidence)}
              </span>
            </Row>
          )}
          <Row icon={Shield} label={t('fields.tokenised')}>
            <span className="text-sm text-text-primary">
              {log.tokenised ? t('fields.tokenisedYes') : t('fields.tokenisedNo')}
            </span>
          </Row>
          <Row icon={Filter} label={t('fields.categories')}>
            <div className="flex flex-wrap gap-1.5">
              {log.input_data_categories.map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary"
                >
                  {cat}
                </span>
              ))}
            </div>
          </Row>
          <Row
            icon={
              decision === 'accepted' ? CheckCircle2 : decision === 'rejected' ? XCircle : Clock
            }
            label={t('fields.decision')}
          >
            <span className="text-sm text-text-primary">
              {t(`decision.${decision}`)}
              {decision === 'rejected' && log.rejected_reason ? ` — ${log.rejected_reason}` : ''}
            </span>
          </Row>

          <div className="rounded-2xl border border-border bg-surface-secondary/40 p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {t('fields.prompt')}
            </p>
            <p className="whitespace-pre-wrap text-sm text-text-primary">{log.prompt_summary}</p>
          </div>

          {log.response_summary && (
            <div className="rounded-2xl border border-border bg-surface-secondary/40 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                {t('fields.response')}
              </p>
              <p className="whitespace-pre-wrap text-sm text-text-primary">
                {log.response_summary}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2 text-xs text-text-tertiary">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1 text-end">{children}</div>
    </div>
  );
}
