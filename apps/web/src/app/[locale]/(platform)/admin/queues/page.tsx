'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CirclePause,
  Clock,
  RefreshCw,
  Server,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { Button, cn, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { usePlatformSocket } from '@/hooks/use-platform-socket';
import { apiClient } from '@/lib/api-client';

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

interface QueueMetric {
  name: string;
  is_paused: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused?: number;
}

interface QueueMetricPayload {
  type?: string;
  queues?: QueueMetric[];
}

function isQueueMetricPayload(value: unknown): value is QueueMetricPayload {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toCounts(metric: QueueMetric): QueueCounts {
  return {
    waiting: metric.waiting,
    active: metric.active,
    completed: metric.completed,
    failed: metric.failed,
    delayed: metric.delayed,
    paused: metric.paused ?? 0,
  };
}

export default function QueueDashboardPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { connected, subscribe } = usePlatformSocket();
  const [queues, setQueues] = React.useState<QueueSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);

  const loadQueues = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient<QueueSummary[]>('/api/v1/admin/queues');
      setQueues(response);
      setUpdatedAt(new Date());
    } catch (err: unknown) {
      console.error('[QueueDashboardPage.loadQueues]', err);
      setError('Could not load queue metrics.');
      toast.error('Could not load queue metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadQueues();
  }, [loadQueues]);

  React.useEffect(() => {
    return subscribe('queue_metrics', (payload) => {
      if (!isQueueMetricPayload(payload) || payload.type !== 'queue_metrics' || !payload.queues) {
        return;
      }
      setQueues((current) => {
        const byName = new Map(current.map((queue) => [queue.name, queue]));
        for (const metric of payload.queues ?? []) {
          byName.set(metric.name, {
            name: metric.name,
            is_paused: metric.is_paused,
            counts: toCounts(metric),
          });
        }
        return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
      });
      setUpdatedAt(new Date());
    });
  }, [subscribe]);

  const totals = React.useMemo(
    () =>
      queues.reduce(
        (acc, queue) => ({
          waiting: acc.waiting + queue.counts.waiting,
          active: acc.active + queue.counts.active,
          failed: acc.failed + queue.counts.failed,
          paused: acc.paused + (queue.is_paused ? 1 : 0),
        }),
        { waiting: 0, active: 0, failed: 0, paused: 0 },
      ),
    [queues],
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title="Queue Manager"
        description="Monitor and manage BullMQ background job queues."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void loadQueues()}>
            <RefreshCw className="me-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Queue summary">
        <MetricCard icon={Clock} label="Total waiting" value={totals.waiting} tone="info" />
        <MetricCard icon={Activity} label="Total active" value={totals.active} tone="success" />
        <MetricCard icon={AlertTriangle} label="Total failed" value={totals.failed} tone="danger" />
        <MetricCard icon={CirclePause} label="Queues paused" value={totals.paused} tone="neutral" />
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <header className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">All queues</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                connected ? 'bg-success-text' : 'bg-danger-dot',
              )}
            />
            <span>
              {connected ? 'Live updates on' : 'Live updates unavailable'}
              {updatedAt ? ` · Updated ${updatedAt.toLocaleTimeString()}` : ''}
            </span>
          </div>
        </header>

        {error ? (
          <div className="flex flex-col gap-3 p-5 text-sm text-danger-text sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadQueues()}>
              Try again
            </Button>
          </div>
        ) : null}

        {loading && queues.length === 0 ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-36 animate-pulse rounded-lg border border-border bg-surface-secondary"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {queues.map((queue) => (
              <Link
                key={queue.name}
                href={`/${locale}/admin/queues/${encodeURIComponent(queue.name)}`}
                className="group flex min-h-36 flex-col justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-secondary"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm font-semibold text-text-primary">
                      {queue.name}
                    </p>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {queue.is_paused ? 'Processing paused' : 'Processing active'}
                    </p>
                  </div>
                  <Server className="h-4 w-4 shrink-0 text-text-tertiary group-hover:text-primary-700" />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <CountPill label="Waiting" value={queue.counts.waiting} tone="info" />
                  <CountPill label="Active" value={queue.counts.active} tone="success" />
                  <CountPill label="Failed" value={queue.counts.failed} tone="danger" />
                  <CountPill label="Delayed" value={queue.counts.delayed} tone="warning" />
                </div>

                <div className="mt-4 flex items-center justify-between text-xs font-semibold text-primary-700">
                  <span>Open queue</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  tone: 'danger' | 'info' | 'neutral' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-danger-text'
      : tone === 'info'
        ? 'text-info-text'
        : tone === 'success'
          ? 'text-success-text'
          : 'text-text-tertiary';

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', toneClass)} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
      </div>
      <p className="mt-2 text-[28px] font-bold leading-tight text-text-primary">{value}</p>
    </div>
  );
}

function CountPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'info' | 'success' | 'warning';
}) {
  const className =
    tone === 'danger'
      ? 'bg-danger-fill text-danger-text'
      : tone === 'info'
        ? 'bg-info-fill text-info-text'
        : tone === 'success'
          ? 'bg-success-fill text-success-text'
          : 'bg-warning-fill text-warning-text';

  return (
    <span className={cn('flex items-center justify-between rounded-lg px-2 py-1.5', className)}>
      <span>{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </span>
  );
}
