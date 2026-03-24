'use client';

import { Button, StatCard } from '@school/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  cost_trend: {
    period_month: number;
    period_year: number;
    period_label: string;
    total_pay: number;
    total_basic_pay: number;
    total_bonus_pay: number;
    headcount: number;
  }[];
  incomplete_entries: {
    staff_name: string;
    compensation_type: string;
    missing_field: string;
  }[];
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

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('totalPayThisMonth')} value={formatCurrency(data?.latest_finalised?.total_pay ?? data?.latest_run?.total_pay ?? 0)} />
        <StatCard label={t('headcount')} value={String(data?.latest_finalised?.headcount ?? data?.latest_run?.headcount ?? 0)} />
        <StatCard label={t('totalBonus')} value={formatCurrency(data?.latest_finalised?.total_bonus_pay ?? data?.latest_run?.total_bonus_pay ?? 0)} />
      </div>

      {/* Current Run */}
      {data?.latest_run && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t('currentRun')}</h3>
              <p className="mt-1 text-lg font-medium text-text-primary">{data.latest_run.period_label}</p>
            </div>
            <StatusBadge status={data.latest_run.status} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-text-secondary">
            <span>{t('headcount')}: {data.latest_run.headcount}</span>
            <span>{t('totalPay')}: {formatCurrency(data.latest_run.total_pay)}</span>
          </div>
        </div>
      )}

      {/* Incomplete entries warning */}
      {data?.incomplete_entries && data.incomplete_entries.length > 0 && (
        <div className="rounded-2xl border border-warning-border bg-warning-50 p-5">
          <h3 className="text-sm font-semibold text-warning-text">{t('missingInputs')}</h3>
          <ul className="mt-2 space-y-1">
            {data.incomplete_entries.map((entry, i) => (
              <li key={i} className="text-sm text-warning-text/80">
                {entry.staff_name} — {t(`missing.${entry.missing_field}` as Parameters<typeof t>[0])}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button
          onClick={() => router.push(`/${locale}/payroll/compensation`)}
          className="rounded-2xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-secondary"
        >
          <p className="text-sm font-semibold text-text-primary">{t('compensation')}</p>
          <p className="mt-1 text-xs text-text-secondary">{t('manageCompensation')}</p>
        </button>
        <button
          onClick={() => router.push(`/${locale}/payroll/runs`)}
          className="rounded-2xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-secondary"
        >
          <p className="text-sm font-semibold text-text-primary">{t('payrollRuns')}</p>
          <p className="mt-1 text-xs text-text-secondary">{t('viewAllRuns')}</p>
        </button>
        <button
          onClick={() => router.push(`/${locale}/payroll/reports`)}
          className="rounded-2xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-secondary"
        >
          <p className="text-sm font-semibold text-text-primary">{t('reports')}</p>
          <p className="mt-1 text-xs text-text-secondary">{t('viewReports')}</p>
        </button>
      </div>
    </div>
  );
}
