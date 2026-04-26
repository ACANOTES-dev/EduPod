'use client';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

interface Props {
  onTrigger: () => void | Promise<void>;
  isRefreshing: boolean;
  refreshedAt: string | null;
  locale: string;
  disabled?: boolean;
}

export function RefreshButton({ onTrigger, isRefreshing, refreshedAt, locale, disabled }: Props) {
  const t = useTranslations('financeBudgetingVariance.refresh');

  const relative = React.useMemo(() => {
    if (!refreshedAt) return null;
    return formatRelative(refreshedAt, locale);
  }, [refreshedAt, locale]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        onClick={() => void onTrigger()}
        disabled={disabled || isRefreshing}
        className="inline-flex items-center gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        <span className="hidden sm:inline">{isRefreshing ? t('refreshing') : t('label')}</span>
      </Button>
      <span className="text-xs text-text-tertiary">
        {refreshedAt ? t('ago', { time: relative ?? '' }) : t('neverRefreshed')}
      </span>
    </div>
  );
}

/**
 * Light wrapper around `Intl.RelativeTimeFormat`. Picks the largest
 * unit that still produces a non-zero value so "Refreshed 3 hours ago"
 * reads naturally instead of "Refreshed 10800 seconds ago".
 */
function formatRelative(iso: string, locale: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '';
  const diffSec = Math.round((target - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return formatter.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return formatter.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return formatter.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  return formatter.format(diffDay, 'day');
}
