'use client';

import { ClipboardList } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState } from '@school/ui';

import { ApplicationStatusBadge } from '@/components/admissions/application-status-badge';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyApplication {
  id: string;
  application_number: string;
  student_name: string;
  form_name: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentApplicationsPage() {
  const t = useTranslations('admissions');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [applications, setApplications] = React.useState<MyApplication[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const fetchApplications = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await apiClient<{ data: MyApplication[]; meta: { total: number } }>(
        `/api/v1/parent/applications?${params.toString()}`,
      );
      setApplications(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[ApplicationsPage]', err);
      setApplications([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  React.useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  const columns = [
    {
      key: 'application_number',
      header: t('applicationNumber'),
      render: (row: MyApplication) => (
        <span className="font-mono text-xs text-text-secondary">{row.application_number}</span>
      ),
    },
    {
      key: 'student_name',
      header: t('studentName'),
      render: (row: MyApplication) => (
        <span className="font-medium text-text-primary">{row.student_name}</span>
      ),
    },
    {
      key: 'form_name',
      header: t('forms'),
      render: (row: MyApplication) => (
        <span className="text-sm text-text-secondary">{row.form_name}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: MyApplication) => <ApplicationStatusBadge status={row.status} />,
    },
    {
      key: 'submitted_at',
      header: t('submittedAt'),
      render: (row: MyApplication) => (
        <span className="text-sm text-text-secondary">
          {row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('applications')} description="Track the status of your applications" />

      {!isLoading && applications.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('noApplicationsYet')} description="" />
      ) : (
        <DataTable
          columns={columns}
          data={applications}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/admissions/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
