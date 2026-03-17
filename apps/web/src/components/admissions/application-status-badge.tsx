'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge } from '@school/ui';

type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'pending_acceptance_approval'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_VARIANT_MAP: Record<ApplicationStatus, BadgeVariant> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'warning',
  pending_acceptance_approval: 'warning',
  accepted: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

const STATUS_LABEL_KEY_MAP: Record<ApplicationStatus, string> = {
  draft: 'draft',
  submitted: 'submitted',
  under_review: 'underReview',
  pending_acceptance_approval: 'pendingApproval',
  accepted: 'accepted',
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
