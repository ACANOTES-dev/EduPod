import { cn } from '@school/ui';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'fired' | 'acknowledged' | 'resolved';

const SEVERITY_CLASSES: Record<AlertSeverity, string> = {
  critical: 'border-danger-dot/30 bg-danger-fill/15 text-danger-text',
  info: 'border-info-dot/30 bg-info-fill/15 text-info-text',
  warning: 'border-warning-dot/30 bg-warning-fill/15 text-warning-text',
};

const STATUS_CLASSES: Record<AlertStatus, string> = {
  acknowledged: 'border-warning-dot/30 bg-warning-fill/15 text-warning-text',
  fired: 'border-danger-dot/30 bg-danger-fill/15 text-danger-text',
  resolved: 'border-success-text/30 bg-success-fill/15 text-success-text',
};

interface AlertSeverityBadgeProps {
  severity: AlertSeverity;
}

interface AlertStatusBadgeProps {
  status: AlertStatus;
}

export function AlertSeverityBadge({ severity }: AlertSeverityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-semibold uppercase',
        SEVERITY_CLASSES[severity],
      )}
    >
      {severity}
    </span>
  );
}

export function AlertStatusBadge({ status }: AlertStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-semibold uppercase',
        STATUS_CLASSES[status],
      )}
    >
      {status}
    </span>
  );
}
