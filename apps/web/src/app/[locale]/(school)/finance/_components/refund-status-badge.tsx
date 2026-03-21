'use client';

import type { RefundStatus } from '@school/shared';
import { StatusBadge } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';


const statusVariantMap: Record<
  RefundStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  pending_approval: 'warning',
  approved: 'info',
  executed: 'success',
  failed: 'danger',
  rejected: 'neutral',
};

const statusLabelMap: Record<RefundStatus, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  executed: 'Executed',
  failed: 'Failed',
  rejected: 'Rejected',
};

interface RefundStatusBadgeProps {
  status: RefundStatus;
  className?: string;
}

export function RefundStatusBadge({ status, className }: RefundStatusBadgeProps) {
  const t = useTranslations('finance');

  const label = t(`refundStatus.${status}`, { defaultValue: statusLabelMap[status] });

  return (
    <StatusBadge status={statusVariantMap[status]} dot className={className}>
      {label}
    </StatusBadge>
  );
}
