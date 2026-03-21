'use client';

import type { InvoiceStatus } from '@school/shared';
import { StatusBadge } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';


const statusVariantMap: Record<
  InvoiceStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  draft: 'neutral',
  pending_approval: 'warning',
  issued: 'info',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'danger',
  void: 'neutral',
  cancelled: 'neutral',
  written_off: 'info',
};

const statusLabelMap: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  issued: 'Issued',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  cancelled: 'Cancelled',
  written_off: 'Written Off',
};

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

export function InvoiceStatusBadge({ status, className }: InvoiceStatusBadgeProps) {
  const t = useTranslations('finance');

  const label = t(`invoiceStatus.${status}`, { defaultValue: statusLabelMap[status] });

  return (
    <StatusBadge status={statusVariantMap[status]} dot className={className}>
      {label}
    </StatusBadge>
  );
}
