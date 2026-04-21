'use client';

import {
  AlertTriangle,
  ArrowRight,
  Award,
  Binoculars,
  ChevronRight,
  ClipboardList,
  Cog,
  Eye,
  EyeOff,
  FileWarning,
  FolderLock,
  Gauge,
  KeyRound,
  Lock,
  MessageSquareWarning,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { HubTile } from '@/components/hub-tile';
import { CardSkeleton, KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { QuickAction } from '@/components/quick-action';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import type { RoleKey } from '@/lib/route-roles';

import {
  composeHubKpis,
  deriveSlaBucket,
  type SafeguardingConcernRow,
  type SafeguardingDashboardPayload,
} from './_components/summary';
import {
  canViewSafeguarding,
  canViewSealedRecords,
  filterSafeguardingHubCards,
  filterSafeguardingQuickActions,
  SAFEGUARDING_SEAL_VIEW_ROLES,
  SAFEGUARDING_TIER_ROLES,
  type SafeguardingHubCardKey,
  type SafeguardingQuickActionKey,
} from './_components/visibility';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HubCardConfig {
  key: SafeguardingHubCardKey;
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  roles?: RoleKey[];
}

interface QuickActionConfig {
  key: SafeguardingQuickActionKey;
  href: string;
  icon: LucideIcon;
  accent: string;
  gradient: string;
  roles?: RoleKey[];
}

// ─── Hub card catalogue ───────────────────────────────────────────────────────

const HUB_CARDS: HubCardConfig[] = [
  {
    key: 'concerns',
    href: '/safeguarding/concerns',
    icon: ClipboardList,
    accent: 'from-slate-500 via-slate-600 to-slate-700',
    iconBg: 'bg-slate-100 text-slate-700',
    glow: 'from-slate-50/80',
  },
  {
    key: 'sla',
    href: '/safeguarding/sla',
    icon: Gauge,
    accent: 'from-amber-500 via-amber-600 to-amber-700',
    iconBg: 'bg-amber-100 text-amber-700',
    glow: 'from-amber-50/80',
  },
  {
    key: 'sealed',
    href: '/safeguarding/sealed',
    icon: FolderLock,
    accent: 'from-zinc-600 via-zinc-700 to-zinc-800',
    iconBg: 'bg-zinc-100 text-zinc-700',
    glow: 'from-zinc-50/80',
    roles: SAFEGUARDING_SEAL_VIEW_ROLES,
  },
  {
    key: 'breakGlass',
    href: '/safeguarding/break-glass',
    icon: KeyRound,
    accent: 'from-rose-500 via-rose-600 to-rose-700',
    iconBg: 'bg-rose-100 text-rose-700',
    glow: 'from-rose-50/80',
  },
  {
    key: 'reviews',
    href: '/safeguarding/reviews',
    icon: Binoculars,
    accent: 'from-indigo-500 via-indigo-600 to-indigo-700',
    iconBg: 'bg-indigo-100 text-indigo-700',
    glow: 'from-indigo-50/80',
  },
  {
    key: 'settings',
    href: '/settings/safeguarding',
    icon: Cog,
    accent: 'from-stone-500 via-stone-600 to-stone-700',
    iconBg: 'bg-stone-100 text-stone-700',
    glow: 'from-stone-50/80',
  },
];

// ─── Quick action catalogue ───────────────────────────────────────────────────

const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    key: 'reportConcern',
    href: '/safeguarding/concerns/new',
    icon: MessageSquareWarning,
    accent: 'bg-rose-100 text-rose-700',
    gradient: 'from-rose-500 to-rose-700',
  },
  {
    key: 'viewMyReports',
    href: '/safeguarding/my-reports',
    icon: FileWarning,
    accent: 'bg-slate-100 text-slate-700',
    gradient: 'from-slate-500 to-slate-700',
  },
  {
    key: 'requestBreakGlass',
    href: '/safeguarding/break-glass',
    icon: KeyRound,
    accent: 'bg-amber-100 text-amber-700',
    gradient: 'from-amber-500 to-amber-700',
    roles: SAFEGUARDING_TIER_ROLES,
  },
  {
    key: 'runAfterAction',
    href: '/safeguarding/reviews',
    icon: Binoculars,
    accent: 'bg-indigo-100 text-indigo-700',
    gradient: 'from-indigo-500 to-indigo-700',
    roles: SAFEGUARDING_TIER_ROLES,
  },
];

// ─── Severity → Tailwind accent (for KPI + row badges) ────────────────────────

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-danger-100 text-danger-700',
  high: 'bg-warning-100 text-warning-700',
  medium: 'bg-info-100 text-info-700',
  low: 'bg-surface-secondary text-text-secondary',
};

const SLA_BUCKET_STYLE: Record<
  ReturnType<typeof deriveSlaBucket>,
  { label: string; bg: string; text: string }
> = {
  breached: { label: 'breached', bg: 'bg-danger-100', text: 'text-danger-700' },
  due_soon: { label: 'due_soon', bg: 'bg-warning-100', text: 'text-warning-700' },
  on_track: { label: 'on_track', bg: 'bg-success-100', text: 'text-success-700' },
  unknown: { label: 'unknown', bg: 'bg-surface-secondary', text: 'text-text-secondary' },
};

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeFromNow(
  iso: string,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const seconds = Math.max(0, Math.round(diffMs / 1000));
  if (seconds < 60) return t('recentConcerns.justNow');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('recentConcerns.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('recentConcerns.hoursAgo', { count: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t('recentConcerns.daysAgo', { count: days });
  return new Date(iso).toLocaleDateString();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SafeguardingHubPage() {
  const t = useTranslations('safeguardingHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { roleKeys } = useRoleCheck();

  const canView = canViewSafeguarding(roleKeys);
  const canViewSealed = canViewSealedRecords(roleKeys);

  const [dashboard, setDashboard] = React.useState<SafeguardingDashboardPayload | null>(null);
  const [sealedCount, setSealedCount] = React.useState<number | null>(null);
  const [slaBreachFeed, setSlaBreachFeed] = React.useState<SafeguardingConcernRow[]>([]);
  const [recentConcerns, setRecentConcerns] = React.useState<SafeguardingConcernRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  // ── Fetch ──────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!canView) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const academicYearStart = new Date(new Date().getFullYear(), 7, 1).toISOString();

    void Promise.allSettled([
      apiClient<{ data: SafeguardingDashboardPayload }>('/api/v1/safeguarding/dashboard'),
      apiClient<{
        data: SafeguardingConcernRow[];
        meta?: { total: number };
      }>(
        `/api/v1/safeguarding/concerns?status=sealed&pageSize=50&from=${encodeURIComponent(academicYearStart)}`,
      ),
      apiClient<{
        data: SafeguardingConcernRow[];
      }>('/api/v1/safeguarding/concerns?sla_status=overdue&pageSize=5'),
      apiClient<{
        data: SafeguardingConcernRow[];
      }>('/api/v1/safeguarding/concerns?pageSize=8'),
    ])
      .then(([dashboardRes, sealedRes, breachesRes, recentRes]) => {
        if (cancelled) return;

        if (dashboardRes.status === 'fulfilled') {
          setDashboard(dashboardRes.value.data);
        } else {
          console.error('[SafeguardingHub] dashboard failed', dashboardRes.reason);
          setError(t('loadError'));
        }

        if (sealedRes.status === 'fulfilled') {
          setSealedCount(sealedRes.value.meta?.total ?? sealedRes.value.data.length);
        } else if (canViewSealed) {
          console.warn('[SafeguardingHub] sealed count failed', sealedRes.reason);
          setSealedCount(0);
        }

        if (breachesRes.status === 'fulfilled') {
          setSlaBreachFeed(breachesRes.value.data.slice(0, 5));
        } else {
          console.warn('[SafeguardingHub] sla breach feed failed', breachesRes.reason);
        }

        if (recentRes.status === 'fulfilled') {
          setRecentConcerns(recentRes.value.data.slice(0, 8));
        } else {
          console.warn('[SafeguardingHub] recent concerns failed', recentRes.reason);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, canViewSealed, reloadKey, t]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const visibleCards = React.useMemo(() => {
    const allowed = new Set(
      filterSafeguardingHubCards({
        roleKeys,
        cards: HUB_CARDS.map((c) => ({ key: c.key, roles: c.roles })),
      }).map((c) => c.key),
    );
    return HUB_CARDS.filter((c) => allowed.has(c.key));
  }, [roleKeys]);

  const visibleActions = React.useMemo(() => {
    const allowed = new Set(
      filterSafeguardingQuickActions({
        roleKeys,
        actions: QUICK_ACTIONS.map((a) => ({ key: a.key, roles: a.roles })),
      }).map((a) => a.key),
    );
    return QUICK_ACTIONS.filter((a) => allowed.has(a.key));
  }, [roleKeys]);

  const kpis = composeHubKpis(dashboard, sealedCount);

  // ── Permission-denied state ─────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader title={t('title')} description={t('description')} />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold text-text-primary">{t('denied.title')}</h2>
            <p className="text-sm text-text-secondary">{t('denied.body')}</p>
          </div>
          <Link
            href={`/${locale}/wellbeing`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            {t('denied.backToHub')}
          </Link>
        </section>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader title={t('title')} description={t('description')} />

      {/* ── Privacy banner ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-200/80 text-slate-700">
            <EyeOff className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-slate-800">{t('privacyBanner.title')}</p>
            <p className="text-xs text-slate-600">{t('privacyBanner.body')}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-300 bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 sm:self-auto">
          <Eye className="h-3 w-3" />
          {t('privacyBanner.scopePill')}
        </span>
      </section>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
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

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <section aria-label={t('kpis.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={ClipboardList}
          label={t('kpis.openConcerns')}
          value={kpis.open_concerns_total}
          subtitle={
            dashboard
              ? t('kpis.openConcernsBreakdown', {
                  critical: kpis.open_by_severity.critical,
                  high: kpis.open_by_severity.high,
                })
              : undefined
          }
          isLoading={isLoading}
          accent="text-slate-700"
          href={`/${locale}/safeguarding/concerns`}
          tooltip={t('kpis.tooltips.openConcerns')}
        />
        <KpiTile
          icon={AlertTriangle}
          label={t('kpis.slaBreaches')}
          value={kpis.sla_breaches_open}
          isLoading={isLoading}
          accent="text-warning-700"
          href={`/${locale}/safeguarding/sla`}
          tooltip={t('kpis.tooltips.slaBreaches')}
        />
        <KpiTile
          icon={ShieldAlert}
          label={t('kpis.criticalAwaitingAck')}
          value={kpis.critical_awaiting_ack}
          isLoading={isLoading}
          accent="text-danger-700"
          tooltip={t('kpis.tooltips.criticalAwaitingAck')}
        />
        <KpiTile
          icon={FolderLock}
          label={t('kpis.sealedThisYear')}
          value={canViewSealed ? kpis.sealed_this_year : undefined}
          subtitle={canViewSealed ? undefined : t('kpis.sealedRestricted')}
          isLoading={isLoading && canViewSealed}
          accent="text-zinc-700"
          href={canViewSealed ? `/${locale}/safeguarding/sealed` : undefined}
          tooltip={t('kpis.tooltips.sealedThisYear')}
        />
      </section>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      {visibleActions.length > 0 && (
        <section
          aria-label={t('quickActions.ariaLabel')}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {visibleActions.map((action) => (
            <QuickAction
              key={action.key}
              icon={action.icon}
              label={t(`quickActions.${action.key}`)}
              href={action.href}
              accent={action.accent}
              gradient={action.gradient}
              tooltip={t(`quickActions.tooltips.${action.key}`)}
            />
          ))}
        </section>
      )}

      {/* ── Hub cards ─────────────────────────────────────────────────────── */}
      <section
        aria-label={t('cards.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {isLoading && dashboard === null ? (
          <>
            {visibleCards.map((card) => (
              <CardSkeleton key={`skeleton-${card.key}`} />
            ))}
          </>
        ) : (
          visibleCards.map((card, idx) => (
            <HubTile
              key={card.key}
              icon={card.icon}
              title={t(`cards.${card.key}.title`)}
              description={t(`cards.${card.key}.description`)}
              tooltip={t(`cards.${card.key}.tooltip`)}
              href={card.href}
              accent={card.accent}
              iconBg={card.iconBg}
              glow={card.glow}
              count={getCardCount(card.key, kpis, slaBreachFeed.length)}
              animationIndex={idx}
            />
          ))
        )}
      </section>

      {/* ── SLA breach feed (admin-only, rendered only if breaches exist) ─── */}
      {slaBreachFeed.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-warning-200 bg-surface shadow-sm">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-warning-400 via-warning-500 to-warning-700" />
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning-700" />
              <h3 className="text-sm font-semibold text-text-primary">{t('slaFeed.title')}</h3>
              <span className="inline-flex items-center rounded-full bg-warning-100 px-2 py-0.5 text-[11px] font-semibold text-warning-800">
                {slaBreachFeed.length}
              </span>
            </div>
            <Link
              href={`/${locale}/safeguarding/sla`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {t('slaFeed.viewAll')}
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </div>
          <ul className="divide-y divide-border/50">
            {slaBreachFeed.map((row) => {
              const dueMs = row.sla_first_response_due
                ? new Date(row.sla_first_response_due).getTime()
                : null;
              const overdueHrs =
                dueMs !== null && !Number.isNaN(dueMs)
                  ? Math.max(0, Math.round((Date.now() - dueMs) / (60 * 60 * 1000)))
                  : null;
              return (
                <li key={row.id}>
                  <Link
                    href={`/${locale}/safeguarding/concerns/${row.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-warning-50/40"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-700">
                      <FileWarning className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {row.concern_number}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {overdueHrs !== null
                          ? t('slaFeed.overdueHours', { hours: overdueHrs })
                          : t('slaFeed.overdue')}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_BADGE[row.severity] ?? SEVERITY_BADGE.low}`}
                    >
                      {t(`severity.${row.severity}`)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-text-tertiary opacity-60 rtl:rotate-180" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Recent concerns ───────────────────────────────────────────────── */}
      {recentConcerns.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('recentConcerns.title')}
              </h3>
            </div>
            <Link
              href={`/${locale}/safeguarding/concerns`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {t('recentConcerns.viewAll')}
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </div>
          <ul className="divide-y divide-border/50">
            {recentConcerns.map((row) => {
              const bucket = deriveSlaBucket(row);
              const slaStyle = SLA_BUCKET_STYLE[bucket];
              return (
                <li key={row.id}>
                  <Link
                    href={`/${locale}/safeguarding/concerns/${row.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {row.concern_number}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {relativeFromNow(row.created_at, t)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_BADGE[row.severity] ?? SEVERITY_BADGE.low}`}
                    >
                      {t(`severity.${row.severity}`)}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${slaStyle.bg} ${slaStyle.text}`}
                    >
                      {t(`slaBucket.${slaStyle.label}`)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-text-tertiary opacity-60 rtl:rotate-180" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Zero-state when nothing has been reported ─────────────────────── */}
      {!isLoading && !error && recentConcerns.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="text-base font-semibold text-text-primary">{t('empty.title')}</h3>
            <p className="text-sm text-text-secondary">{t('empty.body')}</p>
          </div>
        </section>
      )}

      {/* ── Audit footer ──────────────────────────────────────────────────── */}
      <footer className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-border bg-surface-secondary/40 px-5 py-4 text-xs text-text-tertiary sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          <span>{t('footer.audit')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Award className="h-3.5 w-3.5" />
          <span>{t('footer.designatedLead')}</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCardCount(
  key: SafeguardingHubCardKey,
  kpis: ReturnType<typeof composeHubKpis>,
  breachCount: number,
): number | undefined {
  switch (key) {
    case 'concerns':
      return kpis.open_concerns_total;
    case 'sla':
      return breachCount;
    case 'sealed':
      return kpis.sealed_this_year;
    case 'breakGlass':
    case 'reviews':
    case 'settings':
      return undefined;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
