'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { CustomReportBuilder } from '../_components/custom-report-builder';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgingBucket {
  bucket: 'current' | '1_30' | '31_60' | '61_90' | '90_plus';
  total: number;
  invoice_count: number;
  households: Array<{
    household_id: string;
    household_name: string;
    amount: number;
    oldest_days: number;
  }>;
}

interface FeePerformanceRow {
  fee_structure_id: string;
  name: string;
  total_assigned: number;
  total_billed: number;
  total_collected: number;
  default_rate: number;
}

type ReportTab = 'aging' | 'fee_performance' | 'custom';

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinanceReportsPage() {
  const t = useTranslations('finance');

  const [activeTab, setActiveTab] = React.useState<ReportTab>('aging');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  // Aging state
  const [agingData, setAgingData] = React.useState<AgingBucket[]>([]);
  const [expandedBucket, setExpandedBucket] = React.useState<string | null>(null);

  // Fee performance state
  const [feePerformanceData, setFeePerformanceData] = React.useState<FeePerformanceRow[]>([]);

  // ─── Fetch report data ──────────────────────────────────────────────────────

  const fetchReport = React.useCallback(
    async (tab: ReportTab) => {
      if (tab === 'custom') return;
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        const qs = params.toString() ? `?${params.toString()}` : '';

        if (tab === 'aging') {
          const res = await apiClient<
            Record<
              string,
              { label: string; count: number; total: number; households: AgingBucket['households'] }
            >
          >(`/api/v1/finance/reports/aging${qs}`);
          const bucketKeyMap: Record<string, AgingBucket['bucket']> = {
            current: 'current',
            overdue_1_30: '1_30',
            overdue_31_60: '31_60',
            overdue_61_90: '61_90',
            overdue_90_plus: '90_plus',
          };
          setAgingData(
            Object.entries(res)
              .filter(([key]) => key in bucketKeyMap)
              .map(([key, val]) => ({
                bucket: bucketKeyMap[key] as AgingBucket['bucket'],
                total: val.total,
                invoice_count: val.count,
                households: val.households ?? [],
              })),
          );
        } else if (tab === 'fee_performance') {
          const raw = await apiClient<FeePerformanceRow[] | { data: FeePerformanceRow[] }>(
            `/api/v1/finance/reports/fee-structure-performance${qs}`,
          );
          setFeePerformanceData(Array.isArray(raw) ? raw : raw.data);
        }
      } catch (err) {
        console.error('[FinanceReportsPage]', err);
      } finally {
        setIsLoading(false);
      }
    },
    [dateFrom, dateTo],
  );

  React.useEffect(() => {
    void fetchReport(activeTab);
  }, [activeTab, fetchReport]);

  function handleExportCsv() {
    const params = new URLSearchParams({ report: activeTab });
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    window.open(`${baseUrl}/api/v1/finance/reports/export?${params.toString()}`, '_blank');
  }

  // ─── Tab config ─────────────────────────────────────────────────────────────

  const tabs: Array<{ key: ReportTab; label: string }> = [
    { key: 'aging', label: t('reports.tabAging') },
    { key: 'fee_performance', label: t('reports.tabFeePerformance') },
    { key: 'custom', label: t('reports.tabCustom') },
  ];

  const bucketLabel: Record<string, string> = {
    current: t('reports.bucketCurrent'),
    '1_30': t('reports.bucket1to30'),
    '31_60': t('reports.bucket31to60'),
    '61_90': t('reports.bucket61to90'),
    '90_plus': t('reports.bucket90plus'),
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reports.title')}
        description={t('reports.description')}
        actions={
          activeTab !== 'custom' ? (
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="me-2 h-4 w-4" />
              {t('reports.exportCsv')}
            </Button>
          ) : undefined
        }
      />

      {/* Shared date filter for aging/fee performance */}
      {activeTab !== 'custom' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
          <span className="text-sm font-medium text-text-secondary">{t('reports.dateRange')}</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full sm:w-[150px]"
            placeholder={t('from')}
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full sm:w-[150px]"
            placeholder={t('to')}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchReport(activeTab)}
            disabled={isLoading}
          >
            {t('reports.apply')}
          </Button>
        </div>
      )}

      {/* Tab navigation */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Loading overlay for aging/fee performance */}
      {isLoading && activeTab !== 'custom' && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
        </div>
      )}

      {/* ── Aging Report ── */}
      {!isLoading && activeTab === 'aging' && (
        <div className="space-y-4">
          {agingData.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">{t('reports.noData')}</p>
          ) : (
            agingData.map((bucket) => (
              <div key={bucket.bucket} className="overflow-hidden rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedBucket(expandedBucket === bucket.bucket ? null : bucket.bucket)
                  }
                  className="flex w-full items-center justify-between bg-surface px-4 py-3 text-start transition-colors hover:bg-surface-secondary"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-text-primary">
                      {bucketLabel[bucket.bucket] ?? bucket.bucket}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {bucket.invoice_count} {t('reports.invoices')}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-danger-700" dir="ltr">
                    {bucket.total.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </button>

                {expandedBucket === bucket.bucket && bucket.households.length > 0 && (
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface-secondary">
                          <th className="px-4 py-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                            {t('household')}
                          </th>
                          <th className="px-4 py-2 text-end text-xs font-semibold uppercase text-text-tertiary">
                            {t('totalAmount')}
                          </th>
                          <th className="px-4 py-2 text-end text-xs font-semibold uppercase text-text-tertiary">
                            {t('reports.oldestDays')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bucket.households.map((hh) => (
                          <tr
                            key={hh.household_id}
                            className="border-b border-border last:border-b-0"
                          >
                            <td className="px-4 py-2 text-text-primary">{hh.household_name}</td>
                            <td
                              className="px-4 py-2 text-end font-mono text-text-secondary"
                              dir="ltr"
                            >
                              {hh.amount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td
                              className="px-4 py-2 text-end font-mono text-text-secondary"
                              dir="ltr"
                            >
                              {hh.oldest_days}d
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Fee Performance ── */}
      {!isLoading && activeTab === 'fee_performance' && (
        <div className="overflow-x-auto rounded-xl border border-border">
          {feePerformanceData.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">{t('reports.noData')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                    {t('reports.feeStructure')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                    {t('reports.householdsAssigned')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                    {t('reports.totalBilled')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                    {t('reports.totalCollected')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                    {t('reports.collectionRate')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                    {t('reports.defaultRate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {feePerformanceData.map((row) => (
                  <tr key={row.fee_structure_id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{row.name}</td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                      {row.total_assigned}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                      {row.total_billed.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                      {row.total_collected.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-end" dir="ltr">
                      {(() => {
                        const rate =
                          row.total_billed > 0 ? (row.total_collected / row.total_billed) * 100 : 0;
                        return (
                          <span
                            className={
                              rate >= 80
                                ? 'font-semibold text-success-700'
                                : rate >= 50
                                  ? 'font-semibold text-warning-700'
                                  : 'font-semibold text-danger-700'
                            }
                          >
                            {rate.toFixed(1)}%
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-danger-700" dir="ltr">
                      {row.default_rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Custom Report Builder ── */}
      {activeTab === 'custom' && <CustomReportBuilder />}
    </div>
  );
}
