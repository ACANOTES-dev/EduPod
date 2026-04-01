'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';


import { BonusAnalysisTable } from './_components/bonus-analysis-table';
import { CostTrendChart } from './_components/cost-trend-chart';
import { YtdSummaryTable } from './_components/ytd-summary-table';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

type TabKey = 'costTrend' | 'ytdSummary' | 'bonusAnalysis' | 'variance' | 'forecast';

export interface CostTrendPoint {
  period_month: number;
  period_year: number;
  period_label: string;
  total_pay: number;
  total_basic_pay: number;
  total_bonus_pay: number;
  headcount: number;
}

export interface YtdSummaryRow {
  staff_profile_id: string;
  staff_name: string;
  ytd_basic: number;
  ytd_bonus: number;
  ytd_total: number;
  months_paid: number;
}

export interface BonusAnalysisRow {
  staff_profile_id: string;
  staff_name: string;
  months_with_bonus: number;
  total_bonus_amount: number;
  avg_bonus_per_month: number;
}

interface VarianceRow {
  staff_name: string;
  change_type: 'new_joiner' | 'departure' | 'compensation_change' | 'allowance_change';
  prev_amount: number | null;
  curr_amount: number | null;
  diff: number;
  description: string;
}

interface VarianceSummary {
  total_impact: number;
  new_joiners: number;
  departures: number;
  changes: number;
}

interface ForecastPoint {
  period_label: string;
  projected_cost: number;
}

export default function PayrollReportsPage() {
  const t = useTranslations('payroll');
  const [activeTab, setActiveTab] = React.useState<TabKey>('costTrend');

  const [costTrend, setCostTrend] = React.useState<CostTrendPoint[]>([]);
  const [ytdSummary, setYtdSummary] = React.useState<YtdSummaryRow[]>([]);
  const [bonusAnalysis, setBonusAnalysis] = React.useState<BonusAnalysisRow[]>([]);
  const [varianceRows, setVarianceRows] = React.useState<VarianceRow[]>([]);
  const [varianceSummary, setVarianceSummary] = React.useState<VarianceSummary | null>(null);
  const [forecast, setForecast] = React.useState<ForecastPoint[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        const [trendRes, ytdRes, bonusRes] = await Promise.all([
          apiClient<{ data: CostTrendPoint[] }>('/api/v1/payroll/reports/cost-trend'),
          apiClient<{ data: YtdSummaryRow[] }>('/api/v1/payroll/reports/ytd-summary'),
          apiClient<{ data: BonusAnalysisRow[] }>('/api/v1/payroll/reports/bonus-analysis'),
        ]);
        setCostTrend(trendRes.data);
        setYtdSummary(ytdRes.data);
        setBonusAnalysis(bonusRes.data);
      } catch (err) {
        console.error('[fetchAll]', err);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchAll();
  }, []);

  React.useEffect(() => {
    const fetchTabData = async () => {
      try {
        if (activeTab === 'variance') {
          const res = await apiClient<{
            data: VarianceRow[];
            summary: VarianceSummary;
          }>('/api/v1/payroll/reports/variance');
          setVarianceRows(res.data);
          setVarianceSummary(res.summary);
        } else if (activeTab === 'forecast') {
          const res = await apiClient<{ data: ForecastPoint[] }>(
            '/api/v1/payroll/reports/forecast',
          );
          setForecast(res.data);
        }
      } catch (err) {
        console.error('[fetchTabData]', err);
      }
    };
    if (activeTab === 'variance' || activeTab === 'forecast') {
      void fetchTabData();
    }
  }, [activeTab]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'costTrend', label: t('costTrend') },
    { key: 'ytdSummary', label: t('ytdSummary') },
    { key: 'bonusAnalysis', label: t('bonusAnalysis') },
    { key: 'variance', label: t('varianceReport') },
    { key: 'forecast', label: t('costForecast') },
  ];

  const CHANGE_TYPE_LABELS: Record<string, string> = {
    new_joiner: t('newStaff'),
    departure: t('departed'),
    compensation_change: t('compensationChange'),
    allowance_change: t('allowanceChange'),
  };

  const CHANGE_TYPE_COLORS: Record<string, string> = {
    new_joiner: 'bg-success-100 text-success-text',
    departure: 'bg-danger-100 text-danger-text',
    compensation_change: 'bg-warning-100 text-warning-text',
    allowance_change: 'bg-info-100 text-info-text',
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('reports')} />

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface-secondary p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {isLoading &&
      (activeTab === 'costTrend' || activeTab === 'ytdSummary' || activeTab === 'bonusAnalysis') ? (
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      ) : (
        <>
          {activeTab === 'costTrend' && <CostTrendChart data={costTrend} />}
          {activeTab === 'ytdSummary' && <YtdSummaryTable data={ytdSummary} />}
          {activeTab === 'bonusAnalysis' && <BonusAnalysisTable data={bonusAnalysis} />}

          {activeTab === 'variance' && (
            <div className="space-y-4">
              {/* Summary strip */}
              {varianceSummary && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    {
                      label: t('totalImpact'),
                      value:
                        (varianceSummary.total_impact > 0 ? '+' : '') +
                        formatCurrency(varianceSummary.total_impact),
                      highlight: true,
                    },
                    { label: t('newJoiners'), value: String(varianceSummary.new_joiners) },
                    { label: t('departures'), value: String(varianceSummary.departures) },
                    { label: t('changes'), value: String(varianceSummary.changes) },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-2xl border border-border bg-surface p-4"
                    >
                      <p className="text-xs text-text-secondary">{card.label}</p>
                      <p
                        className={`mt-1 text-xl font-semibold ${
                          card.highlight ? 'text-primary' : 'text-text-primary'
                        }`}
                      >
                        {card.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-2xl border border-border bg-surface">
                <div className="overflow-x-auto">
                  {varianceRows.length === 0 ? (
                    <div className="py-12 text-center text-sm text-text-tertiary">
                      {t('noVarianceData')}
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                            {t('staffName')}
                          </th>
                          <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                            {t('changeType')}
                          </th>
                          <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                            {t('description')}
                          </th>
                          <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                            {t('prevMonthTotal')}
                          </th>
                          <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                            {t('thisMonthTotal')}
                          </th>
                          <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                            {t('impact')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {varianceRows.map((row, i) => (
                          <tr key={i} className="hover:bg-surface-secondary">
                            <td className="px-4 py-3 font-medium text-text-primary">
                              {row.staff_name}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  CHANGE_TYPE_COLORS[row.change_type] ??
                                  'bg-neutral-100 text-text-secondary'
                                }`}
                              >
                                {CHANGE_TYPE_LABELS[row.change_type] ?? row.change_type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-text-secondary">{row.description}</td>
                            <td className="px-4 py-3 text-end text-text-secondary">
                              {row.prev_amount != null ? formatCurrency(row.prev_amount) : '—'}
                            </td>
                            <td className="px-4 py-3 text-end text-text-primary">
                              {row.curr_amount != null ? formatCurrency(row.curr_amount) : '—'}
                            </td>
                            <td
                              className={`px-4 py-3 text-end font-medium ${
                                row.diff > 0 ? 'text-success-600' : 'text-danger-600'
                              }`}
                            >
                              {row.diff > 0 ? '+' : ''}
                              {formatCurrency(row.diff)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'forecast' && (
            <div className="space-y-4">
              {forecast.length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface py-12 text-center text-sm text-text-tertiary">
                  {t('noForecastData')}
                </div>
              ) : (
                <>
                  {/* Projected total callout */}
                  {forecast.length > 0 && (
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-sm text-text-secondary">{t('forecastNote')}</p>
                      <p className="mt-1 text-xl font-semibold text-primary">
                        {formatCurrency(
                          forecast.reduce((s, p) => s + p.projected_cost, 0) / forecast.length,
                        )}{' '}
                        / {t('month')}
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-border bg-surface p-5">
                    <h3 className="mb-4 text-sm font-semibold text-text-primary">
                      {t('costForecast')}
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={forecast}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis
                          dataKey="period_label"
                          tick={{ fontSize: 11 }}
                          stroke="var(--color-text-tertiary)"
                        />
                        <YAxis
                          tickFormatter={(v: number) => formatCurrency(v)}
                          tick={{ fontSize: 11 }}
                          stroke="var(--color-text-tertiary)"
                        />
                        <Tooltip
                          formatter={(v) => (typeof v === 'number' ? formatCurrency(v) : v)}
                          labelStyle={{ color: 'var(--color-text-primary)' }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="projected_cost"
                          name={t('projectedCost')}
                          stroke="hsl(var(--color-primary))"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          strokeDasharray="6 3"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
