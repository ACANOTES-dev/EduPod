'use client';
import Link from 'next/link';
import * as React from 'react';

type EventItem = {
  id: string;
  date: string;
  title: string;
  category: 'all' | 'academic' | 'admin';
};

type EventCategory = EventItem['category'];

const PLACEHOLDER_EVENTS: EventItem[] = [
  { id: '1', date: 'Apr 10', title: 'Parent-Teacher Meeting', category: 'admin' },
  { id: '2', date: 'Apr 15', title: 'Science Fair Submission Deadline', category: 'academic' },
  { id: '3', date: 'Apr 20', title: 'School Board Meeting', category: 'admin' },
  { id: '4', date: 'Apr 22', title: 'Sports Day', category: 'academic' },
];

const TABS: Array<{ key: EventCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'academic', label: 'Academic' },
  { key: 'admin', label: 'Admin' },
];

export function UpcomingEvents() {
  const [activeTab, setActiveTab] = React.useState<EventCategory>('all');
  const events =
    activeTab === 'all'
      ? PLACEHOLDER_EVENTS
      : PLACEHOLDER_EVENTS.filter((event) => event.category === activeTab);

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
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-3">
            <span className="text-[12px] font-semibold text-primary-600 whitespace-nowrap min-w-[48px]">
              {event.date}
            </span>
            <span className="text-[13px] font-medium text-text-primary leading-snug">
              {event.title}
            </span>
          </div>
        ))}
      </div>

      <Link
        href="/engagement/events"
        className="mt-4 text-[12px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
      >
        View Calendar &rarr;
      </Link>
    </div>
  );
}
