'use client';

import { ArrowLeft, CirclePause, Play, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button, cn, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { ExplainButton, RecommendFixButton } from '@/components/platform/explain-button';
import { apiClient } from '@/lib/api-client';

import { QueueStatusBadge } from '../_components/queue-status-badge';

import { CleanConfirmDialog } from './_components/clean-confirm-dialog';
import { JobDetailPanel, type QueueJobDetail } from './_components/job-detail-panel';

type JobStatusFilter = 'all' | 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

interface QueueSummary {
  name: string;
  is_paused: boolean;
  counts: QueueCounts;
}

interface JobSummary {
  id: string;
  name: string;
  status: string;
  timestamp: number;
  processed_on: number | null;
  finished_on: number | null;
  attempts_made: number;
  attempts_total: number | null;
  failed_reason: string | null;
  data: unknown;
}

interface JobListResponse {
  data: JobSummary[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;
const FILTERS: JobStatusFilter[] = ['all', 'waiting', 'active', 'completed', 'failed', 'delayed'];

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function formatDuration(job: JobSummary): string {
  if (!job.processed_on) return '—';
  if (!job.finished_on) return job.status === 'active' ? 'running' : '—';
  const duration = Math.max(0, job.finished_on - job.processed_on);
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function QueueDetailPage({ params }: { params: { locale: string; name: string } }) {
  const queueName = decodeURIComponent(params.name);
  const [queue, setQueue] = React.useState<QueueSummary | null>(null);
  const [jobs, setJobs] = React.useState<JobSummary[]>([]);
  const [selectedJob, setSelectedJob] = React.useState<QueueJobDetail | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [status, setStatus] = React.useState<JobStatusFilter>('all');
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  const loadQueue = React.useCallback(async () => {
    const queues = await apiClient<QueueSummary[]>('/api/v1/admin/queues');
    const found = queues.find((entry) => entry.name === queueName) ?? null;
    setQueue(found);
  }, [queueName]);

  const loadJobs = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (status !== 'all') {
        params.set('status', status);
      }
      const response = await apiClient<JobListResponse>(
        `/api/v1/admin/queues/${encodeURIComponent(queueName)}/jobs?${params.toString()}`,
      );
      setJobs(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch (err: unknown) {
      console.error('[QueueDetailPage.loadJobs]', err);
      toast.error(errorMessage(err, 'Could not load queue jobs.'));
    } finally {
      setLoading(false);
    }
  }, [page, queueName, status]);

  const reload = React.useCallback(async () => {
    await Promise.all([loadQueue(), loadJobs()]);
  }, [loadJobs, loadQueue]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const selectJob = React.useCallback(
    async (jobId: string) => {
      try {
        setBusy(`detail:${jobId}`);
        const detail = await apiClient<QueueJobDetail>(
          `/api/v1/admin/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}`,
        );
        setSelectedJob(detail);
        setPanelOpen(true);
      } catch (err: unknown) {
        console.error('[QueueDetailPage.selectJob]', err);
        toast.error(errorMessage(err, 'Could not load job detail.'));
      } finally {
        setBusy(null);
      }
    },
    [queueName],
  );

  const retryJob = React.useCallback(
    async (jobId: string) => {
      try {
        setBusy(`retry:${jobId}`);
        await apiClient(
          `/api/v1/admin/queues/${encodeURIComponent(queueName)}/jobs/${jobId}/retry`,
          {
            method: 'POST',
          },
        );
        toast.success('Job retried.');
        await reload();
        if (selectedJob?.id === jobId) {
          setPanelOpen(false);
          setSelectedJob(null);
        }
      } catch (err: unknown) {
        console.error('[QueueDetailPage.retryJob]', err);
        toast.error(errorMessage(err, 'Could not retry job.'));
      } finally {
        setBusy(null);
      }
    },
    [queueName, reload, selectedJob?.id],
  );

  const togglePause = React.useCallback(async () => {
    if (!queue) return;
    const action = queue.is_paused ? 'resume' : 'pause';
    try {
      setBusy(action);
      await apiClient(`/api/v1/admin/queues/${encodeURIComponent(queueName)}/${action}`, {
        method: 'POST',
      });
      toast.success(queue.is_paused ? 'Queue resumed.' : 'Queue paused.');
      await reload();
    } catch (err: unknown) {
      console.error('[QueueDetailPage.togglePause]', err);
      toast.error(errorMessage(err, `Could not ${action} queue.`));
    } finally {
      setBusy(null);
    }
  }, [queue, queueName, reload]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={queueName}
        description="Inspect jobs, filter by state, and run guarded queue controls."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={`/${params.locale}/admin/queues`}>
                <ArrowLeft className="me-1.5 h-3.5 w-3.5" />
                Queues
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
              <RefreshCw className="me-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
            <ExplainButton
              contextId={queueName}
              contextKind="queue"
              label="Explain Queue"
              locale={params.locale}
              question={`Explain queue ${queueName}. What failed or stalled jobs are visible, what services are affected, and which cited evidence supports the diagnosis?`}
            />
            <RecommendFixButton
              contextId={queueName}
              contextKind="queue"
              label="Retry Safe?"
              locale={params.locale}
            />
          </div>
        }
      />

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold',
                queue?.is_paused
                  ? 'bg-warning-fill text-warning-text'
                  : 'bg-success-fill text-success-text',
              )}
            >
              {queue?.is_paused ? 'Paused' : 'Active'}
            </span>
            <span className="font-mono text-xs text-text-tertiary">{queueName}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!queue || busy === 'pause' || busy === 'resume'}
              onClick={() => void togglePause()}
            >
              {queue?.is_paused ? (
                <Play className="me-1.5 h-3.5 w-3.5" />
              ) : (
                <CirclePause className="me-1.5 h-3.5 w-3.5" />
              )}
              {queue?.is_paused ? 'Resume' : 'Pause'}
            </Button>
            <CleanConfirmDialog
              count={queue?.counts.completed ?? 0}
              queueName={queueName}
              status="completed"
              onExecuted={reload}
            />
            <CleanConfirmDialog
              count={queue?.counts.failed ?? 0}
              queueName={queueName}
              status="failed"
              onExecuted={reload}
            >
              <Button type="button" size="sm" variant="destructive">
                <Trash2 className="me-1.5 h-3.5 w-3.5" />
                Clean failed
              </Button>
            </CleanConfirmDialog>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {queue
            ? Object.entries(queue.counts).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-surface-secondary px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    {key}
                  </p>
                  <p className="font-mono text-lg font-semibold text-text-primary">{value}</p>
                </div>
              ))
            : null}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Jobs</h2>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => {
                  setStatus(filter);
                  setPage(1);
                }}
                className={cn(
                  'h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors',
                  status === filter
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
                )}
              >
                {filter === 'all' ? 'All' : filter}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-surface-secondary text-start text-[11px] uppercase tracking-wider text-text-tertiary">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">Job ID</th>
                <th className="px-4 py-3 text-start font-semibold">Name</th>
                <th className="px-4 py-3 text-start font-semibold">Status</th>
                <th className="px-4 py-3 text-start font-semibold">Created</th>
                <th className="px-4 py-3 text-start font-semibold">Duration</th>
                <th className="px-4 py-3 text-start font-semibold">Attempts</th>
                <th className="px-4 py-3 text-start font-semibold">Error</th>
                <th className="px-4 py-3 text-end font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-text-tertiary" colSpan={8}>
                    Loading jobs…
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-text-tertiary" colSpan={8}>
                    No jobs match this filter.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-surface-secondary/60">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="max-w-40 break-all text-start font-mono text-xs font-semibold text-primary-700"
                        onClick={() => void selectJob(job.id)}
                      >
                        {job.id}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-text-primary">{job.name}</td>
                    <td className="px-4 py-3">
                      <QueueStatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {formatTimestamp(job.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{formatDuration(job)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                      {job.attempts_made}
                      {job.attempts_total ? ` / ${job.attempts_total}` : ''}
                    </td>
                    <td className="max-w-64 px-4 py-3 text-xs text-danger-text">
                      {job.failed_reason ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy === `detail:${job.id}`}
                          onClick={() => void selectJob(job.id)}
                        >
                          View
                        </Button>
                        {job.status === 'failed' ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy === `retry:${job.id}`}
                            onClick={() => void retryJob(job.id)}
                          >
                            <RotateCcw className="me-1.5 h-3.5 w-3.5" />
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-tertiary">
            Page {page} of {totalPages} · {total} jobs
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page === 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      <JobDetailPanel
        job={selectedJob}
        open={panelOpen}
        queueName={queueName}
        retrying={selectedJob ? busy === `retry:${selectedJob.id}` : false}
        onOpenChange={setPanelOpen}
        onRetry={(jobId) => void retryJob(jobId)}
      />
    </div>
  );
}
