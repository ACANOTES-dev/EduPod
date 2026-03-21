'use client';

import type { PaymentStatus } from '@school/shared';
import { StatusBadge } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';


const statusVariantMap: Record<
  PaymentStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  pending: 'warning',
  posted: 'success',
  failed: 'danger',
  voided: 'neutral',
  refunded_partial: 'info',
  refunded_full: 'info',
};

const statusLabelMap: Record<PaymentStatus, string> = {
  pending: 'Pending',
  posted: 'Posted',
  failed: 'Failed',
  voided: 'Voided',
  refunded_partial: 'Partially Refunded',
  refunded_full: 'Fully Refunded',
};

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  className?: string;
}

export function PaymentStatusBadge({ status, className }: PaymentStatusBadgeProps) {
  const t = useTranslations('finance');

  const label = t(`paymentStatus.${status}`, { defaultValue: statusLabelMap[status] });

  return (
    <StatusBadge status={statusVariantMap[status]} dot className={className}>
      {label}
    </StatusBadge>
  );
}
