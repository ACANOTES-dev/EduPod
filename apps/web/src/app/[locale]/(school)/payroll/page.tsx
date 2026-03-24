'use client';

import { Button, StatCard } from '@school/ui';
import { AlertTriangle, CalendarDays } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrencyShort(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

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

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft: 'bg-warning-100 text-warning-text',
    pending_approval: 'bg-info-100 text-info-text',
    finalised: 'bg-success-100 text-success-text',
    cancelled: 'bg-neutral-100 text-text-tertiary',
  };
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-neutral-100 text-text-secondary'}`}
    >
      {label}
    </span>
  );
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

export default function PayrollDashboardPage() {
  const t = useTranslations('payroll');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchDashboard = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: DashboardData }>('/api/v1/payroll/dashboard');
      setData(res.data);
    } catch {
      // silent
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  const cal = data?.payroll_calendar;

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-border bg-surface p-3 shadow-lg">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        {payload.map((entry) => (
          <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: {formatCurrencyShort(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard')}
        actions={
          <div className="flex items-center gap-2">
            {data?.latest_run?.status === 'draft' ? (
              <Button onClick={() => router.push(`/${locale}/payroll/runs/${data.latest_run!.id}`)}>
                {t('continueDraft')}
              </Button>
            ) : (
              <Button onClick={() => router.push(`/${locale}/payroll/runs`)}>
                {t('newPayrollRun')}
              </Button>
            )}
          </div>
        }
      />

      {/* Payroll calendar card */}
      {cal && cal.next_pay_date && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {t('nextPayDate')}: {new Date(cal.next_pay_date).toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
                <p className="text-xs text-text-secondary">
                  {cal.days_until_pay === 0
                    ? t('payDayToday')
                    : t('daysAway', { count: cal.days_until_pay ?? 0 })}
                </p>
              </div>
            </div>
            {cal.preparation_deadline && (
              <div className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-text">
                {t('prepDeadline')}: {new Date(cal.preparation_deadline).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                })}
                {cal.days_until_preparation !== null && cal.days_until_preparation <= 5 && (
                  <span className="ms-2 font-semibold">⚠ {t('soon')}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={t('totalPayThisMonth')}
          value={formatCurrency(data?.latest_finalised?.total_pay ?? data?.latest_run?.total_pay ?? 0)}
        />
        <StatCard
          label={t('headcount')}
          value={String(data?.latest_finalised?.headcount ?? data?.latest_run?.headcount ?? 0)}
        />
        <StatCard
          label={t('totalBonus')}
          value={formatCurrency(data?.latest_finalised?.total_bonus_pay ?? data?.latest_run?.total_bonus_pay ?? 0)}
        />
      </div>

      {/* Current Run */}
      {data?.latest_run && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t('currentRun')}</h3>
              <p className="mt-1 text-lg font-medium text-text-primary">
                {data.latest_run.period_label}
              </p>
            </div>
            <StatusBadge status={data.latest_run.status} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-text-secondary">
            <span>
              {t('headcount')}: {data.latest_run.headcount}
            </span>
            <span>
              {t('totalPay')}: {formatCurrency(data.latest_run.total_pay)}
            </span>
          </div>
        </div>
      )}

      {/* Stacked cost trend chart */}
      {data?.cost_trend && data.cost_trend.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('costTrend')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.cost_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="period_label"
                tick={{ fontSize: 11 }}
                stroke="var(--color-text-tertiary)"
              />
              <YAxis
                tickFormatter={(v: number) => formatCurrencyShort(v)}
                tick={{ fontSize: 11 }}
                stroke="var(--color-text-tertiary)"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="total_basic_pay"
                name={t('basicPay')}
                stackId="1"
                stroke="hsl(var(--color-primary))"
                fill="hsl(var(--color-primary) / 0.35)"
              />
              <Area
                type="monotone"
                dataKey="total_bonus_pay"
                name={t('bonusPay')}
                stackId="1"
                stroke="hsl(var(--color-success))"
                fill="hsl(var(--color-success) / 0.35)"
              />
              <Area
                type="monotone"
                dataKey="total_allowances"
                name={t('allowancesTotal')}
                stackId="1"
                stroke="hsl(var(--color-info))"
                fill="hsl(var(--color-info) / 0.25)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Anomaly alerts */}
      {data?.anomalies && data.anomalies.length > 0 && (
        <div className="rounded-2xl border border-warning-border bg-warning-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-warning-600" />
            <h3 className="text-sm font-semibold text-warning-text">
              {t('anomaliesDetected', { count: data.anomalies.length })}
            </h3>
          </div>
          <ul className="space-y-1.5">
            {data.anomalies.slice(0, 5).map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-warning-text/80">
                <span
                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
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
            <p className="mt-2 text-xs text-warning-text/70">
              +{data.anomalies.length - 5} {t('moreAnomalies')}
            </p>
          )}
        </div>
      )}

      {/* Incomplete entries warning */}
      {data?.incomplete_entries && data.incomplete_entries.length > 0 && (
        <div className="rounded-2xl border border-warning-border bg-warning-50 p-5">
          <h3 className="text-sm font-semibold text-warning-text">{t('missingInputs')}</h3>
          <ul className="mt-2 space-y-1">
            {data.incomplete_entries.map((entry, i) => (
              <li key={i} className="text-sm text-warning-text/80">
                {entry.staff_name} —{' '}
                {t(`missing.${entry.missing_field}` as Parameters<typeof t>[0])}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            href: `/${locale}/payroll/compensation`,
            title: t('compensation'),
            desc: t('manageCompensation'),
          },
          {
            href: `/${locale}/payroll/staff-attendance`,
            title: t('staffAttendance'),
            desc: t('staffAttendanceDesc'),
          },
          {
            href: `/${locale}/payroll/reports`,
            title: t('reports'),
            desc: t('viewReports'),
          },
        ].map((link) => (
          <button
            key={link.href}
            onClick={() => router.push(link.href)}
            className="rounded-2xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-secondary"
          >
            <p className="text-sm font-semibold text-text-primary">{link.title}</p>
            <p className="mt-1 text-xs text-text-secondary">{link.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
