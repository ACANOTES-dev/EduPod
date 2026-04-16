'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicPeriod {
  id: string;
  name: string;
}

// These shapes mirror the backend's ReportCardDashboard and
// ClassComparisonEntry in report-card-analytics.service.ts. If the backend
// types change, update these to match and keep the JSX in sync.
interface AnalyticsSummary {
  period_id: string | null;
  total: number;
  published: number;
  draft: number;
  revised: number;
  pending_approval: number;
  completion_rate: number;
  /** @deprecated — see overall/subject counters below. */
  comment_fill_rate: number;
  overall_comments_finalised: number;
  overall_comments_total: number;
  subject_comments_finalised: number;
  subject_comments_total: number;
}

interface ClassComparisonItem {
  class_id: string;
  class_name: string;
  student_count: number;
  average_grade: number;
  published_count: number;
  completion_rate: number;
}

interface TrendItem {
  period_name: string;
  avg_score: number;
  completion_pct: number;
}

interface AnalyticsCombined {
  summary: AnalyticsSummary;
  class_comparison: ClassComparisonItem[];
  trends: TrendItem[];
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Sentinel value used in the period selector to mean "no period filter".
// The dashboard hands us UUIDs or the `'full_year'` literal via the
// `academic_period_id` query param; we keep the literal so the user lands
// on the exact same scope they had on the dashboard snapshot.
const ALL_PERIODS = 'all';
const FULL_YEAR_PERIOD_ID = 'full_year';

export default function ReportCardAnalyticsPage() {
  const t = useTranslations('reportCards');
  const tc = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const { roleKeys } = useRoleCheck();

  const isAdmin = React.useMemo(
    () => roleKeys.some((role) => ADMIN_ROLES.includes(role)),
    [roleKeys],
  );

  // Redirect non-admins away from analytics.
  React.useEffect(() => {
    if (roleKeys.length === 0) return;
    if (!isAdmin) {
      toast.error(t('permissionDenied'));
      router.replace(`/${locale}/report-cards`);
    }
  }, [isAdmin, locale, roleKeys.length, router, t]);

  // Initial period comes from the URL so navigating in from the dashboard
  // keeps the exact scope the user was looking at. Accepts a UUID or the
  // `'full_year'` literal; anything else falls back to "all periods".
  const initialPeriod = searchParams?.get('academic_period_id') ?? ALL_PERIODS;
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = React.useState(initialPeriod);
  const [analytics, setAnalytics] = React.useState<AnalyticsCombined | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch((err) => {
        console.error('[ReportCardsAnalyticsPage]', err);
      });
  }, []);

  // Backend exposes TWO separate endpoints: /analytics/dashboard and
  // /analytics/class-comparison. There is no combined endpoint and no trends
  // endpoint — the latter is a planned feature, so the trends array degrades
  // gracefully to empty and the trend chart simply doesn't render.
  //
  // class-comparison is inherently per-period and throws 500 when called with
  // no period id, so we only fetch it when a specific period is selected.
  // Each fetch is independent via allSettled — one failing never blocks the
  // other from rendering.
  const fetchAnalytics = React.useCallback(async (periodId: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (periodId !== ALL_PERIODS) params.set('academic_period_id', periodId);
      const qs = params.toString();
      const qsSuffix = qs.length > 0 ? `?${qs}` : '';

      const dashboardPromise = apiClient<{ data: AnalyticsSummary }>(
        `/api/v1/report-cards/analytics/dashboard${qsSuffix}`,
      );
      // Always fetch class-comparison. When "all periods" is selected, use
      // the 'full_year' sentinel so the backend returns full-year report cards.
      const comparisonParams = new URLSearchParams();
      if (periodId !== ALL_PERIODS) {
        comparisonParams.set('academic_period_id', periodId);
      } else {
        comparisonParams.set('academic_period_id', 'full_year');
      }
      const comparisonPromise = apiClient<{ data: ClassComparisonItem[] }>(
        `/api/v1/report-cards/analytics/class-comparison?${comparisonParams.toString()}`,
      );

      const [dashboardResult, comparisonResult] = await Promise.allSettled([
        dashboardPromise,
        comparisonPromise,
      ]);

      if (dashboardResult.status === 'rejected') {
        console.error('[ReportCardsAnalyticsPage] dashboard', dashboardResult.reason);
        setAnalytics(null);
        return;
      }
      if (comparisonResult.status === 'rejected') {
        console.error('[ReportCardsAnalyticsPage] class-comparison', comparisonResult.reason);
      }

      setAnalytics({
        summary: dashboardResult.value.data,
        class_comparison:
          comparisonResult.status === 'fulfilled' ? (comparisonResult.value.data ?? []) : [],
        trends: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAnalytics(selectedPeriod);
  }, [selectedPeriod, fetchAnalytics]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('analyticsTitle')}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${locale}/report-cards`)}
            className="min-h-11"
          >
            <ArrowLeft className="me-1.5 h-4 w-4" aria-hidden="true" />
            {t('backToReportCards')}
          </Button>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Select
          value={selectedPeriod}
          onValueChange={(v) => {
            setSelectedPeriod(v);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('selectPeriod')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PERIODS}>{t('allPeriods')}</SelectItem>
            <SelectItem value={FULL_YEAR_PERIOD_ID}>{t('dashboard.fullYearLabel')}</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
          <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
        </div>
      ) : !analytics ? (
        <div className="py-12 text-center text-sm text-text-tertiary">{tc('noResults')}</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label={t('total')} value={analytics.summary.total} />
            <SummaryCard
              label={t('statusPublished')}
              value={analytics.summary.published}
              variant="success"
            />
            <SummaryCard label={t('statusDraft')} value={analytics.summary.draft} variant="info" />
            <SummaryCard
              label={t('completionRate')}
              value={`${(analytics.summary.completion_rate ?? 0).toFixed(1)}%`}
              variant="info"
            />
            <SummaryCard
              label={t('dashboard.analyticsOverallComments')}
              value={`${analytics.summary.overall_comments_finalised} / ${analytics.summary.overall_comments_total}`}
              variant="info"
            />
            <SummaryCard
              label={t('dashboard.analyticsSubjectComments')}
              value={`${analytics.summary.subject_comments_finalised} / ${analytics.summary.subject_comments_total}`}
              variant="info"
            />
          </div>

          {/* Class comparison chart */}
          {analytics.class_comparison.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('classComparison')}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analytics.class_comparison}
                    margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="class_name"
                      tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="average_grade"
                      name={t('avgScore')}
                      fill="var(--color-primary-500)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="published_count"
                      name={t('statusPublished')}
                      fill="var(--color-success-500)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Per-class generation progress — answers the "am I done with
              this class?" question more directly than the chart above. */}
          {analytics.class_comparison.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('analyticsPerClassProgress')}
              </h3>
              <div className="space-y-3">
                {analytics.class_comparison.map((cls) => {
                  const pct = Math.min(100, Math.round(cls.completion_rate));
                  return (
                    <div key={cls.class_id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-text-primary">{cls.class_name}</span>
                        <span className="tabular-nums text-text-secondary">
                          {cls.published_count} / {cls.student_count} · {pct}%
                        </span>
                      </div>
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trend chart */}
          {analytics.trends.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('termOverTermTrends')}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={analytics.trends}
                    margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="period_name"
                      tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="avg_score"
                      name={t('avgScore')}
                      stroke="var(--color-primary-500)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="completion_pct"
                      name={t('completionRate')}
                      stroke="var(--color-success-500)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: number | string;
  variant?: 'neutral' | 'success' | 'warning' | 'info';
}) {
  const colorMap: Record<string, string> = {
    neutral: 'text-text-primary',
    success: 'text-success-700',
    warning: 'text-warning-700',
    info: 'text-primary-700',
  };
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className={`mt-1 text-xl font-bold sm:text-2xl ${colorMap[variant]}`}>{value}</p>
    </div>
  );
}
