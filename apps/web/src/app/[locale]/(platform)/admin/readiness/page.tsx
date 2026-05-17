'use client';

import { RefreshCw, Save } from 'lucide-react';
import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, Input, Skeleton, Switch, cn, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { OwnerActionConfirmDialog } from '@/components/platform/owner-action-confirm-dialog';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import {
  ReadinessScoreHeroCard,
  type ReadinessBreakdownRow,
  type ReadinessDimension,
  type ReadinessScoreResult,
} from '../_components/readiness-score-hero-card';

interface ReadinessSnapshot {
  breakdown: ReadinessBreakdownRow[];
  id: string;
  reasons: string[];
  score: number;
  snapshot_at: string;
  weights_snapshot: Array<{ dimension: ReadinessDimension; enabled: boolean; weight: number }>;
  worst_dimension: ReadinessDimension | null;
  worst_dimension_value: number | null;
}

interface DraftWeight {
  enabled: boolean;
  weight: string;
}

export default function PlatformReadinessPage() {
  const { user } = useAuth();
  const canManage = (user?.platform_permissions ?? []).includes('platform.readiness.manage');
  const [current, setCurrent] = React.useState<ReadinessScoreResult | null>(null);
  const [history, setHistory] = React.useState<ReadinessSnapshot[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, DraftWeight>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [score, snapshots] = await Promise.all([
        apiClient<ReadinessScoreResult>('/api/v1/admin/readiness-score'),
        apiClient<ReadinessSnapshot[]>('/api/v1/admin/readiness-score/history'),
      ]);
      setCurrent(score);
      setHistory(snapshots);
      setDrafts(
        Object.fromEntries(
          score.breakdown.map((row) => [
            row.dimension,
            { enabled: row.enabled, weight: String(row.weight) },
          ]),
        ),
      );
    } catch (err: unknown) {
      console.error('[PlatformReadinessPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load readiness score.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function saveDimension(row: ReadinessBreakdownRow, ownerConfirmationId?: string) {
    const draft = drafts[row.dimension];
    if (!draft) return;
    const nextWeight = Number(draft.weight);
    if (!Number.isFinite(nextWeight) || nextWeight < 0 || nextWeight > 100) {
      toast.error('Weight must be between 0 and 100.');
      return;
    }
    try {
      setSaving(row.dimension);
      await apiClient(`/api/v1/admin/readiness-score/dimensions/${row.dimension}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: draft.enabled,
          owner_confirmation_id: ownerConfirmationId,
          weight: nextWeight,
        }),
      });
      toast.success('Readiness weight saved.');
      await load();
    } catch (err: unknown) {
      console.error('[PlatformReadinessPage.saveDimension]', err);
      toast.error(getErrorMessage(err, 'Failed to save readiness weight.'));
    } finally {
      setSaving(null);
    }
  }

  const sortedBreakdown = [...(current?.breakdown ?? [])].sort(
    (a, b) => a.weighted_contribution - b.weighted_contribution || a.value - b.value,
  );

  return (
    <div className="min-w-0 space-y-6 pb-10">
      <PageHeader
        title="Readiness Score"
        description="A deterministic operations-confidence score built from alert routes, evidence freshness, backups, Sentry intake, synthetic checks, deploy events, certificates, and active critical incidents."
        actions={
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="me-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      <ReadinessScoreHeroCard initial={current} onLoaded={setCurrent} size="large" />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">90-day trend</h2>
                <p className="text-xs text-text-secondary">
                  Daily snapshots are written at 00:05 UTC and never emit alerts.
                </p>
              </div>
              <span className="text-xs text-text-tertiary">{history.length} snapshots</span>
            </div>
            {loading ? (
              <Skeleton className="h-72 rounded-lg" />
            ) : history.length === 0 ? (
              <div className="flex h-72 items-center justify-center rounded-lg bg-surface-secondary text-sm text-text-secondary">
                No daily readiness snapshots have been recorded yet.
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer height="100%" width="100%">
                  <AreaChart data={history.map(snapshotToChartPoint)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area
                      dataKey="score"
                      fill="var(--primary-500)"
                      fillOpacity={0.18}
                      stroke="var(--primary-600)"
                      strokeWidth={2}
                      type="monotone"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text-primary">Dimension breakdown</h2>
              <p className="text-xs text-text-secondary">
                Missing source data is scored as zero so silent pipelines cannot inflate the total.
              </p>
            </div>
            {loading ? (
              <div className="p-4">
                <Skeleton className="h-64 rounded-lg" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-surface-secondary text-xs uppercase tracking-wide text-text-tertiary">
                    <tr>
                      <th className="px-4 py-3 text-start">Dimension</th>
                      <th className="px-4 py-3 text-start">Value</th>
                      <th className="px-4 py-3 text-start">Weight</th>
                      <th className="px-4 py-3 text-start">Contribution</th>
                      <th className="px-4 py-3 text-start">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBreakdown.map((row) => (
                      <tr key={row.dimension} className="border-t border-border">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-text-primary">{row.label}</p>
                          <p className="font-mono text-xs text-text-tertiary">{row.dimension}</p>
                        </td>
                        <td className="px-4 py-3">
                          <ScorePill score={row.value} />
                        </td>
                        <td className="px-4 py-3">{row.enabled ? row.weight : 'disabled'}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {row.weighted_contribution.toFixed(2)}
                        </td>
                        <td className="max-w-lg px-4 py-3 text-text-secondary">
                          {row.reason ?? 'No current reason.'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Worst dimension</h2>
            <p className="mt-2 text-sm text-text-secondary">
              {current?.worst_dimension
                ? `${labelFromDimension(current.worst_dimension)} is currently ${Math.round(
                    current.worst_dimension_value ?? 0,
                  )}/100.`
                : 'No enabled readiness dimension has produced a score yet.'}
            </p>
          </section>

          {canManage ? (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold text-text-primary">Weight editor</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Changes over 10 points require owner confirmation and every change is audited.
              </p>
              <div className="mt-4 space-y-3">
                {(current?.breakdown ?? []).map((row) => {
                  const draft = drafts[row.dimension] ?? {
                    enabled: row.enabled,
                    weight: String(row.weight),
                  };
                  const nextWeight = Number(draft.weight);
                  const requiresConfirmation =
                    Number.isFinite(nextWeight) && Math.abs(nextWeight - row.weight) > 10;
                  return (
                    <div key={row.dimension} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary">
                            {row.label}
                          </p>
                          <p className="font-mono text-xs text-text-tertiary">
                            current {row.weight}
                          </p>
                        </div>
                        <Switch
                          checked={draft.enabled}
                          onCheckedChange={(checked) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.dimension]: { ...draft, enabled: checked },
                            }))
                          }
                        />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Input
                          aria-label={`${row.label} weight`}
                          className="w-24"
                          inputMode="decimal"
                          value={draft.weight}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.dimension]: { ...draft, weight: event.target.value },
                            }))
                          }
                        />
                        {requiresConfirmation ? (
                          <OwnerActionConfirmDialog
                            action="readiness_weight_updated"
                            confirmationPhrase={`UPDATE ${row.dimension}`}
                            payload={{
                              dimension: row.dimension,
                              enabled: draft.enabled,
                              from_weight: row.weight,
                              to_weight: nextWeight,
                            }}
                            summary={`Confirm changing ${row.label} from ${row.weight} to ${nextWeight}.`}
                            targetLabel={row.label}
                            targetResourceId={row.dimension}
                            targetResourceType="readiness_dimension_weight"
                            title="Confirm readiness weight change"
                            onExecuted={(result) => saveDimension(row, result.confirmation_id)}
                          >
                            <Button size="sm" type="button" disabled={saving === row.dimension}>
                              <Save className="me-1.5 h-3.5 w-3.5" />
                              Save
                            </Button>
                          </OwnerActionConfirmDialog>
                        ) : (
                          <Button
                            size="sm"
                            type="button"
                            disabled={saving === row.dimension}
                            onClick={() => void saveDimension(row)}
                          >
                            <Save className="me-1.5 h-3.5 w-3.5" />
                            Save
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
              Weight editing is available to platform owners only.
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', scoreClasses(score))}>
      {Math.round(score)}
    </span>
  );
}

function scoreClasses(score: number): string {
  if (score >= 80) return 'bg-success-bg text-success-text';
  if (score >= 40) return 'bg-warning-bg text-warning-text';
  return 'bg-danger-bg text-danger-text';
}

function snapshotToChartPoint(snapshot: ReadinessSnapshot) {
  return {
    date: new Date(snapshot.snapshot_at).toLocaleDateString('en-IE', {
      day: '2-digit',
      month: 'short',
    }),
    score: Math.round(snapshot.score * 100) / 100,
  };
}

function labelFromDimension(dimension: string): string {
  return dimension
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
