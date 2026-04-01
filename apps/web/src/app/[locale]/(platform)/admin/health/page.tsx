'use client';

import {
  Activity,
  Database,
  HardDrive,
  Mail,
  MessageSquare,
  Search,
  Server,
  Workflow,
} from 'lucide-react';
import * as React from 'react';

import { Skeleton, StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
type MonitorStatus = 'up' | 'down' | 'not_configured';
type ProviderStatus = 'configured' | 'not_configured';

interface QueueMetrics {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  stuck_jobs: number;
}

interface AdminHealthData {
  status: HealthStatus;
  timestamp: string;
  alerts: string[];
  worker: {
    status: 'up' | 'down';
    latency_ms: number;
    url: string;
  };
  delivery_providers: {
    resend_email: {
      status: ProviderStatus;
      details: string;
    };
    twilio_sms: {
      status: ProviderStatus;
      details: string;
    };
    twilio_whatsapp: {
      status: ProviderStatus;
      details: string;
    };
  };
  api: {
    status: HealthStatus;
    timestamp: string;
    uptime: number;
    checks: {
      postgresql: { status: 'up' | 'down'; latency_ms: number };
      redis: { status: 'up' | 'down'; latency_ms: number };
      meilisearch: { status: 'up' | 'down'; latency_ms: number };
      bullmq: {
        status: 'up' | 'down';
        stuck_jobs: number;
        alerts: string[];
        queues: {
          notifications: QueueMetrics;
          behaviour: QueueMetrics;
          finance: QueueMetrics;
          payroll: QueueMetrics;
          pastoral: QueueMetrics;
        };
      };
      disk: { status: 'up' | 'down'; free_gb: number; total_gb: number };
      pgbouncer: {
        status: MonitorStatus;
        latency_ms: number;
        active_client_connections: number | null;
        waiting_client_connections: number | null;
        max_client_connections: number | null;
        utilization_percent: number | null;
        alert: string | null;
      };
      redis_memory: {
        status: MonitorStatus;
        used_memory_bytes: number | null;
        maxmemory_bytes: number | null;
        utilization_percent: number | null;
        alert: string | null;
      };
    };
  };
}

interface AdminHealthResponse {
  data: AdminHealthData;
}

const REFRESH_INTERVAL_MS = 60_000;

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'N/A';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatPercent(value: number | null): string {
  return value === null ? 'N/A' : `${value}%`;
}

function formatLatency(value: number): string {
  return `${value} ms`;
}

function formatStatusLabel(status: HealthStatus | MonitorStatus | ProviderStatus): string {
  return status.replaceAll('_', ' ');
}

function statusClasses(status: HealthStatus | MonitorStatus | ProviderStatus): string {
  if (status === 'healthy' || status === 'up' || status === 'configured') {
    return 'border-success-fill/30 bg-success-fill/10 text-success-text';
  }

  if (status === 'degraded') {
    return 'border-warning-fill/30 bg-warning-fill/10 text-warning-text';
  }

  if (status === 'not_configured') {
    return 'border-border bg-surface-secondary text-text-secondary';
  }

  return 'border-danger-fill/30 bg-danger-fill/10 text-danger-text';
}

function statusDotClasses(status: HealthStatus | MonitorStatus | ProviderStatus): string {
  if (status === 'healthy' || status === 'up' || status === 'configured') {
    return 'bg-success-fill';
  }

  if (status === 'degraded') {
    return 'bg-warning-fill';
  }

  if (status === 'not_configured') {
    return 'bg-text-tertiary';
  }

  return 'bg-danger-fill';
}

export default function PlatformHealthPage() {
  const [data, setData] = React.useState<AdminHealthData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchHealth(background = false) {
      try {
        if (!background) {
          setLoading(true);
        }
        setError(null);
        const result = await apiClient<AdminHealthResponse>('/api/v1/admin/health');
        if (!cancelled) {
          setData(result.data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err && typeof err === 'object' && 'error' in err
              ? String(
                  (err as { error: { message?: string } }).error?.message ??
                    'Failed to load health dashboard',
                )
              : 'Failed to load health dashboard';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchHealth();
    const interval = setInterval(() => void fetchHealth(true), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Platform Health"
        description="Operational status across API, worker, queues, pool usage, Redis memory, and delivery providers."
      />

      {error && (
        <div className="mt-6 rounded-xl border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      {data ? (
        <p className="mt-4 text-sm text-text-secondary">
          Overall status is <span className="font-medium text-text-primary">{data.status}</span>.
          Last updated {new Date(data.timestamp).toLocaleString('en-IE')}. Refreshes every minute.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !data ? (
          <>
            <Skeleton className="h-[100px] rounded-2xl" />
            <Skeleton className="h-[100px] rounded-2xl" />
            <Skeleton className="h-[100px] rounded-2xl" />
            <Skeleton className="h-[100px] rounded-2xl" />
          </>
        ) : data ? (
          <>
            <StatCard label="Overall Status" value={data.status.toUpperCase()} />
            <StatCard label="Queue Alerts" value={data.api.checks.bullmq.alerts.length} />
            <StatCard
              label="Pool Utilization"
              value={formatPercent(data.api.checks.pgbouncer.utilization_percent)}
            />
            <StatCard
              label="Redis Memory"
              value={formatPercent(data.api.checks.redis_memory.utilization_percent)}
            />
          </>
        ) : null}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 xl:col-span-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary-700" />
            <h2 className="text-sm font-semibold text-text-primary">Service Checks</h2>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data ? (
              <>
                <ServiceCard
                  icon={Database}
                  name="PostgreSQL"
                  status={data.api.checks.postgresql.status}
                  details={`Latency ${formatLatency(data.api.checks.postgresql.latency_ms)}`}
                />
                <ServiceCard
                  icon={Activity}
                  name="Redis"
                  status={data.api.checks.redis.status}
                  details={`Latency ${formatLatency(data.api.checks.redis.latency_ms)}`}
                />
                <ServiceCard
                  icon={Search}
                  name="Meilisearch"
                  status={data.api.checks.meilisearch.status}
                  details={`Latency ${formatLatency(data.api.checks.meilisearch.latency_ms)}`}
                />
                <ServiceCard
                  icon={Workflow}
                  name="BullMQ"
                  status={data.api.checks.bullmq.status}
                  details={`${data.api.checks.bullmq.stuck_jobs} stuck job(s), ${data.api.checks.bullmq.alerts.length} alert(s)`}
                />
                <ServiceCard
                  icon={HardDrive}
                  name="Disk"
                  status={data.api.checks.disk.status}
                  details={`${data.api.checks.disk.free_gb} GB free of ${data.api.checks.disk.total_gb} GB`}
                />
                <ServiceCard
                  icon={Database}
                  name="PgBouncer"
                  status={data.api.checks.pgbouncer.status}
                  details={
                    data.api.checks.pgbouncer.status === 'not_configured'
                      ? 'PGBOUNCER_ADMIN_URL is not configured.'
                      : `Active ${data.api.checks.pgbouncer.active_client_connections ?? 0}, waiting ${data.api.checks.pgbouncer.waiting_client_connections ?? 0}, max ${data.api.checks.pgbouncer.max_client_connections ?? 'N/A'}`
                  }
                  note={
                    data.api.checks.pgbouncer.utilization_percent !== null
                      ? `Utilization ${data.api.checks.pgbouncer.utilization_percent}%`
                      : null
                  }
                />
                <ServiceCard
                  icon={Activity}
                  name="Redis Memory"
                  status={data.api.checks.redis_memory.status}
                  details={`${formatBytes(data.api.checks.redis_memory.used_memory_bytes)} used / ${formatBytes(data.api.checks.redis_memory.maxmemory_bytes)}`}
                  note={
                    data.api.checks.redis_memory.maxmemory_bytes === null
                      ? 'Redis maxmemory is not configured.'
                      : `Utilization ${formatPercent(data.api.checks.redis_memory.utilization_percent)}`
                  }
                />
                <ServiceCard
                  icon={Server}
                  name="Worker"
                  status={data.worker.status}
                  details={`Latency ${formatLatency(data.worker.latency_ms)}`}
                  note={data.worker.url}
                />
              </>
            ) : (
              <>
                <Skeleton className="h-[112px] rounded-2xl" />
                <Skeleton className="h-[112px] rounded-2xl" />
                <Skeleton className="h-[112px] rounded-2xl" />
                <Skeleton className="h-[112px] rounded-2xl" />
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary-700" />
            <h2 className="text-sm font-semibold text-text-primary">Active Alerts</h2>
          </div>

          <div className="mt-4 space-y-3">
            {loading && !data ? (
              <>
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
              </>
            ) : data && data.alerts.length > 0 ? (
              data.alerts.map((alert) => (
                <div
                  key={alert}
                  className="rounded-xl border border-warning-fill/30 bg-warning-fill/10 px-4 py-3 text-sm text-warning-text"
                >
                  {alert}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
                No active operational alerts.
              </div>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-text-primary">Delivery Providers</h3>
            <div className="mt-3 space-y-3">
              {data ? (
                <>
                  <ProviderCard
                    icon={Mail}
                    title="Resend Email"
                    status={data.delivery_providers.resend_email.status}
                    details={data.delivery_providers.resend_email.details}
                  />
                  <ProviderCard
                    icon={MessageSquare}
                    title="Twilio SMS"
                    status={data.delivery_providers.twilio_sms.status}
                    details={data.delivery_providers.twilio_sms.details}
                  />
                  <ProviderCard
                    icon={MessageSquare}
                    title="Twilio WhatsApp"
                    status={data.delivery_providers.twilio_whatsapp.status}
                    details={data.delivery_providers.twilio_whatsapp.details}
                  />
                </>
              ) : (
                <>
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Workflow className="h-4 w-4 text-primary-700" />
          <h2 className="text-sm font-semibold text-text-primary">Queue Breakdown</h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data ? (
            Object.entries(data.api.checks.bullmq.queues).map(([queueName, metrics]) => (
              <QueueCard key={queueName} queueName={queueName} metrics={metrics} />
            ))
          ) : (
            <>
              <Skeleton className="h-[136px] rounded-2xl" />
              <Skeleton className="h-[136px] rounded-2xl" />
              <Skeleton className="h-[136px] rounded-2xl" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceCard({
  icon: Icon,
  name,
  status,
  details,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  status: HealthStatus | MonitorStatus | ProviderStatus;
  details: string;
  note?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary-50 p-2">
            <Icon className="h-4 w-4 text-primary-700" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">{name}</p>
            <p className="mt-1 text-xs text-text-secondary">{details}</p>
          </div>
        </div>
        <StatusPill status={status} />
      </div>
      {note ? <p className="mt-3 text-xs text-text-tertiary">{note}</p> : null}
    </div>
  );
}

function ProviderCard({
  icon: Icon,
  title,
  status,
  details,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  status: ProviderStatus;
  details: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary-50 p-2">
            <Icon className="h-4 w-4 text-primary-700" />
          </div>
          <p className="text-sm font-medium text-text-primary">{title}</p>
        </div>
        <StatusPill status={status} />
      </div>
      <p className="mt-2 text-xs text-text-secondary">{details}</p>
    </div>
  );
}

function QueueCard({ queueName, metrics }: { queueName: string; metrics: QueueMetrics }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold capitalize text-text-primary">{queueName}</p>
        <span className="text-xs text-text-tertiary">{metrics.stuck_jobs} stuck</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <QueueMetric label="Waiting" value={metrics.waiting} />
        <QueueMetric label="Active" value={metrics.active} />
        <QueueMetric label="Delayed" value={metrics.delayed} />
        <QueueMetric label="Failed" value={metrics.failed} />
      </div>
    </div>
  );
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: HealthStatus | MonitorStatus | ProviderStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusClasses(status)}`}
    >
      <span className={`h-2 w-2 rounded-full ${statusDotClasses(status)}`} />
      {formatStatusLabel(status)}
    </span>
  );
}
