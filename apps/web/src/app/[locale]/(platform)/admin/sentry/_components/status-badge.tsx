import { cn } from '@school/ui';

export function SentryStateBadge({ state }: { state: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
        state === 'unresolved' && 'bg-danger-bg text-danger-text',
        state === 'resolved' && 'bg-success-bg text-success-text',
        state === 'ignored' && 'bg-warning-bg text-warning-text',
        state === 'archived' && 'bg-surface-hover text-text-secondary',
      )}
    >
      {state}
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
