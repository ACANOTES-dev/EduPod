'use client';

import { RotateCcw } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { FinanceDashboardData } from '@school/shared';
import { StatCard } from '@school/ui';

import { PaymentStatusBadge } from './_components/payment-status-badge';
import { PdfPreviewModal } from './_components/pdf-preview-modal';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Household Debt Breakdown ──────────────────────────────────────────────────

function HouseholdDebtBreakdown({
  breakdown,
}: {
  breakdown: FinanceDashboardData['household_debt_breakdown'];
}) {
  const t = useTranslations('finance');
  const total =
    breakdown.pct_0_10 + breakdown.pct_10_30 + breakdown.pct_30_50 + breakdown.pct_50_plus;

  const buckets = [
    { key: 'pct_0_10', label: t('debt0to10'), count: breakdown.pct_0_10, color: 'bg-success-400' },
    {
      key: 'pct_10_30',
      label: t('debt10to30'),
      count: breakdown.pct_10_30,
      color: 'bg-warning-400',
    },
    {
      key: 'pct_30_50',
      label: t('debt30to50'),
      count: breakdown.pct_30_50,
      color: 'bg-warning-600',
    },
    {
      key: 'pct_50_plus',
      label: t('debt50plus'),
      count: breakdown.pct_50_plus,
      color: 'bg-danger-500',
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('householdDebtBreakdown')}</h3>
        <span className="text-sm font-mono text-text-secondary">
          {total} {t('householdsTotal')}
        </span>
      </div>

      {/* Segmented bar */}
      {total > 0 && (
        <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-surface-secondary">
          {buckets.map((bucket) => {
            const pct = total > 0 ? (bucket.count / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={bucket.key}
                className={`${bucket.color} transition-all`}
                style={{ width: `${pct}%` }}
                title={`${bucket.label}: ${bucket.count}`}
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
                {bucket.count} {t('households')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Payments ──────────────────────────────────────────────────────────

function RecentPaymentsTable({ payments }: { payments: FinanceDashboardData['recent_payments'] }) {
  const t = useTranslations('finance');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [receiptPdfUrl, setReceiptPdfUrl] = React.useState<string | null>(null);
  const [showReceiptPdf, setShowReceiptPdf] = React.useState(false);

  const handlePaymentClick = (paymentId: string) => {
    router.push(`/${locale}/finance/payments/${paymentId}`);
  };

  const handleReceiptClick = (e: React.MouseEvent, paymentId: string) => {
    e.stopPropagation();
    setReceiptPdfUrl(`/api/v1/finance/payments/${paymentId}/receipt/pdf`);
    setShowReceiptPdf(true);
  };

  const handleStatementClick = (e: React.MouseEvent, householdId: string) => {
    e.stopPropagation();
    router.push(`/${locale}/finance/statements/${householdId}`);
  };

  return (
    <>
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
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-tertiary">
                    {t('noRecentPayments')}
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors cursor-pointer"
                    onClick={() => handlePaymentClick(payment.id)}
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
                    <td className="px-4 py-3 text-end text-sm">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => handleReceiptClick(e, payment.id)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {t('receiptPdf')}
                        </button>
                        <span className="text-text-tertiary">|</span>
                        <button
                          onClick={(e) => handleStatementClick(e, payment.household_id)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {t('viewStatement')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PdfPreviewModal
        open={showReceiptPdf}
        onOpenChange={setShowReceiptPdf}
        title={t('receiptPdf')}
        pdfUrl={receiptPdfUrl}
      />
    </>
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
    } catch (err) {
      // Silently fall back to null
      console.error('[setData]', err);
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
        <StatCard label={t('expectedRevenue')} value={formatCurrency(data.expected_revenue)} />
        <StatCard label={t('receivedPayments')} value={formatCurrency(data.received_payments)} />
        <StatCard label={t('outstandingAmount')} value={formatCurrency(data.outstanding)} />
        <StatCard label={t('collectionRate')} value={`${data.collection_rate.toFixed(1)}%`} />
      </div>

      {/* Household Debt Breakdown */}
      <HouseholdDebtBreakdown breakdown={data.household_debt_breakdown} />

      {/* Pending Refunds */}
      {data.pending_refund_approvals > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-info-border bg-info-50 p-4">
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

      {/* Recent Payments */}
      <RecentPaymentsTable payments={data.recent_payments} />
    </div>
  );
}
