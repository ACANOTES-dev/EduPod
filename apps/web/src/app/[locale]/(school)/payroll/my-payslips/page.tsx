'use client';

import { Download } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { downloadAuthenticatedPdf } from '@/lib/download-pdf';

/**
 * Wave 3 contract: payslips list and YTD endpoints scope strictly to the
 * calling user's own staff_profile. The privacy invariant (rule 11) means
 * the page must NOT pass a `staff_profile_id` query parameter — the API
 * resolves the user's staff_profile from the authenticated principal.
 */

interface PayslipEntry {
  id: string;
  payslip_number: string | null;
  created_at: string;
  payroll_entry: {
    id: string;
    payroll_run_id: string;
    basic_pay: number;
    bonus_pay: number;
    total_pay: number;
    payroll_run: {
      period_label: string;
      period_month: number;
      period_year: number;
      finalised_at: string | null;
    };
  };
}

interface YtdResponse {
  year: number;
  gross_total: number;
  net_total: number;
  total_deductions: number;
  by_month: Array<{ month: number; gross: number; net: number; deductions: number }>;
}

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export default function MyPayslipsPage() {
  const t = useTranslations('payroll');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [payslips, setPayslips] = React.useState<PayslipEntry[]>([]);
  const [ytd, setYtd] = React.useState<YtdResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [accessDenied, setAccessDenied] = React.useState(false);

  React.useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [payslipsRes, ytdRes] = await Promise.all([
          apiClient<{ data: PayslipEntry[] }>('/api/v1/payroll/my-payslips', { silent: true }),
          apiClient<YtdResponse>('/api/v1/payroll/my-payslips/ytd', { silent: true }),
        ]);
        setPayslips(payslipsRes.data);
        setYtd(ytdRes);
        setAccessDenied(false);
      } catch (err) {
        const status =
          err && typeof err === 'object' && 'status' in (err as object)
            ? Number((err as { status?: number }).status)
            : null;
        if (status === 403) {
          setAccessDenied(true);
        } else {
          const message = err instanceof Error ? err.message : t('myPayslipsLoadFailed');
          toast.error(message);
        }
      } finally {
        setIsLoading(false);
      }
    };
    void fetchData();
  }, [t]);

  const handleDownload = async (payslipId: string) => {
    setDownloadingId(payslipId);
    try {
      // Wave 3 endpoint: scoped to the calling user's own payslip.
      await downloadAuthenticatedPdf(`/api/v1/payroll/my-payslips/${payslipId}/pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('payslipDownloadFailed');
      toast.error(message);
    } finally {
      setDownloadingId(null);
    }
  };

  if (accessDenied) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
        <h2 className="text-lg font-semibold text-text-primary">{t('selfServiceNoAccessTitle')}</h2>
        <p className="text-sm text-text-tertiary">{t('selfServiceNoAccessBody')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface-secondary" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  // Resolve user via the staff_profile linkage server-side. If the user has
  // no linked staff_profile (e.g. parent-only account), the API returns an
  // empty list and zero YTD totals — surface a friendlier message.
  const hasNoStaffProfile = payslips.length === 0 && ytd && ytd.gross_total === 0;
  const byMonthChart = ytd?.by_month.map((row) => ({
    month: MONTH_LABELS[row.month - 1] ?? String(row.month),
    gross: row.gross,
    net: row.net,
  }));

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={t('myPayslips')}
        back={{ href: `/${locale}/payroll`, label: t('backToPayroll') }}
      />

      {/* YTD summary */}
      {ytd && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('ytdSummary')} · {ytd.year}
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-text-secondary">{t('ytdGross')}</p>
              <p className="mt-0.5 text-lg font-semibold text-text-primary">
                {formatCurrency(ytd.gross_total)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">{t('ytdDeductions')}</p>
              <p className="mt-0.5 text-lg font-semibold text-danger-600">
                {formatCurrency(ytd.total_deductions)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">{t('ytdNet')}</p>
              <p className="mt-0.5 text-lg font-semibold text-primary">
                {formatCurrency(ytd.net_total)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">{t('monthsPaid')}</p>
              <p className="mt-0.5 text-lg font-semibold text-text-primary">
                {ytd.by_month.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* By-month chart */}
      {byMonthChart && byMonthChart.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('byMonthChart')}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonthChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--color-text-tertiary)" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--color-text-tertiary)"
                tickFormatter={(v: number) => formatCurrency(v)}
              />
              <Tooltip formatter={(v) => (typeof v === 'number' ? formatCurrency(v) : v)} />
              <Legend />
              <Bar
                dataKey="gross"
                name={t('grossPay')}
                fill="hsl(var(--color-primary) / 0.55)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="net"
                name={t('netPay')}
                fill="hsl(var(--color-success))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payslips list */}
      {hasNoStaffProfile ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center text-sm text-text-tertiary">
          {t('noStaffProfile')}
        </div>
      ) : payslips.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center text-sm text-text-tertiary">
          {t('noPayslipsYet')}
        </div>
      ) : (
        <div className="space-y-3">
          {payslips.map((ps) => (
            <div
              key={ps.id}
              className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {ps.payroll_entry.payroll_run.period_label}
                </p>
                {ps.payslip_number && (
                  <p className="mt-0.5 text-xs text-text-tertiary" dir="ltr">
                    {ps.payslip_number}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-text-secondary">
                  {new Date(ps.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-text-secondary">{t('basicPay')}</span>
                  <p className="font-medium text-text-primary">
                    {formatCurrency(ps.payroll_entry.basic_pay)}
                  </p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('bonusPay')}</span>
                  <p className="font-medium text-text-primary">
                    {formatCurrency(ps.payroll_entry.bonus_pay)}
                  </p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('grandTotal')}</span>
                  <p className="font-semibold text-primary">
                    {formatCurrency(ps.payroll_entry.total_pay)}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={downloadingId === ps.id}
                onClick={() => handleDownload(ps.id)}
                className="shrink-0"
              >
                <Download className="me-1.5 h-4 w-4" />
                {downloadingId === ps.id ? t('downloading') : t('downloadPdf')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
