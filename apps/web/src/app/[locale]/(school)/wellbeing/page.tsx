'use client';

import {
  AlertTriangle,
  ArrowRight,
  Award,
  Brain,
  CheckCircle2,
  ChevronRight,
  Cog,
  FilePlus2,
  Flame,
  Heart,
  HeartHandshake,
  HeartPulse,
  LifeBuoy,
  ListChecks,
  MessageSquareHeart,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  Star,
  TrendingDown,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { WellbeingDashboardSummary } from '@school/shared/wellbeing';

import { HubTile } from '@/components/hub-tile';
import { CardSkeleton, KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { QuickAction } from '@/components/quick-action';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import type { RoleKey } from '@/lib/route-roles';
import { ADMIN_ROLES, STAFF_ROLES } from '@/lib/route-roles';

import {
  filterHubCards,
  filterQuickActions,
  type HubCardKey,
  type HubCardVisibilityOpts,
  type QuickActionKey,
} from './_components/hub-filters';

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingAttentionItem = WellbeingDashboardSummary['pending_attention'][number];
type RecentActivityItem = WellbeingDashboardSummary['recent_activity'][number];

interface HubCardConfig {
  key: HubCardKey;
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  roles?: RoleKey[];
}

interface QuickActionConfig {
  key: QuickActionKey;
  href: string;
  icon: LucideIcon;
  accent: string;
  gradient: string;
  roles?: RoleKey[];
}

// ─── Hub card catalogue ───────────────────────────────────────────────────────

const HUB_CARDS: HubCardConfig[] = [
  {
    key: 'behaviour',
    href: '/behaviour',
    icon: Shield,
    accent: 'from-rose-400 via-rose-500 to-rose-600',
    iconBg: 'bg-rose-100 text-rose-700',
    glow: 'from-rose-50/80',
  },
  {
    key: 'pastoral',
    href: '/pastoral',
    icon: Heart,
    accent: 'from-pink-400 via-pink-500 to-pink-600',
    iconBg: 'bg-pink-100 text-pink-700',
    glow: 'from-pink-50/80',
  },
  {
    key: 'safeguarding',
    href: '/safeguarding',
    icon: ShieldAlert,
    accent: 'from-slate-500 via-slate-600 to-slate-700',
    iconBg: 'bg-slate-100 text-slate-700',
    glow: 'from-slate-50/80',
  },
  {
    key: 'earlyWarnings',
    href: '/early-warnings',
    icon: AlertTriangle,
    accent: 'from-amber-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-700',
    glow: 'from-amber-50/80',
  },
  {
    key: 'staffWellbeing',
    href: '/wellbeing/staff',
    icon: Users,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    glow: 'from-violet-50/80',
    roles: [...STAFF_ROLES],
  },
  {
    key: 'settings',
    href: '/settings/behaviour-general',
    icon: Cog,
    accent: 'from-zinc-400 via-zinc-500 to-zinc-600',
    iconBg: 'bg-zinc-100 text-zinc-700',
    glow: 'from-zinc-50/80',
    roles: ADMIN_ROLES,
  },
];

// ─── Quick action catalogue ───────────────────────────────────────────────────

const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    key: 'logIncident',
    href: '/behaviour/incidents/new',
    icon: FilePlus2,
    accent: 'bg-rose-100 text-rose-700',
    gradient: 'from-rose-400 to-rose-600',
  },
  {
    key: 'logConcern',
    href: '/pastoral/concerns/new',
    icon: MessageSquareHeart,
    accent: 'bg-pink-100 text-pink-700',
    gradient: 'from-pink-400 to-pink-600',
  },
  {
    key: 'declareCritical',
    href: '/pastoral/critical-incidents/new',
    icon: Flame,
    accent: 'bg-amber-100 text-amber-700',
    gradient: 'from-amber-400 to-amber-600',
    roles: ADMIN_ROLES,
  },
  {
    key: 'openCase',
    href: '/pastoral/cases/new',
    icon: HeartHandshake,
    accent: 'bg-violet-100 text-violet-700',
    gradient: 'from-violet-400 to-violet-600',
  },
];

// ─── Pending-attention severity → Tailwind accent ─────────────────────────────

const SEVERITY_STYLES: Record<
  PendingAttentionItem['severity'],
  { border: string; icon: string; iconBg: string; pillBg: string; pillText: string }
> = {
  critical: {
    border: 'border-s-danger-500',
    icon: 'text-danger-600',
    iconBg: 'bg-danger-100',
    pillBg: 'bg-danger-100',
    pillText: 'text-danger-700',
  },
  high: {
    border: 'border-s-warning-500',
    icon: 'text-warning-700',
    iconBg: 'bg-warning-100',
    pillBg: 'bg-warning-100',
    pillText: 'text-warning-700',
  },
  medium: {
    border: 'border-s-info-500',
    icon: 'text-info-700',
    iconBg: 'bg-info-100',
    pillBg: 'bg-info-100',
    pillText: 'text-info-700',
  },
};

const KIND_ICON: Record<PendingAttentionItem['kind'], LucideIcon> = {
  sla_breach: AlertTriangle,
  overdue_intervention: TrendingDown,
  unack_critical: ShieldAlert,
  pending_appeal: LifeBuoy,
  awaiting_parent_meeting: MessageSquareHeart,
};

// ─── Recent activity — kind → icon + accent ───────────────────────────────────

const ACTIVITY_ICON: Record<
  RecentActivityItem['kind'],
  { icon: LucideIcon; bg: string; fg: string }
> = {
  incident: { icon: AlertTriangle, bg: 'bg-rose-100', fg: 'text-rose-700' },
  concern: { icon: HeartPulse, bg: 'bg-pink-100', fg: 'text-pink-700' },
  acknowledgement: { icon: CheckCircle2, bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  escalation: { icon: ShieldAlert, bg: 'bg-amber-100', fg: 'text-amber-700' },
  sanction_served: { icon: ListChecks, bg: 'bg-slate-100', fg: 'text-slate-700' },
  recognition: { icon: Award, bg: 'bg-violet-100', fg: 'text-violet-700' },
};

// ─── Relative time helper (no new deps) ───────────────────────────────────────

function relativeFromNow(iso: string, t: (key: string, values?: Record<string, number>) => string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const seconds = Math.max(0, Math.round(diffMs / 1000));
  if (seconds < 60) return t('recentActivity.justNow');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('recentActivity.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('recentActivity.hoursAgo', { count: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t('recentActivity.daysAgo', { count: days });
  return new Date(iso).toLocaleDateString();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WellbeingHubPage() {
  const t = useTranslations('wellbeingHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole, roleKeys } = useRoleCheck();

  const [summary, setSummary] = React.useState<WellbeingDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  // ── Fetch dashboard summary ─────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiClient<{ data: WellbeingDashboardSummary }>('/api/v1/wellbeing/dashboard-summary')
      .then((res) => {
        if (!cancelled) setSummary(res.data);
      })
      .catch((err) => {
        console.error('[WellbeingHubPage] dashboard-summary failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, t]);

  // ── Derived data ────────────────────────────────────────────────────────
  const visibleCards = React.useMemo(() => {
    const opts: HubCardVisibilityOpts = {
      roleKeys: roleKeys as RoleKey[],
      cards: HUB_CARDS.map((c) => ({ key: c.key, roles: c.roles })),
    };
    const allowedKeys = new Set(filterHubCards(opts).map((c) => c.key));
    return HUB_CARDS.filter((c) => allowedKeys.has(c.key));
  }, [roleKeys]);

  const visibleActions = React.useMemo(() => {
    const opts = {
      roleKeys: roleKeys as RoleKey[],
      actions: QUICK_ACTIONS.map((a) => ({ key: a.key, roles: a.roles })),
    };
    const allowedKeys = new Set(filterQuickActions(opts).map((a) => a.key));
    return QUICK_ACTIONS.filter((a) => allowedKeys.has(a.key));
  }, [roleKeys]);

  const kpis = summary?.kpis;
  const showResourceRibbon = hasAnyRole(...(STAFF_ROLES as RoleKey[]));

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader title={t('title')} description={t('description')} />

      {/* ── Error banner ─────────────────────────────────────────────── */}
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

      {/* ── Pending-attention banner ─────────────────────────────────── */}
      {summary && summary.pending_attention.length > 0 && (
        <section aria-label={t('pendingAttention.title')} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-warning-100 text-warning-700">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-semibold tracking-tight text-text-primary">
                {t('pendingAttention.title')}
              </h2>
              <span className="inline-flex items-center rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                {summary.pending_attention.length}
              </span>
            </div>
            <Link
              href={`/${locale}/behaviour/tasks`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {t('pendingAttention.viewMore')}
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </div>

          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {summary.pending_attention.slice(0, 5).map((item, idx) => {
              const style = SEVERITY_STYLES[item.severity];
              const KindIcon = KIND_ICON[item.kind];
              return (
                <Link
                  key={`${item.kind}-${idx}`}
                  href={`/${locale}${item.href}`}
                  className={`group flex min-w-[280px] shrink-0 snap-start flex-col gap-2 rounded-2xl border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md border-s-4 ${style.border} sm:min-w-[320px]`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBg} ${style.icon}`}
                    >
                      <KindIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {item.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-text-tertiary">
                        {item.detail}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
                  </div>
                  {item.due_at && (
                    <span
                      className={`inline-flex self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.pillBg} ${style.pillText}`}
                    >
                      {t('pendingAttention.due', { when: relativeFromNow(item.due_at, t) })}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <section aria-label={t('kpis.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={AlertTriangle}
          label={t('kpis.studentsAtRisk')}
          value={kpis?.students_at_risk.total}
          subtitle={
            kpis
              ? t('kpis.studentsAtRiskBreakdown', {
                  amber: kpis.students_at_risk.amber,
                  red: kpis.students_at_risk.red,
                })
              : undefined
          }
          isLoading={isLoading}
          accent="text-amber-700"
          href={`/${locale}/early-warnings`}
          tooltip={t('kpis.tooltips.studentsAtRisk')}
        />
        <KpiTile
          icon={Shield}
          label={t('kpis.openIncidents')}
          value={kpis?.open_incidents.total}
          subtitle={
            kpis
              ? t('kpis.incidentsBreakdown', {
                  positive: kpis.open_incidents.positive,
                  negative: kpis.open_incidents.negative,
                })
              : undefined
          }
          isLoading={isLoading}
          accent="text-rose-700"
          href={`/${locale}/behaviour`}
          tooltip={t('kpis.tooltips.openIncidents')}
        />
        <KpiTile
          icon={Heart}
          label={t('kpis.openCases')}
          value={kpis?.open_pastoral_cases}
          isLoading={isLoading}
          accent="text-pink-700"
          href={`/${locale}/pastoral`}
          tooltip={t('kpis.tooltips.openCases')}
        />
        <KpiTile
          icon={ListChecks}
          label={t('kpis.overdueActions')}
          value={kpis?.overdue_actions.total}
          subtitle={
            kpis && kpis.overdue_actions.total > 0
              ? t('kpis.overdueBreakdown', {
                  sanctions: kpis.overdue_actions.sanctions,
                  tasks: kpis.overdue_actions.tasks,
                })
              : undefined
          }
          isLoading={isLoading}
          accent="text-slate-700"
          href={`/${locale}/behaviour/tasks`}
          tooltip={t('kpis.tooltips.overdueActions')}
        />
      </section>

      {/* ── Quick actions ─────────────────────────────────────────────── */}
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

      {/* ── Hub cards ─────────────────────────────────────────────────── */}
      <section
        aria-label={t('cards.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {isLoading && summary === null ? (
          <>
            {visibleCards.map((card) => (
              <CardSkeleton key={`skeleton-${card.key}`} />
            ))}
          </>
        ) : (
          visibleCards.map((card, idx) => {
            const count = getHubCount(card.key, summary);
            return (
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
                count={count}
                animationIndex={idx}
              />
            );
          })
        )}
      </section>

      {/* ── Recent activity ──────────────────────────────────────────── */}
      {summary && summary.recent_activity.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500" />
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('recentActivity.title')}
              </h3>
            </div>
          </div>
          <div className="divide-y divide-border/50">
            {summary.recent_activity.slice(0, 8).map((item) => {
              const { icon: Icon, bg, fg } = ACTIVITY_ICON[item.kind];
              return (
                <Link
                  key={item.id}
                  href={`/${locale}${item.href}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg} ${fg}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                    <p className="truncate text-xs text-text-tertiary">
                      {item.actor_name ?? t('recentActivity.system')}
                      <span className="mx-1.5 text-text-tertiary/60">·</span>
                      {relativeFromNow(item.occurred_at, t)}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-text-tertiary opacity-60 rtl:rotate-180" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Resource ribbon ───────────────────────────────────────────── */}
      {showResourceRibbon && (
        <section className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface-secondary/40 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {t('resourceRibbon.title')}
                </p>
                <p className="text-xs text-text-tertiary">{t('resourceRibbon.description')}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${locale}/wellbeing/resources`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
              >
                <HeartPulse className="h-3.5 w-3.5" />
                {t('resourceRibbon.supportDocs')}
              </Link>
              <Link
                href={`/${locale}/wellbeing/resources?category=eap`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
              >
                <LifeBuoy className="h-3.5 w-3.5" />
                {t('resourceRibbon.eap')}
              </Link>
              <Link
                href={`/${locale}/wellbeing/resources?category=training`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t('resourceRibbon.training')}
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getHubCount(
  key: HubCardKey,
  summary: WellbeingDashboardSummary | null,
): number | undefined {
  if (!summary) return undefined;
  const { hub_counts } = summary;
  switch (key) {
    case 'behaviour':
      return hub_counts.behaviour;
    case 'pastoral':
      return hub_counts.pastoral;
    case 'safeguarding':
      return hub_counts.safeguarding;
    case 'earlyWarnings':
      return hub_counts.early_warnings;
    case 'staffWellbeing':
      return hub_counts.staff_wellbeing;
    case 'settings':
      return undefined;
    default: {
      // Exhaustiveness guard; VISIBLE_HUB_KEYS keeps this in sync.
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
