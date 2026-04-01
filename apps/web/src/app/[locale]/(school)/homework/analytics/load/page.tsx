'use client';

import { AlertTriangle, Calendar, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeatmapData {
  days: string[];
  year_groups: string[];
  data: number[][]; // [year_group_index][day_index] = count
}

interface LoadInsight {
  day: string;
  year_group: string;
  load: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeworkLoadHeatmapPage() {
  const t = useTranslations('homework');
  const [loading, setLoading] = React.useState(true);
  const [heatmapData, setHeatmapData] = React.useState<HeatmapData | null>(null);
  const [insights, setInsights] = React.useState<LoadInsight[]>([]);
  const [viewMode, setViewMode] = React.useState<'daily' | 'weekly'>('daily');

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: HeatmapData }>('/api/v1/homework/analytics/load/daily', {
        silent: true,
      });

      const heatmap = res.data;
      if (heatmap) {
        setHeatmapData(heatmap);

        // Generate insights from data
        const newInsights: LoadInsight[] = [];
        heatmap.year_groups.forEach((yg, ygIndex) => {
          heatmap.days.forEach((day, dayIndex) => {
            const load = heatmap.data[ygIndex]?.[dayIndex] ?? 0;
            if (load > 3) {
              newInsights.push({
                day,
                year_group: yg,
                load,
                severity: load > 5 ? 'critical' : load > 4 ? 'high' : 'medium',
              });
            }
          });
        });
        setInsights(newInsights.sort((a, b) => b.load - a.load).slice(0, 5));
      }
    } catch {
      console.error('[LoadHeatmap] Failed to fetch data');
      setHeatmapData(null);
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Transform data for bar chart
  const chartData = React.useMemo(() => {
    if (!heatmapData) return [];
    return heatmapData.days.map((day, dayIndex) => {
      const entry: Record<string, number | string> = { day };
      heatmapData.year_groups.forEach((yg, ygIndex) => {
        entry[yg] = heatmapData.data[ygIndex]?.[dayIndex] ?? 0;
      });
      return entry;
    });
  }, [heatmapData]);

  // Calculate average load
  const averageLoad = React.useMemo(() => {
    if (!heatmapData) return 0;
    let total = 0;
    let count = 0;
    heatmapData.data.forEach((row) => {
      row.forEach((val) => {
        total += val;
        count += 1;
      });
    });
    return count > 0 ? (total / count).toFixed(1) : '0';
  }, [heatmapData]);

  // Find overloaded days
  const overloadedDays = React.useMemo(() => {
    if (!heatmapData) return 0;
    let count = 0;
    heatmapData.data.forEach((row) => {
      row.forEach((val) => {
        if (val > 4) count += 1;
      });
    });
    return count;
  }, [heatmapData]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('analytics.loadHeatmap')} />

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-text-tertiary" />
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'daily' | 'weekly')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">{t('analytics.daily')}</SelectItem>
              <SelectItem value="weekly">{t('analytics.weekly')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('analytics.averageLoad')} value={averageLoad.toString()} />
        <StatCard
          label={t('analytics.overloadedDays')}
          value={overloadedDays.toString()}
          trend={
            overloadedDays > 3
              ? { direction: 'down', label: `${overloadedDays} overloaded` }
              : undefined
          }
        />
        <StatCard
          label={t('analytics.totalAssignments')}
          value={
            heatmapData
              ? heatmapData.data
                  .flat()
                  .reduce((a, b) => a + b, 0)
                  .toString()
              : '0'
          }
        />
      </div>

      {/* Heatmap Grid */}
      <div className="rounded-2xl bg-surface p-6">
        <h3 className="mb-4 text-base font-semibold text-text-primary">
          {viewMode === 'daily'
            ? t('analytics.dailyLoadByYearGroup')
            : t('analytics.weeklyLoadOverview')}
        </h3>

        {loading ? (
          <div className="h-80 animate-pulse rounded-xl bg-surface-secondary" />
        ) : heatmapData ? (
          <div className="space-y-4">
            {/* Heatmap Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="py-2 pe-4 text-start text-sm font-medium text-text-tertiary">
                      {t('analytics.yearGroup')}
                    </th>
                    {heatmapData.days.map((day) => (
                      <th
                        key={day}
                        className="py-2 px-2 text-center text-sm font-medium text-text-tertiary"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.year_groups.map((yg, ygIndex) => (
                    <tr key={yg} className="border-b border-border/50">
                      <td className="py-3 pe-4 text-sm font-medium text-text-primary">{yg}</td>
                      {heatmapData.days.map((day, dayIndex) => {
                        const load = heatmapData.data[ygIndex]?.[dayIndex] ?? 0;
                        return (
                          <td key={`${yg}-${day}`} className="py-2 px-2">
                            <div
                              className={`flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                                load > 5
                                  ? 'bg-red-500 text-white'
                                  : load > 4
                                    ? 'bg-orange-400 text-white'
                                    : load > 3
                                      ? 'bg-yellow-400 text-yellow-900'
                                      : load > 1
                                        ? 'bg-green-400 text-green-900'
                                        : 'bg-surface-secondary text-text-tertiary'
                              }`}
                            >
                              {load}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
              <span>{t('analytics.load')}:</span>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-surface-secondary" />
                <span>0-1</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-green-400" />
                <span>2-3</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-yellow-400" />
                <span>4</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-orange-400" />
                <span>5</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded bg-red-500" />
                <span>6+</span>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon={Calendar} title={t('analytics.noDataAvailable')} description="" />
        )}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="rounded-2xl bg-surface p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-text-primary">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            {t('analytics.insights')}
          </h3>
          <div className="space-y-3">
            {insights.slice(0, 3).map((insight, index) => (
              <div
                key={index}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  insight.severity === 'critical'
                    ? 'border-red-200 bg-red-50'
                    : insight.severity === 'high'
                      ? 'border-orange-200 bg-orange-50'
                      : 'border-yellow-200 bg-yellow-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      insight.severity === 'critical'
                        ? 'bg-red-500'
                        : insight.severity === 'high'
                          ? 'bg-orange-500'
                          : 'bg-yellow-500'
                    }`}
                  />
                  <span className="text-sm text-text-primary">
                    {t('analytics.insightText', {
                      yearGroup: insight.year_group,
                      load: insight.load,
                      day: insight.day,
                    })}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium ${
                    insight.severity === 'critical'
                      ? 'text-red-600'
                      : insight.severity === 'high'
                        ? 'text-orange-600'
                        : 'text-yellow-600'
                  }`}
                >
                  {insight.severity === 'critical'
                    ? t('analytics.severityCritical')
                    : insight.severity === 'high'
                      ? t('analytics.severityHigh')
                      : t('analytics.severityMedium')}
                </span>
              </div>
            ))}
            {insights.some((i) => i.day === 'Wed' && i.load > 5) && (
              <p className="mt-2 text-sm text-text-secondary">
                💡 {t('analytics.wednesdayOverload')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bar Chart Visualization */}
      {heatmapData && (
        <div className="rounded-2xl bg-surface p-6">
          <h3 className="mb-4 text-base font-semibold text-text-primary">
            {t('analytics.loadDistributionByDay')}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                {heatmapData.year_groups.map((yg, index) => (
                  <Bar
                    key={yg}
                    dataKey={yg}
                    fill={
                      ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6'][index % 6]
                    }
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
