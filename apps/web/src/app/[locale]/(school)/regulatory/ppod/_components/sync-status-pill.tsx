'use client';

import { Clock, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@school/ui';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SyncStatusPillProps {
  lastSyncAt: string | null;
  isLoading?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns a short ISO-free relative string like "2h ago" or "3d ago". */
function relativeFromNow(iso: string): { value: number; unit: 'm' | 'h' | 'd' } {
  const then = new Date(iso).getTime();
  const nowMs = Date.now();
  const diffSeconds = Math.max(0, Math.floor((nowMs - then) / 1000));

  if (diffSeconds < 3600) {
    return { value: Math.max(1, Math.floor(diffSeconds / 60)), unit: 'm' };
  }
  if (diffSeconds < 86_400) {
    return { value: Math.floor(diffSeconds / 3600), unit: 'h' };
  }
  return { value: Math.floor(diffSeconds / 86_400), unit: 'd' };
}

// ─── Sync Status Pill ───────────────────────────────────────────────────────

export function SyncStatusPill({ lastSyncAt, isLoading }: SyncStatusPillProps) {
  const t = useTranslations('regulatory.ppod');

  if (isLoading) {
    return (
      <span className="inline-flex h-9 w-32 animate-pulse items-center rounded-full bg-border/60" />
    );
  }

  if (!lastSyncAt) {
    return (
      <span
        className={cn(
          'inline-flex min-h-[36px] items-center gap-2 rounded-full border border-border bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-tertiary',
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        {t('kpi.never')}
      </span>
    );
  }

  const { value, unit } = relativeFromNow(lastSyncAt);
  const relativeLabel =
    unit === 'm'
      ? t('relative.minutesAgo', { count: value })
      : unit === 'h'
        ? t('relative.hoursAgo', { count: value })
        : t('relative.daysAgo', { count: value });

  const tone = unit === 'd' && value >= 7 ? 'stale' : 'fresh';

  return (
    <span
      className={cn(
        'inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
        tone === 'fresh'
          ? 'border-teal-200 bg-teal-50 text-teal-800'
          : 'border-warning-200 bg-warning-50 text-warning-800',
      )}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      <span>
        {t('pill.lastSync')} · {relativeLabel}
      </span>
    </span>
  );
}
