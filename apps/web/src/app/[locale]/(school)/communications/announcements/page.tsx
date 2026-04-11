'use client';

import { Megaphone, Plus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, StatusBadge } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { useIsAdmin } from '@/lib/use-is-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';

// Scope labels are now fetched from i18n: communications.scope.*

interface Announcement {
  id: string;
  title: string;
  scope: string;
  status: AnnouncementStatus;
  published_at: string | null;
  scheduled_at: string | null;
  author_name: string;
  created_at: string;
}

const STATUS_TAB_KEYS = ['all', 'draft', 'scheduled', 'published', 'archived'] as const;

const STATUS_VARIANT: Record<AnnouncementStatus, 'neutral' | 'info' | 'warning' | 'success'> = {
  draft: 'neutral',
  scheduled: 'warning',
  published: 'success',
  archived: 'neutral',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const t = useTranslations('communications');
  const router = useRouter();
  const locale = useLocale();
  const isAdmin = useIsAdmin();

  React.useEffect(() => {
    if (isAdmin === false) {
      router.replace(`/${locale}/inbox`);
    }
  }, [isAdmin, router, locale]);

  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [activeTab, setActiveTab] = React.useState('all');
  const pageSize = 20;

  const fetchAnnouncements = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (activeTab !== 'all') params.set('status', activeTab);
      const res = await apiClient<{ data: Announcement[]; meta: { total: number } }>(
        `/api/v1/announcements?${params.toString()}`,
      );
      setAnnouncements(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[CommunicationsPage]', err);
      setAnnouncements([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, activeTab]);

  React.useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  React.useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const columns = [
    {
      key: 'title',
      header: t('columns.title'),
      render: (row: Announcement) => (
        <span className="font-medium text-text-primary">{row.title}</span>
      ),
    },
    {
      key: 'scope',
      header: t('columns.scope'),
      render: (row: Announcement) => (
        <span className="text-text-secondary">{t(`scope.${row.scope}`)}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: Announcement) => (
        <StatusBadge status={STATUS_VARIANT[row.status]} dot>
          {t(`statusLabels.${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'published_at',
      header: t('columns.publishedAt'),
      render: (row: Announcement) => {
        const date = row.published_at ?? row.scheduled_at;
        return (
          <span className="text-sm text-text-secondary">
            {date ? new Date(date).toLocaleDateString() : '—'}
          </span>
        );
      },
    },
    {
      key: 'author_name',
      header: t('columns.author'),
      render: (row: Announcement) => <span className="text-text-secondary">{row.author_name}</span>,
    },
  ];

  const toolbar = (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-border">
      {STATUS_TAB_KEYS.map((tabKey) => (
        <button
          key={tabKey}
          onClick={() => setActiveTab(tabKey)}
          className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === tabKey
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          {t(`tabs.${tabKey}`)}
        </button>
      ))}
    </div>
  );

  if (isAdmin !== true) {
    return <div className="h-[50vh]" aria-hidden="true" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/inbox/audiences')}>
              <Users className="me-2 h-4 w-4" />
              {t('manageAudiences')}
            </Button>
            <Button onClick={() => router.push('/communications/new')}>
              <Plus className="me-2 h-4 w-4" />
              {t('newAnnouncement')}
            </Button>
          </div>
        }
      />

      {!isLoading && announcements.length === 0 && activeTab === 'all' ? (
        <EmptyState
          icon={Megaphone}
          title={t('announcements')}
          description={t('emptyDescription')}
          action={{
            label: t('newAnnouncement'),
            onClick: () => router.push('/communications/new'),
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={announcements}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/communications/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
