'use client';

import { Button, Input } from '@school/ui';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

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

interface RevenuePoint {
  month: string;
  invoiced: number;
  collected: number;
  outstanding: number;
}

interface YearGroupCollection {
  year_group: string;
  total_billed: number;
  total_collected: number;
  collection_rate: number;
}

interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  count: number;
  percentage: number;
}

interface FeePerformanceRow {
  fee_structure_id: string;
  fee_structure_name: string;
  households_assigned: number;
  total_billed: number;
  total_collected: number;
  collection_rate: number;
  default_rate: number;
}

type ReportTab = 'aging' | 'revenue' | 'year_group' | 'payment_methods' | 'fee_performance';

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinanceReportsPage() {
  const t = useTranslations('finance');

  const [activeTab, setActiveTab] = React.useState<ReportTab>('aging');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  // Report data
  const [agingData, setAgingData] = React.useState<AgingBucket[]>([]);
  const [revenueData, setRevenueData] = React.useState<RevenuePoint[]>([]);
  const [yearGroupData, setYearGroupData] = React.useState<YearGroupCollection[]>([]);
  const [paymentMethodData, setPaymentMethodData] = React.useState<PaymentMethodBreakdown[]>([]);
  const [feePerformanceData, setFeePerformanceData] = React.useState<FeePerformanceRow[]>([]);
  const [expandedBucket, setExpandedBucket] = React.useState<string | null>(null);

  const fetchReport = React.useCallback(
    async (tab: ReportTab) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        const qs = params.toString() ? `?${params.toString()}` : '';

        if (tab === 'aging') {
          const res = await apiClient<{ data: AgingBucket[] }>(
            `/api/v1/finance/reports/aging${qs}`,
          );
          setAgingData(res.data);
        } else if (tab === 'revenue') {
          const res = await apiClient<{ data: RevenuePoint[] }>(
            `/api/v1/finance/reports/revenue${qs}`,
          );
          setRevenueData(res.data);
        } else if (tab === 'year_group') {
          const res = await apiClient<{ data: YearGroupCollection[] }>(
            `/api/v1/finance/reports/collection-by-year-group${qs}`,
          );
          setYearGroupData(res.data);
        } else if (tab === 'payment_methods') {
          const res = await apiClient<{ data: PaymentMethodBreakdown[] }>(
            `/api/v1/finance/reports/payment-methods${qs}`,
          );
          setPaymentMethodData(res.data);
        } else if (tab === 'fee_performance') {
          const res = await apiClient<{ data: FeePerformanceRow[] }>(
            `/api/v1/finance/reports/fee-performance${qs}`,
          );
          setFeePerformanceData(res.data);
        }
      } catch {
        // Keep stale data
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
    window.open(
      `${baseUrl}/api/v1/finance/reports/export?${params.toString()}`,
      '_blank',
    );
  }

  const tabs: Array<{ key: ReportTab; label: string }> = [
    { key: 'aging', label: t('reports.tabAging') },
    { key: 'revenue', label: t('reports.tabRevenue') },
    { key: 'year_group', label: t('reports.tabYearGroup') },
    { key: 'payment_methods', label: t('reports.tabPaymentMethods') },
    { key: 'fee_performance', label: t('reports.tabFeePerformance') },
  ];

  const bucketLabel: Record<string, string> = {
    current: t('reports.bucketCurrent'),
    '1_30': t('reports.bucket1to30'),
    '31_60': t('reports.bucket31to60'),
    '61_90': t('reports.bucket61to90'),
    '90_plus': t('reports.bucket90plus'),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reports.title')}
        description={t('reports.description')}
        actions={
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="me-2 h-4 w-4" />
            {t('reports.exportCsv')}
          </Button>
        }
      />

      {/* Filters */}
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

      {/* Loading overlay */}
      {isLoading && (
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
                          <tr key={hh.household_id} className="border-b border-border last:border-b-0">
                            <td className="px-4 py-2 text-text-primary">{hh.household_name}</td>
                            <td className="px-4 py-2 text-end font-mono text-text-secondary" dir="ltr">
                              {hh.amount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-4 py-2 text-end font-mono text-text-secondary" dir="ltr">
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

      {/* ── Revenue Report ── */}
      {!isLoading && activeTab === 'revenue' && (
        <div className="space-y-6">
          {revenueData.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">{t('reports.noData')}</p>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-surface p-4">
                <h3 className="mb-4 text-sm font-semibold text-text-primary">
                  {t('reports.revenueChart')}
                </h3>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: 'var(--color-text-tertiary)' }}
                    />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-tertiary)' }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="invoiced"
                      name={t('reports.invoiced')}
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="collected"
                      name={t('reports.collected')}
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="outstanding"
                      name={t('reports.outstanding')}
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                        {t('reports.month')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                        {t('reports.invoiced')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                        {t('reports.collected')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                        {t('reports.outstanding')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.map((row) => (
                      <tr key={row.month} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3 font-medium text-text-primary">{row.month}</td>
                        <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                          {row.invoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                          {row.collected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                          {row.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Year Group Collection ── */}
      {!isLoading && activeTab === 'year_group' && (
        <div className="space-y-6">
          {yearGroupData.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">{t('reports.noData')}</p>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-surface p-4">
                <h3 className="mb-4 text-sm font-semibold text-text-primary">
                  {t('reports.collectionByYearGroup')}
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={yearGroupData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="year_group"
                      tick={{ fontSize: 12, fill: 'var(--color-text-tertiary)' }}
                    />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-tertiary)' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total_billed" name={t('reports.totalBilled')} fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total_collected" name={t('reports.totalCollected')} fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                        {t('reports.yearGroup')}
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
                    </tr>
                  </thead>
                  <tbody>
                    {yearGroupData.map((row) => (
                      <tr key={row.year_group} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3 font-medium text-text-primary">{row.year_group}</td>
                        <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                          {row.total_billed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                          {row.total_collected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-end" dir="ltr">
                          <span
                            className={
                              row.collection_rate >= 80
                                ? 'text-success-700 font-semibold'
                                : row.collection_rate >= 50
                                ? 'text-warning-700 font-semibold'
                                : 'text-danger-700 font-semibold'
                            }
                          >
                            {row.collection_rate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Payment Methods ── */}
      {!isLoading && activeTab === 'payment_methods' && (
        <div className="space-y-6">
          {paymentMethodData.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">{t('reports.noData')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-4">
                <h3 className="mb-4 text-sm font-semibold text-text-primary">
                  {t('reports.paymentMethodBreakdown')}
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={paymentMethodData}
                      dataKey="amount"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        name && percent !== undefined ? `${name} (${(percent * 100).toFixed(1)}%)` : ''
                      }
                    >
                      {paymentMethodData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                        {t('reports.method')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                        {t('totalAmount')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                        {t('reports.count')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                        {t('reports.share')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentMethodData.map((row) => (
                      <tr key={row.method} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3 font-medium text-text-primary capitalize">
                          {row.method.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                          {row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                          {row.count}
                        </td>
                        <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                          {row.percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {row.fee_structure_name}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                      {row.households_assigned}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                      {row.total_billed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary" dir="ltr">
                      {row.total_collected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-end" dir="ltr">
                      <span
                        className={
                          row.collection_rate >= 80
                            ? 'font-semibold text-success-700'
                            : row.collection_rate >= 50
                            ? 'font-semibold text-warning-700'
                            : 'font-semibold text-danger-700'
                        }
                      >
                        {row.collection_rate.toFixed(1)}%
                      </span>
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

    </div>
  );
}
