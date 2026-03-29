'use client';

import { Button, StatCard } from '@school/ui';
import {
  Activity,
  ArrowRight,
  ClipboardList,
  ListChecks,
  NotebookPen,
  Send,
  ShieldAlert,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { PastoralSeverityBadge, PastoralTierBadge } from '@/components/pastoral/pastoral-badges';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';
import {
  formatPastoralValue,
  formatShortId,
  getLocaleFromPathname,
  type PastoralApiListResponse,
  type PastoralCaseListItem,
  type PastoralConcernListItem,
} from '@/lib/pastoral';

interface EscalationDashboardResponse {
  data: {
    unacknowledged_urgent: number;
    unacknowledged_critical: number;
    oldest_unacknowledged_urgent: { concern_id: string; created_at: string } | null;
    oldest_unacknowledged_critical: { concern_id: string; created_at: string } | null;
  };
}

const WORKSPACE_LANES = [
  {
    key: 'interventions',
    href: '/pastoral/interventions',
    icon: ListChecks,
  },
  {
    key: 'referrals',
    href: '/pastoral/referrals',
    icon: Send,
  },
  {
    key: 'sst',
    href: '/pastoral/sst',
    icon: Users,
  },
  {
    key: 'checkins',
    href: '/pastoral/checkins',
    icon: Activity,
  },
  {
    key: 'criticalIncidents',
    href: '/pastoral/critical-incidents',
    icon: ShieldAlert,
  },
] as const;

export default function PastoralOverviewPage() {
  const t = useTranslations('pastoral.overview');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const [recentConcerns, setRecentConcerns] = React.useState<PastoralConcernListItem[]>([]);
  const [recentCases, setRecentCases] = React.useState<PastoralCaseListItem[]>([]);
  const [criticalCount, setCriticalCount] = React.useState(0);
  const [urgentCount, setUrgentCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    setIsLoading(true);

    void Promise.allSettled([
      apiClient<PastoralApiListResponse<PastoralConcernListItem>>(
        '/api/v1/pastoral/concerns?page=1&pageSize=6',
        { silent: true },
      ),
      apiClient<PastoralApiListResponse<PastoralCaseListItem>>(
        '/api/v1/pastoral/cases?page=1&pageSize=4',
        { silent: true },
      ),
      apiClient<EscalationDashboardResponse>('/api/v1/pastoral/admin/escalation-dashboard', {
        silent: true,
      }),
    ])
      .then(([concernsResult, casesResult, escalationResult]) => {
        if (cancelled) {
          return;
        }

        if (concernsResult.status === 'fulfilled') {
          setRecentConcerns(concernsResult.value.data ?? []);
        } else {
          setRecentConcerns([]);
        }

        if (casesResult.status === 'fulfilled') {
          setRecentCases(casesResult.value.data ?? []);
        } else {
          setRecentCases([]);
        }

        if (escalationResult.status === 'fulfilled') {
          setCriticalCount(escalationResult.value.data.unacknowledged_critical ?? 0);
          setUrgentCount(escalationResult.value.data.unacknowledged_urgent ?? 0);
        } else {
          setCriticalCount(0);
          setUrgentCount(0);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/${locale}/pastoral/concerns/new`}>
              <Button>
                <NotebookPen className="me-2 h-4 w-4" />
                {t('logConcern')}
              </Button>
            </Link>
            <Link href={`/${locale}/pastoral/cases/new`}>
              <Button variant="outline">{t('openCaseAction')}</Button>
            </Link>
            <Link href={`/${locale}/pastoral/critical-incidents/new`}>
              <Button variant="outline">{t('declareIncidentAction')}</Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard
          label={t('stats.recentConcerns')}
          value={recentConcerns.length}
          className="border-emerald-200 bg-emerald-50/70"
        />
        <StatCard
          label={t('stats.urgentReview')}
          value={urgentCount}
          className="border-amber-200 bg-amber-50/70"
        />
        <StatCard
          label={t('stats.immediateAttention')}
          value={criticalCount}
          className="border-rose-200 bg-rose-50/70"
        />
      </div>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('workflowLanesTitle')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('workflowLanesDescription')}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WORKSPACE_LANES.map((lane) => {
            const Icon = lane.icon;

            return (
              <Link
                key={lane.key}
                href={`/${locale}${lane.href}`}
                className="group rounded-2xl border border-border bg-surface-secondary/50 p-4 transition-colors hover:bg-surface-secondary"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-text-primary">
                      {t(`workflowLanes.items.${lane.key}.title` as never)}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      {t(`workflowLanes.items.${lane.key}.description` as never)}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t('recentConcernsTitle')}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">{t('recentConcernsDescription')}</p>
            </div>
            <Link href={`/${locale}/pastoral/concerns`}>
              <Button variant="ghost" size="sm">
                {t('viewAllConcerns')}
                <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
              </Button>
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
              ))
            ) : recentConcerns.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-tertiary">
                {t('emptyConcerns')}
              </p>
            ) : (
              recentConcerns.map((concern) => (
                <Link
                  key={concern.id}
                  href={`/${locale}/pastoral/concerns/${concern.id}`}
                  className="block rounded-2xl border border-border px-4 py-4 transition-colors hover:bg-surface-secondary"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-text-tertiary">
                          {t('concernRef', { id: formatShortId(concern.id) })}
                        </span>
                        <PastoralSeverityBadge severity={concern.severity} />
                        <PastoralTierBadge tier={concern.tier} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {concern.student_name}
                        </p>
                        <p className="mt-1 text-sm text-text-secondary">
                          {formatPastoralValue(concern.category)}
                        </p>
                      </div>
                      {concern.students_involved.length > 0 ? (
                        <p className="text-xs text-text-tertiary">
                          {t('studentsInvolved', {
                            count: concern.students_involved.length,
                            names: concern.students_involved
                              .slice(0, 2)
                              .map((student) => student.student_name)
                              .join(', '),
                          })}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-xs text-text-tertiary">
                      {formatDateTime(concern.occurred_at)}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-emerald-700" />
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('casePulseTitle')}</h2>
                <p className="text-sm text-text-secondary">{t('casePulseDescription')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {recentCases.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('emptyCases')}
                </p>
              ) : (
                recentCases.map((caseItem) => (
                  <Link
                    key={caseItem.id}
                    href={`/${locale}/pastoral/cases/${caseItem.id}`}
                    className="block rounded-2xl border border-border px-4 py-3 transition-colors hover:bg-surface-secondary"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {caseItem.case_number}
                        </p>
                        <p className="mt-1 text-xs text-text-tertiary">
                          {t('caseSummary', {
                            concerns: caseItem.concern_count,
                            students: caseItem.student_count,
                          })}
                        </p>
                      </div>
                      <span className="text-xs text-text-tertiary">
                        {caseItem.next_review_date
                          ? formatDate(caseItem.next_review_date)
                          : t('reviewNotSet')}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('operatingRulesTitle')}</h2>
            <div className="mt-4 space-y-3 text-sm text-text-secondary">
              <p>{t('operatingRules.concern')}</p>
              <p>{t('operatingRules.case')}</p>
              <p>{t('operatingRules.review')}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
