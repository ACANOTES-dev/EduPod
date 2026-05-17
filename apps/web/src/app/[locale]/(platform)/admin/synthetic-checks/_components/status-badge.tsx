import { cn } from '@school/ui';

import type { SyntheticCheckResultStatus } from './types';

const STATUS_LABELS: Record<SyntheticCheckResultStatus, string> = {
  degraded: 'Degraded',
  error: 'Error',
  failed: 'Failed',
  passed: 'Passed',
  skipped_maintenance: 'Skipped',
};

export function SyntheticStatusBadge({ status }: { status: SyntheticCheckResultStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
        status === 'passed' && 'bg-success-bg text-success-text',
        status === 'degraded' && 'bg-warning-bg text-warning-text',
        status === 'skipped_maintenance' && 'bg-primary-50 text-primary-700',
        (status === 'failed' || status === 'error') && 'bg-danger-bg text-danger-text',
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
