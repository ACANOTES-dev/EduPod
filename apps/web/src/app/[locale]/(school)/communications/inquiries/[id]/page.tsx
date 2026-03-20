'use client';

import { ArrowLeft, Send, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
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
  sender_name: string;
  created_at: string;
}

interface InquiryDetail {
  id: string;
  subject: string;
  parent_name: string;
  student_name: string | null;
  status: InquiryStatus;
  messages: Message[];
  created_at: string;
}

const STATUS_VARIANT: Record<InquiryStatus, 'success' | 'warning' | 'neutral'> = {
  open: 'success',
  in_progress: 'warning',
  closed: 'neutral',
};

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isAdmin = message.sender_type === 'admin';
  return (
    <div className={`flex flex-col gap-1 ${isAdmin ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm ${
        isAdmin
          ? 'rounded-se-sm bg-primary-600 text-white'
          : 'rounded-ss-sm bg-surface-secondary text-text-primary'
      }`}>
        {message.body}
      </div>
      <div className="flex items-center gap-1.5 px-1 text-xs text-text-tertiary">
        <span>{message.sender_name || 'Unknown'}</span>
        <span>&middot;</span>
        <span>{new Date(message.created_at).toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InquiryAdminDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('communications');
  const tc = useTranslations('common');
  const router = useRouter();

  const [inquiry, setInquiry] = React.useState<InquiryDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reply, setReply] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const fetchInquiry = React.useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient<{ data: InquiryDetail }>(`/api/v1/inquiries/${id}`);
      setInquiry(res.data);
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

  const handleClose = async () => {
    setIsClosing(true);
    try {
      await apiClient(`/api/v1/inquiries/${id}/close`, { method: 'POST' });
      toast.success(t('inquiry.closeSuccess'));
      void fetchInquiry();
    } catch {
      toast.error(t('inquiry.closeError'));
    } finally {
      setIsClosing(false);
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
        description={[inquiry.parent_name, inquiry.student_name].filter(Boolean).join(' · ')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
            </Button>
            {!isClosed && (
              <Button variant="outline" onClick={handleClose} disabled={isClosing}>
                <X className="me-2 h-4 w-4" />
                {t('inquiry.closeInquiry')}
              </Button>
            )}
          </div>
        }
      />

      {/* Status */}
      <div className="flex items-center gap-3">
        <StatusBadge status={STATUS_VARIANT[inquiry.status]} dot>
          {inquiry.status === 'in_progress' ? 'In Progress' : inquiry.status.charAt(0).toUpperCase() + inquiry.status.slice(1)}
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
            inquiry.messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
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
