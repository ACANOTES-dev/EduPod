'use client';

import { TrendingUp } from 'lucide-react';
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

import { Button, EmptyState, Input, Label, StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { AiSummaryPanel } from '../_components/ai-summary-panel';
import { ReportPageActions } from '../_components/report-page-actions';

// ─── Backend response shapes (mirror admissions-analytics.service.ts) ────────

interface PipelineFunnelResult {
  applied_count: number;
  under_review_count: number;
  accepted_count: number;
  enrolled_count: number;
  applied_to_review_rate: number;
  review_to_accepted_rate: number;
  accepted_to_enrolled_rate: number;
  overall_conversion_rate: number;
}

interface ProcessingTimeResult {
  average_days_to_decision: number | null;
  min_days: number | null;
  max_days: number | null;
  sample_size: number;
}

interface RejectionReasonEntry {
  reason: string;
  count: number;
  percentage: number;
}

interface MonthlyApplicationsDataPoint {
  month: string;
  count: number;
  accepted_count: number;
  rejected_count: number;
}

interface YearGroupDemandEntry {
  year_group_name: string | null;
  application_count: number;
  accepted_count: number;
  conversion_rate: number;
}

// ─── Helper: build query string from filters ────────────────────────────────

function buildQuery(startDate: string, endDate: string): string {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const q = params.toString();
  return q ? `?${q}` : '';
}

// ─── Funnel visualisation ─────────────────────────────────────────────────────

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  color: string;
}

function FunnelViz({ stages, conversionLabel }: { stages: FunnelStage[]; conversionLabel: string }) {
  const max = stages[0]?.count ?? 1;
  return (
    <div className="space-y-2">
      {stages.map((stage, i) => {
        const width = max > 0 ? (stage.count / max) * 100 : 0;
        const prev = stages[i - 1];
        const conversion =
          prev && prev.count > 0 ? Math.round((stage.count / prev.count) * 100) : 100;
        return (
          <div key={stage.key} className="space-y-1">
            {i > 0 && (
              <div className="flex justify-center text-xs text-text-tertiary">
                ↓ {conversion}% {conversionLabel}
              </div>
            )}
            <div
              className="relative flex items-center justify-center"
              style={{ paddingInline: `${(100 - width) / 2}%` }}
            >
              <div
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-white"
                style={{ backgroundColor: stage.color }}
              >
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="text-sm font-bold">{stage.count}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdmissionsAnalyticsPage() {
  const t = useTranslations('reports');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  const [funnel, setFunnel] = React.useState<PipelineFunnelResult | null>(null);
  const [processing, setProcessing] = React.useState<ProcessingTimeResult | null>(null);
  const [rejection, setRejection] = React.useState<RejectionReasonEntry[]>([]);
  const [monthly, setMonthly] = React.useState<MonthlyApplicationsDataPoint[]>([]);
  const [yearDemand, setYearDemand] = React.useState<YearGroupDemandEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const q = buildQuery(startDate, endDate);

    // Backend admissions controllers don't call `wrap()` — the
    // ResponseTransformInterceptor wraps each body in `{ data }`, so unwrap here.
    Promise.all([
      apiClient<{ data: PipelineFunnelResult }>(
        `/api/v1/reports/analytics/admissions/funnel${q}`,
        { silent: true },
      ),
      apiClient<{ data: ProcessingTimeResult }>(
        `/api/v1/reports/analytics/admissions/processing-time${q}`,
        { silent: true },
      ),
      apiClient<{ data: RejectionReasonEntry[] }>(
        `/api/v1/reports/analytics/admissions/rejection-reasons${q}`,
        { silent: true },
      ),
      apiClient<{ data: MonthlyApplicationsDataPoint[] }>(
        `/api/v1/reports/analytics/admissions/monthly${q}`,
        { silent: true },
      ),
      apiClient<{ data: YearGroupDemandEntry[] }>(
        `/api/v1/reports/analytics/admissions/year-group-demand${q}`,
        { silent: true },
      ),
    ])
      .then(([f, p, r, m, y]) => {
        if (cancelled) return;
        setFunnel(f.data);
        setProcessing(p.data);
        setRejection(r.data);
        setMonthly(m.data);
        setYearDemand(y.data);
      })
      .catch((err: unknown) => {
        console.error('[reports/admissions] load', err);
        if (!cancelled) setError(t('analytics.loadErrorBody'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, t]);

  const stages: FunnelStage[] = React.useMemo(() => {
    if (!funnel) return [];
    return [
      {
        key: 'applied',
        label: t('admissions.stageApplied'),
        count: funnel.applied_count,
        color: '#6366f1',
      },
      {
        key: 'under_review',
        label: t('admissions.stageUnderReview'),
        count: funnel.under_review_count,
        color: '#8b5cf6',
      },
      {
        key: 'accepted',
        label: t('admissions.stageAccepted'),
        count: funnel.accepted_count,
        color: '#10b981',
      },
      {
        key: 'enrolled',
        label: t('admissions.stageEnrolled'),
        count: funnel.enrolled_count,
        color: '#059669',
      },
    ];
  }, [funnel, t]);

  const totalApplications = funnel?.applied_count ?? 0;
  const overallConversion = funnel?.overall_conversion_rate ?? 0;
  const hasFunnelData = stages.some((s) => s.count > 0);
  const hasMonthlyData = monthly.length > 0;
  const hasRejectionData = rejection.length > 0;
  const hasYearDemandData = yearDemand.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('admissions.title')}
        description={t('admissions.description')}
        actions={<ReportPageActions disabled />}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="adm-start">{t('startDate')}</Label>
          <Input
            id="adm-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-44"
          />
        </div>
        <div>
          <Label htmlFor="adm-end">{t('endDate')}</Label>
          <Input
            id="adm-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-44"
          />
        </div>
        {(startDate || endDate) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setStartDate('');
              setEndDate('');
            }}
          >
            {t('clear')}
          </Button>
        )}
      </div>

      {/* AI summary */}
      <AiSummaryPanel mode={{ kind: 'report', reportKey: 'admissions' }} />

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-medium">{t('analytics.loadErrorTitle')}</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label={t('admissions.totalApplications')} value={totalApplications} />
            <StatCard label={t('admissions.accepted')} value={funnel?.accepted_count ?? 0} />
            <StatCard label={t('admissions.enrolled')} value={funnel?.enrolled_count ?? 0} />
            <StatCard
              label={t('admissions.overallConversion')}
              value={`${overallConversion.toFixed(1)}%`}
            />
          </div>

          {/* Funnel */}
          <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-6 text-base font-semibold text-text-primary">
              {t('admissions.funnelTitle')}
            </h2>
            {hasFunnelData ? (
              <FunnelViz stages={stages} conversionLabel={t('admissions.conversionLabel')} />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title={t('noData')}
                description={t('admissions.noFunnelData')}
              />
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Processing Time */}
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                {t('admissions.processingTimeTitle')}
              </h3>
              {processing && processing.sample_size > 0 ? (
                <div className="space-y-2">
                  <p className="text-2xl font-semibold text-text-primary">
                    {processing.average_days_to_decision === null
                      ? '—'
                      : processing.average_days_to_decision.toFixed(1)}
                    <span className="ms-2 text-xs font-normal text-text-tertiary">
                      {t('admissions.avgDaysSuffix')}
                    </span>
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {t('admissions.processingRange', {
                      min: processing.min_days ?? 0,
                      max: processing.max_days ?? 0,
                      n: processing.sample_size,
                    })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">{t('admissions.noProcessingData')}</p>
              )}
            </div>

            {/* Monthly Applications */}
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('admissions.monthlyAppsTitle')}
              </h3>
              {hasMonthlyData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthly} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name={t('admissions.applications')}
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-tertiary">{t('admissions.noMonthlyData')}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Rejection Reasons */}
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('admissions.rejectionReasonsTitle')}
              </h3>
              {hasRejectionData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={rejection}
                    layout="vertical"
                    margin={{ top: 0, right: 16, bottom: 0, left: 140 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="reason" type="category" className="text-xs" width={140} />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name={t('admissions.count')}
                      fill="#ef4444"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-tertiary">{t('admissions.noRejectionData')}</p>
              )}
            </div>

            {/* Year Group Demand */}
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('admissions.yearDemandTitle')}
              </h3>
              {hasYearDemandData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={yearDemand} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="year_group_name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar
                      dataKey="application_count"
                      name={t('admissions.applications')}
                      radius={[4, 4, 0, 0]}
                    >
                      {yearDemand.map((entry, i) => (
                        <Cell
                          key={entry.year_group_name ?? i}
                          fill={['#6366f1', '#8b5cf6', '#a78bfa', '#10b981', '#059669'][i % 5]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-tertiary">{t('admissions.noYearDemandData')}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
