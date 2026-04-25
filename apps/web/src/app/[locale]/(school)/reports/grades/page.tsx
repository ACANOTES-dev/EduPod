'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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

import { AiSummaryPanel } from '../_components/ai-summary-panel';
import { ReportPageActions } from '../_components/report-page-actions';

// ─── Response shapes (match grade-analytics.service.ts) ──────────────────────

interface PassFailEntry {
  subject_id: string;
  subject_name: string;
  year_group_name: string | null;
  class_name: string | null;
  pass_count: number;
  fail_count: number;
  total_count: number;
  pass_rate: number;
}

interface GradeDistributionBucket {
  bucket_label: string;
  min_score: number;
  max_score: number;
  count: number;
  percentage: number;
}

interface StudentPerformanceEntry {
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  average_score: number;
  grade_count: number;
}

interface TopBottomPerformersResult {
  top_performers: StudentPerformanceEntry[];
  bottom_performers: StudentPerformanceEntry[];
}

interface GradeTrendDataPoint {
  period_label: string;
  average_score: number;
  student_count: number;
}

interface SubjectDifficultyEntry {
  subject_id: string;
  subject_name: string;
  average_score: number;
  student_count: number;
  difficulty_rank: number;
}

interface GpaDistributionBucket {
  bucket_label: string;
  min_gpa: number;
  max_gpa: number;
  count: number;
  percentage: number;
}

interface YearGroupOption {
  id: string;
  name: string;
}

interface SubjectOption {
  id: string;
  name: string;
}

type Tab = 'pass-fail' | 'distribution' | 'performers' | 'trends' | 'difficulty' | 'gpa';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradeAnalyticsPage() {
  const t = useTranslations('reports');

  const [activeTab, setActiveTab] = React.useState<Tab>('pass-fail');
  const [yearGroup, setYearGroup] = React.useState<string>('all');
  const [subject, setSubject] = React.useState<string>('all');

  const [yearGroupOptions, setYearGroupOptions] = React.useState<YearGroupOption[]>([]);
  const [subjectOptions, setSubjectOptions] = React.useState<SubjectOption[]>([]);

  const [passFail, setPassFail] = React.useState<PassFailEntry[]>([]);
  const [distribution, setDistribution] = React.useState<GradeDistributionBucket[]>([]);
  const [performers, setPerformers] = React.useState<TopBottomPerformersResult | null>(null);
  const [trends, setTrends] = React.useState<GradeTrendDataPoint[]>([]);
  const [difficulty, setDifficulty] = React.useState<SubjectDifficultyEntry[]>([]);
  const [gpa, setGpa] = React.useState<GpaDistributionBucket[]>([]);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiClient<{ data: YearGroupOption[] }>('/api/v1/year-groups')
      .then((res) => setYearGroupOptions(res.data))
      .catch((err: unknown) => console.error('[reports/grades] year-groups', err));
    apiClient<{ data: SubjectOption[] } | SubjectOption[]>('/api/v1/subjects')
      .then((res) => {
        const list = Array.isArray(res) ? res : res.data;
        setSubjectOptions(list);
      })
      .catch((err: unknown) => console.error('[reports/grades] subjects', err));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (yearGroup !== 'all') qs.set('year_group_id', yearGroup);
        if (subject !== 'all') qs.set('subject_id', subject);
        const suffix = qs.toString() ? `?${qs.toString()}` : '';

        const [passFailRes, distRes, perfRes, trendsRes, diffRes, gpaRes] = await Promise.all([
          apiClient<{ data: PassFailEntry[] } | PassFailEntry[]>(
            `/api/v1/reports/analytics/grades/pass-fail-rates${suffix}`,
          ),
          apiClient<{ data: GradeDistributionBucket[] } | GradeDistributionBucket[]>(
            `/api/v1/reports/analytics/grades/distribution${suffix}`,
          ),
          apiClient<{ data: TopBottomPerformersResult } | TopBottomPerformersResult>(
            `/api/v1/reports/analytics/grades/top-bottom-performers${suffix}`,
          ),
          apiClient<{ data: GradeTrendDataPoint[] } | GradeTrendDataPoint[]>(
            `/api/v1/reports/analytics/grades/trends${suffix}`,
          ),
          apiClient<{ data: SubjectDifficultyEntry[] } | SubjectDifficultyEntry[]>(
            `/api/v1/reports/analytics/grades/subject-difficulty${
              yearGroup !== 'all' ? `?year_group_id=${yearGroup}` : ''
            }`,
          ),
          apiClient<{ data: GpaDistributionBucket[] } | GpaDistributionBucket[]>(
            `/api/v1/reports/analytics/grades/gpa-distribution${
              yearGroup !== 'all' ? `?year_group_id=${yearGroup}` : ''
            }`,
          ),
        ]);

        if (cancelled) return;
        const pf = Array.isArray(passFailRes) ? passFailRes : passFailRes.data;
        const dist = Array.isArray(distRes) ? distRes : distRes.data;
        const perfRaw =
          (perfRes as { data?: TopBottomPerformersResult }).data ??
          (perfRes as TopBottomPerformersResult);
        const tr = Array.isArray(trendsRes) ? trendsRes : trendsRes.data;
        const diff = Array.isArray(diffRes) ? diffRes : diffRes.data;
        const gp = Array.isArray(gpaRes) ? gpaRes : gpaRes.data;

        setPassFail(pf);
        setDistribution(dist);
        setPerformers(perfRaw);
        setTrends(tr);
        setDifficulty(diff);
        setGpa(gp);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('[reports/grades] analytics', err);
        setError(err instanceof Error ? err.message : t('analytics.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [yearGroup, subject, t]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pass-fail', label: t('grades.tabPassFail') },
    { key: 'distribution', label: t('grades.tabDistribution') },
    { key: 'performers', label: t('grades.tabPerformers') },
    { key: 'trends', label: t('grades.tabTrends') },
    { key: 'difficulty', label: t('grades.tabDifficulty') },
    { key: 'gpa', label: t('grades.tabGPA') },
  ];

  const aiData = React.useMemo(
    () => ({
      year_group_id: yearGroup === 'all' ? null : yearGroup,
      subject_id: subject === 'all' ? null : subject,
      tab: activeTab,
      pass_fail_count: passFail.length,
      avg_pass_rate:
        passFail.length === 0
          ? null
          : Math.round(passFail.reduce((a, b) => a + b.pass_rate, 0) / passFail.length),
      bucket_count: distribution.length,
      hardest_subject: difficulty[0]?.subject_name ?? null,
    }),
    [yearGroup, subject, activeTab, passFail, distribution, difficulty],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('grades.title')}
        description={t('grades.description')}
        actions={<ReportPageActions disabled />}
      />

      <AiSummaryPanel
        mode={{ kind: 'report', reportKey: 'grades', data: aiData }}
        fallback={t('grades.aiSummaryFallback')}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-1 text-sm font-medium text-text-primary">{t('yearGroup')}</p>
          <Select value={yearGroup} onValueChange={setYearGroup}>
            <SelectTrigger className="w-44">
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
        <div>
          <p className="mb-1 text-sm font-medium text-text-primary">{t('grades.subject')}</p>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('grades.allSubjects')}</SelectItem>
              {subjectOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
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
          {/* Pass / Fail */}
          {activeTab === 'pass-fail' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
                {passFail.length === 0 ? (
                  <p className="text-sm text-text-tertiary">{t('noData')}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={passFail} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="subject_name" className="text-xs" />
                      <YAxis domain={[0, 100]} className="text-xs" />
                      <Tooltip
                        formatter={(value, name) => {
                          const v = Number(value);
                          return name === 'pass_rate'
                            ? [`${Math.round(v)}%`, t('grades.pass')]
                            : [String(value), String(name)];
                        }}
                      />
                      <Bar
                        dataKey="pass_rate"
                        name={t('grades.pass')}
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('grades.subject')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('grades.pass')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('grades.fail')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {passFail.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-text-tertiary">
                          {t('noData')}
                        </td>
                      </tr>
                    ) : (
                      passFail.map((row) => (
                        <tr
                          key={row.subject_id}
                          className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-text-primary">
                            {row.subject_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-emerald-600">
                            {Math.round(row.pass_rate)}%
                          </td>
                          <td className="px-4 py-3 text-sm text-red-500">
                            {Math.round(100 - row.pass_rate)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Distribution */}
          {activeTab === 'distribution' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('grades.distributionTitle')}
              </h3>
              {distribution.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={distribution} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="bucket_label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name={t('grades.studentCount')}
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Performers */}
          {activeTab === 'performers' && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <PerformerTable
                title={t('grades.topPerformers')}
                tone="emerald"
                rows={performers?.top_performers ?? []}
                emptyLabel={t('noData')}
              />
              <PerformerTable
                title={t('grades.bottomPerformers')}
                tone="red"
                rows={performers?.bottom_performers ?? []}
                emptyLabel={t('noData')}
              />
            </div>
          )}

          {/* Trends */}
          {activeTab === 'trends' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('grades.trendsTitle')}
              </h3>
              {trends.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trends} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="period_label" className="text-xs" />
                    <YAxis domain={[40, 100]} className="text-xs" />
                    <Tooltip
                      formatter={(value) => [
                        `${Math.round(Number(value))}%`,
                        t('grades.averageGrade'),
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="average_score"
                      name={t('grades.averageGrade')}
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Subject Difficulty */}
          {activeTab === 'difficulty' && (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      #
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('grades.subject')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('grades.averageScore')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('grades.difficultyBar')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {difficulty.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-tertiary">
                        {t('noData')}
                      </td>
                    </tr>
                  ) : (
                    difficulty.map((row) => (
                      <tr
                        key={row.subject_id}
                        className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                      >
                        <td className="px-4 py-3 text-sm text-text-tertiary">
                          {row.difficulty_rank}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">
                          {row.subject_name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              row.average_score >= 80
                                ? 'bg-emerald-100 text-emerald-700'
                                : row.average_score >= 70
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {Math.round(row.average_score)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-secondary">
                            <div
                              className={`h-2 rounded-full ${
                                row.average_score >= 80
                                  ? 'bg-emerald-500'
                                  : row.average_score >= 70
                                    ? 'bg-amber-400'
                                    : 'bg-red-400'
                              }`}
                              style={{ width: `${Math.min(row.average_score, 100)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* GPA */}
          {activeTab === 'gpa' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('grades.gpaDistributionTitle')}
              </h3>
              {gpa.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={gpa} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="bucket_label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name={t('grades.studentCount')}
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
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

// ─── Sub-component: performer table ─────────────────────────────────────────

function PerformerTable({
  title,
  rows,
  tone,
  emptyLabel,
}: {
  title: string;
  rows: StudentPerformanceEntry[];
  tone: 'emerald' | 'red';
  emptyLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div
        className={`border-b border-border px-4 py-3 ${
          tone === 'emerald' ? 'bg-emerald-50' : 'bg-red-50'
        }`}
      >
        <h3
          className={`text-sm font-semibold ${
            tone === 'emerald' ? 'text-emerald-800' : 'text-red-800'
          }`}
        >
          {title}
        </h3>
      </div>
      <table className="w-full">
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-sm text-text-tertiary">{emptyLabel}</td>
            </tr>
          ) : (
            rows.map((s, i) => (
              <tr
                key={s.student_id}
                className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
              >
                <td className="px-4 py-3 text-sm text-text-tertiary font-mono">{i + 1}</td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-text-primary">{s.student_name}</p>
                  <p className="text-xs text-text-tertiary">{s.year_group_name ?? '—'}</p>
                </td>
                <td className="px-4 py-3 text-end">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      tone === 'emerald'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {Math.round(s.average_score)}%
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
