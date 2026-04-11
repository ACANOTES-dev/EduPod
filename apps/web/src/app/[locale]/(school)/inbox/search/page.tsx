'use client';

import { Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Button, EmptyState, Input } from '@school/ui';

import { apiClient } from '@/lib/api-client';

/**
 * Inbox full-text search results page. Reads `?q=` and `?page=` from
 * the URL, calls `GET /v1/inbox/search` (impl 09, user-scoped), and
 * renders hits grouped by conversation. Match snippets are highlighted
 * via server-emitted `<mark>` tags sanitised through a whitelist.
 */

interface InboxSearchHit {
  message_id: string;
  conversation_id: string;
  conversation_subject: string | null;
  conversation_kind: 'direct' | 'group' | 'broadcast';
  sender_user_id: string;
  sender_display_name: string;
  body_snippet: string;
  created_at: string;
  rank: number;
}

interface SearchResponse {
  data: InboxSearchHit[];
  meta: { page: number; pageSize: number; total: number };
}

export default function InboxSearchPage() {
  const params = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const initialPage = Number(params.get('page') ?? '1') || 1;

  const [query, setQuery] = React.useState(initialQ);
  const [committedQuery, setCommittedQuery] = React.useState(initialQ);
  const [page, setPage] = React.useState(initialPage);
  const [data, setData] = React.useState<InboxSearchHit[]>([]);
  const [meta, setMeta] = React.useState<SearchResponse['meta']>({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (committedQuery.trim().length < 2) {
      setData([]);
      setMeta({ page: 1, pageSize: 20, total: 0 });
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    apiClient<SearchResponse>(
      `/api/v1/inbox/search?q=${encodeURIComponent(committedQuery)}&page=${page}`,
      { method: 'GET', silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[inbox.search]', err);
        const apiErr = err as { error?: { message?: string } };
        setError(apiErr.error?.message ?? 'Search failed. Try a different query.');
        setData([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [committedQuery, page]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPage(1);
    setCommittedQuery(query);
  };

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-text-primary">Search the inbox</h1>
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all your conversations…"
              className="ps-9"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={query.trim().length < 2}>
            Search
          </Button>
        </form>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : committedQuery.trim().length < 2 ? (
        <EmptyState
          title="Search the inbox"
          description="Type at least 2 characters to find messages in your threads."
          icon={Search}
        />
      ) : data.length === 0 ? (
        <EmptyState
          title="No results"
          description={`No messages found for "${committedQuery}". Try fewer or different words.`}
          icon={Search}
        />
      ) : (
        <>
          <p className="text-xs text-text-tertiary">
            {meta.total} result{meta.total === 1 ? '' : 's'}
          </p>
          <ul className="space-y-2">
            {data.map((hit) => (
              <li key={hit.message_id}>
                <Link
                  href={`/inbox/threads/${hit.conversation_id}`}
                  className="block rounded-lg border border-border bg-surface p-3 transition hover:bg-background/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="truncate text-sm font-medium text-text-primary">
                      {hit.conversation_subject || kindLabel(hit.conversation_kind)}
                    </h2>
                    <time className="shrink-0 text-xs text-text-tertiary" dateTime={hit.created_at}>
                      {formatRelative(hit.created_at)}
                    </time>
                  </div>
                  <p className="mt-1 text-xs text-text-tertiary">{hit.sender_display_name}</p>
                  <p
                    className="mt-2 text-sm text-text-secondary"
                    // eslint-disable-next-line react/no-danger -- sanitised to <mark>-only tags
                    dangerouslySetInnerHTML={{ __html: sanitiseSnippet(hit.body_snippet) }}
                  />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={meta.page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      <span className="text-xs text-text-tertiary">
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

function kindLabel(kind: 'direct' | 'group' | 'broadcast'): string {
  if (kind === 'direct') return 'Direct message';
  if (kind === 'group') return 'Group conversation';
  return 'Broadcast';
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString();
}

/**
 * Sanitise a snippet from `ts_headline`. Only `<mark>` / `</mark>`
 * survive; everything else is HTML-entity escaped so arbitrary message
 * content cannot inject markup. Exported for unit tests.
 */
export function sanitiseSnippet(input: string): string {
  const escaped = input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped.replace(/&lt;mark&gt;/g, '<mark>').replace(/&lt;\/mark&gt;/g, '</mark>');
}
