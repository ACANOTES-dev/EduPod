'use client';

import { StatCard } from '@school/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ── Types ────────────────────────────────────────────────────────────────────

interface AggregateWorkloadSummary {
  average_teaching_periods: number;
  range: { min: number; max: number; p25: number; p50: number; p75: number };
  over_allocated_periods_count: number;
  average_cover_duties: number;
  over_allocated_covers_count: number;
  trend: {
    previous_average_periods: number | null;
    previous_average_covers: number | null;
  } | null;
}

interface CoverFairnessResult {
  distribution: Array<{ cover_count: number; staff_count: number }>;
  gini_coefficient: number;
  range: { min: number; max: number; median: number };
  assessment:
    | 'Well distributed'
    | 'Moderate concentration'
    | 'Significant concentration \u2014 review recommended';
}

interface AggregateTimetableQuality {
  consecutive_periods: {
    mean: number;
    median: number;
    range: { min: number; max: number };
  };
  free_period_clumping: {
    mean: number;
    median: number;
    range: { min: number; max: number };
  };
  split_timetable_pct: number;
  room_changes: {
    mean: number;
    median: number;
    range: { min: number; max: number };
  };
  trend: {
    previous_consecutive_mean: number | null;
    previous_split_pct: number | null;
    previous_room_changes_mean: number | null;
  } | null;
}

interface SubstitutionPressure {
  absence_rate: number;
  cover_difficulty: number;
  unfilled_rate: number;
  composite_score: number;
  trend: Array<{ month: string; score: number }>;
  assessment: 'Low' | 'Moderate' | 'High' | 'Critical';
}

interface AbsenceTrends {
  monthly_rates: Array<{ month: string; rate: number }>;
  day_of_week_pattern: Array<{ weekday: number; rate: number }>;
  term_comparison: { current: number; previous: number | null } | null;
  seasonal_pattern: Array<{ month: number; average_rate: number }> | null;
}

interface CorrelationAccumulating {
  status: 'accumulating';
  dataPoints: number;
  requiredDataPoints: 12;
  projectedAvailableDate: string;
  message: string;
}

interface CorrelationAvailable {
  status: 'available';
  dataPoints: number;
  series: Array<{
    month: string;
    coverPressure: number;
    absenceRate: number;
  }>;
  trendDescription: string;
  disclaimer: string;
}

type CorrelationResult = CorrelationAccumulating | CorrelationAvailable;

interface DashboardData {
  workload: AggregateWorkloadSummary;
  coverFairness: CoverFairnessResult;
  timetableQuality: AggregateTimetableQuality;
  substitutionPressure: SubstitutionPressure;
  absenceTrends: AbsenceTrends;
  correlation: CorrelationResult;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type QualityLabel = 'good' | 'moderate' | 'needsAttention';

function qualityColor(label: QualityLabel): string {
  switch (label) {
    case 'good':
      return 'text-green-600 dark:text-green-400';
    case 'moderate':
      return 'text-amber-600 dark:text-amber-400';
    case 'needsAttention':
      return 'text-red-600 dark:text-red-400';
  }
}

function qualityBadgeBg(label: QualityLabel): string {
  switch (label) {
    case 'good':
      return 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400';
    case 'moderate':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400';
    case 'needsAttention':
      return 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400';
  }
}

function assessConsecutive(mean: number): QualityLabel {
  if (mean <= 2) return 'good';
  if (mean <= 3) return 'moderate';
  return 'needsAttention';
}

function assessFreeClumping(mean: number): QualityLabel {
  if (mean >= 0.7) return 'good';
  if (mean >= 0.4) return 'moderate';
  return 'needsAttention';
}

function assessSplitPct(pct: number): QualityLabel {
  if (pct <= 10) return 'good';
  if (pct <= 25) return 'moderate';
  return 'needsAttention';
}

function assessRoomChanges(mean: number): QualityLabel {
  if (mean <= 2) return 'good';
  if (mean <= 4) return 'moderate';
  return 'needsAttention';
}

function computeTimetableScore(quality: AggregateTimetableQuality): number {
  const consecutiveScore = Math.max(0, 100 - quality.consecutive_periods.mean * 20);
  const clumpingScore = quality.free_period_clumping.mean * 100;
  const splitScore = Math.max(0, 100 - quality.split_timetable_pct * 2);
  const roomScore = Math.max(0, 100 - quality.room_changes.mean * 15);
  return Math.round((consecutiveScore + clumpingScore + splitScore + roomScore) / 4);
}

function computeTimetableLabel(score: number): QualityLabel {
  if (score >= 70) return 'good';
  if (score >= 45) return 'moderate';
  return 'needsAttention';
}

function pressureColor(
  assessment: 'Low' | 'Moderate' | 'High' | 'Critical',
): string {
  switch (assessment) {
    case 'Low':
      return 'text-green-600 dark:text-green-400';
    case 'Moderate':
      return 'text-amber-600 dark:text-amber-400';
    case 'High':
      return 'text-orange-600 dark:text-orange-400';
    case 'Critical':
      return 'text-red-600 dark:text-red-400';
  }
}

function trendDirection(
  current: number,
  previous: number | null,
): 'up' | 'down' | 'neutral' {
  if (previous === null) return 'neutral';
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'neutral';
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-surface-secondary ${className ?? ''}`}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPulse className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonPulse className="h-28 rounded-2xl" />
        <SkeletonPulse className="h-28 rounded-2xl" />
        <SkeletonPulse className="h-28 rounded-2xl" />
        <SkeletonPulse className="h-28 rounded-2xl" />
      </div>
      <SkeletonPulse className="h-72 rounded-xl" />
      <SkeletonPulse className="h-64 rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SkeletonPulse className="h-32 rounded-xl" />
        <SkeletonPulse className="h-32 rounded-xl" />
        <SkeletonPulse className="h-32 rounded-xl" />
        <SkeletonPulse className="h-32 rounded-xl" />
      </div>
      <SkeletonPulse className="h-72 rounded-xl" />
      <SkeletonPulse className="h-64 rounded-xl" />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WellbeingDashboardPage() {
  const t = useTranslations('wellbeing.dashboard');

  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    setError(false);

    Promise.all([
      apiClient<AggregateWorkloadSummary>(
        '/api/v1/staff-wellbeing/aggregate/workload-summary',
      ),
      apiClient<CoverFairnessResult>(
        '/api/v1/staff-wellbeing/aggregate/cover-fairness',
      ),
      apiClient<AggregateTimetableQuality>(
        '/api/v1/staff-wellbeing/aggregate/timetable-quality',
      ),
      apiClient<SubstitutionPressure>(
        '/api/v1/staff-wellbeing/aggregate/substitution-pressure',
      ),
      apiClient<AbsenceTrends>(
        '/api/v1/staff-wellbeing/aggregate/absence-trends',
      ),
      apiClient<CorrelationResult>(
        '/api/v1/staff-wellbeing/aggregate/correlation',
      ),
    ])
      .then(
        ([
          workload,
          coverFairness,
          timetableQuality,
          substitutionPressure,
          absenceTrends,
          correlation,
        ]) => {
          setData({
            workload,
            coverFairness,
            timetableQuality,
            substitutionPressure,
            absenceTrends,
            correlation,
          });
        },
      )
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

  if (error || !data) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader title={t('title')} />
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface p-8 text-center">
          <AlertCircle className="h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">{t('error')}</p>
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
          >
            <RefreshCw className="h-4 w-4" />
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  const { workload, coverFairness, timetableQuality, substitutionPressure, correlation } =
    data;

  // ── Computed values ──────────────────────────────────────────────────────

  const timetableScore = computeTimetableScore(timetableQuality);
  const timetableLabel = computeTimetableLabel(timetableScore);

  const teachingTrendDir = trendDirection(
    workload.average_teaching_periods,
    workload.trend?.previous_average_periods ?? null,
  );

  const teachingTrendLabel =
    workload.trend?.previous_average_periods !== null && workload.trend !== null
      ? `${t('lastTerm')}: ${String(workload.trend.previous_average_periods)}`
      : t('thisTerm');

  const assessmentTranslationKey = (
    assessment: CoverFairnessResult['assessment'],
  ): string => {
    switch (assessment) {
      case 'Well distributed':
        return 'wellDistributed';
      case 'Moderate concentration':
        return 'moderateConcentration';
      default:
        return 'significantConcentration';
    }
  };

  const pressureTranslationKey = (
    assessment: SubstitutionPressure['assessment'],
  ): string => {
    switch (assessment) {
      case 'Low':
        return 'low';
      case 'Moderate':
        return 'moderate';
      case 'High':
        return 'high';
      case 'Critical':
        return 'critical';
    }
  };

  // Workload distribution: build range visualization data
  const workloadRangeData = [
    { label: t('min'), value: workload.range.min },
    { label: 'P25', value: workload.range.p25 },
    { label: 'P50', value: workload.range.p50 },
    { label: 'P75', value: workload.range.p75 },
    { label: t('max'), value: workload.range.max },
  ];

  // Consecutive periods quality
  const consecutiveLabel = assessConsecutive(
    timetableQuality.consecutive_periods.mean,
  );
  const freeLabel = assessFreeClumping(
    timetableQuality.free_period_clumping.mean,
  );
  const splitLabel = assessSplitPct(timetableQuality.split_timetable_pct);
  const roomLabel = assessRoomChanges(timetableQuality.room_changes.mean);

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title={t('title')} />

      {/* ── Section 1: Summary Strip ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('avgTeachingLoad')}
          value={workload.average_teaching_periods}
          trend={{
            direction: teachingTrendDir,
            label: `${teachingTrendLabel} \u00B7 ${t('periodsPerWeek')}`,
          }}
        />
        <StatCard
          label={t('coverFairness')}
          value={coverFairness.gini_coefficient.toFixed(2)}
          trend={{
            direction: 'neutral',
            label: t(assessmentTranslationKey(coverFairness.assessment)),
          }}
        />
        <StatCard
          label={t('timetableQualityAvg')}
          value={timetableScore}
          trend={{
            direction: 'neutral',
            label: t(timetableLabel === 'good' ? 'good' : timetableLabel === 'moderate' ? 'moderate' : 'needsAttention'),
          }}
        />
        <StatCard
          label={t('substitutionPressure')}
          value={substitutionPressure.composite_score.toFixed(1)}
          trend={{
            direction: 'neutral',
            label: t(pressureTranslationKey(substitutionPressure.assessment)),
          }}
        />
      </div>

      {/* ── Section 2: Workload Distribution ────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('workloadDistribution')}
          </h2>
          {workload.over_allocated_periods_count > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              {t('overAllocated', {
                count: workload.over_allocated_periods_count,
              })}
            </span>
          )}
        </div>

        <div className="mt-4 h-56 w-full sm:h-64" aria-label={t('workloadDistribution')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={workloadRangeData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                opacity={0.3}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12 }}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
                formatter={(v) => [String(v), t('periodsCount')]}
              />
              <Bar
                dataKey="value"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {workload.trend && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-tertiary">
            <span>
              {t('thisTerm')}:{' '}
              <span dir="ltr" className="font-medium text-text-primary">
                {workload.average_teaching_periods}
              </span>
            </span>
            {workload.trend.previous_average_periods !== null && (
              <span>
                {t('lastTerm')}:{' '}
                <span dir="ltr" className="font-medium">
                  {workload.trend.previous_average_periods}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: Cover Fairness ───────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">
          {t('coverFairnessSection')}
        </h2>

        <div className="mt-4 h-56 w-full sm:h-64" aria-label={t('coverFairnessSection')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={coverFairness.distribution}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                opacity={0.3}
              />
              <XAxis
                dataKey="cover_count"
                tick={{ fontSize: 12 }}
                tickLine={false}
                label={{
                  value: t('coverPressure'),
                  position: 'insideBottom',
                  offset: -2,
                  fontSize: 11,
                }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12 }}
                tickLine={false}
                width={32}
                label={{
                  value: t('staffCount'),
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 11,
                  offset: 10,
                }}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
                formatter={(v) => [String(v), t('staffCount')]}
              />
              <Bar
                dataKey="staff_count"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gini + range summary */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('giniCoefficient')}
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary" dir="ltr">
              {coverFairness.gini_coefficient.toFixed(3)}
            </p>
            <p
              className={`mt-0.5 text-xs font-medium ${
                coverFairness.assessment === 'Well distributed'
                  ? 'text-green-600 dark:text-green-400'
                  : coverFairness.assessment === 'Moderate concentration'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              {t(assessmentTranslationKey(coverFairness.assessment))}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('range')}
            </p>
            <div className="mt-1 flex items-baseline gap-2 text-sm">
              <span className="text-text-secondary">
                {t('min')}: <span dir="ltr" className="font-medium text-text-primary">{coverFairness.range.min}</span>
              </span>
              <span className="text-text-tertiary">/</span>
              <span className="text-text-secondary">
                {t('max')}: <span dir="ltr" className="font-medium text-text-primary">{coverFairness.range.max}</span>
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('median')}
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary" dir="ltr">
              {coverFairness.range.median}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-text-tertiary">{t('coverFairnessAdvice')}</p>
      </div>

      {/* ── Section 4: Timetable Quality ────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">
          {t('timetableQualitySection')}
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Consecutive teaching */}
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('consecutivePeriods')}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold ${qualityColor(consecutiveLabel)}`}
                dir="ltr"
              >
                {timetableQuality.consecutive_periods.mean.toFixed(1)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${qualityBadgeBg(consecutiveLabel)}`}
              >
                {t(consecutiveLabel === 'needsAttention' ? 'needsAttention' : consecutiveLabel)}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              {t('range')}:{' '}
              <span dir="ltr">
                {timetableQuality.consecutive_periods.range.min}&ndash;{timetableQuality.consecutive_periods.range.max}
              </span>
            </p>
          </div>

          {/* Free period distribution */}
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('freeDistribution')}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold ${qualityColor(freeLabel)}`}
                dir="ltr"
              >
                {timetableQuality.free_period_clumping.mean.toFixed(2)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${qualityBadgeBg(freeLabel)}`}
              >
                {t(freeLabel === 'needsAttention' ? 'needsAttention' : freeLabel)}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              {t('range')}:{' '}
              <span dir="ltr">
                {timetableQuality.free_period_clumping.range.min.toFixed(2)}&ndash;{timetableQuality.free_period_clumping.range.max.toFixed(2)}
              </span>
            </p>
          </div>

          {/* Split timetable */}
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('splitTimetable')}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold ${qualityColor(splitLabel)}`}
                dir="ltr"
              >
                {timetableQuality.split_timetable_pct.toFixed(0)}%
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${qualityBadgeBg(splitLabel)}`}
              >
                {t(splitLabel === 'needsAttention' ? 'needsAttention' : splitLabel)}
              </span>
            </div>
          </div>

          {/* Room changes */}
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('roomChanges')}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold ${qualityColor(roomLabel)}`}
                dir="ltr"
              >
                {timetableQuality.room_changes.mean.toFixed(1)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${qualityBadgeBg(roomLabel)}`}
              >
                {t(roomLabel === 'needsAttention' ? 'needsAttention' : roomLabel)}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              {t('range')}:{' '}
              <span dir="ltr">
                {timetableQuality.room_changes.range.min.toFixed(1)}&ndash;{timetableQuality.room_changes.range.max.toFixed(1)}
              </span>
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-text-tertiary">{t('timetableAdvice')}</p>
      </div>

      {/* ── Section 5: Substitution Pressure ────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('substitutionPressureSection')}
          </h2>
          <span
            className={`text-sm font-semibold ${pressureColor(substitutionPressure.assessment)}`}
          >
            {t(pressureTranslationKey(substitutionPressure.assessment))}
          </span>
        </div>

        {/* Trend line chart */}
        {substitutionPressure.trend.length > 0 && (
          <div className="mt-4 h-56 w-full sm:h-64" aria-label={t('substitutionPressureSection')}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={substitutionPressure.trend}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  opacity={0.3}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  width={32}
                  domain={[0, 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Component breakdown */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('absenceRate')}
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary" dir="ltr">
              {(substitutionPressure.absence_rate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('coverDifficulty')}
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary" dir="ltr">
              {(substitutionPressure.cover_difficulty * 100).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-surface-secondary p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('unfilledRate')}
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary" dir="ltr">
              {(substitutionPressure.unfilled_rate * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-text-tertiary">
          {t('pressureCorrelation')}
        </p>
      </div>

      {/* ── Section 6: Correlation ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">
          {t('correlationSection')}
        </h2>

        {correlation.status === 'accumulating' ? (
          <CorrelationAccumulatingView
            correlation={correlation}
            t={t}
          />
        ) : (
          <CorrelationAvailableView
            correlation={correlation}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

// ── Correlation Sub-Components ───────────────────────────────────────────────

type TranslationFn = ReturnType<typeof useTranslations>;

function CorrelationAccumulatingView({
  correlation,
  t,
}: {
  correlation: CorrelationAccumulating;
  t: TranslationFn;
}) {
  const progress = (correlation.dataPoints / correlation.requiredDataPoints) * 100;

  return (
    <div className="mt-4">
      <p className="text-sm text-text-secondary">{t('correlationAccumulating')}</p>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-text-tertiary">
          <span>
            {t('correlationProgress', {
              count: correlation.dataPoints,
              required: correlation.requiredDataPoints,
            })}
          </span>
          <span dir="ltr">{Math.round(progress)}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-text-tertiary">
        {t('correlationAvailableFrom', {
          date: correlation.projectedAvailableDate,
        })}
      </p>

      <p className="mt-2 text-xs text-text-tertiary">
        {t('correlationExplanation')}
      </p>
    </div>
  );
}

function CorrelationAvailableView({
  correlation,
  t,
}: {
  correlation: CorrelationAvailable;
  t: TranslationFn;
}) {
  return (
    <div className="mt-4">
      {/* Dual-axis line chart */}
      <div className="h-56 w-full sm:h-72" aria-label={t('correlationSection')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={correlation.series}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              opacity={0.3}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12 }}
              tickLine={false}
              width={36}
              domain={[0, 'auto']}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12 }}
              tickLine={false}
              width={36}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="coverPressure"
              name={t('coverPressure')}
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="absenceRate"
              name={t('absenceRate')}
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-sm text-text-secondary">
        {correlation.trendDescription}
      </p>

      {/* Permanent non-dismissable disclaimer */}
      <div className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-900/10">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
          {t('correlationDisclaimer')}
        </p>
      </div>
    </div>
  );
}
