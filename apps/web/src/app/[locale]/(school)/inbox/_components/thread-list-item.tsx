'use client';

import { Lock, Megaphone, User, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@school/ui';

import type { InboxThreadSummary } from './types';

interface ThreadListItemProps {
  thread: InboxThreadSummary;
  selected: boolean;
  onClick: () => void;
}

/** Formats a message timestamp in the thread-list style:
 *  - today → HH:mm
 *  - this week → weekday short
 *  - older → d MMM
 */
function formatListTimestamp(iso: string | null, locale: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  const diffMs = now.getTime() - date.getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (diffMs >= 0 && diffMs < sevenDays) {
    return date.toLocaleDateString(locale, { weekday: 'short' });
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function KindIcon({ kind, muted }: { kind: InboxThreadSummary['kind']; muted?: boolean }) {
  const tone = muted ? 'text-[var(--color-text-tertiary)]' : 'text-current';
  if (kind === 'broadcast') {
    return <Megaphone className={`h-[18px] w-[18px] ${tone}`} aria-hidden="true" />;
  }
  if (kind === 'group') {
    return <Users className={`h-[18px] w-[18px] ${tone}`} aria-hidden="true" />;
  }
  return <User className={`h-[18px] w-[18px] ${tone}`} aria-hidden="true" />;
}

export function ThreadListItem({ thread, selected, onClick }: ThreadListItemProps) {
  const t = useTranslations();
  const locale = useLocale();
  const unread = thread.unread_count > 0;

  const displaySubject =
    thread.subject && thread.subject.trim().length > 0
      ? thread.subject
      : thread.kind === 'direct'
        ? t('inbox.thread.direct_fallback_subject')
        : t('inbox.thread.untitled_subject');

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full items-start gap-3 px-4 py-3 text-start transition-colors',
        'before:pointer-events-none before:absolute before:start-0 before:top-0 before:h-full before:w-[3px] before:bg-transparent',
        selected ? 'bg-primary-50 before:bg-primary-600' : 'hover:bg-[var(--color-surface-hover)]',
      )}
      aria-current={selected ? 'true' : undefined}
    >
      {unread && !selected && (
        <span
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--color-primary)] start-1.5"
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          unread || selected
            ? 'bg-primary-100 text-primary-700'
            : 'bg-[var(--color-surface-secondary)]',
        )}
      >
        <KindIcon kind={thread.kind} muted={!unread && !selected} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              unread
                ? 'font-semibold text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-primary)]',
            )}
          >
            {displaySubject}
          </span>
          {thread.frozen_at && (
            <Lock
              className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]"
              aria-label={t('inbox.thread.frozen.title')}
            />
          )}
          <span
            className={cn(
              'shrink-0 text-[11px] tabular-nums',
              unread ? 'font-semibold text-primary-700' : 'text-[var(--color-text-tertiary)]',
            )}
          >
            {formatListTimestamp(thread.preview_created_at ?? thread.last_message_at, locale)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              unread ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]',
            )}
          >
            {thread.preview_body ?? '\u00A0'}
          </span>
          {unread && (
            <span className="flex min-h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-pill bg-primary-600 px-1.5 text-[10px] font-bold text-white">
              {thread.unread_count > 99 ? '99+' : thread.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
