'use client';

import { ArrowLeft, Lock, Send } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  cn,
  Textarea,
  toast,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import { ThreadMessage } from './thread-message';
import type { ThreadDetail } from './types';
import { useInboxPollingRefresh } from './use-inbox-polling';

interface ThreadViewProps {
  conversationId: string;
}

const POLL_MS = 30_000;

export function ThreadView({ conversationId }: ThreadViewProps) {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { user } = useAuth();
  const refreshPolling = useInboxPollingRefresh();

  const [detail, setDetail] = React.useState<ThreadDetail | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [composerValue, setComposerValue] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomSentinelRef = React.useRef<HTMLDivElement>(null);
  const wasAtBottomRef = React.useRef(true);
  const lastSeenMessageIdRef = React.useRef<string | null>(null);
  const cancelledRef = React.useRef(false);

  const fetchThread = React.useCallback(async (): Promise<void> => {
    if (cancelledRef.current) return;
    try {
      const res = await apiClient<{ data: ThreadDetail } | ThreadDetail>(
        `/api/v1/inbox/conversations/${conversationId}`,
        { silent: true },
      );
      if (cancelledRef.current) return;
      const next = unwrap<ThreadDetail>(res);
      setDetail(next);
      setLoadError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      console.error('[thread-view]', err);
      setLoadError(t('inbox.errors.load_thread'));
    }
  }, [conversationId, t]);

  React.useEffect(() => {
    cancelledRef.current = false;
    setDetail(null);
    lastSeenMessageIdRef.current = null;
    wasAtBottomRef.current = true;
    void fetchThread();
    const interval = setInterval(() => {
      void fetchThread();
    }, POLL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [fetchThread]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const threshold = 80;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      wasAtBottomRef.current = distance < threshold;
    };
    el.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => el.removeEventListener('scroll', handler);
  }, []);

  const messagesAsc = React.useMemo(() => {
    if (!detail) return [];
    return [...detail.messages.data].reverse();
  }, [detail]);

  React.useEffect(() => {
    if (messagesAsc.length === 0) return;
    const latest = messagesAsc[messagesAsc.length - 1];
    if (!latest) return;
    const isFirstLoad = lastSeenMessageIdRef.current === null;
    const isNewMessage = lastSeenMessageIdRef.current !== latest.id;
    if (isFirstLoad || (isNewMessage && wasAtBottomRef.current)) {
      bottomSentinelRef.current?.scrollIntoView({ block: 'end' });
    }
    lastSeenMessageIdRef.current = latest.id;
  }, [messagesAsc]);

  // Opening the thread (first successful load) implicitly marks it read
  // on the server via `GET /conversations/:id`. Refresh polling so the
  // morph bar unread badge updates immediately.
  React.useEffect(() => {
    if (detail) refreshPolling();
  }, [detail, refreshPolling]);

  const isFrozen = detail?.frozen_at != null;
  const allowReplies = detail?.kind !== 'broadcast' || detail?.allow_replies === true;
  const canReply = !!detail && !isFrozen && allowReplies;

  const disabledReason = React.useMemo(() => {
    if (!detail) return null;
    if (isFrozen) return t('inbox.thread.composer.disabled.frozen');
    if (!allowReplies) return t('inbox.thread.composer.disabled.no_reply');
    return null;
  }, [detail, isFrozen, allowReplies, t]);

  const handleSend = async () => {
    const body = composerValue.trim();
    if (!body || !detail || sending || !canReply) return;
    setSending(true);
    try {
      await apiClient(`/api/v1/inbox/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, attachments: [], extra_channels: [] }),
      });
      setComposerValue('');
      wasAtBottomRef.current = true;
      await fetchThread();
      refreshPolling();
    } catch (err) {
      console.error('[thread-view:send]', err);
      toast.error(t('inbox.thread.composer.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (loadError && !detail) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">{loadError}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('inbox.loading')}</p>
      </div>
    );
  }

  const subject =
    detail.subject && detail.subject.trim().length > 0
      ? detail.subject
      : detail.kind === 'direct'
        ? t('inbox.thread.direct_fallback_subject')
        : t('inbox.thread.untitled_subject');

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <button
          type="button"
          onClick={() => router.push(`/${locale}/inbox`)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-surface-hover)] md:hidden"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {subject}
          </h2>
          <p className="truncate text-xs text-[var(--color-text-secondary)]">
            {t('inbox.thread.participants_count', { count: detail.participants.length })}
          </p>
        </div>
      </div>

      {isFrozen && (
        <div
          role="status"
          className="flex shrink-0 items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('inbox.thread.frozen.title')}</p>
            <p className="text-xs">{detail.freeze_reason ?? t('inbox.thread.frozen.banner')}</p>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--color-background)] px-4 py-4"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-1">
          {messagesAsc.map((m, idx) => {
            const previous = idx > 0 ? messagesAsc[idx - 1] : null;
            const showSenderMeta =
              detail.kind !== 'direct' && (previous?.sender_user_id ?? null) !== m.sender_user_id;
            return (
              <ThreadMessage
                key={m.id}
                message={m}
                isOwn={m.sender_user_id === user?.id}
                showSenderMeta={showSenderMeta}
                senderLabel={t('inbox.thread.sender_fallback')}
              />
            );
          })}
          <div ref={bottomSentinelRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        {disabledReason ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex items-center justify-center rounded-md border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-xs text-[var(--color-text-secondary)]',
                  )}
                >
                  {disabledReason}
                </div>
              </TooltipTrigger>
              <TooltipContent>{disabledReason}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={t('inbox.thread.composer.placeholder')}
              rows={2}
              className="min-h-[44px] flex-1 resize-none text-base md:text-sm"
              disabled={!canReply || sending}
              aria-label={t('inbox.thread.composer.placeholder')}
            />
            <Button
              type="button"
              size="icon"
              onClick={() => void handleSend()}
              disabled={!canReply || sending || composerValue.trim().length === 0}
              aria-label={t('inbox.thread.composer.send')}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
