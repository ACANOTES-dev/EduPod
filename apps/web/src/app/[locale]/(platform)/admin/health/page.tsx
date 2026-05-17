'use client';

import { useParams } from 'next/navigation';
import * as React from 'react';

import { Skeleton } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { ExplainButton, RecommendFixButton } from '@/components/platform/explain-button';
import { usePlatformSocket } from '@/hooks/use-platform-socket';
import { apiClient } from '@/lib/api-client';

import { HealthStatusCard } from './_components/health-status-card';
import { OverallStatusBanner } from './_components/overall-status-banner';

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

interface FullHealthResult {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  checks: {
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
  };
}

interface PlatformHealthSnapshot {
  id: string;
  status: HealthStatus;
  checks: FullHealthResult['checks'];
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
  checks: FullHealthResult['checks'];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const COMPONENTS: ComponentKey[] = ['postgresql', 'redis', 'meilisearch', 'bullmq', 'disk'];

function isHealthUpdateSnapshot(value: unknown): value is HealthUpdateSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.type === 'snapshot' && typeof record.status === 'string' && 'checks' in record;
}

function getErrorMessage(err: unknown): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') {
      return maybeError.message;
    }
  }
  return 'Failed to load platform health.';
}

async function fetchCurrentHealth(): Promise<FullHealthResult> {
  const response = await fetch(`${API_URL}/api/health`, {
    credentials: 'include',
  });
  const body = (await response.json()) as unknown;
  if (body !== null && typeof body === 'object' && !Array.isArray(body) && 'status' in body) {
    return body as FullHealthResult;
  }
  throw new Error(`Health check failed (${response.status})`);
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

function buildSparklineData(history: PlatformHealthSnapshot[], component: ComponentKey): number[] {
  return [...history]
    .reverse()
    .map((snapshot) => {
      switch (component) {
        case 'bullmq':
          return snapshot.checks.bullmq.stuck_jobs;
        case 'disk':
          return snapshot.checks.disk.free_gb;
        case 'meilisearch':
          return snapshot.checks.meilisearch.latency_ms;
        case 'postgresql':
          return snapshot.checks.postgresql.latency_ms;
        case 'redis':
          return snapshot.checks.redis.latency_ms;
      }
    })
    .filter((value) => Number.isFinite(value));
}

export default function PlatformHealthPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { connected, subscribe } = usePlatformSocket();
  const [currentHealth, setCurrentHealth] = React.useState<FullHealthResult | null>(null);
  const [history, setHistory] = React.useState<PlatformHealthSnapshot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        setLoading(true);
        setError(null);
        const [current, historical] = await Promise.all([
          fetchCurrentHealth(),
          apiClient<HealthHistoryResponse>('/api/v1/admin/health/history?hours=24'),
        ]);

        if (!cancelled) {
          setCurrentHealth(current);
          setHistory(historical.data);
        }
      } catch (err: unknown) {
        console.error('[PlatformHealthPage.loadHealth]', err);
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    return subscribe('health:update', (payload) => {
      if (!isHealthUpdateSnapshot(payload)) {
        return;
      }

      const nextHealth: FullHealthResult = {
        status: payload.status,
        timestamp: payload.timestamp,
        uptime: payload.uptime,
        checks: payload.checks,
      };

      setCurrentHealth(nextHealth);
      setHistory((previous) => [snapshotFromUpdate(payload), ...previous].slice(0, 1440));
    });
  }, [subscribe]);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Platform Health"
        description="Live dependency status, latency, and 24-hour trends for the platform admin surface."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExplainButton
              contextId="overall"
              contextKind="health"
              label="Explain Health"
              locale={locale}
              question="Explain the current platform health using only cited health, queue, deploy, alert, and topology evidence."
            />
            <RecommendFixButton
              contextId="overall"
              contextKind="health"
              label="Recommend Fix"
              locale={locale}
            />
          </div>
        }
      />

      {error ? (
        <div className="mt-6 rounded-lg border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      ) : null}

      <div className="mt-6">
        <OverallStatusBanner
          connected={connected}
          status={currentHealth?.status ?? null}
          uptime={currentHealth?.uptime ?? 0}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {loading && !currentHealth
          ? COMPONENTS.map((component) => (
              <Skeleton key={component} className="h-[172px] rounded-lg" />
            ))
          : null}

        {currentHealth ? (
          <>
            <HealthStatusCard
              name="PostgreSQL"
              status={currentHealth.checks.postgresql.status}
              latencyMs={currentHealth.checks.postgresql.latency_ms}
              sparklineData={buildSparklineData(history, 'postgresql')}
            />
            <HealthStatusCard
              name="Redis"
              status={currentHealth.checks.redis.status}
              latencyMs={currentHealth.checks.redis.latency_ms}
              sparklineData={buildSparklineData(history, 'redis')}
            />
            <HealthStatusCard
              name="Meilisearch"
              status={currentHealth.checks.meilisearch.status}
              latencyMs={currentHealth.checks.meilisearch.latency_ms}
              sparklineData={buildSparklineData(history, 'meilisearch')}
            />
            <HealthStatusCard
              name="BullMQ"
              status={currentHealth.checks.bullmq.status}
              stuckJobs={currentHealth.checks.bullmq.stuck_jobs}
              sparklineData={buildSparklineData(history, 'bullmq')}
            />
            <HealthStatusCard
              name="Disk"
              status={currentHealth.checks.disk.status}
              freeGb={currentHealth.checks.disk.free_gb}
              totalGb={currentHealth.checks.disk.total_gb}
              sparklineData={buildSparklineData(history, 'disk')}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
