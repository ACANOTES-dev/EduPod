'use client';

import { Button } from '@school/ui';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  formatDisplayDate,
  isConferenceEvent,
  pickLocalizedValue,
  type ParentEventRow,
  type ParentPendingForm,
  type PaginatedResponse,
} from '../../_components/engagement-types';
import { EventStatusBadge } from '../../_components/event-status-badge';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


// ─── Mini-calendar helpers ─────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractDateKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // dateStr may be ISO like "2026-03-15" or "2026-03-15T00:00:00.000Z"
  return dateStr.slice(0, 10);
}

// ─── MiniCalendar component ───────────────────────────────────────────────────

interface MiniCalendarProps {
  events: ParentEventRow[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  locale: string;
}

function MiniCalendar({ events, selectedDate, onSelectDate, locale }: MiniCalendarProps) {
  const t = useTranslations('engagement');
  const today = new Date();
  const [viewYear, setViewYear] = React.useState(today.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(today.getMonth());

  // Build a set of date keys that have at least one event
  const eventDateKeys = React.useMemo(() => {
    const keys = new Set<string>();

    for (const event of events) {
      const start = extractDateKey(event.start_date);
      const end = extractDateKey(event.end_date);

      if (start) keys.add(start);
      if (end && end !== start) keys.add(end);

      // Mark all days in multi-day range
      if (start && end && end > start) {
        const startMs = new Date(start).getTime();
        const endMs = new Date(end).getTime();
        const DAY_MS = 86_400_000;

        for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
          keys.add(new Date(ms).toISOString().slice(0, 10));
        }
      }
    }

    return keys;
  }, [events]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayOfWeek = getFirstDayOfMonth(viewYear, viewMonth);
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const monthLabel = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(viewYear, viewMonth, 1));

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // Day-of-week header labels (Sun–Sat)
  const dayLabels = Array.from({ length: 7 }).map((_, i) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', { weekday: 'short' }).format(
      new Date(2023, 0, 1 + i), // 2023-01-01 is a Sunday
    ),
  );

  // Build grid cells: leading empty cells + day cells
  const leadingBlanks = Array.from({ length: firstDayOfWeek });
  const dayCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={prevMonth}
          aria-label={t('parentEvents.prevMonth')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </button>
        <p className="text-sm font-semibold text-text-primary">{monthLabel}</p>
        <button
          type="button"
          onClick={nextMonth}
          aria-label={t('parentEvents.nextMonth')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="mt-3 grid grid-cols-7 gap-1">
        {dayLabels.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-text-tertiary"
          >
            {label}
          </div>
        ))}

        {/* Leading blanks */}
        {leadingBlanks.map((_, i) => (
          <div key={`blank-${i}`} />
        ))}

        {/* Day cells */}
        {dayCells.map((day) => {
          const dateKey = toDateKey(viewYear, viewMonth, day);
          const hasEvent = eventDateKeys.has(dateKey);
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDate;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : dateKey)}
              aria-label={dateKey}
              aria-pressed={isSelected}
              className={`relative flex h-8 w-full flex-col items-center justify-center rounded-full text-sm transition-colors
                ${isSelected ? 'bg-primary text-primary-foreground' : ''}
                ${isToday && !isSelected ? 'font-bold text-primary' : ''}
                ${!isSelected && !isToday ? 'text-text-primary hover:bg-surface-secondary' : ''}
              `}
            >
              {day}
              {hasEvent ? (
                <span
                  className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                    isSelected ? 'bg-primary-foreground/70' : 'bg-primary'
                  }`}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Selected date hint */}
      {selectedDate ? (
        <p className="mt-3 text-center text-xs text-text-secondary">
          {t('parentEvents.filteringBy', {
            date: new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }).format(new Date(selectedDate)),
          })}{' '}
          <button
            type="button"
            onClick={() => onSelectDate(null)}
            className="font-medium text-primary hover:underline"
          >
            {t('parentEvents.clearFilter')}
          </button>
        </p>
      ) : null}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ParentEngagementEventsPage() {
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [events, setEvents] = React.useState<ParentEventRow[]>([]);
  const [pendingForms, setPendingForms] = React.useState<ParentPendingForm[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      apiClient<PaginatedResponse<ParentEventRow>>(
        '/api/v1/parent/engagement/events?page=1&pageSize=20',
      ),
      apiClient<ParentPendingForm[]>('/api/v1/parent/engagement/pending-forms'),
    ])
      .then(([eventsResponse, formsResponse]) => {
        setEvents(eventsResponse.data);
        setPendingForms(formsResponse);
      })
      .catch((error) => {
        console.error('[ParentEngagementEventsPage.loadData]', error);
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredEvents = React.useMemo(() => {
    if (!selectedDate) return events;

    return events.filter((event) => {
      const start = extractDateKey(event.start_date);
      const end = extractDateKey(event.end_date);

      if (!start) return false;

      // Single-day or multi-day: show if selectedDate falls within [start, end]
      if (!end || end === start) return start === selectedDate;

      return selectedDate >= start && selectedDate <= end;
    });
  }, [events, selectedDate]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-48 animate-pulse rounded-3xl bg-surface-secondary" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('parent.eventsTitle')} description={t('parent.eventsDescription')} />

      {/* Mini calendar — collapsible on mobile */}
      <section>
        <button
          type="button"
          onClick={() => setCalendarVisible((v) => !v)}
          className="mb-3 flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <CalendarDays className="h-4 w-4" />
          {calendarVisible ? t('parentEvents.hideCalendar') : t('parentEvents.showCalendar')}
        </button>

        {calendarVisible ? (
          <MiniCalendar
            events={events}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            locale={locale}
          />
        ) : null}
      </section>

      {/* Event cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredEvents.map((event) => {
          const eventForms = pendingForms.filter((form) => form.event_id === event.id);
          const needsPayment = event.participants.some(
            (participant) => participant.payment_status === 'pending',
          );
          const canRegister = event.participants.some((participant) =>
            ['invited', 'withdrawn'].includes(participant.status),
          );
          const isConference = isConferenceEvent(event.event_type);

          return (
            <article key={event.id} className="rounded-3xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-text-primary">
                    {pickLocalizedValue(locale, event.title, event.title_ar)}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {formatDisplayDate(event.start_date, locale)}
                  </p>
                </div>
                <EventStatusBadge status={event.status} label={t(`statuses.${event.status}`)} />
              </div>

              <div className="mt-4 rounded-2xl bg-surface-secondary/70 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-tertiary">{t('parent.location')}</span>
                  <span className="font-medium text-text-primary">
                    {pickLocalizedValue(locale, event.location, event.location_ar) || '—'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-text-tertiary">{t('parent.children')}</span>
                  <span className="font-medium text-text-primary">{event.participants.length}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={`/${locale}/engagement/parent/events/${event.id}`}>
                    {t('parent.viewEvent')}
                  </Link>
                </Button>
                {isConference ? (
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/engagement/parent/conferences/${event.id}/book`}>
                      {t('parent.bookConference')}
                    </Link>
                  </Button>
                ) : null}
                {isConference ? (
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/engagement/parent/conferences/${event.id}/my-bookings`}>
                      {t('parent.myConferenceBookings')}
                    </Link>
                  </Button>
                ) : null}
                {canRegister ? (
                  <Button asChild>
                    <Link href={`/${locale}/engagement/parent/events/${event.id}`}>
                      {t('parent.register')}
                    </Link>
                  </Button>
                ) : null}
                {eventForms[0] ? (
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/engagement/parent/forms/${eventForms[0].id}`}>
                      {t('parent.viewConsent')}
                    </Link>
                  </Button>
                ) : null}
                {needsPayment ? (
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/dashboard`}>{t('parent.pay')}</Link>
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {filteredEvents.length === 0 && selectedDate ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
          <CalendarDays className="mx-auto mb-3 h-6 w-6 text-text-tertiary" />
          {t('parentEvents.noEventsOnDate')}
        </div>
      ) : null}

      {events.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
          <CalendarDays className="mx-auto mb-3 h-6 w-6 text-text-tertiary" />
          {t('parent.noEvents')}
        </div>
      ) : null}
    </div>
  );
}
