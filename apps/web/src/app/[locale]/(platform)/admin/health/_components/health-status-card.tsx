'use client';

import { cn } from '@school/ui';

import { LatencySparkline } from './latency-sparkline';

interface HealthStatusCardProps {
  name: string;
  status: 'up' | 'down';
  latencyMs?: number;
  stuckJobs?: number;
  freeGb?: number;
  totalGb?: number;
  sparklineData: number[];
}

function formatMetric({
  latencyMs,
  stuckJobs,
  freeGb,
  totalGb,
}: Pick<HealthStatusCardProps, 'latencyMs' | 'stuckJobs' | 'freeGb' | 'totalGb'>): string {
  if (typeof latencyMs === 'number') {
    return `${latencyMs} ms`;
  }
  if (typeof stuckJobs === 'number') {
    return `${stuckJobs} stuck job${stuckJobs === 1 ? '' : 's'}`;
  }
  if (typeof freeGb === 'number' && typeof totalGb === 'number') {
    return `${freeGb} GB free / ${totalGb} GB`;
  }
  return 'No metric';
}

export function HealthStatusCard({
  name,
  status,
  latencyMs,
  stuckJobs,
  freeGb,
  totalGb,
  sparklineData,
}: HealthStatusCardProps) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-text-primary">{name}</h2>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {formatMetric({ latencyMs, stuckJobs, freeGb, totalGb })}
          </p>
        </div>
        <span
          className={cn(
            'mt-1 h-3 w-3 shrink-0 rounded-full',
            status === 'up' ? 'bg-success-fill' : 'bg-danger-dot',
          )}
          aria-label={`${name} is ${status}`}
          role="status"
        />
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-text-tertiary">
        Status: {status}
      </p>
      <div className="mt-4">
        <LatencySparkline data={sparklineData} />
      </div>
    </article>
  );
}
