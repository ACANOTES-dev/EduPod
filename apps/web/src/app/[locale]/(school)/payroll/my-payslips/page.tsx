'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { downloadAuthenticatedPdf } from '@/lib/download-pdf';

interface MyPayslip {
  id: string;
  payroll_run_id: string;
  period_label: string;
  period_month: number;
  period_year: number;
  basic_pay: number;
  bonus_pay: number;
  allowances_total: number;
  deductions_total: number;
  adjustments_total: number;
  total_pay: number;
  created_at: string;
}

interface YtdSummary {
  ytd_basic: number;
  ytd_bonus: number;
  ytd_allowances: number;
  ytd_deductions: number;
  ytd_total: number;
  months_paid: number;
}

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function MyPayslipsPage() {
  const t = useTranslations('payroll');

  const [payslips, setPayslips] = React.useState<MyPayslip[]>([]);
  const [ytd, setYtd] = React.useState<YtdSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [payslipsRes, ytdRes] = await Promise.all([
          apiClient<{ data: MyPayslip[] }>('/api/v1/payroll/my-payslips'),
          apiClient<{ data: YtdSummary }>('/api/v1/payroll/my-payslips/ytd'),
        ]);
        setPayslips(payslipsRes.data);
        setYtd(ytdRes.data);
      } catch (err) {
        console.error('[fetchData]', err);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchData();
  }, []);

  const handleDownload = async (payslipId: string, runId: string) => {
    setDownloadingId(payslipId);
    try {
      await downloadAuthenticatedPdf(`/api/v1/payroll/runs/${runId}/payslips/${payslipId}`);
    } catch (err) {
      console.error('[handleDownload]', err);
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
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

  return (
    <div className="space-y-6">
      <PageHeader title={t('myPayslips')} />

      {/* YTD Summary card */}
      {ytd && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('ytdSummary')} &middot; {ytd.months_paid} {t('monthsPaid')}
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: t('ytdBasic'), value: formatCurrency(ytd.ytd_basic) },
              { label: t('ytdBonus'), value: formatCurrency(ytd.ytd_bonus) },
              { label: t('allowancesTotal'), value: formatCurrency(ytd.ytd_allowances) },
              { label: t('deductionsTotal'), value: formatCurrency(ytd.ytd_deductions) },
              { label: t('ytdTotal'), value: formatCurrency(ytd.ytd_total), highlight: true },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs text-text-secondary">{item.label}</p>
                <p
                  className={`mt-0.5 text-lg font-semibold ${
                    item.highlight ? 'text-primary' : 'text-text-primary'
                  }`}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payslips list */}
      {payslips.length === 0 ? (
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
                <p className="text-sm font-semibold text-text-primary">{ps.period_label}</p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {new Date(ps.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Breakdown row */}
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-text-secondary">{t('basicPay')}</span>
                  <p className="font-medium text-text-primary">{formatCurrency(ps.basic_pay)}</p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('bonusPay')}</span>
                  <p className="font-medium text-text-primary">{formatCurrency(ps.bonus_pay)}</p>
                </div>
                {ps.allowances_total > 0 && (
                  <div>
                    <span className="text-text-secondary">{t('allowancesTotal')}</span>
                    <p className="font-medium text-success-600">
                      +{formatCurrency(ps.allowances_total)}
                    </p>
                  </div>
                )}
                {ps.deductions_total > 0 && (
                  <div>
                    <span className="text-text-secondary">{t('deductionsTotal')}</span>
                    <p className="font-medium text-danger-600">
                      -{formatCurrency(ps.deductions_total)}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-text-secondary">{t('grandTotal')}</span>
                  <p className="font-semibold text-primary">{formatCurrency(ps.total_pay)}</p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={downloadingId === ps.id}
                onClick={() => handleDownload(ps.id, ps.payroll_run_id)}
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
