'use client';

import { Activity, ArrowDown, ArrowUp, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
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

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PulseDimension {
  name: string;
  value: number | null;
  weight: number;
  label: string;
}

interface PulseResult {
  dimensions: PulseDimension[];
  composite: number | null;
  composite_available: boolean;
  gate_reason: string | null;
  cached_at: string;
  pulse_enabled: boolean;
}

interface OverviewResult {
  total_incidents: number;
  prior_period_total: number;
  delta_percent: number | null;
  positive_negative_ratio: number | null;
  ratio_trend: string | null;
  open_follow_ups: number;
  active_alerts: number;
  data_quality: { exposure_normalised: boolean; data_as_of: string };
}

interface TrendPoint {
  date: string;
  positive: number;
  negative: number;
  total: number;
}

interface CategoryEntry {
  category_id: string;
  category_name: string;
  polarity: string;
  count: number;
  rate_per_100: number | null;
}

interface SubjectEntry {
  subject_id: string;
  subject_name: string;
  incident_count: number;
  rate_per_100_periods: number | null;
}

interface HeatmapCell {
  weekday: number;
  period_order: number;
  raw_count: number;
  polarity_breakdown: { positive: number; negative: number; neutral: number };
}

interface ComparisonEntry {
  year_group_id: string;
  year_group_name: string;
  positive_rate: number | null;
  negative_rate: number | null;
  student_count: number;
}

interface StaffEntry {
  staff_id: string;
  staff_name: string;
  last_7_days: number;
  last_30_days: number;
  total_year: number;
  last_logged_at: string | null;
  inactive_flag: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BehaviourAnalyticsPage() {
  const t = useTranslations('behaviour.analytics');
  const [pulse, setPulse] = React.useState<PulseResult | null>(null);
  const [overview, setOverview] = React.useState<OverviewResult | null>(null);
  const [trends, setTrends] = React.useState<TrendPoint[]>([]);
  const [categories, setCategories] = React.useState<CategoryEntry[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectEntry[]>([]);
  const [heatmap, setHeatmap] = React.useState<HeatmapCell[]>([]);
  const [comparisons, setComparisons] = React.useState<ComparisonEntry[]>([]);
  const [staffData, setStaffData] = React.useState<StaffEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dateRange, setDateRange] = React.useState('30');
  const [exposureNormalised, setExposureNormalised] = React.useState(true);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    const to = new Date();
    const from = new Date(to.getTime() - parseInt(dateRange) * 24 * 60 * 60 * 1000);
    params.set('from', from.toISOString());
    params.set('to', to.toISOString());
    params.set('exposureNormalised', String(exposureNormalised));

    try {
      const [pulseRes, overviewRes, trendsRes, categoriesRes, subjectsRes, heatmapRes, compRes] =
        await Promise.all([
          apiClient<PulseResult>('/behaviour/analytics/pulse').catch((err) => { console.error('[BehaviourAnalyticsPage]', err); return null; }),
          apiClient<OverviewResult>(`/behaviour/analytics/overview?${params}`),
          apiClient<{ points: TrendPoint[] }>(`/behaviour/analytics/trends?${params}`),
          apiClient<{ categories: CategoryEntry[] }>(`/behaviour/analytics/categories?${params}`),
          apiClient<{ subjects: SubjectEntry[] }>(`/behaviour/analytics/subjects?${params}`),
          apiClient<{ cells: HeatmapCell[] }>(`/behaviour/analytics/heatmap?${params}`),
          apiClient<{ entries: ComparisonEntry[] }>(`/behaviour/analytics/comparisons?${params}`),
        ]);

      if (pulseRes) setPulse(pulseRes);
      if (overviewRes) setOverview(overviewRes);
      if (trendsRes?.points) setTrends(trendsRes.points);
      if (categoriesRes?.categories) setCategories(categoriesRes.categories);
      if (subjectsRes?.subjects) setSubjects(subjectsRes.subjects);
      if (heatmapRes?.cells) setHeatmap(heatmapRes.cells);
      if (compRes?.entries) setComparisons(compRes.entries);
    } catch (err) {
      // Error handling
      console.error('[all]', err);
    }

    // Staff analytics — separate try/catch; 403 means no permission, silently skip
    try {
      const staffRes = await apiClient<{ entries: StaffEntry[] }>(
        `/behaviour/analytics/staff?${params}`,
      );
      if (staffRes?.entries) setStaffData(staffRes.entries);
    } catch (err) {
      console.error('[BehaviourAnalyticsPage]', err);
      // 403 or other error — user lacks behaviour.view_staff_analytics permission
      setStaffData([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, exposureNormalised]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="mt-6 flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('filters.last7Days')}</SelectItem>
              <SelectItem value="30">{t('filters.last30Days')}</SelectItem>
              <SelectItem value="90">{t('filters.last90Days')}</SelectItem>
              <SelectItem value="365">{t('filters.thisYear')}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={exposureNormalised ? 'default' : 'outline'}
            size="sm"
            onClick={() => setExposureNormalised(!exposureNormalised)}
          >
            <Activity className="me-1 h-4 w-4" />
            {exposureNormalised ? t('normalised') : t('raw')}
          </Button>
          <Link href="/behaviour/analytics/ai">
            <Button variant="outline" size="sm">
              {t('aiQuery')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Section 1: Pulse Widget */}
      {pulse?.pulse_enabled && (
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-semibold">{t('sections.pulse')}</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {pulse.dimensions.map((dim) => (
              <div key={dim.name} className="text-center">
                <div className="mb-1 text-xs text-muted-foreground">{dim.label}</div>
                <div
                  className={`text-2xl font-bold ${
                    dim.value === null
                      ? 'text-muted-foreground'
                      : dim.value >= 0.7
                        ? 'text-green-600'
                        : dim.value >= 0.4
                          ? 'text-amber-600'
                          : 'text-red-600'
                  }`}
                >
                  {dim.value !== null ? `${Math.round(dim.value * 100)}%` : '—'}
                </div>
              </div>
            ))}
          </div>
          {pulse.composite_available && pulse.composite !== null && (
            <div className="mt-4 text-center">
              <div className="text-sm text-muted-foreground">{t('compositeScore')}</div>
              <div className="text-3xl font-bold text-primary">
                {Math.round(pulse.composite * 100)}%
              </div>
            </div>
          )}
          {pulse.gate_reason && (
            <p className="mt-2 text-center text-xs text-muted-foreground">{pulse.gate_reason}</p>
          )}
        </div>
      )}

      {/* Section 2: Overview Cards */}
      {overview && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <OverviewCard
            title={t('cards.totalIncidents')}
            value={overview.total_incidents}
            delta={overview.delta_percent}
          />
          <OverviewCard
            title={t('cards.positiveRatio')}
            value={
              overview.positive_negative_ratio !== null
                ? `${Math.round(overview.positive_negative_ratio * 100)}%`
                : '—'
            }
            trend={overview.ratio_trend}
          />
          <OverviewCard title={t('cards.openFollowUps')} value={overview.open_follow_ups} />
          <Link href="/behaviour/alerts" className="contents">
            <OverviewCard title={t('cards.activeAlerts')} value={overview.active_alerts} />
          </Link>
        </div>
      )}

      {/* Section 3: Trend Chart */}
      {trends.length > 0 && (
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-semibold">{t('sections.trends')}</h3>
          <div className="h-64 w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="positive"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="negative"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Section 4: Heatmap */}
      {heatmap.length > 0 && (
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-semibold">{t('sections.heatmap')}</h3>
          <div className="overflow-x-auto">
            <div className="grid gap-1" style={{ gridTemplateColumns: 'auto repeat(5, 1fr)' }}>
              <div />
              {['mon', 'tue', 'wed', 'thu', 'fri'].map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground">
                  {t(`days.${day}` as Parameters<typeof t>[0])}
                </div>
              ))}
              {Array.from({ length: 8 }, (_, period) => (
                <React.Fragment key={period}>
                  <div className="text-end text-xs text-muted-foreground pe-2">P{period + 1}</div>
                  {[1, 2, 3, 4, 5].map((weekday) => {
                    const cell = heatmap.find(
                      (c) => c.weekday === weekday && c.period_order === period + 1,
                    );
                    const count = cell?.raw_count ?? 0;
                    return (
                      <div
                        key={weekday}
                        className={`flex items-center justify-center rounded p-2 text-xs font-medium ${
                          count === 0
                            ? 'bg-muted'
                            : count <= 2
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : count <= 5
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {count > 0 ? count : ''}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section 5: Category Breakdown */}
      {categories.length > 0 && (
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-semibold">{t('sections.categories')}</h3>
          <div className="h-64 w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  dataKey="category_name"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {categories.slice(0, 10).map((entry) => (
                    <Cell
                      key={entry.category_id}
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

      {/* Section 6: Subject Analysis */}
      {subjects.length > 0 && (
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-semibold">{t('sections.subjects')}</h3>
          {!overview?.data_quality.exposure_normalised && (
            <p className="mb-2 text-xs text-amber-600">{t('rateNormalisationUnavailable')}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="pb-2 text-start font-medium">{t('columns.subject')}</th>
                  <th className="pb-2 text-end font-medium">{t('columns.incidents')}</th>
                  <th className="pb-2 text-end font-medium">{t('columns.ratePer100')}</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.subject_id} className="border-b last:border-0">
                    <td className="py-2">{s.subject_name}</td>
                    <td className="py-2 text-end">{s.incident_count}</td>
                    <td className="py-2 text-end">
                      {s.rate_per_100_periods !== null ? s.rate_per_100_periods.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 7: Year Group Comparison */}
      {comparisons.length > 0 && (
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-semibold">{t('sections.yearGroups')}</h3>
          <div className="h-64 w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisons}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year_group_name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar
                  dataKey="positive_rate"
                  fill="#22c55e"
                  name={t('positive')}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="negative_rate"
                  fill="#ef4444"
                  name={t('negative')}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Section 8: Staff Logging Activity */}
      {staffData.length > 0 && (
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-semibold">{t('sections.staffActivity')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-start font-medium">{t('columns.staffName')}</th>
                  <th className="pb-2 text-end font-medium">{t('columns.last7Days')}</th>
                  <th className="pb-2 text-end font-medium">{t('columns.last30Days')}</th>
                  <th className="pb-2 text-end font-medium">{t('columns.totalYear')}</th>
                  <th className="pb-2 text-end font-medium">{t('columns.lastLogged')}</th>
                </tr>
              </thead>
              <tbody>
                {staffData.map((entry) => (
                  <tr
                    key={entry.staff_id}
                    className={`border-b last:border-0 ${
                      entry.inactive_flag ? 'bg-danger-fill/20' : ''
                    }`}
                  >
                    <td className="py-2 text-start">
                      {entry.staff_name}
                      {entry.inactive_flag && (
                        <span className="ms-2 inline-flex items-center rounded-full bg-danger-fill px-3 py-1 text-xs font-medium text-danger-text">
                          {t('inactive')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-end">{entry.last_7_days}</td>
                    <td className="py-2 text-end">{entry.last_30_days}</td>
                    <td className="py-2 text-end">{entry.total_year}</td>
                    <td className="py-2 text-end">
                      {entry.last_logged_at ? formatDate(entry.last_logged_at) : '—'}
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

// ─── Overview Card Component ──────────────────────────────────────────────────

function OverviewCard({
  title,
  value,
  delta,
  trend,
}: {
  title: string;
  value: number | string;
  delta?: number | null;
  trend?: string | null;
}) {
  const t = useTranslations('behaviour.analytics');
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {delta !== undefined && delta !== null && (
        <div
          className={`mt-1 flex items-center text-xs ${delta > 0 ? 'text-red-500' : 'text-green-500'}`}
        >
          {delta > 0 ? (
            <TrendingUp className="me-1 h-3 w-3" />
          ) : (
            <TrendingDown className="me-1 h-3 w-3" />
          )}
          {t('deltaVsPrior', { delta: Math.abs(delta) })}
        </div>
      )}
      {trend && (
        <div className="mt-1 flex items-center text-xs text-muted-foreground">
          {trend === 'improving' && <ArrowDown className="me-1 h-3 w-3 text-green-500" />}
          {trend === 'declining' && <ArrowUp className="me-1 h-3 w-3 text-red-500" />}
          {trend === 'stable' && <Minus className="me-1 h-3 w-3" />}
          {t(`trends.${trend}` as Parameters<typeof t>[0])}
        </div>
      )}
    </div>
  );
}
