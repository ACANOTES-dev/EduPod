'use client';

import { Activity, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import { cn } from '@school/ui';

type OverallStatus = 'healthy' | 'degraded' | 'unhealthy' | null;

interface OverallStatusBannerProps {
  status: OverallStatus;
  uptime: number;
  connected: boolean;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function OverallStatusBanner({ status, uptime, connected }: OverallStatusBannerProps) {
  const Icon =
    status === 'healthy'
      ? CheckCircle2
      : status === 'degraded'
        ? AlertTriangle
        : status === 'unhealthy'
          ? XCircle
          : Activity;

  return (
    <section
      className={cn(
        'rounded-lg border p-4',
        status === 'healthy' && 'border-success-fill/30 bg-success-fill/10 text-success-text',
        status === 'degraded' && 'border-warning-fill/30 bg-warning-fill/10 text-warning-text',
        status === 'unhealthy' && 'border-danger-fill/30 bg-danger-fill/10 text-danger-text',
        status === null && 'border-border bg-surface text-text-secondary',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide">
              {status ? status : 'loading'}
            </p>
            <p className="mt-1 text-sm">API uptime {formatUptime(uptime)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
          <span
            className={cn('h-2 w-2 rounded-full', connected ? 'bg-success-fill' : 'bg-danger-dot')}
          />
          {connected ? 'Real-time connected' : 'Real-time disconnected'}
        </div>
      </div>
    </section>
  );
}
