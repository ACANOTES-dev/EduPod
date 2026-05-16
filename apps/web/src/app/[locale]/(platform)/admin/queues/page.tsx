'use client';

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock,
  FileWarning,
  RefreshCw,
  RotateCcw,
  Server,
  Trash2,
  Workflow,
} from 'lucide-react';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { OwnerActionConfirmDialog } from '@/components/platform/owner-action-confirm-dialog';
import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FailedSummaryRow {
  queue: string;
  failed_count: number;
}

interface FailedJob {
  id: string | number;
  name: string;
  data: Record<string, unknown>;
  failed_reason: string | null;
  attempts_made: number;
  timestamp: number;
  finished_on: number | null;
}

interface ListResponse {
  data: FailedJob[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function QueueAdminPage() {
  const [summary, setSummary] = React.useState<FailedSummaryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  // ── Per-queue data + expansion state ─────────────────────────────────────
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [jobsByQueue, setJobsByQueue] = React.useState<Record<string, FailedJob[]>>({});
  const [pagesByQueue, setPagesByQueue] = React.useState<Record<string, number>>({});
  const [totalsByQueue, setTotalsByQueue] = React.useState<Record<string, number>>({});
  const [loadingQueue, setLoadingQueue] = React.useState<Set<string>>(new Set());
  const [busyJob, setBusyJob] = React.useState<string | null>(null);

  // ── Load summary ─────────────────────────────────────────────────────────
  const loadSummary = React.useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient<{ data: FailedSummaryRow[] }>('/api/v1/admin/queues/failed')
      .then((res) => {
        if (cancelled) return;
        setSummary(res.data ?? []);
      })
      .catch((err) => {
        console.error('[QueueAdmin] summary failed', err);
        if (!cancelled) setError('Could not load queue summary.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    return loadSummary();
  }, [loadSummary, reloadKey]);

  // ── Fetch failed jobs for one queue ──────────────────────────────────────
  const loadQueue = React.useCallback(async (queue: string, page = 1) => {
    setLoadingQueue((prev) => {
      const next = new Set(prev);
      next.add(queue);
      return next;
    });
    try {
      const res = await apiClient<ListResponse>(
        `/api/v1/admin/queues/${encodeURIComponent(queue)}/failed?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      setJobsByQueue((prev) => ({ ...prev, [queue]: res.data ?? [] }));
      setPagesByQueue((prev) => ({ ...prev, [queue]: page }));
      setTotalsByQueue((prev) => ({ ...prev, [queue]: res.meta?.total ?? 0 }));
    } catch (err) {
      console.error('[QueueAdmin] queue fetch failed', err);
      toast.error(`Could not load jobs for queue "${queue}".`);
    } finally {
      setLoadingQueue((prev) => {
        const next = new Set(prev);
        next.delete(queue);
        return next;
      });
    }
  }, []);

  const toggleQueue = React.useCallback(
    (queue: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(queue)) {
          next.delete(queue);
        } else {
          next.add(queue);
          if (!jobsByQueue[queue]) void loadQueue(queue, 1);
        }
        return next;
      });
    },
    [jobsByQueue, loadQueue],
  );

  // ── Retry ────────────────────────────────────────────────────────────────
  const retryJob = React.useCallback(
    async (queue: string, jobId: string | number) => {
      setBusyJob(String(jobId));
      try {
        await apiClient(`/api/v1/admin/queues/${encodeURIComponent(queue)}/failed/${jobId}/retry`, {
          method: 'POST',
        });
        toast.success('Job retried.');
        await loadQueue(queue, pagesByQueue[queue] ?? 1);
        setReloadKey((k) => k + 1);
      } catch (err) {
        console.error('[QueueAdmin.retryJob]', err);
        const e = err as { error?: { message?: string } };
        toast.error(e?.error?.message ?? 'Could not retry job.');
      } finally {
        setBusyJob(null);
      }
    },
    [loadQueue, pagesByQueue],
  );

  const totalFailed = summary.reduce((acc, row) => acc + row.failed_count, 0);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title="Queue Admin"
        description="Inspect, retry, and discard failed BullMQ jobs. Platform operators only."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshCw className="me-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <section aria-label="Queue summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={FileWarning}
          label="Failed jobs"
          value={loading ? undefined : totalFailed}
          accent={totalFailed > 0 ? 'text-danger-700' : 'text-text-tertiary'}
        />
        <SummaryCard
          icon={Workflow}
          label="Queues with failures"
          value={loading ? undefined : summary.length}
          accent={summary.length > 0 ? 'text-warning-700' : 'text-text-tertiary'}
        />
        <SummaryCard
          icon={Server}
          label="Registered queues"
          value={loading ? undefined : 2}
          accent="text-text-tertiary"
          subtitle="gradebook · notifications"
        />
      </section>

      {/* ── Queues list ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Queues with failed jobs</h2>
          </div>
          <span className="text-xs text-text-tertiary">{summary.length} queue(s)</span>
        </header>

        {loading ? (
          <ul className="divide-y divide-border/50">
            {Array.from({ length: 2 }).map((_, idx) => (
              <li key={idx} className="flex items-center gap-4 px-5 py-4">
                <div className="h-8 w-8 animate-pulse rounded-full bg-border/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/4 animate-pulse rounded bg-border/40" />
                  <div className="h-2 w-1/3 animate-pulse rounded bg-border/30" />
                </div>
              </li>
            ))}
          </ul>
        ) : summary.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CircleDot className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-text-primary">All queues are clean</p>
            <p className="max-w-md text-xs text-text-tertiary">
              There are no failed jobs across the registered BullMQ queues.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {summary.map((row) => {
              const isOpen = expanded.has(row.queue);
              const isLoadingQueue = loadingQueue.has(row.queue);
              const jobs = jobsByQueue[row.queue] ?? [];
              const currentPage = pagesByQueue[row.queue] ?? 1;
              const total = totalsByQueue[row.queue] ?? row.failed_count;
              const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

              return (
                <li key={row.queue}>
                  <button
                    type="button"
                    onClick={() => toggleQueue(row.queue)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-start transition-colors hover:bg-surface-secondary"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-100 text-danger-700">
                      <FileWarning className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {row.queue}
                      </p>
                      <p className="text-xs text-text-tertiary">{row.failed_count} failed job(s)</p>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-text-tertiary" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-text-tertiary" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/60 bg-surface-secondary/30">
                      {isLoadingQueue && jobs.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-xs text-text-tertiary">
                          Loading jobs…
                        </div>
                      ) : jobs.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-xs text-text-tertiary">
                          No failed jobs in this queue.
                        </div>
                      ) : (
                        <ul className="divide-y divide-border/50">
                          {jobs.map((job) => (
                            <li key={job.id} className="px-5 py-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-xs font-semibold text-text-primary">
                                      {String(job.id)}
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                                      {job.name}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                      attempts {job.attempts_made}
                                    </span>
                                  </div>
                                  <p className="text-xs text-text-secondary">
                                    <Clock className="me-1 inline h-3 w-3" />
                                    failed at {formatTimestamp(job.finished_on)}
                                    {' · '}created {formatTimestamp(job.timestamp)}
                                  </p>
                                  {job.failed_reason && (
                                    <p
                                      dir="ltr"
                                      className="mt-1 rounded-lg border border-danger-200 bg-danger-50/60 p-2 font-mono text-[11px] text-danger-700"
                                    >
                                      {truncate(job.failed_reason, 400)}
                                    </p>
                                  )}
                                  {Object.keys(job.data).length > 0 && (
                                    <details className="mt-2">
                                      <summary className="cursor-pointer text-xs text-text-tertiary hover:text-text-primary">
                                        Job data
                                      </summary>
                                      <pre
                                        dir="ltr"
                                        className="mt-2 overflow-x-auto rounded-lg bg-surface p-2 font-mono text-[11px] text-text-secondary"
                                      >
                                        {JSON.stringify(job.data, null, 2)}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={busyJob === String(job.id)}
                                    onClick={() => void retryJob(row.queue, job.id)}
                                  >
                                    <RotateCcw className="me-1.5 h-3.5 w-3.5" />
                                    Retry
                                  </Button>
                                  <OwnerActionConfirmDialog
                                    action="job_removed"
                                    confirmationPhrase={`DELETE JOB ${String(job.id)}`}
                                    payload={{ queue: row.queue, job_id: String(job.id) }}
                                    summary="This permanently discards the failed job from BullMQ."
                                    targetLabel={`${row.queue} / ${String(job.id)}`}
                                    targetResourceId={String(job.id)}
                                    targetResourceType="queue_job"
                                    title="Delete failed job"
                                    onExecuted={async () => {
                                      await loadQueue(row.queue, pagesByQueue[row.queue] ?? 1);
                                      setReloadKey((k) => k + 1);
                                    }}
                                  >
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="destructive"
                                      disabled={busyJob === String(job.id)}
                                    >
                                      <Trash2 className="me-1.5 h-3.5 w-3.5" />
                                      Delete
                                    </Button>
                                  </OwnerActionConfirmDialog>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}

                      {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={currentPage === 1 || isLoadingQueue}
                            onClick={() => void loadQueue(row.queue, Math.max(1, currentPage - 1))}
                          >
                            Previous
                          </Button>
                          <span className="text-xs text-text-tertiary">
                            Page {currentPage} of {totalPages} · {total} total
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={currentPage >= totalPages || isLoadingQueue}
                            onClick={() =>
                              void loadQueue(row.queue, Math.min(totalPages, currentPage + 1))
                            }
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="rounded-2xl border border-dashed border-border bg-surface-secondary/40 px-5 py-4 text-xs text-text-tertiary">
        Retry replays the original job with the same data. Delete permanently discards the job — it
        cannot be retried afterwards. Every action is logged to BullMQ and the audit trail.
      </footer>
    </div>
  );
}

// ─── Summary card ────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
  subtitle,
}: {
  icon: typeof FileWarning;
  label: string;
  value: number | undefined;
  accent: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
      </div>
      {value === undefined ? (
        <div className="mt-1 h-8 w-14 animate-pulse rounded bg-border/60" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-[28px] font-bold leading-tight tracking-tight text-text-primary">
            {value}
          </span>
          {subtitle && <span className="text-xs text-text-tertiary">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
