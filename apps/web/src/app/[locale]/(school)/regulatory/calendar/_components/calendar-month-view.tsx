'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@school/ui';

import { fmtLocale } from '@/lib/i18n-format';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MonthViewEvent {
  id: string;
  domain: string;
  event_type: 'hard_deadline' | 'soft_deadline' | 'preparation' | 'reminder';
  title: string;
  due_date: string;
  status: string;
}

interface CalendarMonthViewProps {
  events: MonthViewEvent[];
  month: number;
  year: number;
  isLoading?: boolean;
  onMonthChange: (month: number, year: number) => void;
  onEventClick?: (event: MonthViewEvent) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOffset(year: number, month: number): number {
  // Monday-first week — matches the engagement calendar convention.
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function monthYearLabel(locale: string, year: number, month: number): string {
  return new Intl.DateTimeFormat(fmtLocale(locale, 'en-IE'), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 1));
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Map each domain to a stable accent colour used for the event pin.
function pinToneForDomain(domain: string): string {
  switch (domain) {
    case 'des_september_returns':
    case 'des_october_census':
      return 'bg-teal-500';
    case 'tusla_attendance':
      return 'bg-sky-500';
    case 'ppod_sync':
    case 'pod_sync':
      return 'bg-cyan-500';
    case 'child_safeguarding':
    case 'anti_bullying':
      return 'bg-rose-500';
    case 'gdpr_compliance':
      return 'bg-indigo-500';
    case 'board_governance':
    case 'fssu_financial':
      return 'bg-amber-500';
    default:
      return 'bg-slate-500';
  }
}

function ringToneForStatus(status: string): string {
  if (status === 'reg_accepted' || status === 'accepted') return 'ring-success-300';
  if (status === 'overdue' || status === 'reg_rejected' || status === 'rejected')
    return 'ring-danger-300';
  return 'ring-transparent';
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CalendarMonthView({
  events,
  month,
  year,
  isLoading = false,
  onMonthChange,
  onEventClick,
}: CalendarMonthViewProps) {
  const locale = useLocale();
  const t = useTranslations('regulatory.calendar');

  const weekdays = [
    t('weekday.mon'),
    t('weekday.tue'),
    t('weekday.wed'),
    t('weekday.thu'),
    t('weekday.fri'),
    t('weekday.sat'),
    t('weekday.sun'),
  ];

  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, MonthViewEvent[]>();
    for (const ev of events) {
      const d = parseDateOnly(ev.due_date);
      if (!d) continue;
      if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month) continue;
      const key = toDateKey(d);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events, year, month]);

  const total = daysInMonth(year, month);
  const offset = firstDayOffset(year, month);

  // 6 rows × 7 cols covers every month layout.
  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < offset; i += 1) cells.push({ date: null, key: `empty-lead-${i}` });
  for (let d = 1; d <= total; d += 1) {
    const date = new Date(Date.UTC(year, month, d));
    cells.push({ date, key: toDateKey(date) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, key: `empty-trail-${cells.length}` });

  const today = new Date();
  const todayKey = toDateKey(
    new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())),
  );

  function step(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    onMonthChange(m, y);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-primary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t('previousMonth')}
            onClick={() => step(-1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-hover"
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t('nextMonth')}
            onClick={() => step(1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-hover"
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </button>
          <h3 className="ms-2 text-base font-semibold text-text-primary">
            {monthYearLabel(locale, year, month)}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => onMonthChange(today.getMonth(), today.getFullYear())}
          className="text-xs font-medium text-teal-700 transition-colors hover:text-teal-800"
        >
          {t('today')}
        </button>
      </div>

      {/* Weekday strip */}
      <div className="grid grid-cols-7 border-b border-border bg-surface-secondary text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        {weekdays.map((w) => (
          <div key={w} className="px-2 py-2 text-center">
            {w}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className={cn('grid grid-cols-7', isLoading && 'animate-pulse')}>
        {cells.map((cell) => {
          if (!cell.date) {
            return <div key={cell.key} className="h-24 border-b border-e border-border" />;
          }
          const list = eventsByDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          return (
            <div
              key={cell.key}
              className={cn(
                'min-h-[96px] border-b border-e border-border p-1.5',
                isToday && 'bg-teal-50/60',
              )}
            >
              <div
                className={cn(
                  'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                  isToday ? 'bg-teal-600 font-semibold text-white' : 'text-text-secondary',
                )}
              >
                {cell.date.getUTCDate()}
              </div>
              <div className="flex flex-col gap-1">
                {list.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onEventClick?.(ev)}
                    className={cn(
                      'flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-text-primary ring-1 transition-colors hover:bg-surface-hover',
                      ringToneForStatus(ev.status),
                    )}
                  >
                    <span
                      className={cn('h-2 w-2 shrink-0 rounded-full', pinToneForDomain(ev.domain))}
                      aria-hidden="true"
                    />
                    <span className="truncate">{ev.title}</span>
                  </button>
                ))}
                {list.length > 3 && (
                  <p className="ps-1 text-[10px] font-medium text-text-tertiary">
                    {t('moreEvents', { count: list.length - 3 })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
