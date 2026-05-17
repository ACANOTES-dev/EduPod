'use client';

import { ArrowLeft, Play, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { getErrorMessage, SyntheticStatusBadge } from '../_components/status-badge';
import type {
  PaginatedResponse,
  SyntheticCheckDefinition,
  SyntheticCheckResult,
} from '../_components/types';

const PAGE_SIZE = 20;

export default function PlatformSyntheticCheckDetailPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const id = params?.id as string;
  const [check, setCheck] = React.useState<SyntheticCheckDefinition | null>(null);
  const [results, setResults] = React.useState<SyntheticCheckResult[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);

  const loadDetail = React.useCallback(async () => {
    try {
      setLoading(true);
      const [definition, resultPage] = await Promise.all([
        apiClient<SyntheticCheckDefinition>(`/api/v1/admin/synthetic-checks/${id}`),
        apiClient<PaginatedResponse<SyntheticCheckResult>>(
          `/api/v1/admin/synthetic-checks/${id}/results?page=1&pageSize=${PAGE_SIZE}`,
        ),
      ]);
      setCheck(definition);
      setResults(resultPage.data);
    } catch (err: unknown) {
      console.error('[PlatformSyntheticCheckDetailPage.loadDetail]', err);
      toast.error(getErrorMessage(err, 'Failed to load synthetic check.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function runNow() {
    if (!check) return;
    try {
      setRunning(true);
      const result = await apiClient<SyntheticCheckResult>(
        `/api/v1/admin/synthetic-checks/${check.id}/run-now`,
        { method: 'POST' },
      );
      setResults((current) => [result, ...current].slice(0, PAGE_SIZE));
      setCheck((current) => (current ? { ...current, last_result: result } : current));
      toast.success('Synthetic check run recorded.');
    } catch (err: unknown) {
      console.error('[PlatformSyntheticCheckDetailPage.runNow]', err);
      toast.error(getErrorMessage(err, 'Failed to run synthetic check.'));
    } finally {
      setRunning(false);
    }
  }

  if (loading && !check) {
    return <div className="p-6 text-sm text-text-secondary">Loading synthetic check...</div>;
  }

  if (!check) {
    return <div className="p-6 text-sm text-danger-text">Synthetic check not found.</div>;
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/${locale}/admin/synthetic-checks`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Synthetic Checks
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadDetail()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={running}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-700 px-3 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-4 w-4" />
            {running ? 'Running' : 'Run Now'}
          </button>
        </div>
      </div>

      <PageHeader title={check.display_name} description={check.description ?? check.key} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Kind" value={check.kind} mono />
        <SummaryTile label="Schedule" value={check.schedule_cron} mono />
        <SummaryTile label="Component" value={check.related_component ?? 'Platform'} />
        <SummaryTile
          label="Last Status"
          value={
            check.last_result ? (
              <SyntheticStatusBadge status={check.last_result.status} />
            ) : (
              'No result'
            )
          }
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <JsonPanel title="Target" value={check.target} />
        <JsonPanel title="Expected" value={check.expected} />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="border-b border-border bg-surface-secondary px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Recent Results</h2>
        </div>
        {results.length === 0 ? (
          <div className="px-4 py-8 text-sm text-text-secondary">No results recorded.</div>
        ) : (
          results.map((result) => (
            <article key={result.id} className="border-b border-border px-4 py-4 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <SyntheticStatusBadge status={result.status} />
                  <span className="font-mono text-xs text-text-tertiary">
                    {new Date(result.ran_at).toLocaleString()}
                  </span>
                  <span className="text-sm text-text-secondary">
                    {result.latency_ms === null ? 'No latency' : `${result.latency_ms} ms`}
                  </span>
                </div>
                <span className="font-mono text-xs text-text-tertiary">
                  Attempt {result.attempt_number} · {result.triggered_by}
                </span>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <DetailBlock
                  label="Body SHA256"
                  value={result.response_body_sha256 ?? 'Not stored'}
                />
                <DetailBlock
                  label="Response Status"
                  value={result.response_status_code?.toString() ?? 'None'}
                />
              </div>
              {result.response_body_snippet ? (
                <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-surface-secondary p-3 text-xs text-text-secondary">
                  {result.response_body_snippet}
                </pre>
              ) : null}
              {result.failure_detail ? (
                <JsonPanel title="Failure Detail" value={result.failure_detail} />
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function SummaryTile({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </p>
      <div
        className={
          mono ? 'mt-2 font-mono text-sm text-text-primary' : 'mt-2 text-sm text-text-primary'
        }
      >
        {value}
      </div>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-tertiary">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-text-secondary">{value}</p>
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-surface-secondary p-3 text-xs text-text-secondary">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
