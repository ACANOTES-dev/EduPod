'use client';
import { Calendar } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpcomingEventItem {
  id: string;
  title: string;
  start_date: string | null;
  event_type: string;
  status: string;
  href?: string;
}

type EventCategory = 'all' | 'academic' | 'admin';

const TABS: Array<{ key: EventCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'academic', label: 'Academic' },
  { key: 'admin', label: 'Admin' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map API event_type to our filter categories. */
function categoriseEvent(eventType: string): EventCategory {
  switch (eventType) {
    case 'parent_conference':
    case 'policy_signoff':
    case 'in_school_event':
      return 'admin';
    case 'school_trip':
    case 'overnight_trip':
    case 'sports_event':
    case 'cultural_event':
    case 'after_school_activity':
      return 'academic';
    default:
      return 'academic';
  }
}

/** Format an ISO date string to a short display form like "Apr 10". */
function formatShortDate(isoDate: string | null): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

/** Filter to only future events (today onwards). */
function isFutureOrToday(isoDate: string | null): boolean {
  if (!isoDate) return false;
  const eventDate = new Date(isoDate);
  if (Number.isNaN(eventDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);
  return eventDate >= today;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface UpcomingEventsProps {
  /** Events fetched from the API. */
  events?: UpcomingEventItem[];
  /** Whether data is still loading. */
  loading?: boolean;
}

export function UpcomingEvents({ events = [], loading = false }: UpcomingEventsProps) {
  const [activeTab, setActiveTab] = React.useState<EventCategory>('all');

  // Filter to future events only, then apply category filter
  const futureEvents = React.useMemo(
    () => events.filter((e) => isFutureOrToday(e.start_date)),
    [events],
  );

  const filteredEvents = React.useMemo(
    () =>
      activeTab === 'all'
        ? futureEvents
        : futureEvents.filter((e) => categoriseEvent(e.event_type) === activeTab),
    [futureEvents, activeTab],
  );

  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm flex flex-col">
      <h3 className="text-[16px] font-semibold text-text-primary mb-3">Upcoming Events</h3>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary-50 text-primary-700 font-semibold'
                : 'text-text-tertiary hover:bg-surface-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div className="flex flex-col gap-3 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-[13px] text-text-tertiary">
            Loading events...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-text-tertiary">
            <Calendar className="h-5 w-5" />
            <span className="text-[13px]">No upcoming events</span>
          </div>
        ) : (
          filteredEvents.slice(0, 6).map((event) => (
            <Link
              key={event.id}
              href={event.href ?? `/engagement/events/${event.id}`}
              className="flex items-start gap-3 rounded-lg p-1.5 -ms-1.5 hover:bg-surface-secondary transition-colors"
            >
              <span className="text-[12px] font-semibold text-primary-600 whitespace-nowrap min-w-[48px]">
                {formatShortDate(event.start_date)}
              </span>
              <span className="text-[13px] font-medium text-text-primary leading-snug">
                {event.title}
              </span>
            </Link>
          ))
        )}
      </div>

      <Link
        href="/engagement/events"
        className="mt-4 text-[12px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
      >
        Go to Events &rarr;
      </Link>
    </div>
  );
}
