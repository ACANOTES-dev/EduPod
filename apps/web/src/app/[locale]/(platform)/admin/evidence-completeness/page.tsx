'use client';

import { RefreshCw, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { Button, Skeleton, cn, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

type PipelineStatus = 'fresh' | 'lagging' | 'stale' | 'silent' | 'unknown';

interface EvidencePipelineStatus {
  breach_count: number;
  lag_seconds: number | null;
  last_check_at: string | null;
  last_seen_at: string | null;
  last_status_change_at: string | null;
  status: PipelineStatus;
}

interface EvidencePipeline {
  alert_severity_lagging: string;
  alert_severity_silent: string;
  display_name: string;
  enabled: boolean;
  expected_interval_seconds: number;
  id: string;
  is_seeded: boolean;
  key: string;
  lagging_threshold_seconds: number;
  related_component: string | null;
  silent_threshold_seconds: number;
  stale_threshold_seconds: number;
  status: EvidencePipelineStatus | null;
}

interface UptimeReconciliation {
  detected_at: string;
  disagreement_streak: number;
  external_monitor_name: string;
  external_status: string;
  external_target: string;
  id: string;
  in_disagreement: boolean;
  internal_check_key: string;
  internal_status: string;
}

export default function EvidenceCompletenessPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [pipelines, setPipelines] = React.useState<EvidencePipeline[]>([]);
  const [reconciliations, setReconciliations] = React.useState<UptimeReconciliation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [runningKey, setRunningKey] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [pipelineRows, reconciliationRows] = await Promise.all([
        apiClient<EvidencePipeline[]>('/api/v1/admin/evidence-pipelines'),
        apiClient<UptimeReconciliation[]>('/api/v1/admin/uptime-reconciliations', {
          silent: true,
        }),
      ]);
      setPipelines(pipelineRows);
      setReconciliations(reconciliationRows);
    } catch (err: unknown) {
      console.error('[EvidenceCompletenessPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load evidence completeness.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function runCheck(key: string) {
    try {
      setRunningKey(key);
      await apiClient(`/api/v1/admin/evidence-pipelines/${encodeURIComponent(key)}/run-check-now`, {
        method: 'POST',
      });
      toast.success('Freshness check completed.');
      await load();
    } catch (err: unknown) {
      console.error('[EvidenceCompletenessPage.runCheck]', err);
      toast.error(getErrorMessage(err, 'Failed to run freshness check.'));
    } finally {
      setRunningKey(null);
    }
  }

  const counts = countStatuses(pipelines);
  const worst = worstStatus(pipelines.map((pipeline) => pipeline.status?.status ?? 'unknown'));

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Evidence Completeness"
        description="Freshness checks for the operational evidence pipelines behind alerts, Sentry, queues, deploys, runbooks, and Copilot context."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/${locale}/admin/uptime-reconciliations`}>Uptime Reconciliation</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="me-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <section className={cn('rounded-lg border p-4', bannerClasses(worst))}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">{summaryText(counts)}</p>
            <p className="mt-1 text-xs opacity-80">
              Silent pipelines are critical because they can make the platform look quiet when the
              evidence stream has actually stopped.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {(['fresh', 'lagging', 'stale', 'silent', 'unknown'] as const).map((status) => (
              <span key={status} className="rounded-full bg-surface px-2 py-1 text-text-secondary">
                {status}: {counts[status]}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-lg" />
          ))
        ) : pipelines.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
            No evidence pipelines are configured.
          </div>
        ) : (
          pipelines.map((pipeline) => (
            <article
              key={pipeline.id}
              className="rounded-lg border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FreshnessBadge status={pipeline.status?.status ?? 'unknown'} />
                    {pipeline.is_seeded ? (
                      <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs font-medium text-text-tertiary">
                        seeded
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-2 truncate text-base font-semibold text-text-primary">
                    {pipeline.display_name}
                  </h2>
                  <p className="mt-1 break-all font-mono text-xs text-text-tertiary">
                    {pipeline.key}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={runningKey === pipeline.key}
                  onClick={() => void runCheck(pipeline.key)}
                >
                  <RotateCw className="me-1.5 h-3.5 w-3.5" />
                  Run
                </Button>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <Metric label="Lag" value={humanizeSeconds(pipeline.status?.lag_seconds)} />
                <Metric
                  label="Expected"
                  value={humanizeSeconds(pipeline.expected_interval_seconds)}
                />
                <Metric
                  label="Last seen"
                  value={humanizeDate(pipeline.status?.last_seen_at ?? null)}
                />
                <Metric label="Breaches" value={String(pipeline.status?.breach_count ?? 0)} />
              </dl>
              <div className="mt-4 rounded-lg bg-surface-secondary p-3 text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">Thresholds:</span> lagging{' '}
                {humanizeSeconds(pipeline.lagging_threshold_seconds)}, stale{' '}
                {humanizeSeconds(pipeline.stale_threshold_seconds)}, silent{' '}
                {humanizeSeconds(pipeline.silent_threshold_seconds)}
              </div>
            </article>
          ))
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Active Uptime Disagreements</h2>
          <span className="text-xs text-text-tertiary">{reconciliations.length} active</span>
        </div>
        {reconciliations.length === 0 ? (
          <div className="px-4 py-8 text-sm text-text-secondary">
            No active internal-vs-external disagreements.
          </div>
        ) : (
          reconciliations.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 border-b border-border px-4 py-4 text-sm last:border-b-0 lg:grid-cols-[1fr_0.8fr_0.5fr_0.7fr]"
            >
              <div>
                <p className="font-semibold text-text-primary">{row.external_target}</p>
                <p className="text-xs text-text-tertiary">{row.external_monitor_name}</p>
              </div>
              <p className="text-text-secondary">
                external {row.external_status} / internal {row.internal_status}
              </p>
              <p className="font-mono text-xs text-text-tertiary">
                streak {row.disagreement_streak}
              </p>
              <p className="text-text-secondary">{new Date(row.detected_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-tertiary">{label}</dt>
      <dd className="mt-1 truncate font-mono text-xs text-text-primary">{value}</dd>
    </div>
  );
}

function FreshnessBadge({ status }: { status: PipelineStatus }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', badgeClasses(status))}>
      {status}
    </span>
  );
}

function countStatuses(pipelines: EvidencePipeline[]): Record<PipelineStatus, number> {
  return pipelines.reduce(
    (acc, pipeline) => {
      acc[pipeline.status?.status ?? 'unknown'] += 1;
      return acc;
    },
    { fresh: 0, lagging: 0, silent: 0, stale: 0, unknown: 0 },
  );
}

function worstStatus(statuses: PipelineStatus[]): PipelineStatus {
  if (statuses.includes('silent')) return 'silent';
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('lagging')) return 'lagging';
  if (statuses.includes('unknown')) return 'unknown';
  return 'fresh';
}

function summaryText(counts: Record<PipelineStatus, number>): string {
  if (counts.silent > 0) return `${counts.silent} evidence pipeline is silent.`;
  if (counts.stale > 0) return `${counts.stale} evidence pipeline is stale.`;
  if (counts.lagging > 0) return `${counts.lagging} evidence pipeline is lagging.`;
  if (counts.unknown > 0) return `${counts.unknown} evidence pipeline has unknown freshness.`;
  return 'All evidence pipelines are fresh.';
}

function badgeClasses(status: PipelineStatus): string {
  if (status === 'fresh') return 'bg-success-bg text-success-text';
  if (status === 'lagging' || status === 'stale') return 'bg-warning-bg text-warning-text';
  if (status === 'silent') return 'bg-danger-bg text-danger-text';
  return 'bg-surface-secondary text-text-tertiary';
}

function bannerClasses(status: PipelineStatus): string {
  if (status === 'silent') return 'border-danger-text bg-danger-bg text-danger-text';
  if (status === 'lagging' || status === 'stale') {
    return 'border-warning-200 bg-warning-bg text-warning-text';
  }
  return 'border-border bg-surface text-text-primary';
}

function humanizeDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'unknown';
}

function humanizeSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'unknown';
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.round(value / 60)}m`;
  if (value < 86_400) return `${Math.round(value / 3600)}h`;
  return `${Math.round(value / 86_400)}d`;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
