'use client';

import { CheckCircle2, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Button, Skeleton, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface UptimeReconciliation {
  acknowledged_at: string | null;
  detected_at: string;
  disagreement_streak: number;
  external_monitor_name: string;
  external_observed_at: string;
  external_status: string;
  external_target: string;
  id: string;
  in_disagreement: boolean;
  internal_check_key: string;
  internal_observed_at: string;
  internal_status: string;
}

export default function UptimeReconciliationsPage() {
  const [rows, setRows] = React.useState<UptimeReconciliation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showHistory, setShowHistory] = React.useState(false);
  const [acknowledgingId, setAcknowledgingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const search = new URLSearchParams({ active_only: String(!showHistory) });
      setRows(
        await apiClient<UptimeReconciliation[]>(
          `/api/v1/admin/uptime-reconciliations?${search.toString()}`,
        ),
      );
    } catch (err: unknown) {
      console.error('[UptimeReconciliationsPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load uptime reconciliations.'));
    } finally {
      setLoading(false);
    }
  }, [showHistory]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function acknowledge(id: string) {
    try {
      setAcknowledgingId(id);
      await apiClient(`/api/v1/admin/uptime-reconciliations/${id}/acknowledge`, {
        method: 'POST',
      });
      toast.success('Disagreement acknowledged.');
      await load();
    } catch (err: unknown) {
      console.error('[UptimeReconciliationsPage.acknowledge]', err);
      toast.error(getErrorMessage(err, 'Failed to acknowledge disagreement.'));
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Uptime Reconciliations"
        description="Internal synthetic-check state compared with UptimeRobot monitors when the external API key is configured."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={showHistory ? 'outline' : 'default'}
              onClick={() => setShowHistory(false)}
            >
              Active
            </Button>
            <Button
              size="sm"
              variant={showHistory ? 'default' : 'outline'}
              onClick={() => setShowHistory(true)}
            >
              History
            </Button>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="me-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-[1.1fr_0.7fr_0.7fr_0.5fr_0.7fr] gap-3 border-b border-border bg-surface-secondary px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary max-lg:hidden">
          <span>External target</span>
          <span>External</span>
          <span>Internal</span>
          <span>Streak</span>
          <span>Action</span>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-sm text-text-secondary">
            {showHistory
              ? 'No uptime reconciliation history yet.'
              : 'No active uptime disagreements.'}
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 border-b border-border px-4 py-4 text-sm last:border-b-0 lg:grid-cols-[1.1fr_0.7fr_0.7fr_0.5fr_0.7fr] lg:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-text-primary">{row.external_target}</p>
                <p className="text-xs text-text-tertiary">
                  {row.external_monitor_name} · detected{' '}
                  {new Date(row.detected_at).toLocaleString()}
                </p>
              </div>
              <StatusCell status={row.external_status} observedAt={row.external_observed_at} />
              <StatusCell status={row.internal_status} observedAt={row.internal_observed_at} />
              <span className="font-mono text-xs text-text-secondary">
                {row.disagreement_streak}
              </span>
              {row.acknowledged_at ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-text">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Acknowledged
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acknowledgingId === row.id}
                  onClick={() => void acknowledge(row.id)}
                >
                  Acknowledge
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatusCell({ observedAt, status }: { observedAt: string; status: string }) {
  return (
    <span className="text-text-secondary">
      <span className="font-semibold text-text-primary">{status}</span>
      <span className="block text-xs text-text-tertiary">
        {new Date(observedAt).toLocaleString()}
      </span>
    </span>
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
