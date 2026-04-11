'use client';

import { Pencil, Search } from 'lucide-react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, cn } from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';

import { ComposeDialog } from './compose-dialog';
import { ThreadListItem } from './thread-list-item';
import type { InboxFilterKind, InboxThreadSummary, Paginated } from './types';
import { useInboxPolling } from './use-inbox-polling';

interface FilterConfig {
  key: string;
  labelKey: string;
  kind?: InboxFilterKind;
  unread?: boolean;
  archived?: boolean;
}

const ALL_FILTER: FilterConfig = { key: 'all', labelKey: 'inbox.filter.all' };

const FILTERS: readonly FilterConfig[] = [
  ALL_FILTER,
  { key: 'unread', labelKey: 'inbox.filter.unread', unread: true },
  { key: 'direct', labelKey: 'inbox.filter.direct', kind: 'direct' },
  { key: 'group', labelKey: 'inbox.filter.group', kind: 'group' },
  { key: 'broadcasts', labelKey: 'inbox.filter.broadcasts', kind: 'broadcast' },
  { key: 'archived', labelKey: 'inbox.filter.archived', archived: true },
];

export function InboxSidebar() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  const locale = (params?.locale as string) ?? 'en';
  const polling = useInboxPolling();

  const activeFilter = search?.get('filter') ?? 'all';
  const searchInput = React.useRef<HTMLInputElement>(null);

  const [threads, setThreads] = React.useState<InboxThreadSummary[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [composeOpen, setComposeOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'c' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      event.preventDefault();
      setComposeOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const selectedThreadId = React.useMemo(() => {
    const m = /\/inbox\/threads\/([^/]+)/.exec(pathname);
    return m ? m[1] : null;
  }, [pathname]);

  const latestSignal = polling?.latest_message_at ?? null;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const filter: FilterConfig = FILTERS.find((f) => f.key === activeFilter) ?? ALL_FILTER;
    const qs = new URLSearchParams();
    qs.set('page', '1');
    qs.set('pageSize', '30');
    if (filter.kind) qs.set('kind', filter.kind);
    if (filter.unread) qs.set('unread_only', 'true');
    if (filter.archived) qs.set('archived', 'true');
    else qs.set('archived', 'false');

    void (async () => {
      try {
        const res = await apiClient<
          { data: Paginated<InboxThreadSummary> } | Paginated<InboxThreadSummary>
        >(`/api/v1/inbox/conversations?${qs.toString()}`, { silent: true });
        if (cancelled) return;
        const page = unwrap<Paginated<InboxThreadSummary>>(res);
        setThreads(page.data ?? []);
      } catch (err) {
        if (cancelled) return;
        console.error('[inbox-sidebar]', err);
        setError(t('inbox.errors.load_threads'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeFilter, latestSignal, t]);

  const handleFilterClick = (key: string) => {
    const qp = new URLSearchParams(search?.toString() ?? '');
    if (key === 'all') qp.delete('filter');
    else qp.set('filter', key);
    router.replace(`/${locale}/inbox${qp.toString() ? `?${qp.toString()}` : ''}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.current?.value.trim();
    if (!q) return;
    router.push(`/${locale}/inbox/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          {t('inbox.title')}
        </h1>
        <Button
          size="sm"
          onClick={() => setComposeOpen(true)}
          className="shrink-0 gap-1.5"
          aria-label={t('inbox.compose')}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t('inbox.compose')}</span>
        </Button>
      </div>

      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />

      <form onSubmit={handleSearchSubmit} className="px-3 pt-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)] start-3"
            aria-hidden="true"
          />
          <Input
            ref={searchInput}
            type="search"
            placeholder={t('inbox.search.placeholder')}
            className="h-9 bg-[var(--color-surface-secondary)] ps-9 text-base md:text-sm"
            aria-label={t('inbox.search.placeholder')}
          />
        </div>
      </form>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 py-3">
        {FILTERS.map((f) => {
          const active = activeFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => handleFilterClick(f.key)}
              className={cn(
                'shrink-0 rounded-pill px-3 py-1 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]',
              )}
            >
              {t(f.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="flex-1 divide-y divide-[var(--color-border)] overflow-y-auto overflow-x-hidden">
        {loading && threads === null && (
          <div className="p-4 text-center text-sm text-[var(--color-text-secondary)]">
            {t('inbox.loading')}
          </div>
        )}
        {error && <div className="p-4 text-center text-sm text-red-600">{error}</div>}
        {!loading && threads && threads.length === 0 && (
          <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">
            {t('inbox.list.empty')}
          </div>
        )}
        {threads &&
          threads.map((thread) => (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              selected={thread.id === selectedThreadId}
              onClick={() => router.push(`/${locale}/inbox/threads/${thread.id}`)}
            />
          ))}
      </div>
    </div>
  );
}
