'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { StatCard } from '@school/ui';

import { ComplianceStatusCard } from './_components/compliance-status-card';
import { DeadlineTimeline } from './_components/deadline-timeline';
import { RegulatoryNav } from './_components/regulatory-nav';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';


// ─── Types ───────────────────────────────────────────────────────────────────

interface NextDeadline {
  id: string;
  title: string;
  domain: string;
  due_date: string;
}

interface DashboardSummary {
  calendar: {
    upcoming_deadlines: number;
    overdue: number;
    next_deadline: NextDeadline | null;
  };
  tusla: {
    students_approaching_threshold: number;
    students_exceeded_threshold: number;
    active_alerts: number;
  };
  des: {
    readiness_status: 'not_started' | 'incomplete' | 'ready';
    recent_submissions: number;
  };
  october_returns: {
    readiness_status: 'not_started' | 'incomplete' | 'ready';
  };
  ppod: {
    synced: number;
    pending: number;
    errors: number;
    last_sync_at: string | null;
  };
  cba: {
    pending_sync: number;
    synced: number;
    last_sync_at: string | null;
  };
}

interface OverdueItem {
  id: string;
  type: string;
  title: string;
  domain: string;
  due_date: string;
  days_overdue: number;
}

// ─── Readiness Helpers ───────────────────────────────────────────────────────

type ReadinessStatus = 'not_started' | 'incomplete' | 'ready';

function readinessVariant(status: ReadinessStatus): 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'ready':
      return 'success';
    case 'incomplete':
      return 'warning';
    case 'not_started':
      return 'danger';
  }
}

function readinessLabel(status: ReadinessStatus, t: (key: string) => string): string {
  switch (status) {
    case 'ready':
      return t('dashboard.statusReady');
    case 'incomplete':
      return t('dashboard.statusIncomplete');
    case 'not_started':
      return t('dashboard.statusNotStarted');
  }
}

// ─── Skeleton Components ─────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface-secondary p-5">
      <div className="h-3 w-20 rounded bg-border" />
      <div className="mt-3 h-7 w-16 rounded bg-border" />
    </div>
  );
}

function ComplianceCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface-secondary p-5">
      <div className="h-4 w-32 rounded bg-border" />
      <div className="mt-4 space-y-3">
        <div className="flex justify-between">
          <div className="h-3 w-24 rounded bg-border" />
          <div className="h-3 w-12 rounded bg-border" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-20 rounded bg-border" />
          <div className="h-3 w-8 rounded bg-border" />
        </div>
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface-secondary p-5">
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-border" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-border" />
              <div className="h-3 w-24 rounded bg-border" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RegulatoryDashboardPage() {
  const t = useTranslations('regulatory');

  const [summary, setSummary] = React.useState<DashboardSummary | null>(null);
  const [overdueItems, setOverdueItems] = React.useState<OverdueItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [dashboardRes, overdueRes] = await Promise.all([
        apiClient<DashboardSummary>('/api/v1/regulatory/dashboard'),
        apiClient<OverdueItem[]>('/api/v1/regulatory/dashboard/overdue'),
      ]);
      setSummary(dashboardRes);
      setOverdueItems(overdueRes);
    } catch (err) {
      console.error('[RegulatoryDashboardPage]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('dashboard.description')} />

      <RegulatoryNav />

      {/* ─── Top Stat Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label={t('dashboard.upcomingDeadlines')}
              value={summary?.calendar.upcoming_deadlines ?? 0}
            />
            <StatCard
              label={t('dashboard.overdueItems')}
              value={summary?.calendar.overdue ?? 0}
              trend={
                summary && summary.calendar.overdue > 0
                  ? { direction: 'down', label: t('dashboard.requiresAttention') }
                  : undefined
              }
            />
            <StatCard
              label={t('dashboard.nextDeadline')}
              value={
                summary?.calendar.next_deadline
                  ? formatDate(summary.calendar.next_deadline.due_date)
                  : t('dashboard.none')
              }
            />
          </>
        )}
      </div>

      {/* ─── Compliance Status Cards ──────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {t('dashboard.complianceStatus')}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <>
              <ComplianceCardSkeleton />
              <ComplianceCardSkeleton />
              <ComplianceCardSkeleton />
              <ComplianceCardSkeleton />
              <ComplianceCardSkeleton />
            </>
          ) : summary ? (
            <>
              {/* Tusla Attendance */}
              <ComplianceStatusCard
                title={t('dashboard.tuslaAttendance')}
                items={[
                  {
                    label: t('dashboard.approachingThreshold'),
                    value: summary.tusla.students_approaching_threshold,
                    variant:
                      summary.tusla.students_approaching_threshold > 0 ? 'warning' : 'success',
                  },
                  {
                    label: t('dashboard.exceededThreshold'),
                    value: summary.tusla.students_exceeded_threshold,
                    variant: summary.tusla.students_exceeded_threshold > 0 ? 'danger' : 'success',
                  },
                  {
                    label: t('dashboard.activeAlerts'),
                    value: summary.tusla.active_alerts,
                    variant: summary.tusla.active_alerts > 0 ? 'warning' : 'neutral',
                  },
                ]}
              />

              {/* DES September Returns */}
              <ComplianceStatusCard
                title={t('dashboard.desReturns')}
                items={[
                  {
                    label: t('dashboard.readiness'),
                    value: readinessLabel(summary.des.readiness_status, t),
                    variant: readinessVariant(summary.des.readiness_status),
                  },
                  {
                    label: t('dashboard.recentSubmissions'),
                    value: summary.des.recent_submissions,
                    variant: 'neutral',
                  },
                ]}
              />

              {/* October Returns */}
              <ComplianceStatusCard
                title={t('dashboard.octoberReturns')}
                items={[
                  {
                    label: t('dashboard.readiness'),
                    value: readinessLabel(summary.october_returns.readiness_status, t),
                    variant: readinessVariant(summary.october_returns.readiness_status),
                  },
                ]}
              />

              {/* PPOD Sync */}
              <ComplianceStatusCard
                title={t('dashboard.ppodSync')}
                items={[
                  {
                    label: t('dashboard.synced'),
                    value: summary.ppod.synced,
                    variant: 'success',
                  },
                  {
                    label: t('dashboard.pending'),
                    value: summary.ppod.pending,
                    variant: summary.ppod.pending > 0 ? 'warning' : 'neutral',
                  },
                  {
                    label: t('dashboard.errors'),
                    value: summary.ppod.errors,
                    variant: summary.ppod.errors > 0 ? 'danger' : 'neutral',
                  },
                ]}
                footer={
                  summary.ppod.last_sync_at
                    ? `${t('dashboard.lastSync')}: ${formatDate(summary.ppod.last_sync_at)}`
                    : t('dashboard.neverSynced')
                }
              />

              {/* CBA Sync */}
              <ComplianceStatusCard
                title={t('dashboard.cbaSync')}
                items={[
                  {
                    label: t('dashboard.synced'),
                    value: summary.cba.synced,
                    variant: 'success',
                  },
                  {
                    label: t('dashboard.pendingSync'),
                    value: summary.cba.pending_sync,
                    variant: summary.cba.pending_sync > 0 ? 'warning' : 'neutral',
                  },
                ]}
                footer={
                  summary.cba.last_sync_at
                    ? `${t('dashboard.lastSync')}: ${formatDate(summary.cba.last_sync_at)}`
                    : t('dashboard.neverSynced')
                }
              />
            </>
          ) : null}
        </div>
      </div>

      {/* ─── Overdue Items Timeline ───────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {t('dashboard.overdueItemsTitle')}
        </h2>
        <div className="mt-3">
          {isLoading ? (
            <TimelineSkeleton />
          ) : (
            <DeadlineTimeline items={overdueItems} emptyMessage={t('dashboard.noOverdueItems')} />
          )}
        </div>
      </div>
    </div>
  );
}
