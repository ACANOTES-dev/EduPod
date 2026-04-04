'use client';

import { MessageCircle, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, StatusBadge } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type InquiryStatus = 'open' | 'in_progress' | 'closed';

interface MyInquiry {
  id: string;
  subject: string;
  status: InquiryStatus;
  message_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
}

const STATUS_VARIANT: Record<InquiryStatus, 'success' | 'warning' | 'neutral'> = {
  open: 'success',
  in_progress: 'warning',
  closed: 'neutral',
};

const STATUS_LABEL: Record<InquiryStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  closed: 'Closed',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentInquiriesPage() {
  const t = useTranslations('communications');
  const router = useRouter();

  const [inquiries, setInquiries] = React.useState<MyInquiry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchInquiries = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: MyInquiry[] }>('/api/v1/inquiries/my');
      setInquiries(res.data);
    } catch (err) {
      console.error('[InquiriesPage]', err);
      setInquiries([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchInquiries();
  }, [fetchInquiries]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('inquiry.title')}
        description="Your inquiries to the school"
        actions={
          <Button onClick={() => router.push('/inquiries/new')}>
            <Plus className="me-2 h-4 w-4" />
            {t('inquiry.newInquiry')}
          </Button>
        }
      />

      {inquiries.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title={t('noInquiriesYet')}
          description="Have a question? Send an inquiry to the school."
          action={{ label: t('inquiry.newInquiry'), onClick: () => router.push('/inquiries/new') }}
        />
      ) : (
        <div className="space-y-3">
          {inquiries.map((inquiry) => (
            <button
              key={inquiry.id}
              onClick={() => router.push(`/inquiries/${inquiry.id}`)}
              className="w-full rounded-xl border border-border bg-surface p-4 shadow-sm text-start hover:bg-surface-secondary transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-text-primary truncate">
                      {inquiry.subject}
                    </span>
                    <StatusBadge status={STATUS_VARIANT[inquiry.status]} dot>
                      {STATUS_LABEL[inquiry.status]}
                    </StatusBadge>
                  </div>
                  {inquiry.last_message_preview && (
                    <p className="mt-1 text-sm text-text-secondary truncate">
                      {inquiry.last_message_preview}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-text-tertiary">
                    {inquiry.last_message_at
                      ? new Date(inquiry.last_message_at).toLocaleDateString()
                      : new Date(inquiry.created_at).toLocaleDateString()}
                  </span>
                  {inquiry.message_count > 0 && (
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                      {inquiry.message_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
