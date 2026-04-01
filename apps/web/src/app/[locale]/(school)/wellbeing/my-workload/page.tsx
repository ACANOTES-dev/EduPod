'use client';

import { AlertCircle, Info, RefreshCw } from 'lucide-react';
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

import { SmallSchoolGuidance } from '../_components/small-school-guidance';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


// ── Types ────────────────────────────────────────────────────────────────────

interface PersonalWorkloadSummary {
  teaching_periods_per_week: number;
  cover_duties_this_term: number;
  school_average_covers: number;
  timetable_quality_score: number;
  timetable_quality_label: 'Good' | 'Moderate' | 'Needs attention';
  trend: {
    previous_term_periods: number | null;
    previous_term_covers: number | null;
  } | null;
  status: 'normal' | 'elevated' | 'high';
}

interface CoverHistoryEntry {
  date: string;
  period: string;
  subject: string | null;
  original_teacher: 'Colleague';
}

interface CoverHistoryResponse {
  data: CoverHistoryEntry[];
  meta: { page: number; pageSize: number; total: number };
}

interface PersonalTimetableQuality {
  free_period_distribution: Array<{ weekday: number; free_count: number }>;
  consecutive_periods: { max: number; average: number };
  split_days_count: number;
  room_changes: { average: number; max: number };
  school_averages: {
    consecutive_max: number;
    free_distribution_score: number;
    split_days_pct: number;
    room_changes_avg: number;
  };
  composite_score: number;
  composite_label: 'Good' | 'Moderate' | 'Needs attention';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function qualityColor(label: 'Good' | 'Moderate' | 'Needs attention'): string {
  switch (label) {
    case 'Good':
      return 'text-green-600 dark:text-green-400';
    case 'Moderate':
      return 'text-amber-600 dark:text-amber-400';
    case 'Needs attention':
      return 'text-red-600 dark:text-red-400';
  }
}

function qualityBg(label: 'Good' | 'Moderate' | 'Needs attention'): string {
  switch (label) {
    case 'Good':
      return 'bg-green-50 dark:bg-green-900/10';
    case 'Moderate':
      return 'bg-amber-50 dark:bg-amber-900/10';
    case 'Needs attention':
      return 'bg-red-50 dark:bg-red-900/10';
  }
}

const WEEKDAY_KEYS: Record<number, string> = {
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
};

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-secondary ${className ?? ''}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPulse className="h-8 w-48" />
      <SkeletonPulse className="h-12 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SkeletonPulse className="h-28 rounded-2xl" />
        <SkeletonPulse className="h-28 rounded-2xl" />
        <SkeletonPulse className="h-28 rounded-2xl" />
      </div>
      <SkeletonPulse className="h-64 rounded-xl" />
      <SkeletonPulse className="h-48 rounded-xl" />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MyWorkloadPage() {
  const t = useTranslations('wellbeing.myWorkload');

  const [summary, setSummary] = React.useState<PersonalWorkloadSummary | null>(null);
  const [coverHistory, setCoverHistory] = React.useState<CoverHistoryResponse | null>(null);
  const [quality, setQuality] = React.useState<PersonalTimetableQuality | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    setError(false);

    Promise.all([
      apiClient<PersonalWorkloadSummary>('/api/v1/staff-wellbeing/my-workload/summary'),
      apiClient<CoverHistoryResponse>(
        '/api/v1/staff-wellbeing/my-workload/cover-history?page=1&pageSize=20',
      ),
      apiClient<PersonalTimetableQuality>('/api/v1/staff-wellbeing/my-workload/timetable-quality'),
    ])
      .then(([summaryRes, coverRes, qualityRes]) => {
        setSummary(summaryRes);
        setCoverHistory(coverRes);
        setQuality(qualityRes);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error || !summary) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader title={t('title')} />
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface p-8 text-center">
          <AlertCircle className="h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">Unable to load workload data</p>
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const qualityLabel = summary.timetable_quality_label;

  const translatedLabel =
    qualityLabel === 'Good'
      ? t('good')
      : qualityLabel === 'Moderate'
        ? t('moderate')
        : t('needsAttention');

  // Build chart data for free period distribution (Mon-Fri)
  const freePeriodData = [1, 2, 3, 4, 5].map((weekday) => {
    const entry = quality?.free_period_distribution.find((d) => d.weekday === weekday);
    return {
      day: t(WEEKDAY_KEYS[weekday] as 'mon' | 'tue' | 'wed' | 'thu' | 'fri'),
      free: entry?.free_count ?? 0,
    };
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader title={t('title')} />

      {/* Privacy note */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/10">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-blue-700 dark:text-blue-300">{t('privacyNote')}</p>
      </div>

      {/* Small school guidance */}
      <SmallSchoolGuidance staffCount={0} />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label={t('teachingPeriods')}
          value={summary.teaching_periods_per_week}
          trend={{
            direction: 'neutral',
            label: t('ofMax', { max: 22 }),
          }}
        />
        <StatCard
          label={t('coverDuties')}
          value={summary.cover_duties_this_term}
          trend={{
            direction:
              summary.cover_duties_this_term > summary.school_average_covers
                ? 'up'
                : summary.cover_duties_this_term < summary.school_average_covers
                  ? 'down'
                  : 'neutral',
            label: t('schoolAverage', { avg: summary.school_average_covers }),
          }}
        />
        <div className={`rounded-2xl p-5 ${qualityBg(qualityLabel)}`}>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t('timetableQuality')}
          </p>
          <p className="mt-1 text-[28px] font-semibold leading-tight text-text-primary">
            <span dir="ltr">{summary.timetable_quality_score}</span>
          </p>
          <p className={`mt-1 text-xs font-medium ${qualityColor(qualityLabel)}`}>
            {translatedLabel}
          </p>
        </div>
      </div>

      {/* Cover history */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-text-primary">{t('coverHistory')}</h2>
          <p className="text-xs text-text-tertiary">
            {t('runningTotal', { total: coverHistory?.meta.total ?? 0 })}
            <span className="ms-2">
              {t('schoolAverage', { avg: summary.school_average_covers })}
            </span>
          </p>
        </div>

        {!coverHistory || coverHistory.data.length === 0 ? (
          <p className="mt-4 text-sm text-text-tertiary">{t('noCoverHistory')}</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-border text-text-tertiary">
                    <th className="pb-2 pe-4 text-start text-xs font-medium uppercase tracking-wider">
                      {t('date')}
                    </th>
                    <th className="pb-2 pe-4 text-start text-xs font-medium uppercase tracking-wider">
                      {t('period')}
                    </th>
                    <th className="pb-2 pe-4 text-start text-xs font-medium uppercase tracking-wider">
                      {t('subject')}
                    </th>
                    <th className="pb-2 text-start text-xs font-medium uppercase tracking-wider">
                      {t('coveredFor')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {coverHistory.data.map((entry, idx) => (
                    <tr key={idx} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pe-4 text-text-primary">
                        <span dir="ltr">{new Date(entry.date).toLocaleDateString()}</span>
                      </td>
                      <td className="py-2.5 pe-4 text-text-primary">
                        <span dir="ltr">{entry.period}</span>
                      </td>
                      <td className="py-2.5 pe-4 text-text-secondary">
                        {entry.subject ?? '\u2014'}
                      </td>
                      <td className="py-2.5 text-text-secondary">{entry.original_teacher}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="mt-4 space-y-3 md:hidden">
              {coverHistory.data.map((entry, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-border/50 bg-surface-secondary p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-tertiary">{t('date')}</span>
                    <span className="text-sm text-text-primary" dir="ltr">
                      {new Date(entry.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-text-tertiary">{t('period')}</span>
                    <span className="text-sm text-text-primary" dir="ltr">
                      {entry.period}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-text-tertiary">{t('subject')}</span>
                    <span className="text-sm text-text-secondary">{entry.subject ?? '\u2014'}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-text-tertiary">
                      {t('coveredFor')}
                    </span>
                    <span className="text-sm text-text-secondary">{entry.original_teacher}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Timetable quality breakdown */}
      {quality && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-primary">{t('timetableBreakdown')}</h2>

          {/* Free period distribution chart */}
          <div className="mt-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('freePeriods')}
            </h3>
            <div className="mt-2 h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={freePeriodData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                    }}
                  />
                  <Bar dataKey="free" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {freePeriodData.map((entry, index) => (
                      <Cell key={index} fill={entry.free === 0 ? '#ef4444' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Metrics grid */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Consecutive periods */}
            <div className="rounded-lg border border-border/50 bg-surface-secondary p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('consecutivePeriods')}
              </h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-semibold ${
                    quality.consecutive_periods.max >= 4
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-text-primary'
                  }`}
                  dir="ltr"
                >
                  {quality.consecutive_periods.max}
                </span>
                <span className="text-xs text-text-tertiary">
                  {t('maxPerDay', { max: quality.consecutive_periods.max })}
                </span>
              </div>
              {quality.consecutive_periods.max >= 4 && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t('highlighted')}</p>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
                <span>
                  {t('you')}: <span dir="ltr">{quality.consecutive_periods.max}</span>
                </span>
                <span>
                  {t('average')}: <span dir="ltr">{quality.school_averages.consecutive_max}</span>
                </span>
              </div>
            </div>

            {/* Split days */}
            <div className="rounded-lg border border-border/50 bg-surface-secondary p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('splitDays')}
              </h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-text-primary" dir="ltr">
                  {quality.split_days_count}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
                <span>
                  {t('you')}: <span dir="ltr">{quality.split_days_count}</span>
                </span>
                <span>
                  {t('average')}:{' '}
                  <span dir="ltr">{Math.round(quality.school_averages.split_days_pct * 100)}%</span>
                </span>
              </div>
            </div>

            {/* Room changes */}
            <div className="rounded-lg border border-border/50 bg-surface-secondary p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('roomChanges')}
              </h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-text-primary" dir="ltr">
                  {quality.room_changes.average.toFixed(1)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
                <span>
                  {t('you')}: <span dir="ltr">{quality.room_changes.average.toFixed(1)}</span>
                </span>
                <span>
                  {t('average')}:{' '}
                  <span dir="ltr">{quality.school_averages.room_changes_avg.toFixed(1)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trend section */}
      {summary.trend ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-primary">{t('trend')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Teaching periods trend */}
            <div className="rounded-lg border border-border/50 bg-surface-secondary p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('teachingPeriods')}
              </h3>
              <div className="mt-3 flex items-end gap-4">
                <div>
                  <p className="text-xs text-text-tertiary">{t('thisTerm')}</p>
                  <p className="text-xl font-semibold text-text-primary" dir="ltr">
                    {summary.teaching_periods_per_week}
                  </p>
                </div>
                {summary.trend.previous_term_periods !== null && (
                  <div>
                    <p className="text-xs text-text-tertiary">{t('lastTerm')}</p>
                    <p className="text-xl font-semibold text-text-tertiary" dir="ltr">
                      {summary.trend.previous_term_periods}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Cover duties trend */}
            <div className="rounded-lg border border-border/50 bg-surface-secondary p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('coverDuties')}
              </h3>
              <div className="mt-3 flex items-end gap-4">
                <div>
                  <p className="text-xs text-text-tertiary">{t('thisTerm')}</p>
                  <p className="text-xl font-semibold text-text-primary" dir="ltr">
                    {summary.cover_duties_this_term}
                  </p>
                </div>
                {summary.trend.previous_term_covers !== null && (
                  <div>
                    <p className="text-xs text-text-tertiary">{t('lastTerm')}</p>
                    <p className="text-xl font-semibold text-text-tertiary" dir="ltr">
                      {summary.trend.previous_term_covers}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-primary">{t('trend')}</h2>
          <p className="mt-2 text-sm text-text-tertiary">{t('noTrendData')}</p>
        </div>
      )}
    </div>
  );
}
