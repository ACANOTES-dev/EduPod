'use client';

import { Button, StatCard } from '@school/ui';
import { Activity, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { IncidentCard, type IncidentCardData } from '@/components/behaviour/incident-card';
import { QuickLogFab } from '@/components/behaviour/quick-log-fab';
import { QuickLogSheet } from '@/components/behaviour/quick-log-sheet';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedResponse {
  data: IncidentCardData[];
  meta: { total: number };
}

interface TaskStats {
  data: {
    pending: number;
    overdue: number;
    completed_today: number;
  };
}

interface PulseStats {
  data: {
    total_incidents: number;
    positive_count: number;
    negative_count: number;
    open_tasks: number;
    overdue_tasks: number;
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourDashboardPage() {
  const t = useTranslations('behaviour.dashboard');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [feed, setFeed] = React.useState<IncidentCardData[]>([]);
  const [feedLoading, setFeedLoading] = React.useState(true);
  const [stats, setStats] = React.useState({
    total_incidents: 0,
    positive_count: 0,
    negative_count: 0,
    open_tasks: 0,
    overdue_tasks: 0,
  });
  const [quickLogOpen, setQuickLogOpen] = React.useState(false);

  React.useEffect(() => {
    setFeedLoading(true);
    apiClient<FeedResponse>('/api/v1/behaviour/incidents?pageSize=10&sort=occurred_at&order=desc')
      .then((res) => setFeed(res.data ?? []))
      .catch(() => setFeed([]))
      .finally(() => setFeedLoading(false));

    apiClient<PulseStats>('/api/v1/behaviour/incidents/stats')
      .then((res) => {
        if (res.data) setStats(res.data);
      })
      .catch(() => undefined);

    apiClient<TaskStats>('/api/v1/behaviour/tasks/stats')
      .then((res) => {
        if (res.data) {
          setStats((prev) => ({
            ...prev,
            open_tasks: res.data.pending,
            overdue_tasks: res.data.overdue,
          }));
        }
      })
      .catch(() => undefined);
  }, []);

  const ratio = stats.negative_count > 0
    ? (stats.positive_count / stats.negative_count).toFixed(1)
    : stats.positive_count > 0 ? t('allPositive') : '0';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href={`/${locale}/behaviour/incidents/new`}>
            <Button>{t('logIncident')}</Button>
          </Link>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t('stats.totalIncidents')}
          value={stats.total_incidents}
          className="border border-border"
        />
        <StatCard
          label={t('stats.positiveNegative')}
          value={typeof ratio === 'string' ? ratio : `${ratio}:1`}
          className="border border-border"
        />
        <StatCard
          label={t('stats.openTasks')}
          value={stats.open_tasks}
          className="border border-border"
        />
        <StatCard
          label={t('stats.overdue')}
          value={stats.overdue_tasks}
          trend={stats.overdue_tasks > 0 ? { direction: 'up', label: t('stats.needsAttention') } : undefined}
          className="border border-border"
        />
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href={`/${locale}/behaviour/incidents`}>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary">
            <Activity className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium text-text-primary">{t('quickActions.allIncidents')}</span>
          </div>
        </Link>
        <Link href={`/${locale}/behaviour/students`}>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary">
            <TrendingUp className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-text-primary">{t('quickActions.students')}</span>
          </div>
        </Link>
        <Link href={`/${locale}/behaviour/tasks`}>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary">
            <CheckCircle className="h-5 w-5 text-purple-500" />
            <span className="text-sm font-medium text-text-primary">{t('quickActions.tasks')}</span>
          </div>
        </Link>
        <Link href={`/${locale}/behaviour/incidents?tab=escalated`}>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-text-primary">{t('quickActions.escalated')}</span>
          </div>
        </Link>
      </div>

      {/* Recent Feed */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">{t('recentActivity')}</h2>
          <Link href={`/${locale}/behaviour/incidents`} className="text-sm font-medium text-primary-600 hover:underline">
            {t('viewAll')}
          </Link>
        </div>

        {feedLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
            ))}
          </div>
        ) : feed.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface py-12 text-center">
            <Activity className="mx-auto h-8 w-8 text-text-tertiary" />
            <p className="mt-2 text-sm text-text-tertiary">{t('noRecentIncidents')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {feed.map((incident) => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                onClick={() => { window.location.href = `/${locale}/behaviour/incidents/${incident.id}`; }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Log FAB + Sheet */}
      <QuickLogFab onClick={() => setQuickLogOpen(true)} />
      <QuickLogSheet open={quickLogOpen} onOpenChange={setQuickLogOpen} />
    </div>
  );
}
