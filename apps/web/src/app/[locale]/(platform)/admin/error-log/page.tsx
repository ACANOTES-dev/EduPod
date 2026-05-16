'use client';

import { ExternalLink, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Badge, Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

interface PlatformErrorLog {
  id: string;
  source: string;
  level: string;
  message_redacted: string;
  stack_redacted: string | null;
  fingerprint: string;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  redaction_metadata: unknown;
  tenant_id_redacted: string | null;
  correlation_id: string | null;
  sentry_event_id: string | null;
}

interface PlatformErrorLogResponse {
  data: PlatformErrorLog[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function PlatformErrorLogPage() {
  const [rows, setRows] = React.useState<PlatformErrorLog[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const load = React.useCallback(async (nextPage: number) => {
    try {
      setLoading(true);
      const result = await apiClient<PlatformErrorLogResponse>(
        `/api/v1/admin/platform-error-log?page=${nextPage}&pageSize=${PAGE_SIZE}`,
      );
      setRows(result.data);
      setPage(result.meta.page);
      setTotal(result.meta.total);
    } catch (err: unknown) {
      console.error('[PlatformErrorLogPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load redacted error log.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(1);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Redacted Error Log"
        description="Dashboard-safe error events after destructive redaction."
        actions={
          <Button variant="outline" onClick={() => void load(page)}>
            <RefreshCw className="me-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3">
        {loading ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
            Loading error log...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
            No redacted errors captured yet.
          </div>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="rounded-lg border border-border bg-surface">
              <button
                type="button"
                className="flex w-full flex-col gap-3 px-4 py-4 text-start md:flex-row md:items-start md:justify-between"
                onClick={() => setExpandedId((current) => (current === row.id ? null : row.id))}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        row.level === 'error'
                          ? 'bg-danger-bg text-danger-text'
                          : 'bg-warning-bg text-warning-text'
                      }
                    >
                      {row.level}
                    </Badge>
                    <Badge className="bg-surface-secondary text-text-secondary">{row.source}</Badge>
                    <span className="text-xs text-text-tertiary" dir="ltr">
                      {formatDateTime(row.last_seen_at)}
                    </span>
                  </span>
                  <span className="mt-3 block break-words text-sm font-medium text-text-primary">
                    {row.message_redacted}
                  </span>
                  <span className="mt-2 block font-mono text-xs text-text-tertiary">
                    {row.fingerprint}
                  </span>
                </span>
                <span className="text-sm text-text-secondary">{row.count} occurrence(s)</span>
              </button>

              {expandedId === row.id ? (
                <div className="border-t border-border px-4 py-4">
                  {row.sentry_event_id ? (
                    <a
                      className="mb-3 inline-flex items-center text-sm font-medium text-primary-700"
                      href={`https://sentry.io/issues/?query=${encodeURIComponent(row.sentry_event_id)}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="me-2 h-4 w-4" />
                      Open in Sentry
                    </a>
                  ) : null}
                  <pre className="max-h-72 overflow-auto rounded-md bg-background p-3 text-xs text-text-secondary">
                    {row.stack_redacted ?? 'No stack trace captured.'}
                  </pre>
                  <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-background p-3 text-xs text-text-secondary">
                    {JSON.stringify(row.redaction_metadata, null, 2)}
                  </pre>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>
          Page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => void load(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => void load(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
