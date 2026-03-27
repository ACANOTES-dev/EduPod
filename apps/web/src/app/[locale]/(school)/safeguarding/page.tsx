'use client';

import { Button, StatCard } from '@school/ui';
import { AlertTriangle, Clock, FileText, Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { SafeguardingSeverityBadge } from '@/components/behaviour/safeguarding-severity-badge';
import { SafeguardingStatusBadge } from '@/components/behaviour/safeguarding-status-badge';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlaPanel {
  overdue: number;
  due_soon: number;
  on_track: number;
}

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface StatusDistribution {
  status: string;
  count: number;
}

interface RecentActivity {
  id: string;
  concern_number: string;
  concern_type: string;
  severity: string;
  status: string;
  reported_at: string;
  student_name: string;
}

interface DashboardResponse {
  data: {
    sla: SlaPanel;
    severity_counts: SeverityCounts;
    status_distribution: StatusDistribution[];
    recent_activity: RecentActivity[];
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SafeguardingDashboardPage() {
  const t = useTranslations('safeguarding.dashboard');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [sla, setSla] = React.useState<SlaPanel>({ overdue: 0, due_soon: 0, on_track: 0 });
  const [severity, setSeverity] = React.useState<SeverityCounts>({ critical: 0, high: 0, medium: 0, low: 0 });
  const [statusDist, setStatusDist] = React.useState<StatusDistribution[]>([]);
  const [recent, setRecent] = React.useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    setIsLoading(true);
    apiClient<DashboardResponse>('/api/v1/safeguarding/dashboard')
      .then((res) => {
        if (res.data) {
          setSla(res.data.sla);
          setSeverity(res.data.severity_counts);
          setStatusDist(res.data.status_distribution);
          setRecent(res.data.recent_activity);
        }
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href={`/${locale}/safeguarding/concerns/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('reportConcern')}
            </Button>
          </Link>
        }
      />

      {/* SLA Traffic Light Panel */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('sla.overdue')}
          value={sla.overdue}
          className="border-2 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
        />
        <StatCard
          label={t('sla.dueSoon')}
          value={sla.due_soon}
          className="border-2 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
        />
        <StatCard
          label={t('sla.onTrack')}
          value={sla.on_track}
          className="border-2 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
        />
      </div>

      {/* Open by Severity */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          {t('openBySeverity')}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label={t('severities.critical')}
            value={severity.critical}
            className="border border-red-200"
          />
          <StatCard
            label={t('severities.high')}
            value={severity.high}
            className="border border-orange-200"
          />
          <StatCard
            label={t('severities.medium')}
            value={severity.medium}
            className="border border-yellow-200"
          />
          <StatCard
            label={t('severities.low')}
            value={severity.low}
            className="border border-blue-200"
          />
        </div>
      </div>

      {/* Status Distribution */}
      {statusDist.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-text-primary">{t('statusDistribution')}</h2>
          <div className="mt-3 flex flex-wrap gap-4">
            {statusDist.map((s) => (
              <div key={s.status} className="flex items-center gap-2">
                <SafeguardingStatusBadge status={s.status} />
                <span className="text-sm font-semibold text-text-primary">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">{t('recentActivity')}</h2>
          <Link href={`/${locale}/safeguarding/concerns`}>
            <Button variant="ghost" size="sm">
              {t('viewAll')}
            </Button>
          </Link>
        </div>
        <div className="mt-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-tertiary">
              {t('noRecentActivity')}
            </p>
          ) : (
            <div className="space-y-3">
              {recent.map((item) => (
                <Link
                  key={item.id}
                  href={`/${locale}/safeguarding/concerns/${item.id}`}
                  className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-surface-secondary"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-text-tertiary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-text-tertiary">
                        {item.concern_number}
                      </span>
                      <SafeguardingSeverityBadge severity={item.severity} />
                      <SafeguardingStatusBadge status={item.status} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-text-primary">
                      {item.student_name} &mdash; {item.concern_type}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-text-tertiary">
                    {formatDateTime(item.reported_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href={`/${locale}/safeguarding/concerns`}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
        >
          <FileText className="h-5 w-5 text-text-tertiary" />
          <span className="text-sm font-medium text-text-primary">{t('quickLinks.allConcerns')}</span>
        </Link>
        <Link
          href={`/${locale}/safeguarding/my-reports`}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
        >
          <Clock className="h-5 w-5 text-text-tertiary" />
          <span className="text-sm font-medium text-text-primary">{t('quickLinks.myReports')}</span>
        </Link>
        <Link
          href={`/${locale}/safeguarding/concerns/new`}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
        >
          <AlertTriangle className="h-5 w-5 text-text-tertiary" />
          <span className="text-sm font-medium text-text-primary">{t('quickLinks.reportConcern')}</span>
        </Link>
      </div>
    </div>
  );
}
