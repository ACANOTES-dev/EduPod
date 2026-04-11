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
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { FinanceDashboardData, InvoiceStatus } from '@school/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useLocale() {
  const pathname = usePathname();
  return (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
}

export function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Invoice Pipeline ────────────────────────────────────────────────────────

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

export function InvoicePipeline({ counts }: { counts: Record<string, number> }) {
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {PIPELINE_STAGES.map((stage) => (
          <Link
            key={stage.status}
            href={`/${locale}/finance/invoices?status=${stage.status}`}
            className="group flex flex-col items-center rounded-lg p-2 transition-colors hover:bg-surface-secondary"
          >
            <span className={`text-xl font-bold ${stage.color}`}>{counts[stage.status] ?? 0}</span>
            <span className="mt-0.5 text-[11px] font-medium text-text-tertiary text-center">
              {t(stage.labelKey)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Aging Overview ──────────────────────────────────────────────────────────

const AGING_BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  '1_30': '1\u201330 days',
  '31_60': '31\u201360 days',
  '61_90': '61\u201390 days',
  '90_plus': '90+ days',
};

const AGING_COLORS: Record<string, string> = {
  current: 'bg-success-100 text-success-700',
  '1_30': 'bg-warning-100 text-warning-700',
  '31_60': 'bg-warning-200 text-warning-800',
  '61_90': 'bg-danger-100 text-danger-700',
  '90_plus': 'bg-danger-200 text-danger-800',
};

export function AgingOverview({ aging }: { aging: FinanceDashboardData['aging_summary'] }) {
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

// ─── Top Debtors ─────────────────────────────────────────────────────────────

export function TopDebtors({ debtors }: { debtors: FinanceDashboardData['top_debtors'] }) {
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

// ─── Overdue Invoices ────────────────────────────────────────────────────────

export function OverdueInvoices({
  invoices,
}: {
  invoices: FinanceDashboardData['overdue_invoices'];
}) {
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

// ─── Pending Actions Banner ──────────────────────────────────────────────────

export function PendingActionsBanner({
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
  items: Array<{ labelKey: string; href: string; icon: LucideIcon; descKey: string }>;
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

function FinanceNavigateSectionCard({ section }: { section: NavSection }) {
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

export function FinanceNavigate() {
  const t = useTranslations('finance');
  return (
    <div className="rounded-2xl border border-border bg-surface-secondary/30 p-5">
      <h2 className="mb-5 text-base font-semibold text-text-primary">{t('financeModules')}</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {NAV_SECTIONS.map((section) => (
          <FinanceNavigateSectionCard key={section.titleKey} section={section} />
        ))}
      </div>
    </div>
  );
}
