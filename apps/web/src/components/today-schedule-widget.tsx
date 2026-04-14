'use client';

import { ArrowRight, Calendar, Clock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TodayScheduleItem {
  id: string;
  start_time: string;
  end_time: string;
  primary: string;
  secondary?: string | null;
  tertiary?: string | null;
}

interface TodayScheduleWidgetProps {
  title: string;
  items: TodayScheduleItem[];
  loading?: boolean;
  viewAllHref?: string;
  viewAllLabel?: string;
  emptyLabel?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUBJECT_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200',
  'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-200',
  'bg-purple-50 border-purple-200 text-purple-900 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-200',
  'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200',
  'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-200',
  'bg-cyan-50 border-cyan-200 text-cyan-900 dark:bg-cyan-900/20 dark:border-cyan-800 dark:text-cyan-200',
];

function hashColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length] ?? SUBJECT_COLORS[0]!;
}

function formatTime(time: string): string {
  if (!time) return '';
  const parts = time.split(':');
  const hours = parts[0] ?? '0';
  const minutes = parts[1] ?? '00';
  const h = parseInt(hours, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${minutes} ${period}`;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':');
  return (parseInt(h ?? '0', 10) || 0) * 60 + (parseInt(m ?? '0', 10) || 0);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TodayScheduleWidget({
  title,
  items,
  loading = false,
  viewAllHref,
  viewAllLabel,
  emptyLabel,
}: TodayScheduleWidgetProps) {
  const t = useTranslations('dashboard.todaySchedule');
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const sorted = React.useMemo(
    () => [...items].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)),
    [items],
  );

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {viewAllLabel ?? t('viewAll')}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </Link>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-secondary animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-6 text-center">
          <Calendar className="h-8 w-8 mx-auto text-text-tertiary mb-2" />
          <p className="text-sm text-text-tertiary">{emptyLabel ?? t('empty')}</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {sorted.map((item) => {
            const startMin = toMinutes(item.start_time);
            const endMin = toMinutes(item.end_time);
            const isNow = nowMinutes >= startMin && nowMinutes < endMin;
            const isPast = nowMinutes >= endMin;
            const colorClass = hashColor(item.primary);
            return (
              <li
                key={item.id}
                className={`relative rounded-xl border px-4 py-3 transition-opacity ${colorClass} ${
                  isPast ? 'opacity-50' : ''
                } ${isNow ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.primary}</p>
                    {item.secondary && (
                      <p className="text-xs opacity-80 truncate mt-0.5">{item.secondary}</p>
                    )}
                    {item.tertiary && (
                      <p className="text-xs opacity-70 truncate">{item.tertiary}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="flex items-center gap-1 text-xs font-mono font-medium">
                      <Clock className="h-3 w-3" />
                      {formatTime(item.start_time)}
                    </div>
                    {isNow && (
                      <span className="mt-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                        {t('nowBadge')}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
