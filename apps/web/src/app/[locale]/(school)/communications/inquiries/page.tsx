'use client';

import { MessageCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState, StatusBadge } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type InquiryStatus = 'open' | 'in_progress' | 'closed';

interface Inquiry {
  id: string;
  subject: string;
  parent_name?: string;
  student_name?: string | null;
  parent?: { id: string; first_name: string; last_name: string } | null;
  student?: { id: string; first_name: string; last_name: string } | null;
  _count?: { messages: number };
  status: InquiryStatus;
  message_count?: number;
  last_message_at?: string | null;
  created_at: string;
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'closed', label: 'Closed' },
];

const STATUS_VARIANT: Record<InquiryStatus, 'success' | 'warning' | 'neutral'> = {
  open: 'success',
  in_progress: 'warning',
  closed: 'neutral',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommunicationsInquiriesPage() {
  const t = useTranslations('communications');
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();

  const statusParam = searchParams?.get('status') ?? 'all';
  const activeTab = STATUS_TABS.some((tab) => tab.key === statusParam) ? statusParam : 'all';

  const [inquiries, setInquiries] = React.useState<Inquiry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const setActiveTab = React.useCallback(
    (tabKey: string) => {
      const qp = new URLSearchParams(searchParams?.toString() ?? '');
      if (tabKey === 'all') {
        qp.delete('status');
      } else {
        qp.set('status', tabKey);
      }
      const next = qp.toString();
      router.replace(`/${locale}/communications/inquiries${next ? `?${next}` : ''}`);
    },
    [locale, router, searchParams],
  );

  const fetchInquiries = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (activeTab !== 'all') params.set('status', activeTab);
      const res = await apiClient<{ data: Inquiry[]; meta: { total: number } }>(
        `/api/v1/inquiries?${params.toString()}`,
      );
      setInquiries(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[CommunicationsInquiriesPage]', err);
      setInquiries([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, activeTab]);

  React.useEffect(() => {
    void fetchInquiries();
  }, [fetchInquiries]);

  React.useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const columns = [
    {
      key: 'subject',
      header: t('columns.subject'),
      render: (row: Inquiry) => (
        <span className="font-medium text-text-primary">{row.subject}</span>
      ),
    },
    {
      key: 'parent_name',
      header: t('columns.parent'),
      render: (row: Inquiry) => (
        <span className="text-text-secondary">
          {row.parent_name ??
            (row.parent ? `${row.parent.first_name} ${row.parent.last_name}` : '—')}
        </span>
      ),
    },
    {
      key: 'student_name',
      header: t('columns.student'),
      render: (row: Inquiry) => (
        <span className="text-text-secondary">
          {row.student_name ??
            (row.student ? `${row.student.first_name} ${row.student.last_name}` : '—')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: Inquiry) => (
        <StatusBadge status={STATUS_VARIANT[row.status]} dot>
          {row.status === 'in_progress'
            ? 'In Progress'
            : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </StatusBadge>
      ),
    },
    {
      key: 'message_count',
      header: t('columns.messages'),
      render: (row: Inquiry) => (
        <span className="text-sm text-text-secondary">
          {row.message_count ?? row._count?.messages ?? 0}
        </span>
      ),
    },
    {
      key: 'last_message_at',
      header: t('columns.lastMessage'),
      render: (row: Inquiry) => (
        <span className="text-sm text-text-secondary">
          {row.last_message_at ? new Date(row.last_message_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-border">
      {STATUS_TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === tab.key
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('inquiry.title')} description="Parent inquiries and support requests" />

      {toolbar}

      {!isLoading && inquiries.length === 0 && activeTab === 'all' ? (
        <EmptyState
          icon={MessageCircle}
          title={t('noInquiriesYet')}
          description="Parent inquiries will appear here."
        />
      ) : (
        <DataTable
          columns={columns}
          data={inquiries}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/communications/inquiries/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
