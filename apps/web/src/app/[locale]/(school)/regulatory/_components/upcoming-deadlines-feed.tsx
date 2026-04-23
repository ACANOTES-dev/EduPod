'use client';

import { ArrowRight, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { RegulatoryDashboardSummary } from '@school/shared/regulatory';

import { formatDate } from '@/lib/format-date';

// ─── Types ───────────────────────────────────────────────────────────────────

type NextDeadline = RegulatoryDashboardSummary['calendar']['next_deadlines'][number];

interface UpcomingDeadlinesFeedProps {
  items: NextDeadline[];
  isLoading: boolean;
}

// Calendar events land users on the regulatory calendar filtered by domain.
// Individual event pages don't exist yet — Phase 8 will wire deep links.
function hrefForDeadline(locale: string): string {
  return `/${locale}/regulatory/calendar`;
}

// Turn `des_september_returns` → `Des September Returns` for the feed row
// subtitle without requiring every domain to have a translation key.
function formatDomain(domain: string): string {
  return domain
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ─── Component ──────────────────────────────────────────────────────────────

export function UpcomingDeadlinesFeed({ items, isLoading }: UpcomingDeadlinesFeedProps) {
  const t = useTranslations('regulatory.superHub.feed');
  const locale = useLocale();

  return (
    <section
      aria-label={t('ariaLabel')}
      className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-teal-400 via-teal-500 to-teal-600" />

      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-teal-600" />
          <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
        </div>
        <Link
          href={`/${locale}/regulatory/calendar`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t('viewAll')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Link>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border/50">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-border/50" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-border/50" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-border/50" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-teal-600">
            <CalendarClock className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-text-primary">{t('emptyTitle')}</p>
          <p className="text-xs text-text-tertiary">{t('emptyDescription')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {items.slice(0, 5).map((item) => (
            <Link
              key={item.id}
              href={hrefForDeadline(locale)}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <CalendarClock className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                <p className="truncate text-xs text-text-tertiary">
                  {formatDomain(item.domain)}
                  <span className="mx-1.5 text-text-tertiary/60">·</span>
                  {formatDate(item.due_date)}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary opacity-60 rtl:rotate-180" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
