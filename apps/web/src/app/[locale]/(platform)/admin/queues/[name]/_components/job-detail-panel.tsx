'use client';

import { RotateCcw, X } from 'lucide-react';

import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@school/ui';

import { QueueStatusBadge } from '../../_components/queue-status-badge';

export interface QueueJobDetail {
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
  opts: unknown;
  progress: unknown;
  return_value: unknown;
  stacktrace: string[];
  logs: string[];
}

interface JobDetailPanelProps {
  job: QueueJobDetail | null;
  open: boolean;
  queueName: string;
  retrying: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: (jobId: string) => void;
}

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return 'Not recorded';
  return new Date(ms).toLocaleString();
}

function formatDuration(job: QueueJobDetail): string {
  if (!job.processed_on) return 'Not started';
  if (!job.finished_on) return 'Running';
  const duration = Math.max(0, job.finished_on - job.processed_on);
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

export function JobDetailPanel({
  job,
  open,
  queueName,
  retrying,
  onOpenChange,
  onRetry,
}: JobDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-3">
            <span>Job detail</span>
            <button
              type="button"
              className="rounded-full p-1 text-text-tertiary hover:bg-surface-secondary hover:text-text-primary"
              onClick={() => onOpenChange(false)}
              aria-label="Close job detail"
            >
              <X className="h-4 w-4" />
            </button>
          </SheetTitle>
          <SheetDescription>{queueName}</SheetDescription>
        </SheetHeader>

        {job ? (
          <div className="mt-6 space-y-5">
            <section className="grid gap-3 rounded-lg border border-border bg-surface-secondary p-4 sm:grid-cols-2">
              <Detail label="Job ID" value={job.id} mono />
              <Detail label="Job name" value={job.name} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Status
                </p>
                <div className="mt-1">
                  <QueueStatusBadge status={job.status} />
                </div>
              </div>
              <Detail
                label="Attempts"
                value={`${job.attempts_made}${job.attempts_total ? ` / ${job.attempts_total}` : ''}`}
              />
              <Detail label="Created" value={formatTimestamp(job.timestamp)} />
              <Detail label="Started" value={formatTimestamp(job.processed_on)} />
              <Detail label="Finished" value={formatTimestamp(job.finished_on)} />
              <Detail label="Duration" value={formatDuration(job)} />
            </section>

            <CodeBlock title="Payload" value={formatJson(job.data)} />

            {job.failed_reason ? (
              <CodeBlock title="Error" value={job.failed_reason} tone="danger" />
            ) : null}

            {job.stacktrace.length > 0 ? (
              <CodeBlock title="Stack trace" value={job.stacktrace.join('\n\n')} tone="danger" />
            ) : null}

            {job.logs.length > 0 ? (
              <CodeBlock title="Attempt logs" value={job.logs.join('\n')} />
            ) : null}

            <CodeBlock title="Options" value={formatJson(job.opts)} />
            <CodeBlock title="Return value" value={formatJson(job.return_value)} />

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {job.status === 'failed' ? (
                <Button type="button" disabled={retrying} onClick={() => onRetry(job.id)}>
                  <RotateCcw className="me-1.5 h-3.5 w-3.5" />
                  Retry job
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-8 text-sm text-text-tertiary">Select a job to inspect.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <p
        className={
          mono
            ? 'mt-1 break-all font-mono text-xs text-text-primary'
            : 'mt-1 break-words text-sm font-medium text-text-primary'
        }
      >
        {value}
      </p>
    </div>
  );
}

function CodeBlock({
  title,
  value,
  tone = 'default',
}: {
  title: string;
  value: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {title}
      </h3>
      <pre
        dir="ltr"
        className={
          tone === 'danger'
            ? 'max-h-72 overflow-auto rounded-lg border border-danger-text/20 bg-danger-fill p-3 font-mono text-xs text-danger-text'
            : 'max-h-72 overflow-auto rounded-lg border border-border bg-surface-secondary p-3 font-mono text-xs text-text-secondary'
        }
      >
        {value}
      </pre>
    </section>
  );
}
