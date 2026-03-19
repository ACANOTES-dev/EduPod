'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { Button } from '@school/ui';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface PaymentEntry {
  id: string;
  payroll_run_id: string;
  period_label: string;
  period_month: number;
  period_year: number;
  basic_pay: number;
  bonus_pay: number;
  total_pay: number;
}

export default function StaffPaymentHistoryPage() {
  const t = useTranslations('payroll');
  const params = useParams();
  const staffProfileId = params?.staffProfileId as string;

  const [data, setData] = React.useState<PaymentEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [staffName, setStaffName] = React.useState('');

  const pageSize = 20;

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const res = await apiClient<{
        data: PaymentEntry[];
        meta: { total: number; staff_name: string };
      }>(`/api/v1/payroll/staff/${staffProfileId}/history?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
      setStaffName(res.meta.staff_name);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [page, staffProfileId]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handlePrintPayslip = (runId: string) => {
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/payroll/runs/${runId}/entries/staff/${staffProfileId}/payslip`,
      '_blank'
    );
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
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            handlePrintPayslip(row.payroll_run_id);
          }}
        >
          {t('printPayslip')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={staffName ? `${t('paymentHistory')} — ${staffName}` : t('paymentHistory')}
      />

      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />
    </div>
  );
}
