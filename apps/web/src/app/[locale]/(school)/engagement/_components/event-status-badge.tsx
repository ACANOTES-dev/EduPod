'use client';

import { StatusBadge } from '@school/ui';

import { humanizeStatus, type EngagementEventStatus } from './engagement-types';

const EVENT_STATUS_VARIANTS: Record<
  EngagementEventStatus,
  'success' | 'warning' | 'danger' | 'neutral' | 'info'
> = {
  draft: 'warning',
  published: 'info',
  open: 'success',
  closed: 'neutral',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'danger',
  archived: 'neutral',
};

interface EventStatusBadgeProps {
  status: EngagementEventStatus;
  label?: string;
}

export function EventStatusBadge({ status, label }: EventStatusBadgeProps) {
  return (
    <StatusBadge status={EVENT_STATUS_VARIANTS[status]} dot>
      {label ?? humanizeStatus(status)}
    </StatusBadge>
  );
}
