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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Response shapes (match reports/attendance-analytics.service.ts) ─────────

interface ChronicAbsenteeismEntry {
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  class_name: string | null;
  attendance_rate: number;
  total_sessions: number;
  absent_sessions: number;
}

interface DayOfWeekHeatmapEntry {
  year_group_id: string;
  year_group_name: string;
  weekday: number;
  weekday_label: string;
  total_sessions: number;
  present_sessions: number;
  attendance_rate: number;
}

interface TeacherComplianceEntry {
  staff_profile_id: string;
  teacher_name: string;
  total_sessions: number;
  submitted_sessions: number;
  compliance_rate: number;
}

interface TrendDataPoint {
  period_label: string;
  attendance_rate: number;
  total_students: number;
}

interface ExcusedVsUnexcused {
  excused_count: number;
  unexcused_count: number;
  late_count: number;
  left_early_count: number;
  total_absences: number;
  excused_rate: number;
}

interface ClassComparisonEntry {
  class_id: string;
  class_name: string;
  attendance_rate: number;
  total_sessions: number;
}

interface YearGroupOption {
  id: string;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function heatColor(rate: number): string {
  if (rate >= 95) return 'bg-emerald-500';
  if (rate >= 90) return 'bg-emerald-300';
  if (rate >= 85) return 'bg-amber-300';
  if (rate >= 80) return 'bg-orange-400';
  return 'bg-red-400';
}

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'chronic' | 'heatmap' | 'compliance' | 'trends' | 'excused' | 'comparison';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendanceAnalyticsPage() {
  const t = useTranslations('reports');
  const defaults = React.useMemo(() => defaultRange(), []);

  const [activeTab, setActiveTab] = React.useState<Tab>('chronic');
  const [startDate, setStartDate] = React.useState(defaults.start);
  const [endDate, setEndDate] = React.useState(defaults.end);
  const [yearGroup, setYearGroup] = React.useState<string>('all');
  const [yearGroupOptions, setYearGroupOptions] = React.useState<YearGroupOption[]>([]);

  const [chronic, setChronic] = React.useState<ChronicAbsenteeismEntry[]>([]);
  const [heatmap, setHeatmap] = React.useState<DayOfWeekHeatmapEntry[]>([]);
  const [compliance, setCompliance] = React.useState<TeacherComplianceEntry[]>([]);
  const [trends, setTrends] = React.useState<TrendDataPoint[]>([]);
  const [excused, setExcused] = React.useState<ExcusedVsUnexcused | null>(null);
  const [comparison, setComparison] = React.useState<ClassComparisonEntry[]>([]);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiClient<YearGroupOption[]>('/api/v1/year-groups')
      .then((res) => setYearGroupOptions(res))
      .catch((err: unknown) => console.error('[reports/attendance] year-groups', err));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const dateQs = new URLSearchParams({ start_date: startDate, end_date: endDate });
        const excusedQs = new URLSearchParams(dateQs);
        if (yearGroup !== 'all') excusedQs.set('year_group_id', yearGroup);

        const [chronicRes, heatmapRes, complianceRes, trendsRes, excusedRes] = await Promise.all([
          apiClient<ChronicAbsenteeismEntry[]>(
            `/api/v1/reports/analytics/attendance/chronic-absenteeism?${dateQs.toString()}`,
          ),
          apiClient<DayOfWeekHeatmapEntry[]>(
            `/api/v1/reports/analytics/attendance/day-of-week-heatmap?${dateQs.toString()}`,
          ),
          apiClient<TeacherComplianceEntry[]>(
            '/api/v1/reports/analytics/attendance/teacher-compliance',
          ),
          apiClient<TrendDataPoint[]>(
            `/api/v1/reports/analytics/attendance/trends?${dateQs.toString()}`,
          ),
          apiClient<ExcusedVsUnexcused>(
            `/api/v1/reports/analytics/attendance/excused-vs-unexcused?${excusedQs.toString()}`,
          ),
        ]);

        if (cancelled) return;
        setChronic(chronicRes);
        setHeatmap(heatmapRes);
        setCompliance(complianceRes);
        setTrends(trendsRes);
        setExcused(excusedRes);

        // Class comparison requires a year_group_id path param — only load when one is selected
        if (yearGroup !== 'all') {
          const cmpRes = await apiClient<ClassComparisonEntry[]>(
            `/api/v1/reports/analytics/attendance/class-comparison/${yearGroup}?${dateQs.toString()}`,
          );
          if (!cancelled) setComparison(cmpRes);
        } else {
          setComparison([]);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics');
        console.error('[reports/attendance] analytics', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, yearGroup]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'chronic', label: t('attendance.tabChronic') },
    { key: 'heatmap', label: t('attendance.tabHeatmap') },
    { key: 'compliance', label: t('attendance.tabCompliance') },
    { key: 'trends', label: t('attendance.tabTrends') },
    { key: 'excused', label: t('attendance.tabExcused') },
    { key: 'comparison', label: t('attendance.tabComparison') },
  ];

  const heatmapYearGroups = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const cell of heatmap) {
      if (!seen.has(cell.year_group_id)) seen.set(cell.year_group_id, cell.year_group_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [heatmap]);

  const excusedChartData = React.useMemo(() => {
    if (!excused) return [] as { name: string; value: number; fill: string }[];
    return [
      { name: 'Excused', value: excused.excused_count, fill: '#6366f1' },
      { name: 'Unexcused', value: excused.unexcused_count, fill: '#ef4444' },
    ];
  }, [excused]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('attendance.title')} description={t('attendance.description')} />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="att-start">{t('startDate')}</Label>
          <Input
            id="att-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-44"
          />
        </div>
        <div>
          <Label htmlFor="att-end">{t('endDate')}</Label>
          <Input
            id="att-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-44"
          />
        </div>
        <div>
          <Label>{t('yearGroup')}</Label>
          <Select value={yearGroup} onValueChange={setYearGroup}>
            <SelectTrigger className="mt-1 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('attendance.allYearGroups')}</SelectItem>
              {yearGroupOptions.map((yg) => (
                <SelectItem key={yg.id} value={yg.id}>
                  {yg.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {loading && <p className="text-sm text-text-tertiary">{t('attendance.loading')}</p>}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Tab: Chronic Absenteeism */}
          {activeTab === 'chronic' && (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      #
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('studentName')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('yearGroup')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('attendance.attendanceRate')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chronic.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-tertiary">
                        {t('attendance.noData')}
                      </td>
                    </tr>
                  ) : (
                    chronic.map((row, i) => (
                      <tr
                        key={row.student_id}
                        className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                      >
                        <td className="px-4 py-3 text-sm text-text-tertiary">{i + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">
                          {row.student_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {row.year_group_name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            {Math.round(row.attendance_rate)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: Heatmap */}
          {activeTab === 'heatmap' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('attendance.heatmapTitle')}
              </h3>
              {heatmapYearGroups.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('attendance.noData')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="pb-2 pe-4 text-start text-text-tertiary" />
                        {DAY_SHORT.map((d) => (
                          <th
                            key={d}
                            className="pb-2 px-2 text-center font-medium text-text-tertiary"
                          >
                            {d}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapYearGroups.map((yg) => (
                        <tr key={yg.id}>
                          <td className="py-1 pe-4 text-start text-xs font-medium text-text-secondary whitespace-nowrap">
                            {yg.name}
                          </td>
                          {[0, 1, 2, 3, 4].map((dow) => {
                            const cell = heatmap.find(
                              (c) => c.year_group_id === yg.id && c.weekday === dow,
                            );
                            const rate = cell ? Math.round(cell.attendance_rate) : 0;
                            return (
                              <td key={dow} className="px-1 py-1">
                                <div
                                  className={`flex h-10 w-16 items-center justify-center rounded-lg text-white text-xs font-medium ${heatColor(rate)}`}
                                >
                                  {cell ? `${rate}%` : '—'}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Teacher Compliance */}
          {activeTab === 'compliance' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('attendance.complianceChartTitle')}
              </h3>
              {compliance.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('attendance.noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(240, compliance.length * 32)}>
                  <BarChart
                    data={compliance}
                    layout="vertical"
                    margin={{ top: 0, right: 16, bottom: 0, left: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" domain={[0, 100]} className="text-xs" />
                    <YAxis dataKey="teacher_name" type="category" className="text-xs" width={120} />
                    <Tooltip formatter={(v) => [`${String(v)}%`, t('attendance.complianceRate')]} />
                    <Bar dataKey="compliance_rate" fill="#6366f1" radius={[0, 4, 4, 0]}>
                      {compliance.map((entry) => (
                        <Cell
                          key={entry.staff_profile_id}
                          fill={
                            entry.compliance_rate >= 95
                              ? '#10b981'
                              : entry.compliance_rate >= 85
                                ? '#f59e0b'
                                : '#ef4444'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Tab: Trends */}
          {activeTab === 'trends' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('attendance.trendsTitle')}
              </h3>
              {trends.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('attendance.noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trends} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="period_label" className="text-xs" />
                    <YAxis domain={[0, 100]} className="text-xs" />
                    <Tooltip formatter={(v) => [`${String(v)}%`, t('attendance.attendanceRate')]} />
                    <Line
                      type="monotone"
                      dataKey="attendance_rate"
                      name={t('attendance.attendanceRate')}
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Tab: Excused vs Unexcused */}
          {activeTab === 'excused' && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
                <h3 className="mb-4 text-sm font-semibold text-text-primary">
                  {t('attendance.excusedTitle')}
                </h3>
                {excusedChartData.every((d) => d.value === 0) ? (
                  <p className="text-sm text-text-tertiary">{t('attendance.noData')}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={excusedChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, percent }) =>
                          `${name} ${Math.round((percent ?? 0) * 100)}%`
                        }
                      >
                        {excusedChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('type')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('amount')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {excusedChartData.map((row) => {
                      const total = excusedChartData.reduce((a, b) => a + b.value, 0);
                      const pct = total === 0 ? 0 : Math.round((row.value / total) * 100);
                      return (
                        <tr
                          key={row.name}
                          className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-text-primary">
                            {row.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">{row.value}</td>
                          <td className="px-4 py-3 text-sm text-text-secondary">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Class Comparison */}
          {activeTab === 'comparison' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('attendance.comparisonTitle')}
              </h3>
              {yearGroup === 'all' ? (
                <p className="text-sm text-text-tertiary">
                  {t('attendance.selectYearGroupForComparison')}
                </p>
              ) : comparison.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('attendance.noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={comparison} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="class_name" className="text-xs" />
                    <YAxis domain={[0, 100]} className="text-xs" />
                    <Tooltip formatter={(v) => [`${String(v)}%`, t('attendance.attendanceRate')]} />
                    <Bar
                      dataKey="attendance_rate"
                      name={t('attendance.attendanceRate')}
                      radius={[4, 4, 0, 0]}
                    >
                      {comparison.map((entry) => (
                        <Cell
                          key={entry.class_id}
                          fill={
                            entry.attendance_rate >= 93
                              ? '#10b981'
                              : entry.attendance_rate >= 88
                                ? '#f59e0b'
                                : '#ef4444'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
