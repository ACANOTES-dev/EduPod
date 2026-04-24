'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { StatusBadge } from '@school/ui';

interface VettingExpiryBadgeProps {
  daysRemaining: number;
}

export function VettingExpiryBadge({ daysRemaining }: VettingExpiryBadgeProps) {
  const t = useTranslations('regulatory.safeguarding.staffVetting');

  if (daysRemaining < 0) {
    return (
      <StatusBadge status="danger" dot>
        {t('overdueBy', { days: Math.abs(daysRemaining) })}
      </StatusBadge>
    );
  }
  if (daysRemaining <= 30) {
    return (
      <StatusBadge status="danger" dot>
        {t('daysRemaining', { days: daysRemaining })}
      </StatusBadge>
    );
  }
  if (daysRemaining <= 60) {
    return (
      <StatusBadge status="warning" dot>
        {t('daysRemaining', { days: daysRemaining })}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge status="success" dot>
      {t('daysRemaining', { days: daysRemaining })}
    </StatusBadge>
  );
}
