'use client';

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

import { StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { AiSummaryPanel } from '../_components/ai-summary-panel';
import { InfoTooltip } from '../_components/info-tooltip';
import { ReportPageActions } from '../_components/report-page-actions';

// ─── Response shapes (match staff-analytics.service.ts) ───────────────────────

interface HeadcountByDepartmentEntry {
  department: string;
  count: number;
  active_count: number;
}

interface StaffStudentRatioResult {
  active_staff: number;
  active_students: number;
  ratio: string;
  students_per_teacher: number;
}

interface TenureDistributionBucket {
  bucket_label: string;
  min_years: number;
  max_years: number;
  count: number;
  percentage: number;
}

interface StaffAttendanceRateResult {
  total_records: number;
  present_count: number;
  absent_count: number;
  attendance_rate: number;
}

interface QualificationCoverageEntry {
  subject_id: string;
  subject_name: string;
  has_qualified_teacher: boolean;
  teacher_count: number;
}

interface CompensationDistributionBucket {
  bucket_label: string;
  min_salary: number;
  max_salary: number;
  count: number;
  percentage: number;
}

type Tab = 'headcount' | 'ratio' | 'tenure' | 'attendance' | 'qualifications' | 'compensation';

export default function StaffAnalyticsPage() {
  const t = useTranslations('reports');
  const [activeTab, setActiveTab] = React.useState<Tab>('headcount');

  const [headcount, setHeadcount] = React.useState<HeadcountByDepartmentEntry[]>([]);
  const [ratio, setRatio] = React.useState<StaffStudentRatioResult | null>(null);
  const [tenure, setTenure] = React.useState<TenureDistributionBucket[]>([]);
  const [attendance, setAttendance] = React.useState<StaffAttendanceRateResult | null>(null);
  const [qualifications, setQualifications] = React.useState<QualificationCoverageEntry[]>([]);
  const [compensation, setCompensation] = React.useState<CompensationDistributionBucket[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [hcRes, ratioRes, tenRes, attRes, qualRes, compRes] = await Promise.all([
          apiClient<{ data: HeadcountByDepartmentEntry[] } | HeadcountByDepartmentEntry[]>(
            '/api/v1/reports/analytics/staff/headcount',
          ),
          apiClient<{ data: StaffStudentRatioResult } | StaffStudentRatioResult>(
            '/api/v1/reports/analytics/staff/ratio',
          ),
          apiClient<{ data: TenureDistributionBucket[] } | TenureDistributionBucket[]>(
            '/api/v1/reports/analytics/staff/tenure',
          ),
          apiClient<{ data: StaffAttendanceRateResult } | StaffAttendanceRateResult>(
            '/api/v1/reports/analytics/staff/attendance',
          ),
          apiClient<{ data: QualificationCoverageEntry[] } | QualificationCoverageEntry[]>(
            '/api/v1/reports/analytics/staff/qualification-coverage',
          ),
          apiClient<{ data: CompensationDistributionBucket[] } | CompensationDistributionBucket[]>(
            '/api/v1/reports/analytics/staff/compensation-distribution',
          ),
        ]);
        if (cancelled) return;
        setHeadcount(Array.isArray(hcRes) ? hcRes : hcRes.data);
        setRatio(
          (ratioRes as { data?: StaffStudentRatioResult }).data ??
            (ratioRes as StaffStudentRatioResult),
        );
        setTenure(Array.isArray(tenRes) ? tenRes : tenRes.data);
        setAttendance(
          (attRes as { data?: StaffAttendanceRateResult }).data ??
            (attRes as StaffAttendanceRateResult),
        );
        setQualifications(Array.isArray(qualRes) ? qualRes : qualRes.data);
        setCompensation(Array.isArray(compRes) ? compRes : compRes.data);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('[reports/staff] load', err);
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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'headcount', label: t('staff.tabHeadcount') },
    { key: 'ratio', label: t('staff.tabRatio') },
    { key: 'tenure', label: t('staff.tabTenure') },
    { key: 'attendance', label: t('staff.tabAttendance') },
    { key: 'qualifications', label: t('staff.tabQualifications') },
    { key: 'compensation', label: t('staff.tabCompensation') },
  ];

  const aiData = React.useMemo(
    () => ({
      headcount_total: headcount.reduce((a, b) => a + b.count, 0),
      active_staff: ratio?.active_staff ?? null,
      students_per_teacher: ratio?.students_per_teacher ?? null,
      qualification_gaps: qualifications.filter((q) => !q.has_qualified_teacher).length,
      attendance_rate: attendance?.attendance_rate ?? null,
    }),
    [headcount, ratio, qualifications, attendance],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('staff.title')}
        description={t('staff.description')}
        actions={<ReportPageActions disabled />}
      />

      <AiSummaryPanel
        mode={{ kind: 'report', reportKey: 'staff', data: aiData }}
        fallback={t('staff.aiSummaryFallback')}
      />

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
          {activeTab === 'headcount' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-primary">
                {t('staff.headcountTitle')}
                <InfoTooltip text={t('staff.headcountTooltip')} />
              </h3>
              {headcount.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={headcount} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="department" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="count" name={t('staff.staffCount')} radius={[4, 4, 0, 0]}>
                      {headcount.map((row, i) => (
                        <Cell
                          key={row.department || `dept-${i}`}
                          fill={
                            ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#ec4899'][
                              i % 6
                            ]
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {activeTab === 'ratio' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard label={t('staff.currentRatio')} value={ratio?.ratio ?? '—'} />
                <StatCard label={t('staff.totalStudents')} value={ratio?.active_students ?? 0} />
                <StatCard label={t('staff.totalTeachingStaff')} value={ratio?.active_staff ?? 0} />
              </div>
              <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
                <h3 className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-text-primary">
                  {t('staff.ratioTooltipTitle')}
                  <InfoTooltip text={t('staff.ratioTooltip')} />
                </h3>
                <p className="text-sm text-text-secondary">
                  {ratio
                    ? t('staff.ratioSummary', {
                        students: ratio.active_students,
                        staff: ratio.active_staff,
                      })
                    : t('noData')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'tenure' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-primary">
                {t('staff.tenureTitle')}
                <InfoTooltip text={t('staff.tenureTooltip')} />
              </h3>
              {tenure.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={tenure} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="bucket_label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name={t('staff.staffCount')}
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="space-y-4">
              {attendance && attendance.total_records > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StatCard
                    label={t('staff.attendanceRate')}
                    value={`${Math.round(attendance.attendance_rate)}%`}
                  />
                  <StatCard label={t('staff.daysPresent')} value={attendance.present_count} />
                  <StatCard label={t('staff.daysAbsent')} value={attendance.absent_count} />
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
                  <p className="text-sm text-text-secondary">{t('staff.attendanceNote')}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'qualifications' && (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    {['subject', 'qualifiedTeachers', 'coverage'].map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                      >
                        {t(`staff.col.${col}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qualifications.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-text-tertiary">
                        {t('noData')}
                      </td>
                    </tr>
                  ) : (
                    qualifications.map((row) => (
                      <tr
                        key={row.subject_id}
                        className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">
                          {row.subject_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {row.teacher_count}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.has_qualified_teacher ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                          >
                            {row.has_qualified_teacher ? t('staff.covered') : t('staff.gap')}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'compensation' && (
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-primary">
                {t('staff.compensationTitle')}
                <InfoTooltip text={t('staff.compensationTooltip')} />
              </h3>
              {compensation.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('noData')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={compensation} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="bucket_label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name={t('staff.staffCount')}
                      fill="#f59e0b"
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
