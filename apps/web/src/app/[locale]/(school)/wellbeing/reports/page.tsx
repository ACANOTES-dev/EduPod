'use client';

import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, Minus, Printer, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ── Types ────────────────────────────────────────────────────────────────────

interface BoardReportSummary {
  workload_distribution: {
    average_periods: number;
    range: { min: number; max: number };
    over_allocated_count: number;
  };
  cover_fairness: {
    gini_coefficient: number;
    distribution_shape: string;
    assessment: string;
  };
  timetable_quality: {
    average_score: number;
    label: 'Good' | 'Moderate' | 'Needs attention';
  };
  substitution_pressure: {
    composite_score: number;
    assessment: string;
    trend_direction: 'improving' | 'stable' | 'worsening' | null;
  };
  absence_pattern: {
    current_term_rate: number;
    previous_term_rate: number | null;
    highest_day: string | null;
  };
  correlation_insight: {
    status: 'accumulating' | 'available';
    summary: string;
  } | null;
  generated_at: string;
  term_name: string;
  academic_year_name: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function qualityColor(label: 'Good' | 'Moderate' | 'Needs attention'): string {
  switch (label) {
    case 'Good':
      return 'text-green-700 dark:text-green-400';
    case 'Moderate':
      return 'text-amber-700 dark:text-amber-400';
    case 'Needs attention':
      return 'text-red-700 dark:text-red-400';
  }
}

function qualityBadgeBg(label: 'Good' | 'Moderate' | 'Needs attention'): string {
  switch (label) {
    case 'Good':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
    case 'Moderate':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
    case 'Needs attention':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
  }
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-secondary ${className ?? ''}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SkeletonPulse className="h-8 w-56" />
        <SkeletonPulse className="h-10 w-full sm:w-36" />
      </div>
      <SkeletonPulse className="h-14 w-full rounded-xl" />
      {[...Array<null>(6)].map((_, i) => (
        <SkeletonPulse key={i} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 print:rounded-none print:border-x-0 print:border-t-0 print:p-0 print:pt-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
        {title}
      </h2>
      {children}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="text-end font-medium text-text-primary">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/50" />;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BoardReportPage() {
  const t = useTranslations('wellbeing.reports');

  const [report, setReport] = React.useState<BoardReportSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const fetchReport = React.useCallback(() => {
    setLoading(true);
    setError(false);

    apiClient<BoardReportSummary>('/api/v1/staff-wellbeing/reports/termly-summary')
      .then((data) => {
        setReport(data);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handlePrint = React.useCallback(() => {
    window.print();
  }, []);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error || !report) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader title={t('title')} />
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface p-8 text-center">
          <AlertCircle className="h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">{t('notAvailable')}</p>
          <button
            type="button"
            onClick={fetchReport}
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const {
    workload_distribution,
    cover_fairness,
    timetable_quality,
    substitution_pressure,
    absence_pattern,
    correlation_insight,
    generated_at,
    term_name,
    academic_year_name,
  } = report;

  const qualityLabelKey =
    timetable_quality.label === 'Good'
      ? 'good'
      : timetable_quality.label === 'Moderate'
        ? 'moderate'
        : 'needsAttention';

  const trendIcon =
    substitution_pressure.trend_direction === 'improving' ? (
      <ArrowDown className="inline h-4 w-4 text-green-600 dark:text-green-400" />
    ) : substitution_pressure.trend_direction === 'worsening' ? (
      <ArrowUp className="inline h-4 w-4 text-red-600 dark:text-red-400" />
    ) : substitution_pressure.trend_direction === 'stable' ? (
      <ArrowRight className="inline h-4 w-4 text-text-tertiary" />
    ) : (
      <Minus className="inline h-4 w-4 text-text-tertiary" />
    );

  const trendLabel =
    substitution_pressure.trend_direction === 'improving'
      ? t('improving')
      : substitution_pressure.trend_direction === 'worsening'
        ? t('worsening')
        : substitution_pressure.trend_direction === 'stable'
          ? t('stable')
          : t('notAvailable');

  const trendBadgeColor =
    substitution_pressure.trend_direction === 'improving'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
      : substitution_pressure.trend_direction === 'worsening'
        ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
        : 'bg-surface-secondary text-text-secondary';

  const correlationBadgeColor =
    correlation_insight?.status === 'available'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
      : 'bg-surface-secondary text-text-secondary';

  const generatedDate = new Date(generated_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-6 p-4 md:p-6 print:space-y-4 print:p-0">
      {/* Header */}
      <PageHeader
        title={t('title')}
        actions={
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary sm:w-auto print:hidden"
          >
            <Printer className="h-4 w-4" />
            {t('downloadPdf')}
          </button>
        }
      />

      {/* Report metadata bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-secondary px-5 py-4 sm:flex-row sm:items-center sm:justify-between print:rounded-none print:border-x-0 print:border-t-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium text-text-primary">{academic_year_name}</span>
          <span className="hidden text-text-tertiary sm:inline">&middot;</span>
          <span className="text-text-secondary">{term_name}</span>
        </div>
        <p className="text-xs text-text-tertiary">
          {t('generatedAt', { date: generatedDate })}
        </p>
      </div>

      {/* a. Workload Distribution */}
      <SectionCard title={t('workloadDistribution')}>
        <DataRow
          label={t('avgPeriods')}
          value={<span dir="ltr">{workload_distribution.average_periods.toFixed(1)}</span>}
        />
        <Divider />
        <DataRow
          label="Range"
          value={
            <span dir="ltr">
              {workload_distribution.range.min}–{workload_distribution.range.max}
            </span>
          }
        />
        <Divider />
        <DataRow
          label={t('overAllocated', { count: workload_distribution.over_allocated_count })}
          value={
            <span
              dir="ltr"
              className={
                workload_distribution.over_allocated_count > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-green-700 dark:text-green-400'
              }
            >
              {workload_distribution.over_allocated_count}
            </span>
          }
        />
      </SectionCard>

      {/* b. Cover Fairness */}
      <SectionCard title={t('coverFairness')}>
        <DataRow
          label={t('giniLabel', { value: cover_fairness.gini_coefficient.toFixed(3) })}
          value={<span dir="ltr">{cover_fairness.gini_coefficient.toFixed(3)}</span>}
        />
        <Divider />
        <DataRow
          label="Distribution shape"
          value={cover_fairness.distribution_shape}
        />
        <Divider />
        <DataRow
          label="Assessment"
          value={cover_fairness.assessment}
        />
      </SectionCard>

      {/* c. Timetable Quality */}
      <SectionCard title={t('timetableQuality')}>
        <DataRow
          label="Average score"
          value={
            <span dir="ltr" className={qualityColor(timetable_quality.label)}>
              {timetable_quality.average_score.toFixed(1)}
            </span>
          }
        />
        <Divider />
        <DataRow
          label="Rating"
          value={
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${qualityBadgeBg(timetable_quality.label)}`}
            >
              {t(qualityLabelKey)}
            </span>
          }
        />
      </SectionCard>

      {/* d. Substitution Pressure */}
      <SectionCard title={t('substitutionPressure')}>
        <DataRow
          label="Composite score"
          value={<span dir="ltr">{substitution_pressure.composite_score.toFixed(1)}</span>}
        />
        <Divider />
        <DataRow
          label="Assessment"
          value={substitution_pressure.assessment}
        />
        <Divider />
        <DataRow
          label="Trend"
          value={
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${trendBadgeColor}`}
            >
              {trendIcon}
              {trendLabel}
            </span>
          }
        />
      </SectionCard>

      {/* e. Absence Pattern */}
      <SectionCard title={t('absencePattern')}>
        <DataRow
          label={t('currentTermRate')}
          value={<span dir="ltr">{formatPercent(absence_pattern.current_term_rate)}</span>}
        />
        {absence_pattern.previous_term_rate !== null && (
          <>
            <Divider />
            <DataRow
              label={t('previousTermRate')}
              value={
                <span dir="ltr">{formatPercent(absence_pattern.previous_term_rate)}</span>
              }
            />
          </>
        )}
        {absence_pattern.highest_day !== null && (
          <>
            <Divider />
            <DataRow
              label={t('highestDay')}
              value={absence_pattern.highest_day}
            />
          </>
        )}
      </SectionCard>

      {/* f. Correlation Insight */}
      {correlation_insight !== null && (
        <SectionCard title={t('correlationInsight')}>
          <DataRow
            label="Status"
            value={
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${correlationBadgeColor}`}
              >
                {correlation_insight.status === 'available' ? t('available') : t('accumulating')}
              </span>
            }
          />
          <Divider />
          <div className="pt-3 text-sm text-text-secondary">{correlation_insight.summary}</div>
        </SectionCard>
      )}
    </div>
  );
}
