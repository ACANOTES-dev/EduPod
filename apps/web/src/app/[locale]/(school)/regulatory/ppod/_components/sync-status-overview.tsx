'use client';

import { StatCard } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { formatDate } from '@/lib/format-date';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncStatusOverviewProps {
  total: number;
  synced: number;
  pending: number;
  changed: number;
  errors: number;
  lastSyncAt: string | null;
  isLoading: boolean;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface-secondary p-5">
      <div className="h-3 w-20 rounded bg-border" />
      <div className="mt-3 h-7 w-16 rounded bg-border" />
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SyncStatusOverview({
  total,
  synced,
  pending,
  changed,
  errors,
  lastSyncAt,
  isLoading,
}: SyncStatusOverviewProps) {
  const t = useTranslations('regulatory');

  if (isLoading) {
    return (
      <div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="mt-3">
          <div className="h-3 w-40 animate-pulse rounded bg-border" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={t('ppod.totalStudents')}
          value={total}
        />
        <StatCard
          label={t('ppod.synced')}
          value={synced}
          trend={
            synced > 0
              ? { direction: 'up', label: t('ppod.upToDate') }
              : undefined
          }
        />
        <StatCard
          label={t('ppod.pending')}
          value={pending}
          trend={
            pending > 0
              ? { direction: 'neutral', label: t('ppod.awaitingSync') }
              : undefined
          }
        />
        <StatCard
          label={t('ppod.changed')}
          value={changed}
          trend={
            changed > 0
              ? { direction: 'neutral', label: t('ppod.needsReview') }
              : undefined
          }
        />
        <StatCard
          label={t('ppod.errors')}
          value={errors}
          trend={
            errors > 0
              ? { direction: 'down', label: t('ppod.requiresAttention') }
              : undefined
          }
        />
      </div>
      <p className="mt-3 text-xs text-text-tertiary">
        {lastSyncAt
          ? `${t('ppod.lastSync')}: ${formatDate(lastSyncAt, 'DD-MM-YYYY')}`
          : t('ppod.neverSynced')}
      </p>
    </div>
  );
}
