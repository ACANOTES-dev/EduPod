'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import {
  EVENT_TYPE_OPTIONS,
  formatDisplayDate,
  pickLocalizedValue,
  type EngagementCalendarEventRecord,
} from '@/app/[locale]/(school)/engagement/_components/engagement-types';

interface EngagementSchoolCalendarProps {
  events: EngagementCalendarEventRecord[];
  month: number;
  year: number;
  isLoading?: boolean;
  onMonthChange: (month: number, year: number) => void;
  onEventClick?: (event: EngagementCalendarEventRecord) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOffset(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatMonthYear(locale: string, year: number, month: number): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 1));
}

function toDateOnly(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function expandEventDates(
  event: EngagementCalendarEventRecord,
  year: number,
  month: number,
): string[] {
  const start = toDateOnly(event.start_date);
  const end = toDateOnly(event.end_date) ?? start;

  if (!start || !end) {
    return [];
  }

  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  const cursor = new Date(Math.max(start.getTime(), monthStart.getTime()));
  const finalDate = new Date(Math.min(end.getTime(), monthEnd.getTime()));
  const dates: string[] = [];

  while (cursor.getTime() <= finalDate.getTime()) {
    dates.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EngagementSchoolCalendar({
  events,
  month,
  year,
  isLoading = false,
  onMonthChange,
  onEventClick,
}: EngagementSchoolCalendarProps) {
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedDate(null);
  }, [month, year]);

  const dayLabels = [
    t('calendar.weekdays.mon'),
    t('calendar.weekdays.tue'),
    t('calendar.weekdays.wed'),
    t('calendar.weekdays.thu'),
    t('calendar.weekdays.fri'),
    t('calendar.weekdays.sat'),
    t('calendar.weekdays.sun'),
  ];

  const eventsByDate = React.useMemo(() => {
    const grouped = new Map<string, EngagementCalendarEventRecord[]>();

    for (const event of events) {
      for (const dateKey of expandEventDates(event, year, month)) {
        const bucket = grouped.get(dateKey) ?? [];
        bucket.push(event);
        grouped.set(dateKey, bucket);
      }
    }

    return grouped;
  }, [events, month, year]);

  const daysInMonth = getDaysInMonth(year, month);
  const offset = getFirstDayOffset(year, month);
  const todayKey = new Date().toISOString().slice(0, 10);
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  const handlePreviousMonth = () => {
    if (month === 0) {
      onMonthChange(11, year - 1);
      return;
    }

    onMonthChange(month - 1, year);
  };

  const handleNextMonth = () => {
    if (month === 11) {
      onMonthChange(0, year + 1);
      return;
    }

    onMonthChange(month + 1, year);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={handlePreviousMonth}>
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <span className="text-sm font-semibold text-text-primary">
          {formatMonthYear(locale, year, month)}
        </span>
        <Button variant="ghost" size="icon" onClick={handleNextMonth}>
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>

      {isLoading ? (
        <div className="h-[320px] animate-pulse rounded-3xl bg-surface-secondary" />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1">
            {dayLabels.map((label) => (
              <div
                key={label}
                className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-text-tertiary"
              >
                {label}
              </div>
            ))}

            {Array.from({ length: offset }).map((_, index) => (
              <div
                key={`pad-${index}`}
                className="min-h-[88px] rounded-2xl bg-surface-secondary/60"
              />
            ))}

            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = eventsByDate.get(dateKey) ?? [];
              const isToday = todayKey === dateKey;
              const isSelected = selectedDate === dateKey;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                  className={`min-h-[88px] rounded-2xl border p-2 text-start transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-surface hover:bg-surface-secondary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday ? 'bg-primary text-white' : 'bg-surface-secondary text-text-primary'
                      }`}
                    >
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-medium text-text-tertiary">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={`${event.id}-${dateKey}`}
                        className="truncate rounded-lg px-2 py-1 text-[11px] font-medium text-white"
                        style={{ backgroundColor: event.colour_code }}
                      >
                        {pickLocalizedValue(locale, event.title, event.title_ar)}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <p className="text-[10px] text-text-tertiary">
                        {t('calendar.moreEvents', { count: dayEvents.length - 2 })}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedDate ? (
            selectedEvents.length > 0 ? (
              <div className="rounded-3xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {t('calendar.dayAgenda', {
                      date: formatDisplayDate(`${selectedDate}T00:00:00.000Z`, locale),
                    })}
                  </h3>
                  <span className="text-xs text-text-tertiary">
                    {selectedEvents.length} {t('calendar.itemsLabel')}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {selectedEvents.map((event) => {
                    const eventTypeLabel =
                      EVENT_TYPE_OPTIONS.find((option) => option.value === event.event_type)
                        ?.label ?? 'inSchoolEvent';

                    return (
                      <button
                        key={`${event.id}-detail`}
                        type="button"
                        onClick={() => onEventClick?.(event)}
                        className="w-full rounded-2xl border border-border bg-surface-secondary/70 p-4 text-start transition-colors hover:bg-surface-secondary"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-text-primary">
                              {pickLocalizedValue(locale, event.title, event.title_ar)}
                            </p>
                            <p className="mt-1 text-xs text-text-secondary">
                              {t(`eventTypes.${eventTypeLabel}`)}
                            </p>
                          </div>
                          <span
                            className="inline-flex h-3 w-3 rounded-full"
                            style={{ backgroundColor: event.colour_code }}
                          />
                        </div>
                        {(event.start_date || event.end_date) && (
                          <p className="mt-3 text-xs text-text-tertiary">
                            {formatDisplayDate(event.start_date, locale)}
                            {event.end_date && event.end_date !== event.start_date
                              ? ` - ${formatDisplayDate(event.end_date, locale)}`
                              : ''}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-tertiary">
                {t('calendar.noEventsSelectedDay')}
              </div>
            )
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-tertiary">
              {events.length === 0 ? t('calendar.empty') : t('calendar.selectDay')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
