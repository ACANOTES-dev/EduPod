'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { BonusAnalysisTable } from './_components/bonus-analysis-table';
import { CostTrendChart } from './_components/cost-trend-chart';
import { YtdSummaryTable } from './_components/ytd-summary-table';

type TabKey = 'costTrend' | 'ytdSummary' | 'bonusAnalysis';

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

export default function PayrollReportsPage() {
  const t = useTranslations('payroll');
  const [activeTab, setActiveTab] = React.useState<TabKey>('costTrend');

  const [costTrend, setCostTrend] = React.useState<CostTrendPoint[]>([]);
  const [ytdSummary, setYtdSummary] = React.useState<YtdSummaryRow[]>([]);
  const [bonusAnalysis, setBonusAnalysis] = React.useState<BonusAnalysisRow[]>([]);
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
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    };
    void fetchAll();
  }, []);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'costTrend', label: t('costTrend') },
    { key: 'ytdSummary', label: t('ytdSummary') },
    { key: 'bonusAnalysis', label: t('bonusAnalysis') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('reports')} />

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface-secondary p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
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
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      ) : (
        <>
          {activeTab === 'costTrend' && (
            <CostTrendChart data={costTrend} />
          )}
          {activeTab === 'ytdSummary' && (
            <YtdSummaryTable data={ytdSummary} />
          )}
          {activeTab === 'bonusAnalysis' && (
            <BonusAnalysisTable data={bonusAnalysis} />
          )}
        </>
      )}
    </div>
  );
}
