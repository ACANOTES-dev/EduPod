'use client';

import { AlertTriangle, BarChart3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState, Skeleton, StatCard } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { CHART_COLORS, humanise } from './shared';



// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewData {
  total_sen_students: number;
  by_category: Array<{ category: string; count: number }>;
  by_support_level: Array<{ level: string; count: number }>;
  by_year_group: Array<{ year_group_id: string; year_group_name: string; count: number }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OverviewTab() {
  const t = useTranslations('sen');
  const [data, setData] = React.useState<OverviewData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data: OverviewData }>('/api/v1/sen/reports/overview')
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        console.error('[OverviewTab] load overview', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const categoryChartData = React.useMemo(() => {
    if (!data?.by_category) return [];
    return data.by_category.map((item) => ({ name: item.category, value: item.count }));
  }, [data]);

  const supportLevelChartData = React.useMemo(() => {
    if (!data?.by_support_level) return [];
    return data.by_support_level.map((item) => ({ name: item.level, value: item.count }));
  }, [data]);

  const yearGroupChartData = React.useMemo(() => {
    if (!data?.by_year_group) return [];
    return data.by_year_group.map((item) => ({
      name: item.year_group_name,
      value: item.count,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('reports.errorTitle')}
        description={t('reports.errorDescription')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('reports.overview.totalProfiles')} value={data.total_sen_students} />
        <StatCard label={t('reports.overview.categories')} value={data.by_category.length} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category pie chart */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('reports.overview.categoryBreakdown')}
          </h3>
          {categoryChartData.length === 0 ? (
            <EmptyState icon={BarChart3} title={t('reports.noData')} className="py-12" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={categoryChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${humanise(name ?? '')} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {categoryChartData.map((entry, index) => (
                    <Cell
                      key={`cat-${entry.name}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [String(value), '']} />
                <Legend formatter={(value) => humanise(String(value))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Support level bar chart */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('reports.overview.supportLevelBreakdown')}
          </h3>
          {supportLevelChartData.length === 0 ? (
            <EmptyState icon={BarChart3} title={t('reports.noData')} className="py-12" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={supportLevelChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value: string) => humanise(value)}
                />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [String(value), '']}
                  labelFormatter={(label) => humanise(String(label))}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {supportLevelChartData.map((entry, index) => (
                    <Cell
                      key={`sl-${entry.name}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Year group bar chart */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">
          {t('reports.overview.yearGroupBreakdown')}
        </h3>
        {yearGroupChartData.length === 0 ? (
          <EmptyState icon={BarChart3} title={t('reports.noData')} className="py-12" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={yearGroupChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip formatter={(value) => [String(value), '']} />
              <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
