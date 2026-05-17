'use client';

import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import * as React from 'react';

import { Button, Skeleton, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface RouteHealthCheck {
  failure_detail: Record<string, unknown> | null;
  id: string;
  latency_ms: number | null;
  ran_at: string;
  route: {
    channel: { name: string; type: string };
    display_name: string;
    id: string;
  };
  success: boolean;
  triggered_by: string;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function PlatformAlertRouteHealthPage() {
  const [checks, setChecks] = React.useState<RouteHealthCheck[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setChecks(await apiClient<RouteHealthCheck[]>('/api/v1/admin/alerts/route-health'));
    } catch (err: unknown) {
      console.error('[PlatformAlertRouteHealthPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load route health.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Route Health"
        description="Dead-man and manual test outcomes for alert routes."
      />
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="me-1.5 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_1fr] gap-3 border-b border-border bg-surface-secondary px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary max-lg:hidden">
          <span>Route</span>
          <span>Result</span>
          <span>Trigger</span>
          <span>Latency</span>
          <span>Ran at</span>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : checks.length === 0 ? (
          <div className="px-4 py-10 text-sm text-text-secondary">No route health checks yet.</div>
        ) : (
          checks.map((check) => (
            <div
              key={check.id}
              className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_1fr] lg:items-center"
            >
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {check.route.display_name}
                </p>
                <p className="text-xs text-text-tertiary">
                  {check.route.channel.name} · {check.route.channel.type}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-primary">
                {check.success ? (
                  <CheckCircle2 className="h-4 w-4 text-success-text" />
                ) : (
                  <XCircle className="h-4 w-4 text-danger-text" />
                )}
                {check.success ? 'OK' : 'Failed'}
              </span>
              <span className="text-sm text-text-secondary">{check.triggered_by}</span>
              <span className="font-mono text-xs text-text-secondary">
                {check.latency_ms === null ? '-' : `${check.latency_ms}ms`}
              </span>
              <span className="text-sm text-text-secondary">
                {new Date(check.ran_at).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
