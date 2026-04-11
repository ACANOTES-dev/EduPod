'use client';

import {
  ArrowRight,
  BadgeDollarSign,
  CreditCard,
  Receipt,
  ScrollText,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { FinanceDashboardData } from '@school/shared';

import { apiClient } from '@/lib/api-client';

import {
  AgingOverview,
  FinanceNavigate,
  InvoicePipeline,
  OverdueInvoices,
  PendingActionsBanner,
  TopDebtors,
  formatCurrency,
} from './_components/dashboard-sections';
import { PaymentStatusBadge } from './_components/payment-status-badge';
import { PdfPreviewModal } from './_components/pdf-preview-modal';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useLocale() {
  const pathname = usePathname();
  return (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  accent,
  subtitle,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  href: string;
  accent: string;
  subtitle?: string;
}) {
  const locale = useLocale();
  return (
    <Link
      href={`/${locale}${href}`}
      className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-all hover:border-border-strong hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {label}
          </p>
          <p
            className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-text-primary"
            dir="ltr"
          >
            {value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-text-secondary">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="absolute bottom-0 end-0 start-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-primary/60 to-primary transition-transform group-hover:scale-x-100" />
    </Link>
  );
}

// ─── Quick Action ────────────────────────────────────────────────────────────

function QuickAction({
  label,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  icon: LucideIcon;
  href: string;
  accent: string;
}) {
  const locale = useLocale();
  return (
    <Link
      href={`/${locale}${href}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-border-strong hover:shadow-sm"
    >
      <div className={`shrink-0 rounded-lg p-2 ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <ArrowRight className="ms-auto h-4 w-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

// ─── Household Debt Breakdown ────────────────────────────────────────────────

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {buckets.map((bucket) => (
          <div key={bucket.key} className="flex items-center gap-2">
            <div className={`h-3 w-3 shrink-0 rounded-full ${bucket.color}`} />
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

// ─── Recent Payments ─────────────────────────────────────────────────────────

function RecentPayments({ payments }: { payments: FinanceDashboardData['recent_payments'] }) {
  const t = useTranslations('finance');
  const router = useRouter();
  const locale = useLocale();
  const [receiptPdfUrl, setReceiptPdfUrl] = React.useState<string | null>(null);
  const [showReceiptPdf, setShowReceiptPdf] = React.useState(false);

  return (
    <>
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('recentPayments')}</h3>
          <Link
            href={`/${locale}/finance/payments`}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('viewAll')}
          </Link>
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
                    onClick={() => router.push(`/${locale}/finance/payments/${payment.id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-text-secondary max-w-[180px] truncate">
                      {payment.payment_reference}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {payment.household_name}
                    </td>
                    <td
                      className="px-4 py-3 text-end text-sm font-mono text-text-primary"
                      dir="ltr"
                    >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setReceiptPdfUrl(`/api/v1/finance/payments/${payment.id}/receipt/pdf`);
                            setShowReceiptPdf(true);
                          }}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {t('receiptPdf')}
                        </button>
                        <span className="text-text-tertiary">|</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/${locale}/finance/statements/${payment.household_id}`);
                          }}
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

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-secondary" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-2xl bg-surface-secondary" />
        <div className="h-48 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FinanceDashboardPage() {
  const t = useTranslations('finance');
  const [data, setData] = React.useState<FinanceDashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient<{ data: FinanceDashboardData }>('/api/v1/finance/dashboard');
        if (!cancelled) setData(res.data);
      } catch (err) {
        console.error('[FinanceDashboard]', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return <DashboardSkeleton />;

  if (!data) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {t('financeHub')}
        </h1>
        <div className="flex items-center justify-center rounded-2xl bg-surface-secondary p-12">
          <p className="text-sm text-text-tertiary">{t('noDashboardData')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {t('financeHub')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t('financeHubDesc')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t('expectedRevenue')}
          value={formatCurrency(data.expected_revenue)}
          icon={Receipt}
          href="/finance/invoices"
          accent="bg-primary/10 text-primary"
          subtitle={`${(data.invoice_status_counts.issued ?? 0) + (data.invoice_status_counts.partially_paid ?? 0)} ${t('activeInvoices')}`}
        />
        <KpiCard
          label={t('receivedPayments')}
          value={formatCurrency(data.received_payments)}
          icon={TrendingUp}
          href="/finance/payments"
          accent="bg-success-100 text-success-700"
        />
        <KpiCard
          label={t('outstandingAmount')}
          value={formatCurrency(data.outstanding)}
          icon={TrendingDown}
          href="/finance/statements"
          accent="bg-danger-100 text-danger-700"
          subtitle={
            data.overdue_invoices.length > 0
              ? `${data.overdue_invoices.length} ${t('overdueInvoicesCount')}`
              : undefined
          }
        />
        <KpiCard
          label={t('collectionRate')}
          value={`${data.collection_rate.toFixed(1)}%`}
          icon={BadgeDollarSign}
          href="/finance/reports"
          accent={
            data.collection_rate >= 80
              ? 'bg-success-100 text-success-700'
              : data.collection_rate >= 50
                ? 'bg-warning-100 text-warning-700'
                : 'bg-danger-100 text-danger-700'
          }
        />
      </div>

      <PendingActionsBanner
        refunds={data.pending_refund_approvals}
        paymentPlans={data.pending_payment_plans}
        drafts={data.draft_invoices}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction
          label={t('generateFees')}
          icon={Zap}
          href="/finance/fee-generation"
          accent="bg-primary/10 text-primary"
        />
        <QuickAction
          label={t('recordPayment')}
          icon={CreditCard}
          href="/finance/payments/new"
          accent="bg-success-100 text-success-700"
        />
        <QuickAction
          label={t('createInvoice')}
          icon={Receipt}
          href="/finance/invoices"
          accent="bg-info-100 text-info-700"
        />
        <QuickAction
          label={t('viewStatements')}
          icon={ScrollText}
          href="/finance/statements"
          accent="bg-warning-100 text-warning-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InvoicePipeline counts={data.invoice_status_counts} />
        <AgingOverview aging={data.aging_summary} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HouseholdDebtBreakdown breakdown={data.household_debt_breakdown} />
        <TopDebtors debtors={data.top_debtors} />
      </div>

      <OverdueInvoices invoices={data.overdue_invoices} />
      <RecentPayments payments={data.recent_payments} />
      <FinanceNavigate />
    </div>
  );
}
