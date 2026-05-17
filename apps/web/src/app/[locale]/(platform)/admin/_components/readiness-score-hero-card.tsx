'use client';

import { ArrowRight, Gauge, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button, Skeleton, cn, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

export type ReadinessDimension =
  | 'synthetic_journeys'
  | 'alert_route_health'
  | 'evidence_freshness'
  | 'backup_readiness'
  | 'sentry_intake'
  | 'queue_canary'
  | 'deploy_event_freshness'
  | 'unresolved_critical_incidents'
  | 'certificate_expiry'
  | 'external_dependency_status';

export interface ReadinessBreakdownRow {
  dimension: ReadinessDimension;
  enabled: boolean;
  label: string;
  reason?: string;
  value: number;
  weight: number;
  weighted_contribution: number;
}

export interface ReadinessScoreResult {
  breakdown: ReadinessBreakdownRow[];
  computed_at: string;
  reasons: string[];
  score: number;
  weights_sum: number;
  worst_dimension: ReadinessDimension | null;
  worst_dimension_value: number | null;
}

interface ReadinessScoreHeroCardProps {
  className?: string;
  href?: string;
  initial?: ReadinessScoreResult | null;
  onLoaded?: (result: ReadinessScoreResult) => void;
  size?: 'compact' | 'large';
}

export function ReadinessScoreHeroCard({
  className,
  href,
  initial = null,
  onLoaded,
  size = 'compact',
}: ReadinessScoreHeroCardProps) {
  const [result, setResult] = React.useState<ReadinessScoreResult | null>(initial);
  const [loading, setLoading] = React.useState(!initial);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const next = await apiClient<ReadinessScoreResult>('/api/v1/admin/readiness-score');
      setResult(next);
      onLoaded?.(next);
    } catch (err: unknown) {
      console.error('[ReadinessScoreHeroCard.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load readiness score.'));
    } finally {
      setLoading(false);
    }
  }, [onLoaded]);

  React.useEffect(() => {
    if (!initial) {
      void load();
    }
  }, [initial, load]);

  if (loading && !result) {
    return <Skeleton className={cn('h-56 rounded-lg', className)} />;
  }

  const status = scoreStatus(result?.score ?? 0);
  const reasons = result?.reasons.length
    ? result.reasons.slice(0, 3)
    : ['No readiness reasons available yet. Missing source data counts as zero.'];

  return (
    <section className={cn('rounded-lg border p-5 shadow-sm', heroClasses(status), className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
            <Gauge className="h-4 w-4" />
            Readiness Score
          </div>
          <div className="mt-4 flex items-end gap-2">
            <span
              className={cn(
                'font-semibold leading-none text-text-primary',
                size === 'large' ? 'text-6xl' : 'text-5xl',
              )}
            >
              {Math.round(result?.score ?? 0)}
            </span>
            <span className="pb-1 text-lg font-semibold text-text-secondary">/ 100</span>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            {result?.worst_dimension
              ? `Worst dimension: ${labelFromDimension(result.worst_dimension)} (${Math.round(
                  result.worst_dimension_value ?? 0,
                )}/100)`
              : 'No enabled readiness dimensions are reporting yet.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="me-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          {href ? (
            <Button asChild size="sm">
              <Link href={href}>
                View dimensions
                <ArrowRight className="ms-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {reasons.map((reason) => (
          <div
            key={reason}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-secondary"
          >
            {reason}
          </div>
        ))}
      </div>
    </section>
  );
}

function scoreStatus(score: number): 'green' | 'amber' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 40) return 'amber';
  return 'red';
}

function heroClasses(status: 'green' | 'amber' | 'red'): string {
  if (status === 'green') return 'border-success-text bg-success-bg';
  if (status === 'amber') return 'border-warning-text bg-warning-bg';
  return 'border-danger-text bg-danger-bg';
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
