'use client';

import { Download, Loader2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BreakdownEntry {
  leave_type: string;
  is_paid: boolean;
  days: number;
}

interface StaffPeriodSummary {
  staff_profile_id: string;
  staff_name: string | null;
  period: string;
  school_days_in_period: number;
  days_worked: number;
  days_missed: number;
  paid_days_missed: number;
  unpaid_days_missed: number;
  breakdown: BreakdownEntry[];
}

interface AbsencePeriodResponse {
  data: StaffPeriodSummary[];
  meta: { period: string; school_days_in_period: number };
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayrollAbsencesPage() {
  const t = useTranslations('payrollAbsences');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [period, setPeriod] = React.useState<string>(currentPeriod());
  const [response, setResponse] = React.useState<AbsencePeriodResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [paidFilter, setPaidFilter] = React.useState<'all' | 'paid' | 'unpaid' | 'none'>('all');

  const fetchPeriod = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<AbsencePeriodResponse>(
        `/api/v1/payroll/absence-periods?period=${period}`,
        { silent: true },
      );
      setResponse(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('loadError');
      toast.error(msg);
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  React.useEffect(() => {
    void fetchPeriod();
  }, [fetchPeriod]);

  const rows: StaffPeriodSummary[] = React.useMemo(() => {
    const list = response?.data ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      if (q && !(r.staff_name ?? '').toLowerCase().includes(q)) return false;
      if (paidFilter === 'paid' && r.paid_days_missed === 0) return false;
      if (paidFilter === 'unpaid' && r.unpaid_days_missed === 0) return false;
      if (paidFilter === 'none' && r.days_missed > 0) return false;
      return true;
    });
  }, [response, query, paidFilter]);

  const totals = React.useMemo(() => {
    if (!response) return null;
    const all = response.data;
    return {
      staff_count: all.length,
      with_absences: all.filter((r) => r.days_missed > 0).length,
      total_days_missed: round2(all.reduce((acc, r) => acc + r.days_missed, 0)),
      paid_days_missed: round2(all.reduce((acc, r) => acc + r.paid_days_missed, 0)),
      unpaid_days_missed: round2(all.reduce((acc, r) => acc + r.unpaid_days_missed, 0)),
      school_days: response.meta.school_days_in_period,
    };
  }, [response]);

  const handleExport = () => {
    if (!response) return;
    const headers = [
      'staff_profile_id',
      'staff_name',
      'period',
      'school_days_in_period',
      'days_worked',
      'days_missed',
      'paid_days_missed',
      'unpaid_days_missed',
      'breakdown',
    ];
    const lines = [headers.join(',')];
    for (const r of response.data) {
      const breakdown = r.breakdown
        .map((b) => `${b.leave_type}:${b.is_paid ? 'paid' : 'unpaid'}:${b.days}`)
        .join('|');
      lines.push(
        [
          r.staff_profile_id,
          csvEscape(r.staff_name ?? ''),
          r.period,
          r.school_days_in_period,
          r.days_worked,
          r.days_missed,
          r.paid_days_missed,
          r.unpaid_days_missed,
          csvEscape(breakdown),
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `absence-period-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('exportedToast'));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/payroll`, label: t('backToPayroll') }}
        actions={
          <Button variant="outline" onClick={handleExport} disabled={!response || loading}>
            <Download className="me-2 h-4 w-4" />
            {t('exportCsv')}
          </Button>
        }
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="period" className="text-xs font-medium text-text-secondary">
            {t('period')}
          </label>
          <input
            id="period"
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value || currentPeriod())}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            dir="ltr"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="search" className="text-xs font-medium text-text-secondary">
            {t('search')}
          </label>
          <input
            id="search"
            type="search"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter" className="text-xs font-medium text-text-secondary">
            {t('filter')}
          </label>
          <Select value={paidFilter} onValueChange={(v) => setPaidFilter(v as typeof paidFilter)}>
            <SelectTrigger id="filter" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filterAll')}</SelectItem>
              <SelectItem value="paid">{t('filterPaid')}</SelectItem>
              <SelectItem value="unpaid">{t('filterUnpaid')}</SelectItem>
              <SelectItem value="none">{t('filterNone')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary tiles */}
      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryTile
            label={t('schoolDays')}
            value={totals.school_days}
            accent="text-text-primary"
          />
          <SummaryTile
            label={t('staffCount')}
            value={totals.staff_count}
            accent="text-text-primary"
          />
          <SummaryTile
            label={t('withAbsences')}
            value={totals.with_absences}
            accent="text-warning-600"
          />
          <SummaryTile
            label={t('paidDaysMissed')}
            value={totals.paid_days_missed}
            accent="text-info-600"
          />
          <SummaryTile
            label={t('unpaidDaysMissed')}
            value={totals.unpaid_days_missed}
            accent="text-danger-600"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-8 text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary">
          {t('noRows')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-secondary/60">
              <tr>
                <th className="px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  {t('colStaff')}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  {t('colDaysWorked')}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  {t('colDaysMissed')}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  {t('colPaid')}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  {t('colUnpaid')}
                </th>
                <th className="px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  {t('colBreakdown')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.staff_profile_id} className={r.days_missed === 0 ? 'opacity-60' : ''}>
                  <td className="px-4 py-2.5 align-middle text-sm font-medium text-text-primary">
                    {r.staff_name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center align-middle text-sm text-text-primary">
                    {round2(r.days_worked)} / {r.school_days_in_period}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-center align-middle text-sm font-semibold ${
                      r.days_missed > 0 ? 'text-warning-700' : 'text-text-tertiary'
                    }`}
                  >
                    {round2(r.days_missed)}
                  </td>
                  <td className="px-4 py-2.5 text-center align-middle text-sm text-info-700">
                    {round2(r.paid_days_missed)}
                  </td>
                  <td className="px-4 py-2.5 text-center align-middle text-sm text-danger-700">
                    {round2(r.unpaid_days_missed)}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-xs text-text-secondary">
                    {r.breakdown.length === 0 ? (
                      <span className="text-text-tertiary">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.breakdown.map((b, idx) => (
                          <span
                            key={`${b.leave_type}-${b.is_paid}-${idx}`}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              b.is_paid
                                ? 'bg-info-100 text-info-800'
                                : 'bg-danger-100 text-danger-800'
                            }`}
                          >
                            <span className="font-mono">{b.leave_type}</span>
                            <span>·</span>
                            <span>{round2(b.days)}d</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold leading-tight tracking-tight ${accent}`}>{value}</p>
    </div>
  );
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
