'use client';

import { GraduationCap, Search } from 'lucide-react';
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

import { EmptyState, Input } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { AiSummaryPanel } from '../_components/ai-summary-panel';
import { ReportPageActions } from '../_components/report-page-actions';
import { StudentRiskPanel } from '../_components/student-risk-panel';

interface StudentSearchResult {
  id: string;
  name: string;
  year_group: string;
  student_number: string | null;
}

interface SearchResponse {
  data: StudentSearchResult[];
}

interface SubjectGradeTrend {
  subject_id: string;
  subject_name: string;
  grades: Array<{ period_name: string; score: number; max_score: number }>;
}

interface AttendanceTrendEntry {
  period_label: string;
  attendance_rate: number;
  total_sessions: number;
}

interface RiskAlertEntry {
  alert_id: string;
  alert_type: string;
  severity: string;
  created_at: string;
  acknowledged_at: string | null;
}

interface StudentProgressReport {
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  class_name: string | null;
  grade_trends: SubjectGradeTrend[];
  attendance_trend: AttendanceTrendEntry[];
  risk_alerts: RiskAlertEntry[];
  overall_progress_score: number;
}

export default function StudentProgressPage() {
  const t = useTranslations('reports');

  const [search, setSearch] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentSearchResult | null>(null);

  const [progress, setProgress] = React.useState<StudentProgressReport | null>(null);
  const [progressLoading, setProgressLoading] = React.useState(false);
  const [progressError, setProgressError] = React.useState<string | null>(null);

  const handleSearch = React.useCallback(async () => {
    if (search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await apiClient<SearchResponse>(
        `/api/v1/students/search?q=${encodeURIComponent(search)}&pageSize=8`,
      );
      setSearchResults(res.data);
    } catch (err: unknown) {
      console.error('[reports/student-progress] search', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [search]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      void handleSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [handleSearch]);

  React.useEffect(() => {
    if (!selectedStudent) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    async function load() {
      if (!selectedStudent) return;
      setProgressLoading(true);
      setProgressError(null);
      try {
        const res = await apiClient<{ data: StudentProgressReport } | StudentProgressReport>(
          `/api/v1/reports/analytics/student-progress?student_id=${encodeURIComponent(selectedStudent.id)}`,
        );
        if (cancelled) return;
        const inner =
          (res as { data?: StudentProgressReport }).data ?? (res as StudentProgressReport);
        setProgress(inner);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('[reports/student-progress] load', err);
        setProgressError(err instanceof Error ? err.message : t('analytics.loadError'));
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent, t]);

  const aiData = React.useMemo(
    () =>
      progress
        ? {
            student_id: progress.student_id,
            year_group: progress.year_group_name,
            overall_progress_score: progress.overall_progress_score,
            subject_count: progress.grade_trends.length,
            risk_alerts_count: progress.risk_alerts.length,
          }
        : {},
    [progress],
  );

  const subjectCurrent = React.useMemo(() => {
    if (!progress) return [];
    return progress.grade_trends.map((tr) => {
      const latest = tr.grades[tr.grades.length - 1];
      const pct = latest && latest.max_score > 0 ? (latest.score / latest.max_score) * 100 : 0;
      return {
        subject: tr.subject_name,
        period: latest?.period_name ?? '—',
        pct: Math.round(pct),
      };
    });
  }, [progress]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studentProgress.title')}
        description={t('studentProgress.description')}
        actions={<ReportPageActions disabled />}
      />

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchStudentPlaceholder')}
          className="ps-10"
        />
        {!selectedStudent && search.length >= 2 && (
          <div className="absolute start-0 end-0 top-full z-10 mt-1 rounded-xl border border-border bg-surface shadow-lg">
            {searching ? (
              <p className="px-4 py-2.5 text-sm text-text-tertiary">{t('attendance.loading')}</p>
            ) : searchResults.length === 0 ? (
              <p className="px-4 py-2.5 text-sm text-text-tertiary">{t('noData')}</p>
            ) : (
              searchResults.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedStudent(s);
                    setSearch(s.name);
                    setSearchResults([]);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm hover:bg-surface-secondary first:rounded-t-xl last:rounded-b-xl"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">{s.name}</p>
                    <p className="text-xs text-text-tertiary">
                      {s.year_group} {s.student_number ? `· ${s.student_number}` : ''}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {!selectedStudent ? (
        <EmptyState
          icon={GraduationCap}
          title={t('studentProgress.selectStudentTitle')}
          description={t('studentProgress.selectStudentDesc')}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-semibold text-text-primary">{selectedStudent.name}</p>
                <p className="text-sm text-text-secondary">{selectedStudent.year_group}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedStudent(null);
                setSearch('');
                setProgress(null);
              }}
              className="text-sm text-text-secondary underline-offset-2 hover:underline"
            >
              {t('studentProgress.changeStudent')}
            </button>
          </div>

          <AiSummaryPanel
            mode={{
              kind: 'report',
              reportKey: `student-progress-${selectedStudent.id}`,
              data: aiData,
            }}
            fallback={`${selectedStudent.name} ${t('studentProgress.aiSummaryFallback')}`}
          />

          <StudentRiskPanel studentId={selectedStudent.id} />

          {progressLoading && (
            <p className="text-sm text-text-tertiary">{t('attendance.loading')}</p>
          )}
          {progressError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-900">{progressError}</p>
            </div>
          )}

          {!progressLoading && !progressError && progress && (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
                  <h3 className="mb-4 text-sm font-semibold text-text-primary">
                    {t('studentProgress.gradesTitle')}
                  </h3>
                  {subjectCurrent.length === 0 ? (
                    <p className="text-sm text-text-tertiary">{t('noData')}</p>
                  ) : (
                    <div className="space-y-3">
                      {subjectCurrent.map((row) => (
                        <div key={row.subject} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm text-text-secondary">{row.subject}</span>
                              <span className="ms-2 text-xs text-text-tertiary">{row.period}</span>
                            </div>
                            <span
                              className={`text-sm font-semibold ${row.pct >= 80 ? 'text-emerald-600' : row.pct >= 65 ? 'text-amber-600' : 'text-red-500'}`}
                            >
                              {row.pct}%
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
                            <div
                              className={`h-2 rounded-full ${row.pct >= 80 ? 'bg-emerald-500' : row.pct >= 65 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${row.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
                  <h3 className="mb-4 text-sm font-semibold text-text-primary">
                    {t('studentProgress.attendanceTitle')}
                  </h3>
                  {progress.attendance_trend.length === 0 ? (
                    <p className="text-sm text-text-tertiary">{t('noData')}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart
                        data={progress.attendance_trend}
                        margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="period_label" className="text-xs" />
                        <YAxis domain={[0, 100]} className="text-xs" />
                        <Tooltip
                          formatter={(v) => [
                            `${Math.round(typeof v === 'number' ? v : Number(v))}%`,
                            t('attendance.attendanceRate'),
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="attendance_rate"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
                <h3 className="mb-4 text-sm font-semibold text-text-primary">
                  {t('studentProgress.alertsTitle')}
                </h3>
                {progress.risk_alerts.length === 0 ? (
                  <p className="text-sm text-text-tertiary">{t('studentProgress.noAlerts')}</p>
                ) : (
                  <ol className="relative border-s border-border ps-4 space-y-4">
                    {progress.risk_alerts.map((alert) => (
                      <li key={alert.alert_id} className="ms-2">
                        <div className="absolute -start-1.5 mt-1 h-3 w-3 rounded-full border border-border bg-amber-400" />
                        <time className="text-xs text-text-tertiary">
                          {new Date(alert.created_at).toLocaleDateString()}
                        </time>
                        <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {alert.alert_type}
                        </span>
                        <p className="mt-1 text-sm text-text-secondary">
                          {t('studentProgress.severity')} {alert.severity}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {progress.grade_trends.length > 0 && (
                <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
                  <h3 className="mb-4 text-sm font-semibold text-text-primary">
                    {t('studentProgress.gradeHistoryTitle')}
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={subjectCurrent}
                      layout="vertical"
                      margin={{ top: 0, right: 16, bottom: 0, left: 100 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" domain={[0, 100]} className="text-xs" />
                      <YAxis dataKey="subject" type="category" className="text-xs" width={100} />
                      <Tooltip
                        formatter={(v) => [
                          `${Math.round(typeof v === 'number' ? v : Number(v))}%`,
                        ]}
                      />
                      <Bar dataKey="pct" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
