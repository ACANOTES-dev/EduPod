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

import { CurrencyDisplay } from './_components/currency-display';
import {
  AgingOverview,
  FinanceNavigate,
  InvoicePipeline,
  OverdueInvoices,
  PendingActionsBanner,
} from './_components/dashboard-sections';
import { PaymentStatusBadge } from './_components/payment-status-badge';
import { PdfPreviewModal } from './_components/pdf-preview-modal';
import { useTenantCurrency } from './_components/use-tenant-currency';

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
  value: React.ReactNode;
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
          <div
            className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-text-primary"
            dir="ltr"
          >
            {value}
          </div>
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

const DEBT_BUCKETS = [
  {
    key: 'pct_0_10',
    labelKey: 'debt0to10',
    filterValue: '0_10',
    color: 'bg-success-400',
    textColor: 'text-success-700',
    bgLight: 'bg-success-50',
  },
  {
    key: 'pct_10_30',
    labelKey: 'debt10to30',
    filterValue: '10_30',
    color: 'bg-warning-400',
    textColor: 'text-warning-700',
    bgLight: 'bg-warning-50',
  },
  {
    key: 'pct_30_50',
    labelKey: 'debt30to50',
    filterValue: '30_50',
    color: 'bg-warning-600',
    textColor: 'text-warning-800',
    bgLight: 'bg-warning-50',
  },
  {
    key: 'pct_50_plus',
    labelKey: 'debt50plus',
    filterValue: '50_plus',
    color: 'bg-danger-500',
    textColor: 'text-danger-700',
    bgLight: 'bg-danger-50',
  },
] as const;

function HouseholdDebtBreakdown({
  breakdown,
  topDebtors,
}: {
  breakdown: FinanceDashboardData['household_debt_breakdown'];
  topDebtors: FinanceDashboardData['top_debtors'];
}) {
  const t = useTranslations('finance');
  const locale = useLocale();
  const currencyCode = useTenantCurrency();
  const total =
    breakdown.pct_0_10 + breakdown.pct_10_30 + breakdown.pct_30_50 + breakdown.pct_50_plus;
  const counts: Record<string, number> = {
    pct_0_10: breakdown.pct_0_10,
    pct_10_30: breakdown.pct_10_30,
    pct_30_50: breakdown.pct_30_50,
    pct_50_plus: breakdown.pct_50_plus,
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t('householdDebtBreakdown')}</h3>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {total} {t('householdsTotal')}
          </p>
        </div>
        <Link
          href={`/${locale}/finance/debt-breakdown`}
          className="flex items-center gap-1.5 rounded-lg bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-hover"
        >
          {t('viewFullBreakdown')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Segmented bar */}
      {total > 0 && (
        <div className="mb-5 flex h-4 overflow-hidden rounded-full bg-surface-secondary">
          {DEBT_BUCKETS.map((bucket) => {
            const count = counts[bucket.key] ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <Link
                key={bucket.key}
                href={`/${locale}/finance/debt-breakdown?bucket=${bucket.filterValue}`}
                className={`${bucket.color} transition-all hover:brightness-110`}
                style={{ width: `${pct}%` }}
                title={`${t(bucket.labelKey)}: ${count}`}
              />
            );
          })}
        </div>
      )}

      {/* Bucket cards — clickable, full-width grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DEBT_BUCKETS.map((bucket) => {
          const count = counts[bucket.key] ?? 0;
          return (
            <Link
              key={bucket.key}
              href={`/${locale}/finance/debt-breakdown?bucket=${bucket.filterValue}`}
              className={`group rounded-xl border border-border p-3 transition-all hover:border-border-strong hover:shadow-sm ${count > 0 ? '' : 'opacity-50'}`}
            >
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 shrink-0 rounded-full ${bucket.color}`} />
                <span className="text-xs font-medium text-text-tertiary">{t(bucket.labelKey)}</span>
              </div>
              <p
                className={`mt-1.5 text-2xl font-bold ${count > 0 ? bucket.textColor : 'text-text-tertiary'}`}
              >
                {count}
              </p>
              <p className="text-[11px] text-text-tertiary">{t('households')}</p>
            </Link>
          );
        })}
      </div>

      {/* Top debtors preview */}
      {topDebtors.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('topDebtors')}
            </h4>
            <Link
              href={`/${locale}/finance/debt-breakdown`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('viewAll')}
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {topDebtors.slice(0, 6).map((debtor, i) => (
              <Link
                key={debtor.household_id}
                href={`/${locale}/finance/statements/${debtor.household_id}`}
                className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-all hover:border-border-strong hover:shadow-sm"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-100 text-[10px] font-bold text-danger-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {debtor.household_name}
                  </p>
                  <p className="text-[11px] text-text-tertiary">
                    {debtor.invoice_count}{' '}
                    {debtor.invoice_count === 1 ? t('invoice') : t('invoicesLabel')}
                  </p>
                </div>
                <CurrencyDisplay
                  amount={debtor.total_owed}
                  currency_code={currencyCode}
                  className="shrink-0 font-mono text-sm font-semibold text-danger-600"
                  locale={locale}
                />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recent Payments ─────────────────────────────────────────────────────────

function RecentPayments({ payments }: { payments: FinanceDashboardData['recent_payments'] }) {
  const t = useTranslations('finance');
  const router = useRouter();
  const locale = useLocale();
  const currencyCode = useTenantCurrency();
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
                    <td className="px-4 py-3 text-end" dir="ltr">
                      <CurrencyDisplay
                        amount={payment.amount}
                        currency_code={currencyCode}
                        className="text-sm font-mono text-text-primary"
                        locale={locale}
                      />
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
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const currencyCode = useTenantCurrency();
  const [data, setData] = React.useState<FinanceDashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const hasFetched = React.useRef(false);
  React.useEffect(() => {
    // FIN-024: guard against duplicate fetches from React.StrictMode double-invoke
    // in development and any parent re-mount edge case in production.
    if (hasFetched.current) return;
    hasFetched.current = true;

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
          value={
            <CurrencyDisplay
              amount={data.expected_revenue}
              currency_code={currencyCode}
              locale={locale}
            />
          }
          icon={Receipt}
          href="/finance/overview"
          accent="bg-primary/10 text-primary"
          subtitle={`${(data.invoice_status_counts.issued ?? 0) + (data.invoice_status_counts.partially_paid ?? 0)} ${t('activeInvoices')}`}
        />
        <KpiCard
          label={t('receivedPayments')}
          value={
            <CurrencyDisplay
              amount={data.received_payments}
              currency_code={currencyCode}
              locale={locale}
            />
          }
          icon={TrendingUp}
          href="/finance/overview"
          accent="bg-success-100 text-success-700"
        />
        <KpiCard
          label={t('outstandingAmount')}
          value={
            <CurrencyDisplay
              amount={data.outstanding}
              currency_code={currencyCode}
              locale={locale}
            />
          }
          icon={TrendingDown}
          href={
            data.overdue_invoices.length > 0 ? '/finance/overview?overdue=yes' : '/finance/overview'
          }
          accent="bg-danger-100 text-danger-700"
          subtitle={
            data.overdue_invoices.length > 0
              ? `${data.overdue_invoices.length} ${t('overdueInvoicesCount')}`
              : undefined
          }
        />
        {/* Split card: Outstanding % + Financial Reports */}
        <div className="flex flex-col gap-2">
          <div className="flex-1 rounded-2xl border border-border bg-surface p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {t('outstandingPct')}
            </p>
            <p
              className={`mt-1 text-[22px] font-bold leading-tight tracking-tight ${
                data.outstanding > 0 && data.expected_revenue > 0
                  ? (data.outstanding / data.expected_revenue) * 100 > 30
                    ? 'text-danger-600'
                    : (data.outstanding / data.expected_revenue) * 100 > 15
                      ? 'text-warning-600'
                      : 'text-success-600'
                  : 'text-success-600'
              }`}
              dir="ltr"
            >
              {data.expected_revenue > 0
                ? `${((data.outstanding / data.expected_revenue) * 100).toFixed(1)}%`
                : '0.0%'}
            </p>
          </div>
          <Link
            href={`/${locale}/finance/reports`}
            className="group flex flex-1 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-all hover:border-border-strong hover:shadow-sm"
          >
            <div className="rounded-lg bg-info-100 p-2">
              <BadgeDollarSign className="h-4 w-4 text-info-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-text-primary">{t('navReports')}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        </div>
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
          label={t('viewInvoices')}
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

      <HouseholdDebtBreakdown
        breakdown={data.household_debt_breakdown}
        topDebtors={data.top_debtors}
      />

      <OverdueInvoices invoices={data.overdue_invoices} />
      <FinanceNavigate />
      <RecentPayments payments={data.recent_payments} />
    </div>
  );
}
