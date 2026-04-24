'use client';

import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ListOrdered,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { REGULATORY_DOMAINS } from '@school/shared/regulatory';
import {
  Button,
  cn,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import { ErrorBanner } from '../_components/error-banner';

import { CalendarEventDetail } from './_components/calendar-event-detail';
import { CalendarEventDialog } from './_components/calendar-event-dialog';
import { CalendarMonthView, type MonthViewEvent } from './_components/calendar-month-view';
import { CalendarUpcomingList, type UpcomingListEvent } from './_components/calendar-upcoming-list';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  domain: string;
  event_type: 'hard_deadline' | 'soft_deadline' | 'preparation' | 'reminder';
  title: string;
  description: string | null;
  due_date: string;
  status: string;
  academic_year: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

interface CalendarApiResponse {
  data: CalendarEvent[];
  meta: { page: number; pageSize: number; total: number };
}

type ViewMode = 'month' | 'list';

const DEFAULT_ACADEMIC_YEAR = '2025-2026';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RegulatoryCalendarPage() {
  const t = useTranslations('regulatory.calendar');
  const statusT = useTranslations('regulatory.status');
  const locale = useLocale();
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_owner', 'school_principal', 'admin');

  const [view, setView] = React.useState<ViewMode>('list');
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [domainFilter, setDomainFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [cursorMonth, setCursorMonth] = React.useState(() => new Date().getMonth());
  const [cursorYear, setCursorYear] = React.useState(() => new Date().getFullYear());

  const [newEventOpen, setNewEventOpen] = React.useState(false);
  const [seedingDefaults, setSeedingDefaults] = React.useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState<UpcomingListEvent | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // ── Fetch (fetch a wide page so month view has events for any month) ─────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);

    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (domainFilter !== 'all') params.set('domain', domainFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);

    apiClient<CalendarApiResponse>(`/api/v1/regulatory/calendar?${params.toString()}`, {
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        setEvents(res.data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[RegulatoryCalendarPage] fetch', err);
        setEvents([]);
        setFetchError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [domainFilter, statusFilter, reloadKey, t]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = React.useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

    let upcomingThisMonth = 0;
    let overdue = 0;
    let completedThisYear = 0;
    let nextDeadline: { title: string; date: Date } | null = null;

    for (const ev of events) {
      const due = new Date(ev.due_date);
      if (Number.isNaN(due.getTime())) continue;

      const status = ev.status.startsWith('reg_') ? ev.status.slice(4) : ev.status;
      const isCompleted = status === 'submitted' || status === 'accepted';
      const isOverdue = status === 'overdue' || (!isCompleted && due < now);

      if (due >= monthStart && due <= monthEnd && !isCompleted) upcomingThisMonth += 1;
      if (isOverdue) overdue += 1;
      if (isCompleted && due >= yearStart && due <= yearEnd) completedThisYear += 1;
      if (!isCompleted && due >= now && (!nextDeadline || due < nextDeadline.date)) {
        nextDeadline = { title: ev.title, date: due };
      }
    }

    const nextDeadlineDays = nextDeadline
      ? Math.ceil((nextDeadline.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return { upcomingThisMonth, overdue, completedThisYear, nextDeadlineDays };
  }, [events]);

  // ── Upcoming list (future events, sorted, limited) ───────────────────────
  const upcomingEvents: UpcomingListEvent[] = React.useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return events
      .filter((ev) => new Date(ev.due_date) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 20)
      .map((ev) => ({
        id: ev.id,
        domain: ev.domain,
        event_type: ev.event_type,
        title: ev.title,
        due_date: ev.due_date,
        status: ev.status,
        description: ev.description,
        academic_year: ev.academic_year,
      }));
  }, [events]);

  const monthViewEvents: MonthViewEvent[] = React.useMemo(
    () =>
      events.map((ev) => ({
        id: ev.id,
        domain: ev.domain,
        event_type: ev.event_type,
        title: ev.title,
        due_date: ev.due_date,
        status: ev.status,
      })),
    [events],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleSeedDefaults() {
    if (!canManage) return;
    setSeedingDefaults(true);
    try {
      const result = await apiClient<{ created: number; total: number }>(
        '/api/v1/regulatory/calendar/seed-defaults',
        {
          method: 'POST',
          body: JSON.stringify({ academic_year: DEFAULT_ACADEMIC_YEAR }),
        },
      );
      toast.success(t('seedSuccess', { count: result.created }));
      setReloadKey((k) => k + 1);
    } catch (err) {
      const msg = (err as { error?: { message?: string }; message?: string })?.error?.message;
      toast.error(msg ?? (err as { message?: string })?.message ?? t('seedError'));
    } finally {
      setSeedingDefaults(false);
    }
  }

  function openEvent(ev: UpcomingListEvent) {
    setSelectedEvent(ev);
    setDetailOpen(true);
  }

  function formatNextDeadline(): string {
    if (kpis.nextDeadlineDays === null) return t('kpi.noneUpcoming');
    if (kpis.nextDeadlineDays < 0) return t('kpi.overdue');
    if (kpis.nextDeadlineDays === 0) return t('dueToday');
    return t('dueIn', { count: kpis.nextDeadlineDays });
  }

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeedDefaults}
                disabled={seedingDefaults}
                className="min-h-[40px]"
              >
                <Sparkles className="me-1.5 h-4 w-4" aria-hidden="true" />
                {t('seedDefaults')}
              </Button>
              <Button
                onClick={() => setNewEventOpen(true)}
                className="min-h-[40px] bg-teal-600 text-white hover:bg-teal-700"
              >
                <Plus className="me-1.5 h-4 w-4" aria-hidden="true" />
                {t('newEvent')}
              </Button>
            </div>
          ) : undefined
        }
      />

      {fetchError && (
        <ErrorBanner
          message={fetchError}
          retryLabel={t('retry')}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── KPI strip ──────────────────────────────────────────────────── */}
      <section aria-label={t('kpi.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={CalendarClock}
          label={t('kpi.upcomingThisMonth')}
          value={kpis.upcomingThisMonth}
          isLoading={isLoading}
          accent="text-teal-700"
          tooltip={t('kpi.upcomingThisMonthTooltip')}
        />
        <KpiTile
          icon={AlertCircle}
          label={t('kpi.overdue')}
          value={kpis.overdue}
          isLoading={isLoading}
          accent={kpis.overdue > 0 ? 'text-danger-600' : 'text-text-tertiary'}
          tooltip={t('kpi.overdueTooltip')}
        />
        <KpiTile
          icon={CheckCircle2}
          label={t('kpi.completedThisYear')}
          value={kpis.completedThisYear}
          isLoading={isLoading}
          accent="text-success-700"
          tooltip={t('kpi.completedThisYearTooltip')}
        />
        <KpiTile
          icon={CalendarDays}
          label={t('kpi.nextDeadline')}
          value={formatNextDeadline()}
          isLoading={isLoading}
          accent="text-cyan-700"
          tooltip={t('kpi.nextDeadlineTooltip')}
        />
      </section>

      {/* ── Filters + view toggle ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border bg-surface-primary p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calendar-domain-filter">{t('domain')}</Label>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger id="calendar-domain-filter" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allDomains')}</SelectItem>
                {Object.entries(REGULATORY_DOMAINS).map(([key, val]) => (
                  <SelectItem key={key} value={key}>
                    {val.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calendar-status-filter">{t('status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="calendar-status-filter" className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allStatuses')}</SelectItem>
                <SelectItem value="not_started">{statusT('notStarted')}</SelectItem>
                <SelectItem value="in_progress">{statusT('inProgress')}</SelectItem>
                <SelectItem value="ready_for_review">{statusT('readyForReview')}</SelectItem>
                <SelectItem value="submitted">{statusT('submitted')}</SelectItem>
                <SelectItem value="accepted">{statusT('accepted')}</SelectItem>
                <SelectItem value="rejected">{statusT('rejected')}</SelectItem>
                <SelectItem value="overdue">{statusT('overdue')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          role="tablist"
          aria-label={t('viewToggleAriaLabel')}
          className="inline-flex overflow-hidden rounded-xl border border-border bg-surface"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            onClick={() => setView('list')}
            className={cn(
              'flex min-h-[40px] items-center gap-1.5 px-3 text-sm transition-colors',
              view === 'list'
                ? 'bg-teal-600 text-white'
                : 'text-text-secondary hover:bg-surface-hover',
            )}
          >
            <ListOrdered className="h-4 w-4" aria-hidden="true" />
            {t('view.list')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'month'}
            onClick={() => setView('month')}
            className={cn(
              'flex min-h-[40px] items-center gap-1.5 border-s border-border px-3 text-sm transition-colors',
              view === 'month'
                ? 'bg-teal-600 text-white'
                : 'text-text-secondary hover:bg-surface-hover',
            )}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {t('view.month')}
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {view === 'month' ? (
        <CalendarMonthView
          events={monthViewEvents}
          month={cursorMonth}
          year={cursorYear}
          isLoading={isLoading}
          onMonthChange={(m, y) => {
            setCursorMonth(m);
            setCursorYear(y);
          }}
          onEventClick={(ev) => {
            const match = events.find((e) => e.id === ev.id);
            if (match) {
              openEvent({
                id: match.id,
                domain: match.domain,
                event_type: match.event_type,
                title: match.title,
                due_date: match.due_date,
                status: match.status,
                description: match.description,
                academic_year: match.academic_year,
              });
            }
          }}
        />
      ) : (
        <CalendarUpcomingList
          events={upcomingEvents}
          isLoading={isLoading}
          onEventClick={openEvent}
        />
      )}

      {/* ── Hidden inputs for accessibility placeholders removed ────────── */}
      <CalendarEventDialog
        open={newEventOpen}
        onOpenChange={setNewEventOpen}
        onCreated={() => setReloadKey((k) => k + 1)}
        defaultAcademicYear={DEFAULT_ACADEMIC_YEAR}
      />

      <CalendarEventDetail
        event={selectedEvent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={() => setReloadKey((k) => k + 1)}
        canManage={canManage}
      />
    </div>
  );
}
