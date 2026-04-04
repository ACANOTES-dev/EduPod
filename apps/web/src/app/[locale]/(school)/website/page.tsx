'use client';

import { Globe, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, EmptyState } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebsitePage {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  status: string;
  show_in_nav: boolean;
  published_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PageTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    home: 'Home',
    about: 'About',
    admissions: 'Admissions',
    contact: 'Contact',
    custom: 'Custom',
  };
  return (
    <Badge variant="secondary" className="text-xs capitalize">
      {labels[type] ?? type}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary'> = {
    published: 'default',
    draft: 'secondary',
    archived: 'secondary',
  };
  return (
    <Badge variant={variants[status] ?? 'secondary'} className="text-xs capitalize">
      {status}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WebsitePagesPage() {
  const t = useTranslations('website');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [pages, setPages] = React.useState<WebsitePage[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const pageSize = 20;

  const fetchPages = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiClient<{ data: WebsitePage[]; meta: { total: number } }>(
        `/api/v1/website/pages?${params.toString()}`,
      );
      setPages(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[WebsitePage]', err);
      setPages([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  React.useEffect(() => {
    void fetchPages();
  }, [fetchPages]);

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const statusTabs = [
    { key: 'all', label: 'All' },
    { key: 'published', label: 'Published' },
    { key: 'draft', label: 'Draft' },
    { key: 'archived', label: 'Archived' },
  ];

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (row: WebsitePage) => (
        <span className="font-medium text-text-primary">{row.title}</span>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (row: WebsitePage) => (
        <span className="font-mono text-xs text-text-secondary">/{row.slug}</span>
      ),
    },
    {
      key: 'page_type',
      header: 'Type',
      render: (row: WebsitePage) => <PageTypeBadge type={row.page_type} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: WebsitePage) => <StatusBadge status={row.status} />,
    },
    {
      key: 'show_in_nav',
      header: 'In Nav',
      render: (row: WebsitePage) => (
        <span className="text-sm text-text-secondary">{row.show_in_nav ? 'Yes' : 'No'}</span>
      ),
    },
    {
      key: 'published_at',
      header: 'Published',
      render: (row: WebsitePage) => (
        <span className="text-sm text-text-secondary">
          {row.published_at ? new Date(row.published_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ];

  const toolbar = (
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
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('websitePages')}
        description="Manage the public-facing pages of your school website"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/${locale}/website/contact-submissions`)}
            >{t('contactSubmissions')}</Button>
            <Button onClick={() => router.push(`/${locale}/website/new`)}>
              <Plus className="me-2 h-4 w-4" />{t('newPage')}</Button>
          </div>
        }
      />

      {!isLoading && pages.length === 0 && statusFilter === 'all' ? (
        <EmptyState
          icon={Globe}
          title={t('noPagesYet')}
          description="Create your first website page to get started."
        />
      ) : (
        <DataTable
          columns={columns}
          data={pages}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/website/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
