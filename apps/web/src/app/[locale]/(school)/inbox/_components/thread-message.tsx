'use client';

import { Download, Paperclip } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { cn, Popover, PopoverContent, PopoverTrigger } from '@school/ui';

import type { ThreadMessageView } from './types';

interface ThreadMessageProps {
  message: ThreadMessageView;
  isOwn: boolean;
  showSenderMeta: boolean;
  senderLabel: string;
}

/** Render message body: preserves line breaks, detects URLs, no raw HTML. */
function renderBody(body: string): React.ReactNode {
  const urlRe = /(https?:\/\/[^\s<]+)/g;
  const lines = body.split('\n');
  return lines.map((line, lineIdx) => {
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    urlRe.lastIndex = 0;
    while ((m = urlRe.exec(line)) !== null) {
      if (m.index > lastIdx) parts.push(line.slice(lastIdx, m.index));
      parts.push(
        <a
          key={`${lineIdx}-${m.index}`}
          href={m[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all"
        >
          {m[0]}
        </a>,
      );
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < line.length) parts.push(line.slice(lastIdx));
    return (
      <React.Fragment key={lineIdx}>
        {parts.length > 0 ? parts : line}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ThreadMessage({ message, isOwn, showSenderMeta, senderLabel }: ThreadMessageProps) {
  const t = useTranslations();
  const locale = useLocale();
  const isDeleted = message.deleted_at !== null;

  if (isDeleted && message.body === '[message deleted]') {
    return (
      <div className="flex w-full justify-center py-1">
        <span className="text-xs italic text-[var(--color-text-tertiary)]">
          {t('inbox.message.deleted')}
        </span>
      </div>
    );
  }

  const timestamp = new Date(message.created_at).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('flex w-full min-w-0 gap-2 py-1', isOwn ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-[85%] min-w-0 flex-col', isOwn ? 'items-end' : 'items-start')}>
        {showSenderMeta && !isOwn && (
          <span className="mb-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
            {senderLabel}
          </span>
        )}
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm break-words',
            isOwn
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]',
          )}
        >
          <div className="whitespace-pre-wrap">{renderBody(message.body)}</div>
          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {message.attachments.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1 text-xs',
                    isOwn ? 'bg-white/10' : 'bg-[var(--color-surface)]',
                  )}
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                  <span className="shrink-0 opacity-70">{formatBytes(a.size_bytes)}</span>
                  <Download className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                </div>
              ))}
            </div>
          )}
        </div>
        <div
          className={cn(
            'mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]',
            isOwn && 'flex-row-reverse',
          )}
        >
          <span>{timestamp}</span>
          {message.edited_at && <span>{t('inbox.message.edited')}</span>}
          {isOwn && message.read_state && (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="cursor-pointer underline-offset-2 hover:underline">
                  {t('inbox.thread.read_by', {
                    read: message.read_state.read_count,
                    total: message.read_state.total_recipients,
                  })}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 text-xs" align="end">
                <p className="font-medium text-[var(--color-text-primary)]">
                  {t('inbox.thread.read_by_popover_title')}
                </p>
                <p className="mt-1 text-[var(--color-text-secondary)]">
                  {t('inbox.thread.read_by', {
                    read: message.read_state.read_count,
                    total: message.read_state.total_recipients,
                  })}
                </p>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}
