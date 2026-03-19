'use client';

import { ClipboardList, Plus, Search } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  StatusBadge,
  EmptyState,
} from '@school/ui';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdmissionForm {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  version: number;
  field_count: number;
  created_at: string;
}

const formStatusVariant: Record<AdmissionForm['status'], 'success' | 'warning' | 'neutral'> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdmissionFormsPage() {
  const t = useTranslations('admissions');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [forms, setForms] = React.useState<AdmissionForm[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const fetchForms = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiClient<{ data: AdmissionForm[]; meta: { total: number } }>(
        `/api/v1/admission-forms?${params.toString()}`,
      );
      setForms(res.data);
      setTotal(res.meta.total);
    } catch {
      setForms([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter]);

  React.useEffect(() => {
    void fetchForms();
  }, [fetchForms]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns = [
    {
      key: 'name',
      header: t('formName'),
      render: (row: AdmissionForm) => (
        <span className="font-medium text-text-primary">{row.name}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: AdmissionForm) => (
        <StatusBadge status={formStatusVariant[row.status]} dot>
          {t(row.status)}
        </StatusBadge>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (row: AdmissionForm) => (
        <span className="text-sm text-text-secondary">v{row.version}</span>
      ),
    },
    {
      key: 'field_count',
      header: 'Fields',
      render: (row: AdmissionForm) => (
        <span className="text-sm text-text-secondary">{row.field_count}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: AdmissionForm) => (
        <span className="text-sm text-text-secondary">
          {new Date(row.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  // ─── Status filter tabs ──────────────────────────────────────────────

  const statusTabs = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: t('draft') },
    { key: 'published', label: t('published') },
    { key: 'archived', label: t('archived') },
  ];

  const toolbar = (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border">
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
          placeholder="Search forms..."
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
        title={t('forms')}
        description="Manage admission forms and their fields"
        actions={
          <Button onClick={() => router.push(`/${locale}/admissions/forms/new`)}>
            <Plus className="me-2 h-4 w-4" />
            {t('createForm')}
          </Button>
        }
      />

      {!isLoading && forms.length === 0 && !search && statusFilter === 'all' ? (
        <EmptyState
          icon={ClipboardList}
          title={t('noFormsYet')}
          description=""
          action={{
            label: t('createForm'),
            onClick: () => router.push(`/${locale}/admissions/forms/new`),
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={forms}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/admissions/forms/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
