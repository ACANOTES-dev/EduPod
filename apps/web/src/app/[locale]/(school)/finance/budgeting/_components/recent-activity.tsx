'use client';

import { Compass, LineChart } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Skeleton } from '@school/ui';

export type RecentActivityItem =
  | {
      kind: 'model';
      id: string;
      name: string;
      status: 'draft' | 'published' | 'archived';
      updated_at: string;
      fiscal_year_start: string;
    }
  | {
      kind: 'event';
      id: string;
      name: string;
      status: 'draft' | 'confirmed' | 'fees_generated' | 'completed' | 'cancelled';
      updated_at: string;
      event_date: string | null;
    };

interface Props {
  items: RecentActivityItem[] | null;
  isLoading: boolean;
  locale: string;
}

export function RecentActivity({ items, isLoading, locale }: Props) {
  const t = useTranslations('financeBudgeting.recent');

  if (isLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">{t('empty')}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/${locale}/finance/budgeting/models/new`}
            className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            {t('emptyCtaModel')}
          </Link>
          <Link
            href={`/${locale}/finance/budgeting/events/new`}
            className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
          >
            {t('emptyCtaEvent')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex min-w-0 flex-col gap-2">
      {items.map((item) => {
        const Icon = item.kind === 'model' ? LineChart : Compass;
        const href =
          item.kind === 'model'
            ? `/${locale}/finance/budgeting/models/${item.id}`
            : `/${locale}/finance/budgeting/events/${item.id}`;
        const label = item.kind === 'model' ? t('modelLabel') : t('eventLabel');

        return (
          <li key={`${item.kind}-${item.id}`} className="min-w-0">
            <Link
              href={href}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface p-3 text-start transition-colors hover:border-primary-300 hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  item.kind === 'model'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-tertiary">
                  {label}
                </span>
                <span className="truncate text-sm font-medium text-text-primary">{item.name}</span>
              </span>
              <Badge variant="secondary" className="shrink-0">
                {item.status}
              </Badge>
              <span className="hidden shrink-0 text-xs text-text-tertiary sm:inline">
                {formatRelativeTime(item.updated_at, locale)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Lightweight "X minutes ago" helper. Uses `Intl.RelativeTimeFormat` for
 * locale-aware output. Falls back to a simple "today" / "yesterday" /
 * "X days ago" string for past dates.
 */
function formatRelativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = then - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  const diffHour = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMonth = Math.round(diffDay / 30);
  return rtf.format(diffMonth, 'month');
}
