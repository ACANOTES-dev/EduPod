'use client';

import {
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { StatCard } from '@school/ui';
import type { FinanceDashboardData } from '@school/shared';
import { PageHeader } from '@/components/page-header';
import { PaymentStatusBadge } from './_components/payment-status-badge';
import { apiClient } from '@/lib/api-client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Ageing Bar ───────────────────────────────────────────────────────────────

function AgeingBar({
  ageing,
  totalAmount,
}: {
  ageing: FinanceDashboardData['overdue_summary']['ageing'];
  totalAmount: number;
}) {
  const t = useTranslations('finance');

  const buckets = [
    { key: 'days_1_30', label: t('ageing1to30'), data: ageing.days_1_30, color: 'bg-warning-400' },
    { key: 'days_31_60', label: t('ageing31to60'), data: ageing.days_31_60, color: 'bg-warning-500' },
    { key: 'days_61_90', label: t('ageing61to90'), data: ageing.days_61_90, color: 'bg-danger-400' },
    { key: 'days_90_plus', label: t('ageing90plus'), data: ageing.days_90_plus, color: 'bg-danger-600' },
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('overdueAgeing')}</h3>
        <span className="text-sm font-mono text-text-secondary">
          {t('overdueAmount')}: {formatCurrency(totalAmount)}
        </span>
      </div>

      {/* Segmented bar */}
      {totalAmount > 0 && (
        <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-surface-secondary">
          {buckets.map((bucket) => {
            const pct = totalAmount > 0 ? (bucket.data.amount / totalAmount) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={bucket.key}
                className={`${bucket.color} transition-all`}
                style={{ width: `${pct}%` }}
                title={`${bucket.label}: ${formatCurrency(bucket.data.amount)}`}
              />
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {buckets.map((bucket) => (
          <div key={bucket.key} className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${bucket.color}`} />
            <div>
              <p className="text-xs text-text-tertiary">{bucket.label}</p>
              <p className="text-sm font-semibold text-text-primary">
                {formatCurrency(bucket.data.amount)}
              </p>
              <p className="text-xs text-text-tertiary">
                {bucket.data.count} {t('invoicesCount')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Invoice Pipeline ─────────────────────────────────────────────────────────

function InvoicePipeline({
  pipeline,
}: {
  pipeline: FinanceDashboardData['invoice_pipeline'];
}) {
  const t = useTranslations('finance');

  const stages = [
    { key: 'draft', label: t('draft'), data: pipeline.draft, color: 'bg-neutral-200 text-text-secondary' },
    { key: 'pending_approval', label: t('pendingApproval'), data: pipeline.pending_approval, color: 'bg-warning-100 text-warning-text' },
    { key: 'issued', label: t('issued'), data: pipeline.issued, color: 'bg-info-100 text-info-text' },
    { key: 'overdue', label: t('overdue'), data: pipeline.overdue, color: 'bg-danger-100 text-danger-text' },
    { key: 'paid', label: t('paid'), data: pipeline.paid, color: 'bg-success-100 text-success-text' },
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('invoicePipeline')}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stages.map((stage) => (
          <div
            key={stage.key}
            className={`rounded-xl p-4 text-center ${stage.color}`}
          >
            <p className="text-2xl font-semibold">{stage.data.count}</p>
            <p className="mt-1 text-xs font-medium">{stage.label}</p>
            <p className="mt-0.5 text-xs font-mono opacity-80">
              {formatCurrency(stage.data.amount)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Unallocated Alert ────────────────────────────────────────────────────────

function UnallocatedAlert({
  count,
  totalAmount,
}: {
  count: number;
  totalAmount: number;
}) {
  const t = useTranslations('finance');

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-warning-border bg-warning-50 p-4">
      <AlertTriangle className="h-5 w-5 shrink-0 text-warning-text" />
      <div className="flex-1">
        <p className="text-sm font-medium text-warning-text">{t('unallocatedPayments')}</p>
        <p className="text-xs text-warning-text/80">
          {count} {t('paymentsUnallocated')} ({formatCurrency(totalAmount)})
        </p>
      </div>
    </div>
  );
}

// ─── Recent Payments ──────────────────────────────────────────────────────────

function RecentPaymentsTable({
  payments,
}: {
  payments: FinanceDashboardData['recent_payments'];
}) {
  const t = useTranslations('finance');

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold text-text-primary">{t('recentPayments')}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('reference')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('household')}
              </th>
              <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('totalAmount')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('status')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('date')}
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-tertiary">
                  {t('noRecentPayments')}
                </td>
              </tr>
            ) : (
              payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                    {payment.payment_reference}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {payment.household_name}
                  </td>
                  <td className="px-4 py-3 text-end text-sm font-mono text-text-primary">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <PaymentStatusBadge status={payment.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary whitespace-nowrap">
                    {new Date(payment.received_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Revenue Summary ──────────────────────────────────────────────────────────

function RevenueSummary({
  revenue,
}: {
  revenue: FinanceDashboardData['revenue_summary'];
}) {
  const t = useTranslations('finance');

  const collectedChange =
    revenue.previous_month_collected > 0
      ? ((revenue.current_month_collected - revenue.previous_month_collected) /
          revenue.previous_month_collected) *
        100
      : 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('revenueSummary')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-text-tertiary">{t('currentMonthCollected')}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {formatCurrency(revenue.current_month_collected)}
          </p>
          {collectedChange !== 0 && (
            <p
              className={`mt-0.5 text-xs font-medium ${
                collectedChange > 0 ? 'text-success-text' : 'text-danger-text'
              }`}
            >
              {collectedChange > 0 ? '+' : ''}
              {collectedChange.toFixed(1)}% {t('vsPreviousMonth')}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-text-tertiary">{t('previousMonthCollected')}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {formatCurrency(revenue.previous_month_collected)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary">{t('currentMonthInvoiced')}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {formatCurrency(revenue.current_month_invoiced)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanceDashboardPage() {
  const t = useTranslations('finance');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<FinanceDashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchDashboard = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: FinanceDashboardData }>('/api/v1/finance/dashboard');
      setData(res.data);
    } catch {
      // Silently fall back to null
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-2xl bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('dashboard')} />
        <div className="flex items-center justify-center rounded-2xl bg-surface-secondary p-12">
          <p className="text-sm text-text-tertiary">{t('noDashboardData')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard')} />

      {/* Top summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('overdueAmount')}
          value={formatCurrency(data.overdue_summary.total_overdue_amount)}
        />
        <StatCard
          label={t('unallocatedPayments')}
          value={data.unallocated_payments.count}
        />
        <StatCard
          label={t('pendingRefunds')}
          value={data.pending_refund_approvals}
        />
        <StatCard
          label={t('currentMonthCollected')}
          value={formatCurrency(data.revenue_summary.current_month_collected)}
        />
      </div>

      {/* Unallocated payments alert */}
      <UnallocatedAlert
        count={data.unallocated_payments.count}
        totalAmount={data.unallocated_payments.total_amount}
      />

      {/* Overdue ageing */}
      <AgeingBar
        ageing={data.overdue_summary.ageing}
        totalAmount={data.overdue_summary.total_overdue_amount}
      />

      {/* Invoice Pipeline */}
      <InvoicePipeline pipeline={data.invoice_pipeline} />

      {/* Two-column: Revenue + Recent Payments */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RevenueSummary revenue={data.revenue_summary} />
        <div className="lg:col-span-1">
          {/* Pending refunds quick stat */}
          {data.pending_refund_approvals > 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-info-border bg-info-50 p-4">
              <RotateCcw className="h-5 w-5 shrink-0 text-info-text" />
              <div className="flex-1">
                <p className="text-sm font-medium text-info-text">{t('pendingRefunds')}</p>
                <p className="text-xs text-info-text/80">
                  {data.pending_refund_approvals} {t('refundsAwaitingApproval')}
                </p>
              </div>
              <button
                onClick={() => router.push(`/${locale}/finance/refunds`)}
                className="text-sm font-medium text-info-text hover:underline"
              >
                {t('viewAll')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent Payments */}
      <RecentPaymentsTable payments={data.recent_payments} />
    </div>
  );
}
