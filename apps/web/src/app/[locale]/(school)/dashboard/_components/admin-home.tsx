'use client';

import * as React from 'react';

import { apiClient } from '@/lib/api-client';

import type { AuditLogItem } from './activity-feed';
import { ActivityFeed } from './activity-feed';
import { GreetingRow } from './greeting-row';
import { MiniCalendar } from './mini-calendar';
import { PriorityFeed } from './priority-feed';
import { QuickActions } from './quick-actions';
import { SchoolSnapshot } from './school-snapshot';
import type { WeeklyMetrics } from './this-week-card';
import { ThisWeekCard } from './this-week-card';
import type { UpcomingEventItem } from './upcoming-events';
import { UpcomingEvents } from './upcoming-events';

// ─── Shared types ───────────────────────────────────────────────────────────

export type DashboardData = {
  stats?: {
    total_students?: number | string;
    active_staff?: number | string;
    total_classes?: number | string;
  };
};

export type PriorityData = {
  /** Outstanding finance balance (total unpaid amount) */
  outstanding_amount?: number;
  /** Count of open follow-ups + active alerts from behaviour analytics */
  unresolved_incidents?: number;
  /** Count of pending approval requests */
  pending_approvals?: number;
  /** Count of admissions applications pending review */
  pending_admissions?: number;
  /** Count of pending assessment unlock requests */
  pending_unlock_requests?: number;
  /** Count of pending report card teacher requests awaiting admin review */
  pending_report_card_requests?: number;
};

// ─── API response types ─────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  event_type: string;
  status: string;
  href?: string;
}

interface AuditLogResponse {
  data: AuditLogItem[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekISO(): string {
  const d = new Date();
  const day = d.getDay();
  // Monday = start of week; Sunday = 0, so offset accordingly
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminHome({
  schoolName,
  data,
  priorityData,
}: {
  schoolName: string;
  data: DashboardData | null;
  priorityData: PriorityData;
}) {
  // ─── Events state ─────────────────────────────────────────────────────────
  const [calendarEvents, setCalendarEvents] = React.useState<CalendarEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = React.useState<UpcomingEventItem[]>([]);
  const [eventsLoading, setEventsLoading] = React.useState(true);

  // ─── Activity state ───────────────────────────────────────────────────────
  const [activities, setActivities] = React.useState<AuditLogItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = React.useState(true);

  // ─── Weekly metrics state ─────────────────────────────────────────────────
  const [weeklyMetrics, setWeeklyMetrics] = React.useState<WeeklyMetrics | undefined>(undefined);
  const [weeklyLoading, setWeeklyLoading] = React.useState(true);

  // ─── Fetch events ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      try {
        const result = await apiClient<{ data: CalendarEvent[] }>(
          '/api/v1/engagement/calendar-events',
          { silent: true },
        );
        if (cancelled) return;
        const events = result.data ?? [];
        setCalendarEvents(events);
        setUpcomingEvents(
          events.map((e) => ({
            id: e.id,
            title: e.title,
            start_date: e.start_date,
            event_type: e.event_type,
            status: e.status,
            href: e.href,
          })),
        );
      } catch (err) {
        console.error('[AdminHome.fetchEvents]', err);
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    }

    void fetchEvents();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Fetch audit log activities ───────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;

    async function fetchActivities() {
      try {
        const today = todayISODate();
        const result = await apiClient<AuditLogResponse>(
          `/api/v1/audit-logs?page=1&pageSize=5&start_date=${today}&end_date=${today}`,
          { silent: true },
        );
        if (cancelled) return;
        setActivities(result.data ?? []);
      } catch (err) {
        console.error('[AdminHome.fetchActivities]', err);
      } finally {
        if (!cancelled) setActivitiesLoading(false);
      }
    }

    void fetchActivities();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Fetch weekly metrics ─────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;

    async function fetchWeeklyMetrics() {
      const weekStart = startOfWeekISO();
      const today = todayISODate();

      // Use existing endpoints that are known to work.
      // Behaviour incidents is the only reliable weekly metric we can derive.
      const results = await Promise.allSettled([
        // Behaviour incidents this week — list endpoint with date range
        apiClient<{ data?: unknown[]; meta?: { total?: number } }>(
          `/api/v1/behaviour/incidents?page=1&pageSize=1&start_date=${weekStart}&end_date=${today}`,
          { silent: true },
        ),
      ]);

      if (cancelled) return;

      const metrics: WeeklyMetrics = {
        attendanceRate: null,
        newAdmissions: null,
        incidentsLogged: null,
      };

      // Parse incidents — response may be { data: [...], meta: { total } }
      if (results[0]?.status === 'fulfilled') {
        const raw = results[0].value;
        const total = raw?.meta?.total ?? (raw?.data as unknown[] | undefined)?.length;
        if (typeof total === 'number') {
          metrics.incidentsLogged = total;
        }
      }

      setWeeklyMetrics(metrics);
      setWeeklyLoading(false);
    }

    void fetchWeeklyMetrics();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Derive calendar event date strings for the mini calendar ─────────────
  const eventDates = React.useMemo(
    () => calendarEvents.filter((e) => e.start_date).map((e) => e.start_date as string),
    [calendarEvents],
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <GreetingRow schoolName={schoolName} />

        <div className="lg:hidden space-y-6">
          <QuickActions variant="horizontal" />
          <SchoolSnapshot variant="compact" data={data} />
        </div>

        <PriorityFeed priorityData={priorityData} />

        {/* Bottom row: Calendar | Upcoming Events | Activity Feed */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MiniCalendar eventDates={eventDates} />
          <UpcomingEvents events={upcomingEvents} loading={eventsLoading} />
          <ActivityFeed activities={activities} loading={activitiesLoading} />
        </div>
      </div>

      <div className="hidden lg:block w-[360px] shrink-0 space-y-6 lg:pt-[56px] xl:pt-0">
        <SchoolSnapshot variant="default" data={data} />
        <ThisWeekCard metrics={weeklyMetrics} loading={weeklyLoading} />
        <QuickActions variant="grid" />
      </div>
    </div>
  );
}
