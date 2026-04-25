'use client';

import {
  AlertOctagon,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Calendar,
  Clock,
  DollarSign,
  Download,
  FileBadge,
  FileText,
  GraduationCap,
  LayoutDashboard,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { KpiDashboardResponse } from '@school/shared/reports';
import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { AiSummaryPanel } from './_components/ai-summary-panel';
import {
  BuilderHeroTile,
  ReportGroup,
  type QuickLink,
  type ReportGroupConfig,
} from './_components/hub-layout';
import { KpiCard } from './_components/kpi-card';

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardData = KpiDashboardResponse['data'];

interface DashboardError {
  code: string;
  message: string;
}

// ─── Group: Analytics dashboards ──────────────────────────────────────────────

const ANALYTICS_LINKS: ReadonlyArray<QuickLink> = [
  {
    icon: GraduationCap,
    labelKey: 'analytics.attendanceAnalytics',
    descKey: 'attendanceAnalyticsDesc',
    href: '/reports/attendance',
    color: 'text-blue-600',
  },
  {
    icon: BookOpen,
    labelKey: 'analytics.gradeAnalytics',
    descKey: 'gradeAnalyticsDesc',
    href: '/reports/grades',
    color: 'text-emerald-600',
  },
  {
    icon: TrendingUp,
    labelKey: 'analytics.studentProgress',
    descKey: 'studentProgressDesc',
    href: '/reports/student-progress',
    color: 'text-indigo-600',
  },
  {
    icon: Users,
    labelKey: 'analytics.demographics',
    descKey: 'demographicsDesc',
    href: '/reports/demographics',
    color: 'text-purple-600',
  },
  {
    icon: UserCheck,
    labelKey: 'analytics.admissions',
    descKey: 'admissionsDesc',
    href: '/reports/admissions',
    color: 'text-pink-600',
  },
  {
    icon: BarChart3,
    labelKey: 'analytics.staff',
    descKey: 'staffDesc',
    href: '/reports/staff',
    color: 'text-orange-600',
  },
  {
    icon: Brain,
    labelKey: 'analytics.insights',
    descKey: 'insightsDesc',
    href: '/reports/insights',
    color: 'text-violet-600',
  },
];

// ─── Group: Governance & compliance ──────────────────────────────────────────

const GOVERNANCE_LINKS: ReadonlyArray<QuickLink> = [
  {
    icon: FileText,
    labelKey: 'analytics.boardReport',
    descKey: 'boardReportDesc',
    href: '/reports/board',
    color: 'text-sky-600',
  },
  {
    icon: FileBadge,
    labelKey: 'analytics.compliance',
    descKey: 'complianceDesc',
    href: '/reports/compliance',
    color: 'text-teal-600',
  },
  {
    icon: Download,
    labelKey: 'analytics.studentExport',
    descKey: 'studentExportDesc',
    href: '/reports/student-export',
    color: 'text-gray-600',
  },
  {
    icon: DollarSign,
    labelKey: 'analytics.writeOffs',
    descKey: 'writeOffsDesc',
    href: '/reports/write-offs',
    color: 'text-yellow-600',
  },
];

// ─── Group: Automation & delivery ────────────────────────────────────────────

const AUTOMATION_LINKS: ReadonlyArray<QuickLink> = [
  {
    icon: Calendar,
    labelKey: 'analytics.scheduled',
    descKey: 'scheduledDesc',
    href: '/reports/scheduled',
    color: 'text-emerald-700',
  },
  {
    icon: Bell,
    labelKey: 'analytics.alerts',
    descKey: 'alertsDesc',
    href: '/reports/alerts',
    color: 'text-amber-600',
  },
  {
    icon: Clock,
    labelKey: 'analytics.notificationDelivery',
    descKey: 'notificationDeliveryDesc',
    href: '/reports/notification-delivery',
    color: 'text-slate-600',
  },
];

const REPORT_GROUPS: ReadonlyArray<ReportGroupConfig> = [
  {
    headingKey: 'analytics.groupAnalyticsTitle',
    hintKey: 'analytics.groupAnalyticsHint',
    links: ANALYTICS_LINKS,
  },
  {
    headingKey: 'analytics.groupGovernanceTitle',
    hintKey: 'analytics.groupGovernanceHint',
    links: GOVERNANCE_LINKS,
  },
  {
    headingKey: 'analytics.groupAutomationTitle',
    hintKey: 'analytics.groupAutomationHint',
    links: AUTOMATION_LINKS,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function ReportsHubPage() {
  const t = useTranslations('reports');

  const [data, setData] = React.useState<DashboardData | null>(null);
  const [error, setError] = React.useState<DashboardError | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);
  const [cacheHit, setCacheHit] = React.useState<boolean>(false);

  const fetchData = React.useCallback(
    (opts: { silentRefresh?: boolean } = {}) => {
      if (!opts.silentRefresh) setLoading(true);
      setError(null);
      apiClient<KpiDashboardResponse>('/api/v1/reports/analytics/dashboard', {
        // Suppress the global error toast — we render an inline error card
        // instead so the dashboard stays explanatory rather than alarming.
        silent: true,
      })
        .then((res) => {
          setData(res.data);
          setCacheHit(Boolean(res.meta?.cache_hit));
          setLastRefresh(new Date());
        })
        .catch((err: unknown) => {
          console.error('[ReportsHubPage]', err);
          const code = extractErrorCode(err);
          const message = extractErrorMessage(err);
          setError({
            code: code || 'UNKNOWN',
            message: message || t('analytics.loadErrorBody'),
          });
          // Important: per impl 14 spec, NO mock fallback. We leave the
          // previous `data` snapshot in place if there was one so the
          // user can still see numbers if a refresh fails — but on first
          // load the dashboard shows the error card with retry, never
          // fake numbers like 195 / 93 / 75.
        })
        .finally(() => setLoading(false));
    },
    [t],
  );

  React.useEffect(() => {
    fetchData();
    const interval = window.setInterval(
      () => fetchData({ silentRefresh: true }),
      REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = React.useCallback(() => {
    fetchData();
  }, [fetchData]);

  return (
    // `mx-auto max-w-content` keeps the page centred on wide displays so the
    // last row of report tiles doesn't visually press into the browser edge.
    // Same wrapper convention `attendance` and other report pages already use.
    <div className="mx-auto max-w-content">
      <div className="space-y-8">
        <PageHeader
          title={t('analytics.dashboardTitle')}
          description={t('analytics.dashboardDescription')}
          actions={
            <DashboardHeaderActions
              loading={loading}
              lastRefresh={lastRefresh}
              cacheHit={cacheHit}
              onRefresh={handleRefresh}
            />
          }
        />

        {/* AI summary — hides itself when the tenant flag is off. */}
        <AiSummaryPanel mode={{ kind: 'dashboard' }} />

        {error && !data ? (
          <DashboardErrorCard error={error} onRetry={handleRefresh} loading={loading} />
        ) : null}

        <section>
          <h2 className="mb-4 text-base font-semibold text-text-primary">
            {t('analytics.kpiTitle')}
          </h2>
          {loading && !data ? <KpiSkeletonGrid /> : data ? <KpiGrid kpis={data.kpis} /> : null}
          {error && data ? (
            // We had data once but the latest refresh failed — show a small
            // banner above the still-rendered cards so the user knows the
            // numbers are stale. No silent mock fallback.
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              {t('analytics.staleData')}
            </div>
          ) : null}
        </section>

        {/* Hero: Build your own — Report Builder + Ask AI featured prominently */}
        <BuilderHero />

        {data ? <TrendsChart trends={data.trends} /> : null}

        <div className="space-y-8">
          {REPORT_GROUPS.map((group) => (
            <ReportGroup
              key={group.headingKey}
              headingKey={group.headingKey}
              hintKey={group.hintKey}
              links={group.links}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Header actions ───────────────────────────────────────────────────────────

interface DashboardHeaderActionsProps {
  loading: boolean;
  lastRefresh: Date | null;
  cacheHit: boolean;
  onRefresh: () => void;
}

function DashboardHeaderActions({
  loading,
  lastRefresh,
  cacheHit,
  onRefresh,
}: DashboardHeaderActionsProps) {
  const t = useTranslations('reports');
  return (
    <div className="flex items-center gap-2">
      {lastRefresh && (
        <span className="hidden text-xs text-text-tertiary sm:inline">
          {t('analytics.lastRefresh')} {lastRefresh.toLocaleTimeString()}
          {cacheHit ? ` · ${t('analytics.cached')}` : ''}
        </span>
      )}
      <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={`me-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        {t('analytics.refresh')}
      </Button>
    </div>
  );
}

// ─── KPI grid ─────────────────────────────────────────────────────────────────

function KpiGrid({ kpis }: { kpis: DashboardData['kpis'] }) {
  if (kpis.length === 0) {
    return <KpiEmptyState />;
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
}

function KpiSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-xl border border-border bg-surface-secondary"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function KpiEmptyState() {
  const t = useTranslations('reports');
  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-center">
      <p className="text-sm text-text-secondary">{t('analytics.allKpisHidden')}</p>
      <Link
        href="/settings/reports"
        className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
      >
        {t('analytics.manageKpis')}
      </Link>
    </div>
  );
}

// ─── Error card ───────────────────────────────────────────────────────────────

interface DashboardErrorCardProps {
  error: DashboardError;
  onRetry: () => void;
  loading: boolean;
}

function DashboardErrorCard({ error, onRetry, loading }: DashboardErrorCardProps) {
  const t = useTranslations('reports');
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
      <div className="flex items-start gap-3">
        <AlertOctagon
          className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
        <div className="flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">
            {t('analytics.loadErrorTitle')}
          </h3>
          <p className="text-sm text-red-800 dark:text-red-200">{t('analytics.loadErrorBody')}</p>
          <p className="text-xs text-red-700/80 dark:text-red-300/80">
            {t('analytics.loadErrorCode')}: <code className="font-mono">{error.code}</code>
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={loading}
            className="border-red-200 bg-white text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
          >
            <RefreshCw
              className={`me-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {t('analytics.retry')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Builder hero ─────────────────────────────────────────────────────────────

function BuilderHero() {
  const t = useTranslations('reports');
  return (
    <section aria-labelledby="reports-build-heading" className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2
          id="reports-build-heading"
          className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary"
        >
          {t('analytics.buildYourOwn')}
        </h2>
        <p className="hidden text-xs text-text-tertiary sm:block">
          {t('analytics.buildYourOwnHint')}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BuilderHeroTile
          href="/reports/builder"
          icon={LayoutDashboard}
          title={t('analytics.builder')}
          description={t('builderDesc')}
          ctaLabel={t('analytics.openBuilder')}
          accent="cyan"
        />
        <BuilderHeroTile
          href="/reports/ask-ai"
          icon={Bot}
          title={t('analytics.askAi')}
          description={t('askAiDesc')}
          ctaLabel={t('analytics.tryAskAi')}
          accent="rose"
          decoration={Sparkles}
        />
      </div>
    </section>
  );
}

// ─── Trends chart ─────────────────────────────────────────────────────────────

function TrendsChart({ trends }: { trends: DashboardData['trends'] }) {
  const t = useTranslations('reports');
  const series = React.useMemo(() => buildTrendSeries(trends), [trends]);

  if (series.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">{t('analytics.trendTitle')}</h2>
        <div className="flex items-center gap-4 text-xs text-text-tertiary">
          <LegendDot color="bg-blue-500" label={t('analytics.kpi.attendanceRate')} />
          <LegendDot color="bg-violet-500" label={t('analytics.kpi.averageGrade')} />
          <LegendDot color="bg-amber-500" label={t('analytics.kpi.collectionRate')} />
        </div>
      </div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={[...series]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="reportsHubAttendance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="reportsHubGrades" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="reportsHubCollection" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" className="text-xs fill-text-tertiary" />
            <YAxis domain={[0, 100]} className="text-xs fill-text-tertiary" />
            <Tooltip
              contentStyle={{
                fontSize: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}
            />
            <Area
              type="monotone"
              dataKey="attendance"
              name={t('analytics.kpi.attendanceRate')}
              stroke="#3b82f6"
              fill="url(#reportsHubAttendance)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="grades"
              name={t('analytics.kpi.averageGrade')}
              stroke="#8b5cf6"
              fill="url(#reportsHubGrades)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="collection"
              name={t('analytics.kpi.collectionRate')}
              stroke="#f59e0b"
              fill="url(#reportsHubCollection)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2 w-4 rounded ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

interface TrendPoint {
  label: string;
  attendance: number;
  grades: number;
  collection: number;
}

/**
 * Pivot the columnar trends payload (`weeks[]`, `attendance[]`,
 * `grades[]`, `collection[]`) into per-row points Recharts expects.
 * Treats short / missing arrays defensively — better to drop a column
 * than crash the chart.
 */
function buildTrendSeries(trends: DashboardData['trends']): ReadonlyArray<TrendPoint> {
  const weeks = Array.isArray(trends.weeks) ? trends.weeks : [];
  const attendance = Array.isArray(trends.attendance) ? trends.attendance : [];
  const grades = Array.isArray(trends.grades) ? trends.grades : [];
  const collection = Array.isArray(trends.collection) ? trends.collection : [];

  return weeks.map((iso, index) => ({
    label: formatWeekLabel(iso),
    attendance: attendance[index] ?? 0,
    grades: grades[index] ?? 0,
    collection: collection[index] ?? 0,
  }));
}

/**
 * Convert an ISO date (week-start) into a short axis label like "Apr 19".
 * Falls back to the raw string on parse failure — better to display the
 * ISO date than crash.
 */
function formatWeekLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'error' in err) {
    return (err as { error?: { code?: string } }).error?.code ?? '';
  }
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as { code?: string }).code ?? '';
  }
  return '';
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'error' in err) {
    return (err as { error?: { message?: string } }).error?.message ?? '';
  }
  if (err instanceof Error) return err.message;
  return '';
}
