'use client';

import { Download, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, Input, Label } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeacherCover {
  staff_profile_id: string;
  teacher_name: string;
  department: string | null;
  cover_count: number;
  total_periods: number;
  cover_pct: number;
}

interface DepartmentBreakdown {
  department: string;
  cover_count: number;
}

interface CoverReportData {
  from_date: string;
  to_date: string;
  total_substitutions: number;
  fairness_index: number; // coefficient of variation (lower = fairer)
  avg_cover_count: number;
  teachers: TeacherCover[];
  by_department: DepartmentBreakdown[];
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down' | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{label}</p>
      <div className="mt-1 flex items-end gap-2">
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        {trend === 'up' && <TrendingUp className="h-4 w-4 text-warning-500 mb-1" />}
        {trend === 'down' && <TrendingDown className="h-4 w-4 text-green-500 mb-1" />}
      </div>
      {sub && <p className="mt-0.5 text-xs text-text-tertiary">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoverReportsPage() {
  const t = useTranslations('scheduling.coverReports');
  const [data, setData] = React.useState<CoverReportData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);

  // Default: last 30 days
  const defaultFrom = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0] ?? '';
  }, []);
  const defaultTo = React.useMemo(() => new Date().toISOString().split('T')[0] ?? '', []);

  const [fromDate, setFromDate] = React.useState(defaultFrom);
  const [toDate, setToDate] = React.useState(defaultTo);

  const fetchReport = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<CoverReportData>(
        `/api/v1/scheduling/cover-reports?from=${fromDate}&to=${toDate}`,
      );
      setData(res);
    } catch (err) {
      console.error('[SchedulingCoverReportsPage]', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  React.useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/v1/scheduling/cover-reports/export?from=${fromDate}&to=${toDate}&format=csv`,
        {
          headers: {
            Authorization: `Bearer ${(await import('@/lib/api-client')).getAccessToken() ?? ''}`,
          },
        },
      );
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cover-report-${fromDate}-${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // silent
      console.error('[revokeObjectURL]', err);
    } finally {
      setExporting(false);
    }
  };

  // Bar colours: top 20% = red, bottom 20% = green, rest = blue
  function barColour(teacher: TeacherCover, allTeachers: TeacherCover[]): string {
    if (allTeachers.length === 0) return '#3b82f6';
    const sorted = [...allTeachers].sort((a, b) => b.cover_count - a.cover_count);
    const idx = sorted.findIndex((t) => t.staff_profile_id === teacher.staff_profile_id);
    const pct = idx / sorted.length;
    if (pct < 0.2) return '#ef4444'; // top 20%
    if (pct > 0.8) return '#22c55e'; // bottom 20%
    return '#3b82f6';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            variant="outline"
            onClick={() => void handleExportCsv()}
            disabled={exporting || !data}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin me-2" />
            ) : (
              <Download className="h-4 w-4 me-2" />
            )}
            {t('exportCsv')}
          </Button>
        }
      />

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>{t('fromDate')}</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            dir="ltr"
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('toDate')}</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            dir="ltr"
            className="w-44"
          />
        </div>
        <Button onClick={() => void fetchReport()}>{t('applyFilter')}</Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-text-secondary">{t('noData')}</p>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label={t('totalSubstitutions')} value={data.total_substitutions} />
            <KpiCard label={t('avgCoverPerTeacher')} value={data.avg_cover_count.toFixed(1)} />
            <KpiCard
              label={t('fairnessIndex')}
              value={`${(data.fairness_index * 100).toFixed(0)}%`}
              sub={t('fairnessHint')}
              trend={data.fairness_index < 0.3 ? 'down' : 'up'}
            />
            <KpiCard label={t('teachersCovered')} value={data.teachers.length} />
          </div>

          {/* Cover count bar chart */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-base font-semibold text-text-primary">
              {t('coverByTeacher')}
            </h2>
            {data.teachers.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-secondary">{t('noData')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={[...data.teachers].sort((a, b) => b.cover_count - a.cover_count)}
                  margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="teacher_name"
                    tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value) => [value, t('coverCount')]}
                  />
                  <Bar dataKey="cover_count" radius={[4, 4, 0, 0]}>
                    {data.teachers.map((teacher) => (
                      <Cell
                        key={teacher.staff_profile_id}
                        fill={barColour(teacher, data.teachers)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Department breakdown */}
          {data.by_department.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-4 text-base font-semibold text-text-primary">
                {t('coverByDepartment')}
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={[...data.by_department].sort((a, b) => b.cover_count - a.cover_count)}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  layout="vertical"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="department"
                    tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value) => [value, t('coverCount')]}
                  />
                  <Bar dataKey="cover_count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Teacher detail table */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-base font-semibold text-text-primary">
              {t('teacherDetails')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      t('teacher'),
                      t('department'),
                      t('coverCount'),
                      t('totalPeriods'),
                      t('coverPct'),
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...data.teachers]
                    .sort((a, b) => b.cover_count - a.cover_count)
                    .map((teacher) => (
                      <tr
                        key={teacher.staff_profile_id}
                        className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50"
                      >
                        <td className="px-4 py-3 font-medium text-text-primary">
                          {teacher.teacher_name}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {teacher.department ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-text-primary">
                          {teacher.cover_count}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{teacher.total_periods}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-surface-secondary">
                              <div
                                className="h-2 rounded-full bg-primary"
                                style={{ width: `${Math.min(100, teacher.cover_pct)}%` }}
                              />
                            </div>
                            <span className="text-xs text-text-secondary">
                              {teacher.cover_pct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
