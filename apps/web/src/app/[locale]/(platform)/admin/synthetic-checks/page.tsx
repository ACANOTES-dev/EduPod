'use client';

import { Play, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { cn, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { getErrorMessage, SyntheticStatusBadge } from './_components/status-badge';
import type {
  PaginatedResponse,
  SyntheticCheckDefinition,
  SyntheticCheckResult,
} from './_components/types';

const PAGE_SIZE = 20;

export default function PlatformSyntheticChecksPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [checks, setChecks] = React.useState<SyntheticCheckDefinition[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const loadChecks = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<PaginatedResponse<SyntheticCheckDefinition>>(
        `/api/v1/admin/synthetic-checks?page=1&pageSize=${PAGE_SIZE}`,
      );
      setChecks(result.data);
    } catch (err: unknown) {
      console.error('[PlatformSyntheticChecksPage.loadChecks]', err);
      toast.error(getErrorMessage(err, 'Failed to load synthetic checks.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadChecks();
  }, [loadChecks]);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return checks;
    return checks.filter((check) =>
      [check.display_name, check.key, check.kind, check.related_component ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [checks, query]);

  async function runNow(check: SyntheticCheckDefinition) {
    try {
      setRunningId(check.id);
      const result = await apiClient<SyntheticCheckResult>(
        `/api/v1/admin/synthetic-checks/${check.id}/run-now`,
        { method: 'POST' },
      );
      setChecks((current) =>
        current.map((entry) =>
          entry.id === check.id
            ? { ...entry, last_result: result, updated_at: new Date().toISOString() }
            : entry,
        ),
      );
      toast.success('Synthetic check run recorded.');
    } catch (err: unknown) {
      console.error('[PlatformSyntheticChecksPage.runNow]', err);
      toast.error(getErrorMessage(err, 'Failed to run synthetic check.'));
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Synthetic Checks"
        description="Scheduled route, queue, notification, DNS, TLS, and dependency health checks."
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block max-w-md flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-surface ps-10 pe-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-primary-600"
            placeholder="Search checks"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadChecks()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr] gap-3 border-b border-border bg-surface-secondary px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary max-lg:hidden">
          <span>Check</span>
          <span>Kind</span>
          <span>Component</span>
          <span>Status</span>
          <span className="text-end">Action</span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-text-secondary">Loading synthetic checks...</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-sm text-text-secondary">No synthetic checks found.</div>
        ) : (
          filtered.map((check) => (
            <div
              key={check.id}
              className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 lg:grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr] lg:items-center"
            >
              <div className="min-w-0">
                <Link
                  href={`/${locale}/admin/synthetic-checks/${check.id}`}
                  className="font-semibold text-text-primary hover:text-primary-700"
                >
                  {check.display_name}
                </Link>
                <p className="mt-1 truncate font-mono text-xs text-text-tertiary">{check.key}</p>
              </div>
              <span className="font-mono text-xs text-text-secondary">{check.kind}</span>
              <span className="text-sm text-text-secondary">
                {check.related_component ?? 'Platform'}
              </span>
              <div>
                {check.last_result ? (
                  <SyntheticStatusBadge status={check.last_result.status} />
                ) : (
                  <span className="text-sm text-text-tertiary">No result</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 lg:justify-end">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold',
                    check.enabled
                      ? 'bg-success-bg text-success-text'
                      : 'bg-surface-secondary text-text-secondary',
                  )}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {check.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  type="button"
                  onClick={() => void runNow(check)}
                  disabled={runningId === check.id}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play className="h-4 w-4" />
                  {runningId === check.id ? 'Running' : 'Run'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
