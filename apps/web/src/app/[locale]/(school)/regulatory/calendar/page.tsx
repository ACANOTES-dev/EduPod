'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { REGULATORY_DOMAINS } from '@school/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { RegulatoryNav } from '../_components/regulatory-nav';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  created_at: string;
}

interface CalendarApiResponse {
  data: CalendarEvent[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  not_started: 'neutral',
  in_progress: 'info',
  ready_for_review: 'warning',
  submitted: 'success',
  accepted: 'success',
  rejected: 'danger',
  overdue: 'danger',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLocaleFromPathname(pathname: string): string {
  const segments = pathname.split('/');
  return segments[1] === 'ar' ? 'ar' : 'en';
}

function formatDateLocale(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-IE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getDomainLabel(domain: string): string {
  const entry = REGULATORY_DOMAINS[domain as keyof typeof REGULATORY_DOMAINS];
  return entry?.label ?? domain;
}

function getEventTypeKey(eventType: string): string {
  const map: Record<string, string> = {
    hard_deadline: 'hardDeadline',
    soft_deadline: 'softDeadline',
    preparation: 'preparation',
    reminder: 'reminder',
  };
  return map[eventType] ?? eventType;
}

function getStatusKey(status: string): string {
  const map: Record<string, string> = {
    not_started: 'notStarted',
    in_progress: 'inProgress',
    ready_for_review: 'readyForReview',
    submitted: 'submitted',
    accepted: 'accepted',
    rejected: 'rejected',
    overdue: 'overdue',
  };
  return map[status] ?? status;
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function RegulatoryCalendarPage() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname ?? '');

  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [domain, setDomain] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchEvents = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (domain !== 'all') {
        params.set('domain', domain);
      }
      if (status !== 'all') {
        params.set('status', status);
      }

      const response = await apiClient<CalendarApiResponse>(
        `/api/v1/regulatory/calendar?${params.toString()}`,
        { silent: true },
      );

      setEvents(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch (err) {
      console.error('[RegulatoryCalendarPage.fetchEvents]', err);
      setEvents([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, domain, status]);

  React.useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  // ─── Toolbar ──────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[200px_200px]">
      <Select
        value={domain}
        onValueChange={(value) => {
          setDomain(value);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('calendar.domain')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('calendar.allDomains')}</SelectItem>
          {Object.entries(REGULATORY_DOMAINS).map(([key, val]) => (
            <SelectItem key={key} value={key}>
              {val.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('calendar.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('calendar.allStatuses')}</SelectItem>
          <SelectItem value="not_started">{t('status.notStarted')}</SelectItem>
          <SelectItem value="in_progress">{t('status.inProgress')}</SelectItem>
          <SelectItem value="ready_for_review">{t('status.readyForReview')}</SelectItem>
          <SelectItem value="submitted">{t('status.submitted')}</SelectItem>
          <SelectItem value="accepted">{t('status.accepted')}</SelectItem>
          <SelectItem value="rejected">{t('status.rejected')}</SelectItem>
          <SelectItem value="overdue">{t('status.overdue')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Table columns ───────────────────────────────────────────────────────

  const columns = React.useMemo(
    () => [
      {
        key: 'title',
        header: t('calendar.eventType'),
        render: (row: CalendarEvent) => (
          <div>
            <p className="text-sm font-medium text-text-primary">{row.title}</p>
            {row.description && (
              <p className="mt-0.5 text-xs text-text-tertiary line-clamp-1">{row.description}</p>
            )}
          </div>
        ),
      },
      {
        key: 'domain',
        header: t('calendar.domain'),
        render: (row: CalendarEvent) => (
          <span className="text-sm text-text-secondary">{getDomainLabel(row.domain)}</span>
        ),
      },
      {
        key: 'event_type',
        header: t('calendar.eventType'),
        render: (row: CalendarEvent) => (
          <span className="text-sm text-text-secondary">
            {t(`calendar.${getEventTypeKey(row.event_type)}` as never)}
          </span>
        ),
      },
      {
        key: 'due_date',
        header: t('calendar.dueDate'),
        render: (row: CalendarEvent) => (
          <span className="text-sm tabular-nums text-text-secondary">
            {formatDateLocale(row.due_date, locale)}
          </span>
        ),
      },
      {
        key: 'status',
        header: t('calendar.status'),
        render: (row: CalendarEvent) => (
          <StatusBadge status={statusVariant[row.status] ?? 'neutral'} dot>
            {t(`status.${getStatusKey(row.status)}` as never)}
          </StatusBadge>
        ),
      },
    ],
    [locale, t],
  );

  // ─── Mobile cards ─────────────────────────────────────────────────────────

  const mobileCards = (
    <div className="space-y-3 md:hidden">
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-secondary" />
        ))
      ) : events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-text-tertiary">
          {t('calendar.noEvents')}
        </p>
      ) : (
        events.map((event) => (
          <div key={event.id} className="rounded-2xl border border-border bg-surface px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={statusVariant[event.status] ?? 'neutral'} dot>
                {t(`status.${getStatusKey(event.status)}` as never)}
              </StatusBadge>
              <span className="text-xs tabular-nums text-text-tertiary">
                {formatDateLocale(event.due_date, locale)}
              </span>
            </div>
            <p className="mt-3 text-sm font-medium text-text-primary">{event.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-secondary">{getDomainLabel(event.domain)}</span>
              <span className="text-xs text-text-tertiary">
                {t(`calendar.${getEventTypeKey(event.event_type)}` as never)}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title={t('calendar.title')} description={t('calendar.description')} />

      <RegulatoryNav />

      {/* Mobile toolbar */}
      <div className="md:hidden">{toolbar}</div>

      {/* Mobile cards */}
      {mobileCards}

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={events}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
