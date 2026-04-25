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

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { AiSummaryPanel } from '../_components/ai-summary-panel';
import { ReportPageActions } from '../_components/report-page-actions';

// ─── Response shapes (match demographics.service.ts) ──────────────────────────

interface NationalityBreakdownEntry {
  nationality: string;
  count: number;
  percentage: number;
}

interface GenderBalanceEntry {
  year_group_id: string;
  year_group_name: string;
  male_count: number;
  female_count: number;
  other_count: number;
  total: number;
}

interface AgeDistributionBucket {
  age: number;
  count: number;
  percentage: number;
}

interface YearGroupSizeEntry {
  year_group_id: string;
  year_group_name: string;
  student_count: number;
  active_count: number;
  capacity: number | null;
  capacity_utilisation: number | null;
}

interface EnrolmentTrendDataPoint {
  month: string;
  new_enrolments: number;
  withdrawals: number;
  net_change: number;
}

interface StatusDistributionEntry {
  status: string;
  count: number;
  percentage: number;
}

const NATIONALITY_COLOURS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#94a3b8'];
const STATUS_COLOURS: Record<string, string> = {
  active: '#10b981',
  applicant: '#6366f1',
  pending: '#6366f1',
  withdrawn: '#ef4444',
  graduated: '#94a3b8',
  inactive: '#94a3b8',
};

function statusColour(status: string): string {
  return STATUS_COLOURS[status.toLowerCase()] ?? '#94a3b8';
}

export default function DemographicsPage() {
  const t = useTranslations('reports');

  const [nationality, setNationality] = React.useState<NationalityBreakdownEntry[]>([]);
  const [gender, setGender] = React.useState<GenderBalanceEntry[]>([]);
  const [age, setAge] = React.useState<AgeDistributionBucket[]>([]);
  const [yearGroupSizes, setYearGroupSizes] = React.useState<YearGroupSizeEntry[]>([]);
  const [enrolmentTrend, setEnrolmentTrend] = React.useState<EnrolmentTrendDataPoint[]>([]);
  const [status, setStatus] = React.useState<StatusDistributionEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [natRes, gendRes, ageRes, ygRes, trendRes, statRes] = await Promise.all([
          apiClient<{ data: NationalityBreakdownEntry[] } | NationalityBreakdownEntry[]>(
            '/api/v1/reports/analytics/demographics/nationality',
          ),
          apiClient<{ data: GenderBalanceEntry[] } | GenderBalanceEntry[]>(
            '/api/v1/reports/analytics/demographics/gender-balance',
          ),
          apiClient<{ data: AgeDistributionBucket[] } | AgeDistributionBucket[]>(
            '/api/v1/reports/analytics/demographics/age-distribution',
          ),
          apiClient<{ data: YearGroupSizeEntry[] } | YearGroupSizeEntry[]>(
            '/api/v1/reports/analytics/demographics/year-group-sizes',
          ),
          apiClient<{ data: EnrolmentTrendDataPoint[] } | EnrolmentTrendDataPoint[]>(
            '/api/v1/reports/analytics/demographics/enrolment-trends',
          ),
          apiClient<{ data: StatusDistributionEntry[] } | StatusDistributionEntry[]>(
            '/api/v1/reports/analytics/demographics/status-distribution',
          ),
        ]);
        if (cancelled) return;
        setNationality(Array.isArray(natRes) ? natRes : natRes.data);
        setGender(Array.isArray(gendRes) ? gendRes : gendRes.data);
        setAge(Array.isArray(ageRes) ? ageRes : ageRes.data);
        setYearGroupSizes(Array.isArray(ygRes) ? ygRes : ygRes.data);
        setEnrolmentTrend(Array.isArray(trendRes) ? trendRes : trendRes.data);
        setStatus(Array.isArray(statRes) ? statRes : statRes.data);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('[reports/demographics] load', err);
        setError(err instanceof Error ? err.message : t('analytics.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const aiData = React.useMemo(
    () => ({
      total_students: status.find((s) => s.status.toLowerCase() === 'active')?.count ?? null,
      nationalities_count: nationality.length,
      year_groups_count: yearGroupSizes.length,
      net_recent_enrolment_change: enrolmentTrend.reduce((a, b) => a + b.net_change, 0),
    }),
    [nationality, status, yearGroupSizes, enrolmentTrend],
  );

  const nationalityChart = React.useMemo(
    () =>
      nationality.map((row, i) => ({
        ...row,
        fill: NATIONALITY_COLOURS[i % NATIONALITY_COLOURS.length],
      })),
    [nationality],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('demographics.title')}
        description={t('demographics.description')}
        actions={<ReportPageActions disabled />}
      />

      <AiSummaryPanel
        mode={{ kind: 'report', reportKey: 'demographics', data: aiData }}
        fallback={t('demographics.aiSummaryFallback')}
      />

      {loading && <p className="text-sm text-text-tertiary">{t('attendance.loading')}</p>}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h2 className="mb-4 text-base font-semibold text-text-primary">
                {t('demographics.nationalityTitle')}
              </h2>
              {nationalityChart.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('noData')}</p>
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={nationalityChart}
                        dataKey="count"
                        nameKey="nationality"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                      >
                        {nationalityChart.map((entry) => (
                          <Cell key={entry.nationality} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="shrink-0 space-y-1.5">
                    {nationalityChart.map((d) => (
                      <li key={d.nationality} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: d.fill }}
                        />
                        <span className="text-text-secondary">{d.nationality || '—'}</span>
                        <span className="ms-auto font-medium text-text-primary">{d.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h2 className="mb-4 text-base font-semibold text-text-primary">
                {t('demographics.genderTitle')}
              </h2>
              {gender.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={gender} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="year_group_name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar
                      dataKey="male_count"
                      name={t('demographics.male')}
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="female_count"
                      name={t('demographics.female')}
                      fill="#ec4899"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>
          </div>

          <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-text-primary">
              {t('demographics.ageTitle')}
            </h2>
            {age.length === 0 ? (
              <p className="text-sm text-text-tertiary">{t('noData')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={age} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="age"
                    className="text-xs"
                    label={{
                      value: t('demographics.ageAxisLabel'),
                      position: 'insideBottom',
                      offset: -2,
                      fontSize: 11,
                    }}
                  />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name={t('grades.studentCount')}
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold text-text-primary">
                {t('demographics.yearGroupSizesTitle')}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('yearGroup')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('demographics.enrolled')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('demographics.capacity')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('demographics.fill')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {yearGroupSizes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-tertiary">
                        {t('noData')}
                      </td>
                    </tr>
                  ) : (
                    yearGroupSizes.map((row) => {
                      const cap = row.capacity ?? 0;
                      const pct =
                        row.capacity_utilisation != null
                          ? Math.round(row.capacity_utilisation)
                          : cap > 0
                            ? Math.round((row.student_count / cap) * 100)
                            : 0;
                      return (
                        <tr
                          key={row.year_group_id}
                          className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-text-primary">
                            {row.year_group_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">
                            {row.student_count}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">
                            {row.capacity ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            {cap > 0 ? (
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-secondary">
                                  <div
                                    className={`h-2 rounded-full ${pct >= 95 ? 'bg-red-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-text-secondary">
                                  {pct}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-text-tertiary">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-text-primary">
              {t('demographics.enrolmentTrendTitle')}
            </h2>
            {enrolmentTrend.length === 0 ? (
              <p className="text-sm text-text-tertiary">{t('noData')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={enrolmentTrend} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="new_enrolments"
                    name={t('demographics.newEnrolments')}
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="withdrawals"
                    name={t('demographics.withdrawals')}
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-text-primary">
              {t('demographics.statusTitle')}
            </h2>
            {status.length === 0 ? (
              <p className="text-sm text-text-tertiary">{t('noData')}</p>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={status}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {status.map((entry) => (
                        <Cell key={entry.status} fill={statusColour(entry.status)} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="shrink-0 space-y-2">
                  {status.map((d) => (
                    <li key={d.status} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: statusColour(d.status) }}
                      />
                      <span className="text-text-secondary">{d.status}</span>
                      <span className="ms-auto font-semibold text-text-primary">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
