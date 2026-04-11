'use client';

import {
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeDollarSign,
  Calculator,
  Clock,
  CreditCard,
  FileText,
  Percent,
  Receipt,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { FinanceDashboardData, InvoiceStatus } from '@school/shared';

import { apiClient } from '@/lib/api-client';

import { PaymentStatusBadge } from './_components/payment-status-badge';
import { PdfPreviewModal } from './_components/pdf-preview-modal';

// ─── Helpers ─────────────────────────────────���────────────────────────────────

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function useLocale() {
  const pathname = usePathname();
  return (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

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

// ─── Quick Action Button ────────────────────────���───────────────���────────────

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

// ─── Invoice Pipeline ───────────────────────────────���────────────────────────

const PIPELINE_STAGES: Array<{
  status: InvoiceStatus;
  labelKey: string;
  color: string;
  barColor: string;
}> = [
  {
    status: 'draft',
    labelKey: 'statusDraft',
    color: 'text-text-tertiary',
    barColor: 'bg-text-tertiary/30',
  },
  {
    status: 'pending_approval',
    labelKey: 'statusPendingApproval',
    color: 'text-warning-600',
    barColor: 'bg-warning-400',
  },
  { status: 'issued', labelKey: 'statusIssued', color: 'text-info-600', barColor: 'bg-info-400' },
  {
    status: 'partially_paid',
    labelKey: 'statusPartiallyPaid',
    color: 'text-warning-600',
    barColor: 'bg-warning-500',
  },
  {
    status: 'overdue',
    labelKey: 'statusOverdue',
    color: 'text-danger-600',
    barColor: 'bg-danger-500',
  },
  { status: 'paid', labelKey: 'statusPaid', color: 'text-success-600', barColor: 'bg-success-500' },
];

function InvoicePipeline({ counts }: { counts: Record<string, number> }) {
  const t = useTranslations('finance');
  const locale = useLocale();
  const totalActive = PIPELINE_STAGES.reduce((s, stage) => s + (counts[stage.status] ?? 0), 0);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('invoicePipeline')}</h3>
        <Link
          href={`/${locale}/finance/invoices`}
          className="text-xs font-medium text-primary hover:underline"
        >
          {t('viewAll')}
        </Link>
      </div>

      {/* Segmented bar */}
      {totalActive > 0 && (
        <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-surface-secondary">
          {PIPELINE_STAGES.map((stage) => {
            const count = counts[stage.status] ?? 0;
            const pct = totalActive > 0 ? (count / totalActive) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={stage.status}
                className={`${stage.barColor} transition-all`}
                style={{ width: `${pct}%` }}
                title={`${t(stage.labelKey)}: ${count}`}
              />
            );
          })}
        </div>
      )}

      {/* Status breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {PIPELINE_STAGES.map((stage) => {
          const count = counts[stage.status] ?? 0;
          return (
            <Link
              key={stage.status}
              href={`/${locale}/finance/invoices?status=${stage.status}`}
              className="group flex flex-col items-center rounded-lg p-2 transition-colors hover:bg-surface-secondary"
            >
              <span className={`text-xl font-bold ${stage.color}`}>{count}</span>
              <span className="mt-0.5 text-[11px] font-medium text-text-tertiary text-center">
                {t(stage.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Aging Overview ─────────────────────────────────���────────────────────────

const AGING_BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_plus': '90+ days',
};

const AGING_COLORS: Record<string, string> = {
  current: 'bg-success-100 text-success-700',
  '1_30': 'bg-warning-100 text-warning-700',
  '31_60': 'bg-warning-200 text-warning-800',
  '61_90': 'bg-danger-100 text-danger-700',
  '90_plus': 'bg-danger-200 text-danger-800',
};

function AgingOverview({ aging }: { aging: FinanceDashboardData['aging_summary'] }) {
  const t = useTranslations('finance');
  const locale = useLocale();
  const totalAmount = aging.reduce((s, b) => s + b.total, 0);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('agingOverview')}</h3>
        <Link
          href={`/${locale}/finance/reports`}
          className="text-xs font-medium text-primary hover:underline"
        >
          {t('fullReport')}
        </Link>
      </div>

      <div className="space-y-2">
        {aging.map((bucket) => {
          const pct = totalAmount > 0 ? (bucket.total / totalAmount) * 100 : 0;
          return (
            <div key={bucket.bucket} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs font-medium text-text-secondary">
                {AGING_BUCKET_LABELS[bucket.bucket]}
              </span>
              <div className="flex-1">
                <div className="h-5 overflow-hidden rounded-full bg-surface-secondary">
                  <div
                    className={`h-full rounded-full transition-all ${AGING_COLORS[bucket.bucket]?.split(' ')[0] ?? 'bg-surface-secondary'}`}
                    style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }}
                  />
                </div>
              </div>
              <div className="flex w-28 shrink-0 items-center justify-end gap-2">
                <span className="text-xs font-mono text-text-secondary" dir="ltr">
                  {formatCurrency(bucket.total)}
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${AGING_COLORS[bucket.bucket] ?? ''}`}
                >
                  {bucket.invoice_count}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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

// ─── Top Debtors ──────────────────────────────────────────────────���──────────

function TopDebtors({ debtors }: { debtors: FinanceDashboardData['top_debtors'] }) {
  const t = useTranslations('finance');
  const locale = useLocale();

  if (debtors.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('topDebtors')}</h3>
        <Link
          href={`/${locale}/finance/statements`}
          className="text-xs font-medium text-primary hover:underline"
        >
          {t('viewStatements')}
        </Link>
      </div>
      <div className="space-y-3">
        {debtors.map((debtor, i) => (
          <Link
            key={debtor.household_id}
            href={`/${locale}/finance/statements/${debtor.household_id}`}
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-secondary"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger-100 text-xs font-bold text-danger-700">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">
                {debtor.household_name}
              </p>
              <p className="text-xs text-text-tertiary">
                {debtor.invoice_count}{' '}
                {debtor.invoice_count === 1 ? t('invoice') : t('invoicesLabel')}{' '}
                {t('overdue').toLowerCase()}
              </p>
            </div>
            <span className="shrink-0 font-mono text-sm font-semibold text-danger-600" dir="ltr">
              {formatCurrency(debtor.total_owed)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Overdue Invoices ─────────────────────────��──────────────────────────────

function OverdueInvoices({ invoices }: { invoices: FinanceDashboardData['overdue_invoices'] }) {
  const t = useTranslations('finance');
  const locale = useLocale();

  if (invoices.length === 0) return null;

  return (
    <div className="rounded-2xl border border-danger-200 bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-danger-500" />
        <h3 className="text-sm font-semibold text-text-primary">{t('overdueInvoices')}</h3>
        <Link
          href={`/${locale}/finance/invoices?status=overdue`}
          className="ms-auto text-xs font-medium text-primary hover:underline"
        >
          {t('viewAll')}
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('invoiceNumber')}
              </th>
              <th className="px-3 py-2 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('household')}
              </th>
              <th className="px-3 py-2 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('balance')}
              </th>
              <th className="px-3 py-2 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('daysOverdue')}
              </th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr
                key={inv.id}
                className="border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-surface-secondary"
                onClick={() => window.location.assign(`/${locale}/finance/invoices/${inv.id}`)}
              >
                <td className="px-3 py-2 font-mono text-sm text-primary">{inv.invoice_number}</td>
                <td className="px-3 py-2 text-sm text-text-primary">{inv.household_name}</td>
                <td className="px-3 py-2 text-end font-mono text-sm text-text-primary" dir="ltr">
                  {formatCurrency(inv.balance_amount)}
                </td>
                <td className="px-3 py-2 text-end" dir="ltr">
                  <span className="rounded-md bg-danger-100 px-2 py-0.5 text-xs font-semibold text-danger-700">
                    {inv.days_overdue}d
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Recent Payments ──────────────────────────────────────────────��──────────

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

// ─── Pending Actions Banner ──────────────────��───────────────────────────────

function PendingActionsBanner({
  refunds,
  paymentPlans,
  drafts,
}: {
  refunds: number;
  paymentPlans: number;
  drafts: number;
}) {
  const t = useTranslations('finance');
  const locale = useLocale();
  const items = [
    {
      count: refunds,
      label: t('refundsAwaitingApproval'),
      href: '/finance/refunds',
      icon: RotateCcw,
      color: 'text-info-600 bg-info-100',
    },
    {
      count: paymentPlans,
      label: t('paymentPlansAwaiting'),
      href: '/finance/payment-plans',
      icon: Clock,
      color: 'text-warning-600 bg-warning-100',
    },
    {
      count: drafts,
      label: t('draftInvoices'),
      href: '/finance/invoices?status=draft',
      icon: FileText,
      color: 'text-text-tertiary bg-surface-secondary',
    },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={`/${locale}${item.href}`}
          className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-2.5 transition-all hover:border-border-strong hover:shadow-sm"
        >
          <div className={`rounded-lg p-1.5 ${item.color}`}>
            <item.icon className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-text-primary">{item.count}</span>
          <span className="text-sm text-text-secondary">{item.label}</span>
          <ArrowRight className="ms-1 h-3.5 w-3.5 text-text-tertiary" />
        </Link>
      ))}
    </div>
  );
}

// ─── Finance Navigate Cards ──────────────────────────────────────────────────

interface NavSection {
  titleKey: string;
  items: Array<{
    labelKey: string;
    href: string;
    icon: LucideIcon;
    descKey: string;
  }>;
}

const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'navSetup',
    items: [
      {
        labelKey: 'navFeeStructures',
        href: '/finance/fee-structures',
        icon: Calculator,
        descKey: 'descFeeStructures',
      },
      {
        labelKey: 'navDiscounts',
        href: '/finance/discounts',
        icon: Percent,
        descKey: 'descDiscounts',
      },
      {
        labelKey: 'navFeeAssignments',
        href: '/finance/fee-assignments',
        icon: FileText,
        descKey: 'descFeeAssignments',
      },
      {
        labelKey: 'navScholarships',
        href: '/finance/scholarships',
        icon: Award,
        descKey: 'descScholarships',
      },
    ],
  },
  {
    titleKey: 'navOperations',
    items: [
      {
        labelKey: 'navFeeGeneration',
        href: '/finance/fee-generation',
        icon: Zap,
        descKey: 'descFeeGeneration',
      },
      {
        labelKey: 'navInvoices',
        href: '/finance/invoices',
        icon: Receipt,
        descKey: 'descInvoices',
      },
      {
        labelKey: 'navPayments',
        href: '/finance/payments',
        icon: CreditCard,
        descKey: 'descPayments',
      },
      {
        labelKey: 'navCreditNotes',
        href: '/finance/credit-notes',
        icon: FileText,
        descKey: 'descCreditNotes',
      },
      { labelKey: 'navRefunds', href: '/finance/refunds', icon: RotateCcw, descKey: 'descRefunds' },
    ],
  },
  {
    titleKey: 'navMonitoring',
    items: [
      {
        labelKey: 'navStatements',
        href: '/finance/statements',
        icon: ScrollText,
        descKey: 'descStatements',
      },
      {
        labelKey: 'navPaymentPlans',
        href: '/finance/payment-plans',
        icon: Clock,
        descKey: 'descPaymentPlans',
      },
      {
        labelKey: 'navReports',
        href: '/finance/reports',
        icon: BadgeDollarSign,
        descKey: 'descReports',
      },
      {
        labelKey: 'navAuditTrail',
        href: '/finance/audit-trail',
        icon: ShieldCheck,
        descKey: 'descAuditTrail',
      },
    ],
  },
];

function FinanceNavigateSection({ section }: { section: NavSection }) {
  const t = useTranslations('finance');
  const locale = useLocale();
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {t(section.titleKey)}
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {section.items.map((item) => (
          <Link
            key={item.href}
            href={`/${locale}${item.href}`}
            className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 transition-all hover:border-border-strong hover:shadow-sm"
          >
            <div className="shrink-0 rounded-lg bg-surface-secondary p-2 transition-colors group-hover:bg-primary/10">
              <item.icon className="h-4 w-4 text-text-secondary transition-colors group-hover:text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{t(item.labelKey)}</p>
              <p className="mt-0.5 text-xs text-text-tertiary">{t(item.descKey)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
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
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-48 animate-pulse rounded-xl bg-surface-secondary" />
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

// ─── Page ──────────────────────────��─────────────────────────────��───────────

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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {t('financeHub')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t('financeHubDesc')}</p>
      </div>

      {/* KPI Cards */}
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

      {/* Pending Actions */}
      <PendingActionsBanner
        refunds={data.pending_refund_approvals}
        paymentPlans={data.pending_payment_plans}
        drafts={data.draft_invoices}
      />

      {/* Quick Actions */}
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

      {/* Invoice Pipeline + Aging */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InvoicePipeline counts={data.invoice_status_counts} />
        <AgingOverview aging={data.aging_summary} />
      </div>

      {/* Debt + Top Debtors */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HouseholdDebtBreakdown breakdown={data.household_debt_breakdown} />
        <TopDebtors debtors={data.top_debtors} />
      </div>

      {/* Overdue Invoices */}
      <OverdueInvoices invoices={data.overdue_invoices} />

      {/* Recent Payments */}
      <RecentPayments payments={data.recent_payments} />

      {/* Navigate — All Finance Pages */}
      <div className="rounded-2xl border border-border bg-surface-secondary/30 p-5">
        <h2 className="mb-5 text-base font-semibold text-text-primary">{t('financeModules')}</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {NAV_SECTIONS.map((section) => (
            <FinanceNavigateSection key={section.titleKey} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
}
