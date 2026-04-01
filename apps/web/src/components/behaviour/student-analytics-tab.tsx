'use client';

import { AlertTriangle, Award, BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useApiQuery } from '@/hooks/use-api-query';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrendPoint {
  week: string;
  positive: number;
  negative: number;
}

interface CategoryBreakdown {
  category_name: string;
  polarity: 'positive' | 'negative' | 'neutral';
  count: number;
}

interface PeriodComparison {
  period_name: string;
  positive: number;
  negative: number;
}

interface SanctionSummary {
  sanction_type: string;
  served: number;
  no_show: number;
}

interface StudentAnalyticsData {
  total_incidents: number;
  positive_ratio: number | null;
  total_points: number;
  active_interventions: number;
  trends: TrendPoint[];
  categories: CategoryBreakdown[];
  period_comparisons: PeriodComparison[];
  sanctions: SanctionSummary[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StudentAnalyticsTab({ studentId }: { studentId: string }) {
  const t = useTranslations('behaviour.components.studentAnalytics');
  const {
    data,
    error,
    isLoading: loading,
  } = useApiQuery<{ data: StudentAnalyticsData }, StudentAnalyticsData>(
    studentId ? `/api/v1/behaviour/students/${studentId}/analytics` : null,
    {
      fallbackMessage: t('errors.loadFailed'),
      select: (response) => response.data,
    },
  );

  const errorMessage = error
    ? error.status === 403
      ? t('errors.noPermission')
      : error.message
    : null;

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-border bg-surface p-4">
              <div className="mb-2 h-3 w-20 rounded bg-surface-secondary" />
              <div className="h-7 w-16 rounded bg-surface-secondary" />
            </div>
          ))}
        </div>
        <div className="animate-pulse rounded-lg border border-border bg-surface p-4">
          <div className="mb-4 h-4 w-32 rounded bg-surface-secondary" />
          <div className="h-64 rounded bg-surface-secondary" />
        </div>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────

  if (errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface py-12 text-center">
        <AlertTriangle className="mb-2 h-8 w-8 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">{errorMessage}</p>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────────

  if (!data || data.total_incidents === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface py-12 text-center">
        <BarChart3 className="mb-2 h-8 w-8 text-text-tertiary" />
        <p className="text-sm font-medium text-text-tertiary">{t('empty.title')}</p>
        <p className="mt-1 text-xs text-text-tertiary">{t('empty.description')}</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          title={t('cards.totalIncidents')}
          value={data.total_incidents}
          icon={<BarChart3 className="h-4 w-4 text-text-tertiary" />}
        />
        <SummaryCard
          title={t('cards.positiveRatio')}
          value={data.positive_ratio !== null ? `${Math.round(data.positive_ratio * 100)}%` : '--'}
          icon={
            data.positive_ratio !== null && data.positive_ratio >= 0.5 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )
          }
        />
        <SummaryCard
          title={t('cards.totalPoints')}
          value={data.total_points}
          icon={<Award className="h-4 w-4 text-text-tertiary" />}
        />
        <SummaryCard
          title={t('cards.activeInterventions')}
          value={data.active_interventions}
          icon={
            <div
              className={`h-2 w-2 rounded-full ${data.active_interventions > 0 ? 'bg-amber-500' : 'bg-green-500'}`}
            />
          }
        />
      </div>

      {/* Trend Line Chart */}
      {data.trends.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4 md:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('charts.weeklyTrends')}
          </h3>
          <div className="h-64 w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="positive"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name={t('legend.positive')}
                />
                <Line
                  type="monotone"
                  dataKey="negative"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name={t('legend.negative')}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Category Breakdown — Horizontal BarChart */}
      {data.categories.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4 md:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('charts.categoryBreakdown')}
          </h3>
          <div className="h-64 w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.categories.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                <YAxis
                  dataKey="category_name"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} name={t('legend.count')}>
                  {data.categories.slice(0, 10).map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.polarity === 'positive'
                          ? '#22c55e'
                          : entry.polarity === 'negative'
                            ? '#ef4444'
                            : '#94a3b8'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Period Comparison — Grouped BarChart (only if multiple periods) */}
      {data.period_comparisons.length > 1 && (
        <div className="rounded-lg border border-border bg-surface p-4 md:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('charts.periodComparison')}
          </h3>
          <div className="h-64 w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.period_comparisons}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period_name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="positive"
                  fill="#22c55e"
                  name={t('legend.positive')}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="negative"
                  fill="#ef4444"
                  name={t('legend.negative')}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Sanction History Table */}
      {data.sanctions.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4 md:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('charts.sanctionHistory')}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-start font-medium text-text-tertiary">
                    {t('sanctions.type')}
                  </th>
                  <th className="pb-2 text-end font-medium text-text-tertiary">
                    {t('sanctions.served')}
                  </th>
                  <th className="pb-2 text-end font-medium text-text-tertiary">
                    {t('sanctions.noShow')}
                  </th>
                  <th className="pb-2 text-end font-medium text-text-tertiary">
                    {t('sanctions.total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.sanctions.map((s) => (
                  <tr key={s.sanction_type} className="border-b border-border last:border-0">
                    <td className="py-2 text-text-primary capitalize">
                      {s.sanction_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 text-end text-green-600">{s.served}</td>
                    <td className="py-2 text-end text-red-500">{s.no_show}</td>
                    <td className="py-2 text-end text-text-primary font-medium">
                      {s.served + s.no_show}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Card Sub-component ───────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-text-tertiary">{title}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-text-primary">{value}</div>
    </div>
  );
}
