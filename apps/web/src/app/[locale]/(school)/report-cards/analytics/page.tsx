'use client';

import { useTranslations } from 'next-intl';
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

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicPeriod {
  id: string;
  name: string;
}

interface AnalyticsSummary {
  total: number;
  published: number;
  pending: number;
  completion_pct: number;
  comment_fill_pct: number;
}

interface ClassComparisonItem {
  class_name: string;
  avg_score: number;
  published: number;
}

interface TrendItem {
  period_name: string;
  avg_score: number;
  completion_pct: number;
}

interface AnalyticsResponse {
  data: {
    summary: AnalyticsSummary;
    class_comparison: ClassComparisonItem[];
    trends: TrendItem[];
  };
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardAnalyticsPage() {
  const t = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = React.useState('all');
  const [analytics, setAnalytics] = React.useState<AnalyticsResponse['data'] | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch((err) => { console.error('[ReportCardsAnalyticsPage]', err); });
  }, []);

  const fetchAnalytics = React.useCallback(async (periodId: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (periodId !== 'all') params.set('academic_period_id', periodId);
      const res = await apiClient<AnalyticsResponse>(
        `/api/v1/report-cards/analytics?${params.toString()}`,
      );
      setAnalytics(res.data);
    } catch (err) {
      console.error('[ReportCardsAnalyticsPage]', err);
      setAnalytics(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAnalytics(selectedPeriod);
  }, [selectedPeriod, fetchAnalytics]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title={t('analyticsTitle')} />
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
            <SelectItem value="all">{t('allPeriods')}</SelectItem>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard label={t('total')} value={analytics.summary.total} />
            <SummaryCard
              label={t('statusPublished')}
              value={analytics.summary.published}
              variant="success"
            />
            <SummaryCard
              label={t('pendingApproval')}
              value={analytics.summary.pending}
              variant="warning"
            />
            <SummaryCard
              label={t('completionRate')}
              value={`${analytics.summary.completion_pct.toFixed(1)}%`}
              variant="info"
            />
            <SummaryCard
              label={t('commentFillRate')}
              value={`${analytics.summary.comment_fill_pct.toFixed(1)}%`}
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
                      dataKey="avg_score"
                      name={t('avgScore')}
                      fill="var(--color-primary-500)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="published"
                      name={t('statusPublished')}
                      fill="var(--color-success-500)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
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
