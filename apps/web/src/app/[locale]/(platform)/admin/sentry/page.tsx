'use client';

import { ExternalLink, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { getErrorMessage, SentryStateBadge } from './_components/status-badge';
import type { PaginatedResponse, SentryIssue } from './_components/types';

const PAGE_SIZE = 25;

export default function PlatformSentryPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [issues, setIssues] = React.useState<SentryIssue[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [state, setState] = React.useState('unresolved');

  const loadIssues = React.useCallback(async () => {
    try {
      setLoading(true);
      const search = new URLSearchParams({
        page: '1',
        pageSize: String(PAGE_SIZE),
      });
      if (state !== 'all') search.set('state', state);
      if (query.trim()) search.set('q', query.trim());
      const result = await apiClient<PaginatedResponse<SentryIssue>>(
        `/api/v1/admin/sentry/issues?${search.toString()}`,
      );
      setIssues(result.data);
    } catch (err: unknown) {
      console.error('[PlatformSentryPage.loadIssues]', err);
      toast.error(getErrorMessage(err, 'Failed to load Sentry issues.'));
    } finally {
      setLoading(false);
    }
  }, [query, state]);

  React.useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Sentry Issues"
        description="Redacted Sentry mirrors with deploy, runbook, topology, and platform error-log links."
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/${locale}/admin/sentry/audit`}>Webhook Audit</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => void loadIssues()}>
              <RefreshCw className="me-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block w-full md:max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            className="w-full rounded-lg border border-border bg-surface px-9 py-2 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Search title, issue id, culprit"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          value={state}
          onChange={(event) => setState(event.target.value)}
        >
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
          <option value="archived">Archived</option>
          <option value="all">All states</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.5fr] gap-4 border-b border-border bg-surface-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          <span>Issue</span>
          <span>Project</span>
          <span>Release</span>
          <span>Last seen</span>
          <span>Events</span>
        </div>
        {loading ? (
          <div className="px-4 py-10 text-sm text-text-secondary">Loading Sentry issues...</div>
        ) : issues.length === 0 ? (
          <div className="px-4 py-10 text-sm text-text-secondary">
            No mirrored Sentry issues match this filter.
          </div>
        ) : (
          issues.map((issue) => (
            <Link
              key={issue.id}
              href={`/${locale}/admin/sentry/${issue.id}`}
              className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.5fr] gap-4 border-b border-border px-4 py-4 text-sm transition last:border-b-0 hover:bg-surface-hover"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <SentryStateBadge state={issue.state} />
                  {issue.permalink ? (
                    <ExternalLink className="h-3.5 w-3.5 text-text-tertiary" />
                  ) : null}
                </span>
                <span className="mt-1 block truncate font-semibold text-text-primary">
                  {issue.title}
                </span>
                <span className="block truncate text-xs text-text-tertiary">
                  {issue.sentry_issue_id}
                </span>
              </span>
              <span className="truncate text-text-secondary">{issue.sentry_project}</span>
              <span className="truncate text-text-secondary">{issue.release ?? 'unknown'}</span>
              <span className="text-text-secondary">
                {new Date(issue.last_seen_at).toLocaleString()}
              </span>
              <span className="font-semibold text-text-primary">{issue.total_event_count}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
