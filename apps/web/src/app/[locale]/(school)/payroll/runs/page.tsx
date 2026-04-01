'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

import { CreateRunDialog } from './_components/create-run-dialog';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const statusVariantMap: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  draft: 'warning',
  pending_approval: 'info',
  finalised: 'success',
  cancelled: 'neutral',
};

interface PayrollRun {
  id: string;
  period_label: string;
  period_month: number;
  period_year: number;
  status: string;
  headcount: number;
  total_pay: number;
  total_working_days: number;
  created_at: string;
}

export default function PayrollRunsPage() {
  const t = useTranslations('payroll');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<PayrollRun[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [yearFilter, setYearFilter] = React.useState<string>('all');
  const [createOpen, setCreateOpen] = React.useState(false);

  const pageSize = 20;
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (yearFilter !== 'all') params.set('year', yearFilter);
      const res = await apiClient<{
        data: PayrollRun[];
        meta: { total: number };
      }>(`/api/v1/payroll/runs?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      // silent
      console.error('[setTotal]', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, yearFilter]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreated = (runId: string) => {
    setCreateOpen(false);
    router.push(`/${locale}/payroll/runs/${runId}`);
  };

  const columns = [
    {
      key: 'period',
      header: t('period'),
      render: (row: PayrollRun) => (
        <span className="font-medium text-text-primary">{row.period_label}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: PayrollRun) => (
        <StatusBadge status={statusVariantMap[row.status] ?? 'neutral'}>
          {t(row.status as Parameters<typeof t>[0])}
        </StatusBadge>
      ),
    },
    {
      key: 'headcount',
      header: t('headcount'),
      render: (row: PayrollRun) => String(row.headcount),
    },
    {
      key: 'total_pay',
      header: t('totalPay'),
      render: (row: PayrollRun) => formatCurrency(row.total_pay),
    },
    {
      key: 'created',
      header: t('created'),
      render: (row: PayrollRun) => new Date(row.created_at).toLocaleDateString(locale),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('payrollRuns')}
        actions={<Button onClick={() => setCreateOpen(true)}>{t('newPayrollRun')}</Button>}
      />

      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onRowClick={(row) => router.push(`/${locale}/payroll/runs/${row.id}`)}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder={t('status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allStaff')}</SelectItem>
                <SelectItem value="draft">{t('draft')}</SelectItem>
                <SelectItem value="pending_approval">{t('pendingApproval')}</SelectItem>
                <SelectItem value="finalised">{t('finalised')}</SelectItem>
                <SelectItem value="cancelled">{t('cancelled')}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={yearFilter}
              onValueChange={(v) => {
                setYearFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder={t('periodYear')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('periodYear')}</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <CreateRunDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={handleCreated} />
    </div>
  );
}
