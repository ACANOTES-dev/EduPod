'use client';

import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { downloadAuthenticatedPdf } from '@/lib/download-pdf';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface PaymentEntry {
  payroll_entry_id: string;
  period_label: string;
  period_month: number;
  period_year: number;
  basic_pay: number;
  bonus_pay: number;
  total_pay: number;
  payslip_id: string | null;
}

interface StaffProfileLite {
  id: string;
  user: { first_name: string; last_name: string };
}

export default function StaffPaymentHistoryPage() {
  const t = useTranslations('payroll');
  const params = useParams();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const staffProfileId = params?.staffProfileId as string;

  const [data, setData] = React.useState<PaymentEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [staffName, setStaffName] = React.useState('');

  const pageSize = 20;

  // Fetch the staff profile once (for the page title). Wave 3 did not add
  // `staff_name` to the staff-history meta envelope, so we resolve the name
  // separately from the staff-profiles endpoint.
  React.useEffect(() => {
    if (!staffProfileId) return;
    void apiClient<{ data: StaffProfileLite }>(`/api/v1/staff-profiles/${staffProfileId}`, {
      silent: true,
    })
      .then((res) => {
        const u = res.data.user;
        setStaffName(`${u.first_name} ${u.last_name}`.trim());
      })
      .catch((err) => {
        // Title is non-essential — log only.
        // eslint-disable-next-line no-console -- background fetch fallback per CLAUDE.md
        console.error('[staff-history.profile-fetch]', err);
      });
  }, [staffProfileId]);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      // Wave 3 alias: `/payroll/reports/staff-history/:staffProfileId`
      // (the canonical endpoint is `/payroll/reports/staff/:id/history` —
      // both are wired in PayrollEnhancedController). The flat
      // `/payroll/staff/:id/history` was attempted in Wave 4 but never
      // shipped on the backend.
      const res = await apiClient<{
        data: PaymentEntry[];
        meta: { total: number };
      }>(`/api/v1/payroll/reports/staff-history/${staffProfileId}?${params.toString()}`, {
        silent: true,
      });
      setData(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('historyLoadFailed');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, staffProfileId, t]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDownloadPayslip = async (payslipId: string | null) => {
    if (!payslipId) {
      toast.error(t('noPayslipForEntry'));
      return;
    }
    try {
      await downloadAuthenticatedPdf(`/api/v1/payroll/payslips/${payslipId}/pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('payslipDownloadFailed');
      toast.error(message);
    }
  };

  const columns = [
    {
      key: 'month',
      header: t('month'),
      render: (row: PaymentEntry) => (
        <span className="font-medium text-text-primary">
          {row.period_month}/{row.period_year}
        </span>
      ),
    },
    {
      key: 'period_label',
      header: t('periodLabel'),
      render: (row: PaymentEntry) => row.period_label,
    },
    {
      key: 'basic_pay',
      header: t('basicPay'),
      render: (row: PaymentEntry) => formatCurrency(row.basic_pay),
      className: 'text-end',
    },
    {
      key: 'bonus_pay',
      header: t('bonusPay'),
      render: (row: PaymentEntry) => formatCurrency(row.bonus_pay),
      className: 'text-end',
    },
    {
      key: 'total_pay',
      header: t('totalPay'),
      render: (row: PaymentEntry) => (
        <span className="font-semibold">{formatCurrency(row.total_pay)}</span>
      ),
      className: 'text-end',
    },
    {
      key: 'payslip',
      header: t('payslip'),
      render: (row: PaymentEntry) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={!row.payslip_id}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            void handleDownloadPayslip(row.payslip_id);
          }}
        >
          {t('downloadPdf')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={staffName ? `${t('paymentHistory')} — ${staffName}` : t('paymentHistory')}
        back={{ href: `/${locale}/payroll`, label: t('backToPayroll') }}
      />

      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.payroll_entry_id}
        isLoading={isLoading}
      />
    </div>
  );
}
