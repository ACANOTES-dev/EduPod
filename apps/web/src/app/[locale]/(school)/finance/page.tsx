'use client';

import {
  ArrowRight,
  BarChart3,
  Clock,
  LineChart,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { FinanceDashboardData } from '@school/shared';
import type { ModuleKey } from '@school/shared/modules';

import { PageHeader } from '@/components/page-header';
import { useModuleEnabled } from '@/hooks/use-module-enabled';
import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from './_components/currency-display';
import { useTenantCurrency } from './_components/use-tenant-currency';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayrollLatest {
  id: string;
  period_label: string;
  total_pay: number;
  headcount: number;
}

interface PayrollDashboardSlice {
  latest_finalised: PayrollLatest | null;
  latest_run: (PayrollLatest & { status: string }) | null;
  payroll_calendar: {
    next_pay_date: string | null;
    days_until_pay: number | null;
  } | null;
}

// ─── Hub card catalogue ───────────────────────────────────────────────────────

interface HubCardConfig {
  key: 'allFinances' | 'payroll' | 'budgeting';
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  moduleKey?: ModuleKey;
  comingSoon?: boolean;
}

const HUB_CARDS: HubCardConfig[] = [
  {
    key: 'allFinances',
    href: '/finance/all-finances',
    icon: Receipt,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    glow: 'from-emerald-50/80',
  },
  {
    key: 'payroll',
    href: '/payroll',
    icon: Wallet,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    glow: 'from-violet-50/80',
  },
  {
    key: 'budgeting',
    href: '/finance/budgeting',
    icon: LineChart,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
    moduleKey: 'budgeting',
    comingSoon: true,
  },
];

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  icon: Icon,
  label,
  value,
  subtitle,
  accent,
  isLoading,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  accent: string;
  isLoading?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {label}
          </p>
          {isLoading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-surface-secondary" />
          ) : (
            <p
              className={`mt-1 text-2xl font-bold leading-tight tracking-tight ${accent}`}
              dir="ltr"
            >
              {value}
            </p>
          )}
          {subtitle && !isLoading && <p className="mt-1 text-xs text-text-tertiary">{subtitle}</p>}
        </div>
        <div className={`shrink-0 rounded-xl bg-surface-secondary p-2 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Hub Card ─────────────────────────────────────────────────────────────────

function HubCard({
  card,
  locale,
  t,
  stat,
}: {
  card: HubCardConfig;
  locale: string;
  t: (key: string) => string;
  stat?: React.ReactNode;
}) {
  const Icon = card.icon;
  const inner = (
    <>
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${card.accent}`}
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.glow} to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ring-black/5 ${card.iconBg}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex items-center gap-3">
          {card.comingSoon ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              {t('cards.comingSoon')}
            </span>
          ) : (
            stat && (
              <span className="inline-flex items-center rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-primary">
                {stat}
              </span>
            )
          )}
          {!card.comingSoon && (
            <ArrowRight className="h-5 w-5 text-text-tertiary transition-colors duration-300 group-hover:text-primary-600 rtl:rotate-180" />
          )}
        </div>
      </div>
      <div className="relative min-w-0 space-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight text-text-primary">
          {t(`cards.${card.key}.title`)}
        </h3>
        <p className="text-sm leading-relaxed text-text-tertiary">
          {t(`cards.${card.key}.description`)}
        </p>
      </div>
    </>
  );

  const baseClassName =
    'group relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-3xl border border-border bg-surface p-6 text-start shadow-sm transition-all duration-300 sm:p-7';

  if (card.comingSoon) {
    return (
      <div className={`${baseClassName} opacity-75`} aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={`/${locale}${card.href}`}
      className={`${baseClassName} hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500`}
    >
      {inner}
    </Link>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDaysUntil(days: number | null | undefined, t: (key: string) => string): string {
  if (days === null || days === undefined) return '';
  if (days === 0) return t('kpis.todayBadge');
  if (days < 0) return t('kpis.overdueBadge');
  return t('kpis.daysAwayOne').replace('{count}', String(days));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanceSuperHubPage() {
  const t = useTranslations('financeSuperHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const currencyCode = useTenantCurrency();
  const budgetingEnabled = useModuleEnabled('budgeting');

  const [finance, setFinance] = React.useState<FinanceDashboardData | null>(null);
  const [payroll, setPayroll] = React.useState<PayrollDashboardSlice | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [fin, pay] = await Promise.all([
        apiClient<{ data: FinanceDashboardData }>('/api/v1/finance/dashboard').catch((err) => {
          console.error('[FinanceSuperHub.finance]', err);
          return null;
        }),
        apiClient<{ data: PayrollDashboardSlice }>('/api/v1/payroll/dashboard').catch((err) => {
          console.error('[FinanceSuperHub.payroll]', err);
          return null;
        }),
      ]);
      if (cancelled) return;
      setFinance(fin?.data ?? null);
      setPayroll(pay?.data ?? null);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const latestPayroll = payroll?.latest_finalised ?? payroll?.latest_run ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10 p-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <section aria-label={t('kpis.ariaLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={TrendingUp}
          label={t('kpis.expectedRevenue')}
          value={
            finance ? (
              <CurrencyDisplay
                amount={finance.expected_revenue}
                currency_code={currencyCode}
                locale={locale}
              />
            ) : (
              '—'
            )
          }
          subtitle={
            finance
              ? `${(finance.invoice_status_counts.issued ?? 0) + (finance.invoice_status_counts.partially_paid ?? 0)} ${t('kpis.activeInvoices')}`
              : undefined
          }
          accent="text-emerald-700"
          isLoading={isLoading}
        />
        <KpiTile
          icon={Receipt}
          label={t('kpis.receivedPayments')}
          value={
            finance ? (
              <CurrencyDisplay
                amount={finance.received_payments}
                currency_code={currencyCode}
                locale={locale}
              />
            ) : (
              '—'
            )
          }
          accent="text-primary"
          isLoading={isLoading}
        />
        <KpiTile
          icon={TrendingDown}
          label={t('kpis.outstanding')}
          value={
            finance ? (
              <CurrencyDisplay
                amount={finance.outstanding}
                currency_code={currencyCode}
                locale={locale}
              />
            ) : (
              '—'
            )
          }
          subtitle={
            finance && finance.overdue_invoices.length > 0
              ? `${finance.overdue_invoices.length} ${t('kpis.overdueLabel')}`
              : undefined
          }
          accent="text-danger-700"
          isLoading={isLoading}
        />
        <KpiTile
          icon={Wallet}
          label={t('kpis.latestPayroll')}
          value={
            latestPayroll ? (
              <CurrencyDisplay
                amount={latestPayroll.total_pay}
                currency_code={currencyCode}
                locale={locale}
              />
            ) : (
              '—'
            )
          }
          subtitle={
            latestPayroll
              ? `${latestPayroll.period_label} · ${latestPayroll.headcount} ${t('kpis.staff')}`
              : t('kpis.noPayrollYet')
          }
          accent="text-violet-700"
          isLoading={isLoading}
        />
      </section>

      {/* ── Pay-day ribbon ─────────────────────────────────────────────── */}
      {payroll?.payroll_calendar?.next_pay_date && (
        <section className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {t('payDay.title', {
                  date: new Date(payroll.payroll_calendar.next_pay_date).toLocaleDateString(
                    locale,
                    { day: 'numeric', month: 'long' },
                  ),
                })}
              </p>
              <p className="text-xs text-text-tertiary">
                {formatDaysUntil(payroll.payroll_calendar.days_until_pay, t)}
              </p>
            </div>
          </div>
          <Link
            href={`/${locale}/payroll`}
            className="inline-flex items-center gap-1.5 self-start rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 sm:self-auto"
          >
            {t('payDay.cta')}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </section>
      )}

      {/* ── Hub cards ───────────────────────────────────────────────────── */}
      <section
        aria-label={t('cards.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {HUB_CARDS.filter((card) => !card.moduleKey || budgetingEnabled).map((card) => {
          let stat: React.ReactNode;
          if (card.key === 'allFinances' && finance) {
            stat =
              (finance.invoice_status_counts.issued ?? 0) +
              (finance.invoice_status_counts.partially_paid ?? 0) +
              (finance.invoice_status_counts.overdue ?? 0);
          } else if (card.key === 'payroll' && latestPayroll) {
            stat = `${latestPayroll.headcount} ${t('cards.payroll.statSuffix')}`;
          }
          return <HubCard key={card.key} card={card} locale={locale} t={t} stat={stat} />;
        })}
      </section>

      {/* ── Quick analytics strip ──────────────────────────────────────── */}
      {finance && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('mini.invoicePipeline')}
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {finance.invoice_status_counts.draft ?? 0}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-tertiary">
                  {t('mini.draft')}
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700">
                  {(finance.invoice_status_counts.issued ?? 0) +
                    (finance.invoice_status_counts.partially_paid ?? 0)}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-tertiary">
                  {t('mini.active')}
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-danger-700">
                  {finance.invoice_status_counts.overdue ?? 0}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-tertiary">
                  {t('mini.overdue')}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-danger-600" />
              <h3 className="text-sm font-semibold text-text-primary">{t('mini.topDebtors')}</h3>
            </div>
            {finance.top_debtors.length === 0 ? (
              <p className="text-sm text-text-tertiary">{t('mini.allClear')}</p>
            ) : (
              <ul className="space-y-2">
                {finance.top_debtors.slice(0, 3).map((d, i) => (
                  <li key={d.household_id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger-100 text-[10px] font-bold text-danger-700">
                        {i + 1}
                      </span>
                      <span className="truncate text-sm text-text-primary">{d.household_name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-danger-600">
                      <CurrencyDisplay
                        amount={d.total_owed}
                        currency_code={currencyCode}
                        locale={locale}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-violet-600" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('mini.payrollSnapshot')}
              </h3>
            </div>
            {latestPayroll ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-text-primary">
                  {latestPayroll.period_label}
                </p>
                <p className="text-xs text-text-tertiary">
                  {latestPayroll.headcount} {t('mini.staff')} ·{' '}
                  <CurrencyDisplay
                    amount={latestPayroll.total_pay}
                    currency_code={currencyCode}
                    locale={locale}
                  />{' '}
                  {t('mini.paid')}
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">{t('mini.noPayroll')}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
