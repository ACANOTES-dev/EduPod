'use client';

import { Download, FileClock, Flag, Lock, Unlock } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { FreezeDialog } from '../../_components/freeze-dialog';
import { OversightBanner } from '../../_components/oversight-banner';
import type { OversightThreadDetail } from '../../_components/oversight-types';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function OversightThreadViewPage() {
  const t = useTranslations('inbox.oversight');
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawId = params?.id;
  const conversationId = typeof rawId === 'string' ? rawId : '';
  const focusFlagId = searchParams?.get('flag') ?? null;

  const [thread, setThread] = React.useState<OversightThreadDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [freezeOpen, setFreezeOpen] = React.useState(false);
  const [unfreezeBusy, setUnfreezeBusy] = React.useState(false);
  const [exportBusy, setExportBusy] = React.useState(false);
  const [expandedEdits, setExpandedEdits] = React.useState<Set<string>>(new Set());

  // Always refetch fresh — the impl spec warns about stale frozen state.
  const fetchThread = React.useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const data = await apiClient<OversightThreadDetail>(
        `/api/v1/inbox/oversight/conversations/${conversationId}`,
      );
      setThread(data);
    } catch (err) {
      console.error('[OversightThreadView.fetch]', err);
      setThread(null);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  React.useEffect(() => {
    void fetchThread();
  }, [fetchThread]);

  const handleUnfreeze = React.useCallback(async () => {
    if (!conversationId) return;
    setUnfreezeBusy(true);
    try {
      await apiClient(`/api/v1/inbox/oversight/conversations/${conversationId}/unfreeze`, {
        method: 'POST',
      });
      toast.success(t('unfreeze.success'));
      void fetchThread();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('unfreeze.error');
      toast.error(message);
    } finally {
      setUnfreezeBusy(false);
    }
  }, [conversationId, fetchThread, t]);

  const handleExport = React.useCallback(async () => {
    if (!conversationId) return;
    setExportBusy(true);
    try {
      const res = await apiClient<{ export_url: string }>(
        `/api/v1/inbox/oversight/conversations/${conversationId}/export`,
        { method: 'POST' },
      );
      toast.success(t('export.success'), {
        action: {
          label: t('export.download'),
          onClick: () => {
            window.open(res.export_url, '_blank', 'noopener,noreferrer');
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('export.error');
      toast.error(message);
    } finally {
      setExportBusy(false);
    }
  }, [conversationId, t]);

  const toggleEdits = (messageId: string) => {
    setExpandedEdits((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <OversightBanner />
        <div className="rounded-lg border border-border p-6 text-sm text-text-secondary">
          {t('loading')}
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="space-y-6">
        <OversightBanner />
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          {t('threadNotFound')}
        </div>
      </div>
    );
  }

  const isFrozen = thread.frozen_at !== null;

  return (
    <div className="space-y-6">
      <OversightBanner />

      <PageHeader
        title={thread.subject ?? t('columns.untitledSubject')}
        description={t(`kinds.${thread.kind}`)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/inbox/oversight')}>
              {t('actions.backToDashboard')}
            </Button>
            {isFrozen ? (
              <Button
                variant="outline"
                size="sm"
                disabled={unfreezeBusy}
                onClick={() => {
                  void handleUnfreeze();
                }}
              >
                <Unlock className="me-1 h-4 w-4" />
                {t('actions.unfreeze')}
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setFreezeOpen(true)}>
                <Lock className="me-1 h-4 w-4" />
                {t('actions.freeze')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={exportBusy}
              onClick={() => {
                void handleExport();
              }}
            >
              <Download className="me-1 h-4 w-4" />
              {t('actions.export')}
            </Button>
          </div>
        }
      />

      {isFrozen ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            <span className="font-medium">{t('frozen.banner')}</span>
          </div>
          {thread.freeze_reason ? (
            <p className="mt-1 text-xs opacity-80">
              {t('frozen.reason')}: {thread.freeze_reason}
            </p>
          ) : null}
          <p className="mt-1 text-xs opacity-80">
            {t('frozen.since', { when: formatDate(thread.frozen_at) })}
          </p>
        </div>
      ) : null}

      {focusFlagId ? (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
          <Flag className="me-2 inline h-3 w-3" />
          {t('flag.focusContext', { flagId: focusFlagId.slice(0, 8) })}
        </div>
      ) : null}

      {/* ─── Participants ─────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-primary">
          {t('sections.participants')} ({thread.participants.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {thread.participants.map((p) => (
            <Badge key={p.id} variant="secondary">
              {p.display_name}
              <span className="ms-1 opacity-60">· {p.role_at_join}</span>
            </Badge>
          ))}
        </div>
      </section>

      {/* ─── Messages ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">
          {t('sections.messages')} ({thread.messages.length})
        </h2>
        {thread.messages.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('emptyThread')}</p>
        ) : (
          thread.messages.map((m) => {
            const isDeleted = m.deleted_at !== null;
            const isExpanded = expandedEdits.has(m.id);
            return (
              <article
                key={m.id}
                className={`rounded-lg border p-4 ${
                  isDeleted
                    ? 'border-border bg-surface-muted opacity-60'
                    : 'border-border bg-surface'
                }`}
              >
                <header className="mb-2 flex items-center justify-between text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">{m.sender_display_name}</span>
                  <span>{formatDate(m.created_at)}</span>
                </header>
                <div
                  className={`whitespace-pre-wrap text-sm ${
                    isDeleted ? 'line-through text-text-secondary' : 'text-text-primary'
                  }`}
                >
                  {m.body}
                </div>
                {m.edits.length > 0 ? (
                  <div className="mt-2">
                    <button
                      onClick={() => toggleEdits(m.id)}
                      className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
                    >
                      <FileClock className="h-3 w-3" />
                      {isExpanded
                        ? t('messages.hideHistory', { count: m.edits.length })
                        : t('messages.showHistory', { count: m.edits.length })}
                    </button>
                    {isExpanded ? (
                      <ol className="mt-2 space-y-2 border-s-2 border-border ps-3 text-xs text-text-secondary">
                        {m.edits.map((e) => (
                          <li key={e.id}>
                            <div className="opacity-70">{formatDate(e.edited_at)}</div>
                            <div className="whitespace-pre-wrap">{e.previous_body}</div>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <FreezeDialog
        open={freezeOpen}
        conversationId={conversationId}
        onOpenChange={setFreezeOpen}
        onFrozen={() => {
          setFreezeOpen(false);
          void fetchThread();
        }}
      />
    </div>
  );
}
