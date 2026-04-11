'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Settings2,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import type { RoleKey } from '@/lib/route-roles';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardSummary {
  counts: {
    ready_to_admit: number;
    waiting_list: number;
    waiting_list_awaiting_year_setup: number;
    conditional_approval: number;
    conditional_approval_near_expiry: number;
    rejected_total: number;
    approved_this_month: number;
    rejected_this_month: number;
    overrides_total: number;
  };
  capacity_pressure: Array<{
    year_group_id: string;
    year_group_name: string;
    waiting_list_count: number;
    total_capacity: number;
    enrolled_count: number;
    conditional_count: number;
  }>;
}

interface DashboardResponse {
  data: DashboardSummary;
}

interface CardConfig {
  key:
    | 'readyToAdmit'
    | 'waitingList'
    | 'conditionalApproval'
    | 'rejected'
    | 'formPreview'
    | 'overrides'
    | 'settings';
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  roles: RoleKey[];
}

const QUEUE_VIEWER_ROLES: RoleKey[] = [...ADMIN_ROLES, 'front_office'];

// Row 1: Ready to Admit, Conditional Approval
// Row 2: Waiting List, Rejected
// Row 3: Admission Form, Overrides Log
const CARDS: CardConfig[] = [
  {
    key: 'readyToAdmit',
    href: '/admissions/ready-to-admit',
    icon: ClipboardCheck,
    accent: 'from-amber-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-700',
    glow: 'from-amber-50/80',
    roles: QUEUE_VIEWER_ROLES,
  },
  {
    key: 'conditionalApproval',
    href: '/admissions/conditional-approval',
    icon: Clock,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    glow: 'from-violet-50/80',
    roles: QUEUE_VIEWER_ROLES,
  },
  {
    key: 'waitingList',
    href: '/admissions/waiting-list',
    icon: Users,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
    roles: QUEUE_VIEWER_ROLES,
  },
  {
    key: 'rejected',
    href: '/admissions/rejected',
    icon: XCircle,
    accent: 'from-rose-400 via-rose-500 to-rose-600',
    iconBg: 'bg-rose-100 text-rose-700',
    glow: 'from-rose-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'formPreview',
    href: '/admissions/form-preview',
    icon: FileText,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    glow: 'from-emerald-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'overrides',
    href: '/admissions/overrides',
    icon: ShieldCheck,
    accent: 'from-slate-400 via-slate-500 to-slate-600',
    iconBg: 'bg-slate-100 text-slate-700',
    glow: 'from-slate-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'settings',
    href: '/admissions/settings',
    icon: Settings2,
    accent: 'from-zinc-400 via-zinc-500 to-zinc-600',
    iconBg: 'bg-zinc-100 text-zinc-700',
    glow: 'from-zinc-50/80',
    roles: ADMIN_ROLES,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdmissionsDashboardPage() {
  const t = useTranslations('admissionsHub');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();

  const [summary, setSummary] = React.useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchSummary = React.useCallback(async () => {
    try {
      const res = await apiClient<DashboardResponse>('/api/v1/admissions/dashboard-summary');
      setSummary(res.data);
    } catch (err) {
      console.error('[AdmissionsDashboardPage]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  // Auto-refresh every 60s while the tab is visible.
  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchSummary();
      }
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [fetchSummary]);

  const visibleCards = React.useMemo(
    () => CARDS.filter((card) => hasAnyRole(...card.roles)),
    [hasAnyRole],
  );

  const counts = summary?.counts;
  const allZero =
    counts !== undefined &&
    counts.ready_to_admit === 0 &&
    counts.waiting_list === 0 &&
    counts.conditional_approval === 0 &&
    counts.rejected_total === 0 &&
    counts.overrides_total === 0;

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader title={t('title')} description={t('description')} />

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          icon={ClipboardCheck}
          label={t('kpis.readyToAdmit')}
          value={counts?.ready_to_admit}
          isLoading={isLoading}
          accent="text-amber-700"
        />
        <KpiTile
          icon={Users}
          label={t('kpis.waitingList')}
          value={counts?.waiting_list}
          isLoading={isLoading}
          accent="text-sky-700"
        />
        <KpiTile
          icon={Clock}
          label={t('kpis.conditionalApproval')}
          value={counts?.conditional_approval}
          isLoading={isLoading}
          accent="text-violet-700"
        />
        <KpiTile
          icon={CheckCircle2}
          label={t('kpis.approvedThisMonth')}
          value={counts?.approved_this_month}
          isLoading={isLoading}
          accent="text-emerald-700"
        />
        <KpiTile
          icon={XCircle}
          label={t('kpis.rejectedThisMonth')}
          value={counts?.rejected_this_month}
          isLoading={isLoading}
          accent="text-rose-700"
        />
      </section>

      {/* Card grid */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-label={t('cardsAria')}>
        {isLoading && summary === null ? (
          <>
            {visibleCards.map((card) => (
              <CardSkeleton key={`skeleton-${card.key}`} />
            ))}
          </>
        ) : (
          visibleCards.map((card) => {
            const Icon = card.icon;
            const { primary, secondary } = describeCard(card.key, counts, t);
            const showAttention =
              card.key === 'conditionalApproval' &&
              (counts?.conditional_approval_near_expiry ?? 0) > 0;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => router.push(`/${locale}${card.href}`)}
                className="group relative flex min-w-0 flex-col gap-6 overflow-hidden rounded-3xl border border-border bg-surface p-7 text-start shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:p-8"
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${card.accent}`}
                />
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.glow} to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                />

                <div className="relative flex items-start justify-between gap-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ring-black/5 ${card.iconBg}`}
                  >
                    <Icon className="h-7 w-7" />
                  </div>
                  <div className="flex items-center gap-2">
                    {showAttention ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                        <AlertTriangle className="h-3 w-3" />
                        {t('cards.conditionalApproval.nearExpiry', {
                          count: counts?.conditional_approval_near_expiry ?? 0,
                        })}
                      </span>
                    ) : null}
                    <ArrowRight className="h-5 w-5 text-text-tertiary transition-colors duration-300 group-hover:text-primary-600 rtl:rotate-180" />
                  </div>
                </div>

                <div className="relative min-w-0 space-y-2">
                  <h3 className="text-xl font-semibold tracking-tight text-text-primary">
                    {t(`cards.${card.key}.title`)}
                  </h3>
                  <p className="text-sm leading-relaxed text-text-tertiary">{primary}</p>
                  {secondary ? (
                    <p className="text-xs leading-relaxed text-text-tertiary/80">{secondary}</p>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </section>

      {allZero ? (
        <section className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
          <ClipboardList className="mx-auto mb-4 h-10 w-10 text-text-tertiary" />
          <h3 className="text-lg font-semibold text-text-primary">{t('empty.title')}</h3>
          <p className="mt-1 text-sm text-text-tertiary">{t('empty.description')}</p>
        </section>
      ) : null}

      {/* Capacity pressure table */}
      {summary && summary.capacity_pressure.length > 0 ? (
        <section className="hidden rounded-3xl border border-border bg-surface p-6 shadow-sm md:block">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-text-primary">
              {t('capacityPressure.title')}
            </h3>
            <p className="text-sm text-text-tertiary">{t('capacityPressure.subtitle')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-text-tertiary">
                  <th className="py-2 pe-3 text-start font-medium">
                    {t('capacityPressure.headerYearGroup')}
                  </th>
                  <th className="py-2 pe-3 text-start font-medium">
                    {t('capacityPressure.headerWaiting')}
                  </th>
                  <th className="py-2 text-start font-medium">
                    {t('capacityPressure.headerCapacity')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.capacity_pressure.map((row) => (
                  <tr key={row.year_group_id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pe-3 font-medium text-text-primary">
                      {row.year_group_name}
                    </td>
                    <td className="py-2 pe-3 text-text-secondary">{row.waiting_list_count}</td>
                    <td className="py-2 font-mono text-xs text-text-secondary">
                      {row.total_capacity} / {row.enrolled_count} / {row.conditional_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  isLoading: boolean;
  accent: string;
}

function KpiTile({ icon: Icon, label, value, isLoading, accent }: KpiTileProps) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <Icon className={`h-5 w-5 shrink-0 ${accent}`} />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium uppercase tracking-wide text-text-tertiary">
          {label}
        </div>
        {isLoading || value === undefined ? (
          <div className="mt-1 h-6 w-10 animate-pulse rounded bg-border/60" />
        ) : (
          <div className="text-2xl font-semibold text-text-primary">{value}</div>
        )}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-6 rounded-3xl border border-border bg-surface p-7">
      <div className="h-14 w-14 animate-pulse rounded-2xl bg-border/60" />
      <div className="space-y-2">
        <div className="h-5 w-1/3 animate-pulse rounded bg-border/60" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-border/60" />
      </div>
    </div>
  );
}

function describeCard(
  key: CardConfig['key'],
  counts: DashboardSummary['counts'] | undefined,
  t: ReturnType<typeof useTranslations>,
): { primary: string; secondary: string | null } {
  if (!counts) {
    return { primary: '', secondary: null };
  }

  switch (key) {
    case 'readyToAdmit': {
      const count = counts.ready_to_admit;
      return {
        primary:
          count === 0
            ? t('cards.readyToAdmit.zero')
            : t('cards.readyToAdmit.description', { count }),
        secondary: null,
      };
    }
    case 'waitingList': {
      const count = counts.waiting_list;
      const awaiting = counts.waiting_list_awaiting_year_setup;
      return {
        primary:
          count === 0 ? t('cards.waitingList.zero') : t('cards.waitingList.description', { count }),
        secondary:
          awaiting > 0 ? t('cards.waitingList.awaitingYearSetup', { count: awaiting }) : null,
      };
    }
    case 'conditionalApproval': {
      const count = counts.conditional_approval;
      return {
        primary:
          count === 0
            ? t('cards.conditionalApproval.zero')
            : t('cards.conditionalApproval.description', { count }),
        secondary: null,
      };
    }
    case 'rejected': {
      const count = counts.rejected_total;
      return {
        primary:
          count === 0 ? t('cards.rejected.zero') : t('cards.rejected.description', { count }),
        secondary: null,
      };
    }
    case 'formPreview':
      return { primary: t('cards.formPreview.description'), secondary: null };
    case 'overrides': {
      const count = counts.overrides_total;
      return {
        primary:
          count === 0 ? t('cards.overrides.zero') : t('cards.overrides.description', { count }),
        secondary: null,
      };
    }
    case 'settings':
      return { primary: t('cards.settings.description'), secondary: null };
  }
}
