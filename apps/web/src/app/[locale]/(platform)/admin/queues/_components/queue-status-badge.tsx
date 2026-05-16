import { Activity, CheckCircle2, CirclePause, Clock, Timer, XCircle } from 'lucide-react';

import { cn } from '@school/ui';

const STATUS_STYLES: Record<string, { className: string; icon: typeof Clock; label: string }> = {
  active: {
    className: 'bg-success-fill text-success-text',
    icon: Activity,
    label: 'Active',
  },
  completed: {
    className: 'bg-surface-secondary text-text-secondary',
    icon: CheckCircle2,
    label: 'Completed',
  },
  delayed: {
    className: 'bg-warning-fill text-warning-text',
    icon: Timer,
    label: 'Delayed',
  },
  failed: {
    className: 'bg-danger-fill text-danger-text',
    icon: XCircle,
    label: 'Failed',
  },
  paused: {
    className: 'bg-surface-secondary text-text-tertiary',
    icon: CirclePause,
    label: 'Paused',
  },
  waiting: {
    className: 'bg-info-fill text-info-text',
    icon: Clock,
    label: 'Waiting',
  },
};

export function QueueStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? {
    className: 'bg-info-fill text-info-text',
    icon: Clock,
    label: 'Waiting',
  };
  const Icon = style.icon;

  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold',
        style.className,
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'active' && 'animate-pulse')} />
      {style.label}
    </span>
  );
}
