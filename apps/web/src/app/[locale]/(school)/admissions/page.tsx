'use client';

import { ClipboardList, Search } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, StatCard, EmptyState } from '@school/ui';

import { ApplicationStatusBadge } from '@/components/admissions/application-status-badge';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Application {
  id: string;
  application_number: string;
  student_name?: string;
  student_first_name?: string;
  student_last_name?: string;
  form_name?: string;
  form_definition?: { id: string; name: string };
  status: string;
  submitted_at: string | null;
}

interface AnalyticsResponse {
  funnel: {
    draft: number;
    submitted: number;
    under_review: number;
    pending_acceptance_approval: number;
    accepted: number;
    rejected: number;
    withdrawn: number;
  };
  total: number;
  conversion_rate: number;
  avg_days_to_decision: number | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdmissionsPage() {
  const t = useTranslations('admissions');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [applications, setApplications] = React.useState<Application[]>([]);
  const [analytics, setAnalytics] = React.useState<AnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const fetchApplications = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiClient<{ data: Application[]; meta: { total: number } }>(
        `/api/v1/applications?${params.toString()}`,
      );
      setApplications(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[fetchApplications]', err);
      setApplications([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter]);

  const fetchAnalytics = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: AnalyticsResponse }>('/api/v1/applications/analytics');
      setAnalytics(res.data);
    } catch (err) {
      console.error('[fetchAnalytics]', err);
    }
  }, []);

  React.useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  React.useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns = [
    {
      key: 'application_number',
      header: t('applicationNumber'),
      render: (row: Application) => (
        <span className="font-mono text-xs text-text-secondary">{row.application_number}</span>
      ),
    },
    {
      key: 'student_name',
      header: t('studentName'),
      render: (row: Application) => (
        <span className="font-medium text-text-primary">
          {row.student_name ??
            (`${row.student_first_name ?? ''} ${row.student_last_name ?? ''}`.trim() || '—')}
        </span>
      ),
    },
    {
      key: 'form_name',
      header: t('forms'),
      render: (row: Application) => (
        <span className="text-sm text-text-secondary">
          {row.form_name ?? row.form_definition?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: Application) => <ApplicationStatusBadge status={row.status} />,
    },
    {
      key: 'submitted_at',
      header: t('submittedAt'),
      render: (row: Application) => (
        <span className="text-sm text-text-secondary">
          {row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ];

  const statusTabs = [
    { key: 'all', label: 'All' },
    { key: 'submitted', label: t('submitted') },
    { key: 'under_review', label: t('underReview') },
    { key: 'accepted', label: t('accepted') },
    { key: 'rejected', label: t('rejected') },
    { key: 'withdrawn', label: t('withdrawn') },
  ];

  const toolbar = (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? 'border-b-2 border-primary-700 text-primary-700'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder="Search applications..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description="Manage applications and track the admissions pipeline"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/${locale}/admissions/analytics`)}
            >
              {t('analytics')}
            </Button>
            <Button variant="outline" onClick={() => router.push(`/${locale}/admissions/forms`)}>
              {t('forms')}
            </Button>
          </div>
        }
      />

      {/* Funnel summary */}
      {analytics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label={t('totalApplications')} value={analytics.total ?? 0} />
          <StatCard label={t('submitted')} value={analytics.funnel.submitted ?? 0} />
          <StatCard label={t('underReview')} value={analytics.funnel.under_review ?? 0} />
          <StatCard label={t('accepted')} value={analytics.funnel.accepted ?? 0} />
          <StatCard label={t('rejected')} value={analytics.funnel.rejected ?? 0} />
        </div>
      )}

      {!isLoading && applications.length === 0 && !search && statusFilter === 'all' ? (
        <EmptyState icon={ClipboardList} title={t('noApplicationsYet')} description="" />
      ) : (
        <DataTable
          columns={columns}
          data={applications}
          toolbar={toolbar}
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
