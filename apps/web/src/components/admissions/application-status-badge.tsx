'use client';

import { useTranslations } from 'next-intl';

import type { ApplicationStatus } from '@school/shared';
import { StatusBadge } from '@school/ui';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_VARIANT_MAP: Record<ApplicationStatus, BadgeVariant> = {
  submitted: 'info',
  waiting_list: 'neutral',
  ready_to_admit: 'warning',
  conditional_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

const STATUS_LABEL_KEY_MAP: Record<ApplicationStatus, string> = {
  submitted: 'submitted',
  waiting_list: 'waitingList',
  ready_to_admit: 'readyToAdmit',
  conditional_approval: 'conditionalApproval',
  approved: 'approved',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
};

interface ApplicationStatusBadgeProps {
  status: string;
}

export function ApplicationStatusBadge({ status }: ApplicationStatusBadgeProps) {
  const t = useTranslations('admissions');

  const appStatus = status as ApplicationStatus;
  const variant = STATUS_VARIANT_MAP[appStatus] ?? 'neutral';
  const labelKey = STATUS_LABEL_KEY_MAP[appStatus] ?? status;

  return (
    <StatusBadge status={variant} dot>
      {t(labelKey)}
    </StatusBadge>
  );
}
