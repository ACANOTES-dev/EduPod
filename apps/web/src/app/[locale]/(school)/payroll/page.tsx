'use client';

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Plus,
  Sparkles,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';

import { CurrencyDisplay } from '../finance/_components/currency-display';
import { useTenantCurrency } from '../finance/_components/use-tenant-currency';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostTrendPoint {
  period_label: string;
  total_basic_pay: number;
  total_bonus_pay: number;
  total_allowances: number;
  total_pay: number;
  headcount: number;
}

interface DashboardData {
  latest_run: {
    id: string;
    period_label: string;
    status: string;
    headcount: number;
    total_pay: number;
    total_basic_pay: number;
    total_bonus_pay: number;
  } | null;
  latest_finalised: {
    id: string;
    period_label: string;
    total_pay: number;
    total_basic_pay: number;
    total_bonus_pay: number;
    headcount: number;
  } | null;
  cost_trend: CostTrendPoint[];
  incomplete_entries: {
    staff_name: string;
    compensation_type: string;
    missing_field: string;
  }[];
  anomalies: {
    entry_id: string;
    staff_name: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
  }[];
  payroll_calendar: {
    next_pay_date: string | null;
    days_until_pay: number | null;
    preparation_deadline: string | null;
    days_until_preparation: number | null;
  } | null;
  current_draft_id: string | null;
}

// ─── Hub card catalogue ───────────────────────────────────────────────────────

interface HubCardConfig {
  key:
    | 'runs'
    | 'compensation'
    | 'attendance'
    | 'classDelivery'
    | 'reports'
    | 'exports'
    | 'myPayslips';
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
}

const HUB_CARDS: HubCardConfig[] = [
  {
    key: 'runs',
    href: '/payroll/runs',
    icon: CalendarDays,
    accent: 'from-primary-400 via-primary-500 to-primary-600',
    iconBg: 'bg-primary-100 text-primary-700',
    glow: 'from-primary-50/80',
  },
  {
    key: 'compensation',
    href: '/payroll/compensation',
    icon: UserCog,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    glow: 'from-violet-50/80',
  },
  {
    key: 'attendance',
    href: '/payroll/staff-attendance',
    icon: CalendarCheck,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    glow: 'from-emerald-50/80',
  },
  {
    key: 'classDelivery',
    href: '/payroll/class-delivery',
    icon: BookOpen,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
  },
  {
    key: 'reports',
    href: '/payroll/reports',
    icon: BarChart3,
    accent: 'from-indigo-400 via-indigo-500 to-indigo-600',
    iconBg: 'bg-indigo-100 text-indigo-700',
    glow: 'from-indigo-50/80',
  },
  {
    key: 'exports',
    href: '/payroll/exports',
    icon: Download,
    accent: 'from-amber-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-700',
    glow: 'from-amber-50/80',
  },
  {
    key: 'myPayslips',
    href: '/payroll/my-payslips',
    icon: FileText,
    accent: 'from-rose-400 via-rose-500 to-rose-600',
    iconBg: 'bg-rose-100 text-rose-700',
    glow: 'from-rose-50/80',
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
          {subtitle && !isLoading && (
            <p className="mt-1 text-xs text-text-tertiary">{subtitle}</p>
          )}
        </div>
        <div className={`shrink-0 rounded-xl bg-surface-secondary p-2 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft: 'bg-warning-100 text-warning-700',
    pending_approval: 'bg-info-100 text-info-700',
    finalised: 'bg-success-100 text-success-700',
    cancelled: 'bg-surface-secondary text-text-tertiary',
  };
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface-secondary text-text-secondary'}`}
    >
      {label}
    </span>
  );
}

// ─── Hub Card ─────────────────────────────────────────────────────────────────

function HubCard({
  card,
  locale,
  t,
  count,
}: {
  card: HubCardConfig;
  locale: string;
  t: (key: string) => string;
  count?: number;
}) {
  const Icon = card.icon;
  return (
    <Link
      href={`/${locale}${card.href}`}
      className="group relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-3xl border border-border bg-surface p-6 text-start shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:p-7"
    >
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
          {count !== undefined && count > 0 && (
            <span className="inline-flex items-center rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-primary">
              {count}
            </span>
          )}
          <ArrowRight className="h-5 w-5 text-text-tertiary transition-colors duration-300 group-hover:text-primary-600 rtl:rotate-180" />
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
    </Link>
  );
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────

function TrendTooltip(props: {
  active?: boolean;
  payload?: ReadonlyArray<{
    name?: string | number;
    value?: string | number | readonly (string | number)[];
    color?: string;
  }>;
  label?: string | number;
  currencyCode: string;
  locale: string;
}) {
  const { active, payload, label, currencyCode, locale } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-lg">
      <p className="text-sm font-semibold text-text-primary">{String(label ?? '')}</p>
      {payload.map((entry, idx) => {
        const amount = typeof entry.value === 'number' ? entry.value : 0;
        const name = String(entry.name ?? '');
        return (
          <p key={`${name}-${idx}`} className="text-xs" style={{ color: entry.color }}>
            {name}:{' '}
            <CurrencyDisplay amount={amount} currency_code={currencyCode} locale={locale} />
          </p>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayrollHubPage() {
  const t = useTranslations('payrollHub');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const currencyCode = useTenantCurrency();

  const [data, setData] = React.useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchDashboard = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: DashboardData }>('/api/v1/payroll/dashboard');
      setData(res.data);
    } catch (err) {
      console.error('[PayrollHubPage]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const latest = data?.latest_finalised ?? data?.latest_run ?? null;
  const cal = data?.payroll_calendar;
  const hasDraft = data?.latest_run?.status === 'draft';

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10 p-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/finance`, label: t('backToFinance') }}
        actions={
          <div className="flex items-center gap-2">
            {hasDraft && data?.latest_run ? (
              <button
                type="button"
                onClick={() => router.push(`/${locale}/payroll/runs/${data.latest_run!.id}`)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-warning-300 bg-warning-50 px-4 py-2 text-sm font-medium text-warning-800 shadow-sm transition-colors hover:bg-warning-100"
              >
                <Clock className="h-4 w-4" />
                {t('actions.continueDraft')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push(`/${locale}/payroll/runs`)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-600"
            >
              <Plus className="h-4 w-4" />
              {t('actions.newRun')}
            </button>
          </div>
        }
      />

      {/* ── Pay-day ribbon ─────────────────────────────────────────────── */}
      {cal?.next_pay_date && (
        <section className="flex flex-col gap-3 rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 via-white to-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {t('payDay.title', {
                  date: new Date(cal.next_pay_date).toLocaleDateString(fmtLocale(locale), {
                    day: 'numeric',
                    month: 'long',
                  }),
                })}
              </p>
              <p className="text-xs text-text-tertiary">
                {cal.days_until_pay === 0
                  ? t('payDay.today')
                  : cal.days_until_pay && cal.days_until_pay > 0
                    ? t('payDay.daysAway', { count: cal.days_until_pay })
                    : t('payDay.overdue')}
              </p>
            </div>
          </div>
          {cal.preparation_deadline && (
            <div className="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
              {t('payDay.prepDeadline', {
                date: new Date(cal.preparation_deadline).toLocaleDateString(fmtLocale(locale), {
                  day: 'numeric',
                  month: 'short',
                }),
              })}
              {cal.days_until_preparation !== null &&
                cal.days_until_preparation !== undefined &&
                cal.days_until_preparation <= 5 && (
                  <span className="ms-2 font-semibold">⚠ {t('payDay.soon')}</span>
                )}
            </div>
          )}
        </section>
      )}

      {/* ── KPI strip ──────────────────────────────────────────────────── */}
      <section aria-label={t('kpis.ariaLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={Wallet}
          label={t('kpis.totalPay')}
          value={
            latest ? (
              <CurrencyDisplay
                amount={latest.total_pay}
                currency_code={currencyCode}
                locale={locale}
              />
            ) : (
              '—'
            )
          }
          subtitle={latest?.period_label}
          accent="text-primary"
          isLoading={isLoading}
        />
        <KpiTile
          icon={Users}
          label={t('kpis.headcount')}
          value={latest?.headcount ?? '—'}
          subtitle={latest ? t('kpis.staffPaid') : undefined}
          accent="text-emerald-700"
          isLoading={isLoading}
        />
        <KpiTile
          icon={Sparkles}
          label={t('kpis.totalBonus')}
          value={
            latest ? (
              <CurrencyDisplay
                amount={latest.total_bonus_pay}
                currency_code={currencyCode}
                locale={locale}
              />
            ) : (
              '—'
            )
          }
          accent="text-violet-700"
          isLoading={isLoading}
        />
        <KpiTile
          icon={TrendingUp}
          label={t('kpis.basicPay')}
          value={
            latest ? (
              <CurrencyDisplay
                amount={latest.total_basic_pay}
                currency_code={currencyCode}
                locale={locale}
              />
            ) : (
              '—'
            )
          }
          accent="text-indigo-700"
          isLoading={isLoading}
        />
      </section>

      {/* ── Current run banner (in-progress state) ───────────────────── */}
      {data?.latest_run && data.latest_run.status !== 'finalised' && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">{t('currentRun.title')}</h3>
                <StatusBadge status={data.latest_run.status} />
              </div>
              <p className="mt-1 text-lg font-medium text-text-primary">
                {data.latest_run.period_label}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-text-tertiary">
                <span>
                  {data.latest_run.headcount} {t('currentRun.staffLabel')}
                </span>
                <span>·</span>
                <span>{t('currentRun.totalLabel')}:</span>
                <CurrencyDisplay
                  amount={data.latest_run.total_pay}
                  currency_code={currencyCode}
                  locale={locale}
                />
              </p>
            </div>
            <Link
              href={`/${locale}/payroll/runs/${data.latest_run.id}`}
              className="inline-flex items-center gap-1.5 self-start rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-surface-secondary sm:self-auto"
            >
              {t('currentRun.cta')}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        </section>
      )}

      {/* ── Attention surfaces (anomalies + incomplete entries) ─────── */}
      {((data?.anomalies && data.anomalies.length > 0) ||
        (data?.incomplete_entries && data.incomplete_entries.length > 0)) && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data?.anomalies && data.anomalies.length > 0 && (
            <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning-700" />
                <h3 className="text-sm font-semibold text-warning-800">
                  {t('attention.anomaliesTitle', { count: data.anomalies.length })}
                </h3>
              </div>
              <ul className="space-y-1.5">
                {data.anomalies.slice(0, 5).map((a) => (
                  <li
                    key={a.entry_id}
                    className="flex items-start gap-2 text-sm text-warning-800/90"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        a.severity === 'high'
                          ? 'bg-danger-500'
                          : a.severity === 'medium'
                            ? 'bg-warning-500'
                            : 'bg-info-400'
                      }`}
                    />
                    <span>
                      <strong>{a.staff_name}</strong> — {a.description}
                    </span>
                  </li>
                ))}
              </ul>
              {data.anomalies.length > 5 && (
                <p className="mt-2 text-xs text-warning-800/70">
                  {t('attention.moreAnomalies', { count: data.anomalies.length - 5 })}
                </p>
              )}
            </div>
          )}

          {data?.incomplete_entries && data.incomplete_entries.length > 0 && (
            <div className="rounded-2xl border border-info-200 bg-info-50 p-5">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-info-700" />
                <h3 className="text-sm font-semibold text-info-800">
                  {t('attention.missingInputsTitle', { count: data.incomplete_entries.length })}
                </h3>
              </div>
              <ul className="space-y-1.5">
                {data.incomplete_entries.slice(0, 5).map((entry, i) => (
                  <li key={i} className="text-sm text-info-800/90">
                    <strong>{entry.staff_name}</strong>
                    {entry.missing_field === 'days_worked'
                      ? ` — ${t('attention.missingDaysWorked')}`
                      : entry.missing_field === 'classes_taught'
                        ? ` — ${t('attention.missingClassesTaught')}`
                        : ` — ${entry.missing_field}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Hub cards ──────────────────────────────────────────────────── */}
      <section
        aria-label={t('cards.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4"
      >
        {HUB_CARDS.map((card) => (
          <HubCard key={card.key} card={card} locale={locale} t={t} />
        ))}
      </section>

      {/* ── Cost trend chart ───────────────────────────────────────────── */}
      {data?.cost_trend && data.cost_trend.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-text-primary">{t('costTrend.title')}</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.cost_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="period_label"
                tick={{ fontSize: 11 }}
                stroke="var(--color-text-tertiary)"
              />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-tertiary)" />
              <Tooltip
                content={(props) => (
                  <TrendTooltip {...props} currencyCode={currencyCode} locale={locale} />
                )}
              />
              <Area
                type="monotone"
                dataKey="total_basic_pay"
                name={t('costTrend.basicPay')}
                stackId="1"
                stroke="hsl(var(--color-primary))"
                fill="hsl(var(--color-primary) / 0.35)"
              />
              <Area
                type="monotone"
                dataKey="total_bonus_pay"
                name={t('costTrend.bonusPay')}
                stackId="1"
                stroke="hsl(var(--color-success))"
                fill="hsl(var(--color-success) / 0.35)"
              />
              <Area
                type="monotone"
                dataKey="total_allowances"
                name={t('costTrend.allowances')}
                stackId="1"
                stroke="hsl(var(--color-info))"
                fill="hsl(var(--color-info) / 0.25)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      )}
    </div>
  );
}
