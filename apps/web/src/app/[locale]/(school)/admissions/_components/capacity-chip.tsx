'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@school/ui';

export interface CapacitySummary {
  total: number;
  enrolled: number;
  conditional: number;
  available: number;
  configured: boolean;
}

interface CapacityChipProps {
  capacity: CapacitySummary | null;
  yearGroupName: string;
}

export function CapacityChip({ capacity, yearGroupName }: CapacityChipProps) {
  const t = useTranslations('admissionsQueues');

  if (!capacity || !capacity.configured) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary"
        title={t('capacity.notConfigured')}
      >
        {yearGroupName} — {t('capacity.notConfigured')}
      </span>
    );
  }

  const tone =
    capacity.available === 0
      ? 'border-danger-500/40 bg-danger-500/10 text-danger-700'
      : capacity.available <= 2
        ? 'border-warning-500/40 bg-warning-500/10 text-warning-700'
        : 'border-success-500/40 bg-success-500/10 text-success-700';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        tone,
      )}
      title={t('capacity.tooltip', {
        total: capacity.total,
        enrolled: capacity.enrolled,
        conditional: capacity.conditional,
        available: capacity.available,
      })}
    >
      <span className="font-semibold">{yearGroupName}</span>
      <span aria-hidden>·</span>
      <span>
        {capacity.enrolled}/{capacity.total} {t('capacity.enrolledShort')}
      </span>
      <span aria-hidden>·</span>
      <span>
        {capacity.conditional} {t('capacity.conditionalShort')}
      </span>
      <span aria-hidden>·</span>
      <span className="font-semibold">
        {capacity.available} {t('capacity.freeShort')}
      </span>
    </span>
  );
}
