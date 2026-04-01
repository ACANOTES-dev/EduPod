'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

interface TrendPoint {
  assessment_title: string;
  class_average: number | null;
  assessment_date: string | null;
}

interface DistributionBucket {
  range_label: string;
  count: number;
  percentage: number;
}

interface AnalyticsSummary {
  mean: number | null;
  median: number | null;
  std_dev: number | null;
  pass_rate: number | null;
  min_score: number | null;
  max_score: number | null;
}

interface ClassAnalyticsResponse {
  trend: TrendPoint[];
  distribution: DistributionBucket[];
  summary: AnalyticsSummary;
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-surface-secondary px-4 py-3">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-lg font-bold text-text-primary tabular-nums">
        {value != null ? value : '—'}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsTab({ classId }: { classId: string }) {
  const t = useTranslations('gradebook');

  const [periods, setPeriods] = React.useState<SelectOption[]>([]);
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [periodId, setPeriodId] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('');

  const [analytics, setAnalytics] = React.useState<ClassAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Load filter options
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setSubjects(res.data))
      .catch(() => undefined);
  }, []);

  // Fetch analytics when filters change
  React.useEffect(() => {
    if (!periodId || !subjectId) return;
    setIsLoading(true);
    const params = new URLSearchParams({
      academic_period_id: periodId,
      subject_id: subjectId,
    });
    apiClient<ClassAnalyticsResponse>(
      `/api/v1/gradebook/classes/${classId}/analytics?${params.toString()}`,
    )
      .then((res) => setAnalytics(res))
      .catch(() => setAnalytics(null))
      .finally(() => setIsLoading(false));
  }, [classId, periodId, subjectId]);

  // Color based on pass rate
  const getBarColor = (pct: number) => {
    if (pct >= 60) return 'var(--color-success-500, #22c55e)';
    if (pct >= 40) return 'var(--color-warning-500, #f59e0b)';
    return 'var(--color-danger-500, #ef4444)';
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('period')} />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={subjectId} onValueChange={setSubjectId}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('subject')} />
          </SelectTrigger>
          <SelectContent>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!periodId || !subjectId ? (
        <p className="py-12 text-center text-sm text-text-tertiary">
          {t('selectPeriodSubjectForAnalytics')}
        </p>
      ) : isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : !analytics ? (
        <p className="py-12 text-center text-sm text-text-tertiary">{t('noAnalyticsData')}</p>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <StatPill
              label={t('analyticsMean')}
              value={analytics.summary.mean != null ? `${analytics.summary.mean.toFixed(1)}` : null}
            />
            <StatPill
              label={t('analyticsMedian')}
              value={
                analytics.summary.median != null ? `${analytics.summary.median.toFixed(1)}` : null
              }
            />
            <StatPill
              label={t('analyticsStdDev')}
              value={
                analytics.summary.std_dev != null ? `${analytics.summary.std_dev.toFixed(1)}` : null
              }
            />
            <StatPill
              label={t('analyticsPassRate')}
              value={
                analytics.summary.pass_rate != null
                  ? `${analytics.summary.pass_rate.toFixed(0)}%`
                  : null
              }
            />
            <StatPill label={t('analyticsMin')} value={analytics.summary.min_score} />
            <StatPill label={t('analyticsMax')} value={analytics.summary.max_score} />
          </div>

          {/* Grade trend chart */}
          {analytics.trend.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('gradeTrend')}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={analytics.trend}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                  <XAxis
                    dataKey="assessment_title"
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #6b7280)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #6b7280)' }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface, #fff)',
                      border: '1px solid var(--color-border, #e5e7eb)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => {
                      const n = typeof value === 'number' ? value : 0;
                      return [`${n.toFixed(1)}`, t('classAverage')];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="class_average"
                    stroke="var(--color-primary-600, #4f46e5)"
                    strokeWidth={2.5}
                    dot={{ fill: 'var(--color-primary-600, #4f46e5)', r: 4 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Distribution histogram */}
          {analytics.distribution.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('gradeDistribution')}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={analytics.distribution}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                  <XAxis
                    dataKey="range_label"
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #6b7280)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #6b7280)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface, #fff)',
                      border: '1px solid var(--color-border, #e5e7eb)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value, _name, props) => {
                      const n = typeof value === 'number' ? value : 0;
                      const payload = props.payload as DistributionBucket | undefined;
                      return [
                        `${n} students (${payload?.percentage.toFixed(0) ?? 0}%)`,
                        t('students'),
                      ];
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {analytics.distribution.map((entry, index) => (
                      <Cell key={index} fill={getBarColor(entry.percentage)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
