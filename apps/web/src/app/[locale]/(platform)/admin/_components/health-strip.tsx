'use client';

import { Activity, ArrowRight, Database, HardDrive, Server, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { cn } from '@school/ui';

import { usePlatformSocket } from '@/hooks/use-platform-socket';
import { apiClient } from '@/lib/api-client';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
type ServiceStatus = 'up' | 'down';
type ComponentKey = 'postgresql' | 'redis' | 'meilisearch' | 'bullmq' | 'disk';

interface QueueMetrics {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  stuck_jobs: number;
}

interface FullHealthChecks {
  postgresql: { status: ServiceStatus; latency_ms: number };
  redis: { status: ServiceStatus; latency_ms: number };
  meilisearch: { status: ServiceStatus; latency_ms: number };
  bullmq: {
    status: ServiceStatus;
    stuck_jobs: number;
    alerts: string[];
    queues: Record<string, QueueMetrics>;
  };
  disk: { status: ServiceStatus; free_gb: number; total_gb: number };
}

interface PlatformHealthSnapshot {
  id: string;
  status: HealthStatus;
  checks: FullHealthChecks;
  uptime: number;
  created_at: string;
}

interface HealthHistoryResponse {
  data: PlatformHealthSnapshot[];
  meta: { total: number };
}

interface HealthUpdateSnapshot {
  type: 'snapshot';
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  checks: FullHealthChecks;
}

interface ComponentHealth {
  key: ComponentKey;
  label: string;
  status: HealthStatus;
  detail: string;
}

interface HealthStripProps {
  className?: string;
}

const COMPONENTS: Array<{
  key: ComponentKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'postgresql', label: 'Postgres', icon: Database },
  { key: 'redis', label: 'Redis', icon: Activity },
  { key: 'meilisearch', label: 'Meilisearch', icon: Server },
  { key: 'bullmq', label: 'BullMQ', icon: Workflow },
  { key: 'disk', label: 'Disk', icon: HardDrive },
];

function isHealthUpdateSnapshot(value: unknown): value is HealthUpdateSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.type === 'snapshot' && typeof record.status === 'string' && 'checks' in record;
}

function toHealthStatus(status: ServiceStatus): HealthStatus {
  return status === 'up' ? 'healthy' : 'unhealthy';
}

function getComponentHealth(snapshot: PlatformHealthSnapshot): ComponentHealth[] {
  return COMPONENTS.map((component) => {
    switch (component.key) {
      case 'bullmq':
        return {
          key: component.key,
          label: component.label,
          status:
            snapshot.checks.bullmq.status === 'up' && snapshot.checks.bullmq.stuck_jobs > 0
              ? 'degraded'
              : toHealthStatus(snapshot.checks.bullmq.status),
          detail: `${snapshot.checks.bullmq.stuck_jobs} stuck`,
        };
      case 'disk':
        return {
          key: component.key,
          label: component.label,
          status: toHealthStatus(snapshot.checks.disk.status),
          detail: `${Math.round(snapshot.checks.disk.free_gb)}GB free`,
        };
      case 'meilisearch':
        return {
          key: component.key,
          label: component.label,
          status: toHealthStatus(snapshot.checks.meilisearch.status),
          detail: `${snapshot.checks.meilisearch.latency_ms}ms`,
        };
      case 'postgresql':
        return {
          key: component.key,
          label: component.label,
          status: toHealthStatus(snapshot.checks.postgresql.status),
          detail: `${snapshot.checks.postgresql.latency_ms}ms`,
        };
      case 'redis':
        return {
          key: component.key,
          label: component.label,
          status: toHealthStatus(snapshot.checks.redis.status),
          detail: `${snapshot.checks.redis.latency_ms}ms`,
        };
    }
  });
}

function snapshotFromUpdate(update: HealthUpdateSnapshot): PlatformHealthSnapshot {
  return {
    id: `live-${update.timestamp}`,
    status: update.status,
    checks: update.checks,
    uptime: update.uptime,
    created_at: update.timestamp,
  };
}

function statusDotClass(status: HealthStatus): string {
  if (status === 'healthy') return 'bg-success-text';
  if (status === 'degraded') return 'bg-warning-dot';
  return 'bg-danger-dot';
}

function statusLabel(status: HealthStatus): string {
  if (status === 'healthy') return 'Healthy';
  if (status === 'degraded') return 'Degraded';
  return 'Unhealthy';
}

export function HealthStrip({ className }: HealthStripProps) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { connected, subscribe } = usePlatformSocket();
  const [snapshot, setSnapshot] = React.useState<PlatformHealthSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadHealth = React.useCallback(async () => {
    try {
      setError(null);
      const result = await apiClient<HealthHistoryResponse>(
        '/api/v1/admin/health/history?hours=1',
        { silent: true },
      );
      setSnapshot(result.data[0] ?? null);
    } catch (err: unknown) {
      console.error('[HealthStrip.loadHealth]', err);
      setError('Health status unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  React.useEffect(() => {
    return subscribe('health:update', (payload) => {
      if (isHealthUpdateSnapshot(payload)) {
        setSnapshot(snapshotFromUpdate(payload));
        setError(null);
        setLoading(false);
      }
    });
  }, [subscribe]);

  React.useEffect(() => {
    if (connected) {
      void loadHealth();
      return undefined;
    }

    const interval = setInterval(() => void loadHealth(), 30_000);
    return () => clearInterval(interval);
  }, [connected, loadHealth]);

  const items = snapshot ? getComponentHealth(snapshot) : [];

  return (
    <section
      aria-label="Platform health"
      className={cn('rounded-lg border border-border bg-surface p-4 shadow-sm', className)}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                connected ? 'bg-success-text' : 'bg-warning-dot',
              )}
              aria-hidden="true"
            />
            <h2 className="text-sm font-semibold text-text-primary">Health Strip</h2>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {error ??
              (snapshot
                ? `Loaded ${statusLabel(snapshot.status).toLowerCase()} status`
                : 'Loading live dependency status')}
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-border bg-surface px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary"
          href={`/${locale}/admin/health`}
        >
          Open health
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {loading && !snapshot
          ? COMPONENTS.map((component) => (
              <div
                key={component.key}
                className="h-20 animate-pulse rounded-lg border border-border bg-surface-secondary"
              />
            ))
          : null}

        {!loading && items.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface-secondary px-4 py-5 text-sm text-text-secondary sm:col-span-2 xl:col-span-5">
            No health snapshot has been recorded yet.
          </div>
        ) : null}

        {items.map((item) => {
          const component = COMPONENTS.find((entry) => entry.key === item.key);
          const Icon = component?.icon ?? Activity;
          return (
            <Link
              key={item.key}
              className="group flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-hover"
              href={`/${locale}/admin/health#${item.key}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-text-primary">
                    {item.label}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">{item.detail}</span>
                </span>
              </div>
              <span
                className={cn('h-2.5 w-2.5 shrink-0 rounded-full', statusDotClass(item.status))}
                aria-label={`${item.label} ${statusLabel(item.status)}`}
                role="status"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
