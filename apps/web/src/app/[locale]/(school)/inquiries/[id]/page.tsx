'use client';

import { ArrowLeft, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, StatusBadge, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type InquiryStatus = 'open' | 'in_progress' | 'closed';

interface Message {
  id: string;
  body: string;
  sender_type: 'parent' | 'admin';
  created_at: string;
}

interface InquiryDetail {
  id: string;
  subject: string;
  status: InquiryStatus;
  messages: Message[];
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

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, adminLabel }: { message: Message; adminLabel: string }) {
  const isParent = message.sender_type === 'parent';
  return (
    <div className={`flex flex-col gap-1 ${isParent ? 'items-start' : 'items-end'}`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm ${
        isParent
          ? 'rounded-ss-sm bg-surface-secondary text-text-primary'
          : 'rounded-se-sm bg-primary-600 text-white'
      }`}>
        {message.body}
      </div>
      <div className="flex items-center gap-1.5 px-1 text-xs text-text-tertiary">
        <span>{isParent ? 'You' : adminLabel}</span>
        <span>&middot;</span>
        <span>{new Date(message.created_at).toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: { id: string };
}

export default function ParentInquiryDetailPage({ params }: PageProps) {
  const t = useTranslations('communications');
  const tc = useTranslations('common');
  const router = useRouter();
  const { id } = params;

  const [inquiry, setInquiry] = React.useState<InquiryDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reply, setReply] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const fetchInquiry = React.useCallback(async () => {
    try {
      const res = await apiClient<InquiryDetail>(`/api/v1/inquiries/${id}/parent`);
      setInquiry(res);
    } catch {
      toast.error('Failed to load inquiry');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchInquiry();
  }, [fetchInquiry]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [inquiry?.messages]);

  const handleSendReply = async () => {
    if (!reply.trim()) return;
    setIsSending(true);
    try {
      await apiClient(`/api/v1/inquiries/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply('');
      toast.success(t('inquiry.replySuccess'));
      void fetchInquiry();
    } catch {
      toast.error(t('inquiry.replyError'));
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void handleSendReply();
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-96 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{t('inquiry.notFound')}</p>
      </div>
    );
  }

  const isClosed = inquiry.status === 'closed';

  return (
    <div className="space-y-6">
      <PageHeader
        title={inquiry.subject}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
          </Button>
        }
      />

      {/* Status */}
      <div className="flex items-center gap-3">
        <StatusBadge status={STATUS_VARIANT[inquiry.status]} dot>
          {STATUS_LABEL[inquiry.status]}
        </StatusBadge>
        <span className="text-sm text-text-tertiary">
          Opened {new Date(inquiry.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Message thread */}
      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="min-h-[320px] max-h-[560px] overflow-y-auto p-6 space-y-4">
          {inquiry.messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">No messages yet.</p>
          ) : (
            inquiry.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} adminLabel={t('inquiry.schoolAdmin')} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply area */}
        <div className="border-t border-border p-4">
          {isClosed ? (
            <p className="text-sm text-text-tertiary text-center py-2">{t('inquiry.closedNotice')}</p>
          ) : (
            <div className="space-y-3">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('inquiry.replyPlaceholder')}
                rows={3}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSendReply}
                  disabled={isSending || !reply.trim()}
                >
                  <Send className="me-2 h-3.5 w-3.5" />
                  {t('inquiry.sendReply')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
