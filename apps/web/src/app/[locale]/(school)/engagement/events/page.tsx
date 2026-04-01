'use client';

import { List, Plus, Search, Shapes } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';


import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import {
  EVENT_TYPE_OPTIONS,
  formatDisplayDate,
  pickLocalizedValue,
  type EventRecord,
  type PaginatedResponse,
} from '../_components/engagement-types';
import { EventStatusBadge } from '../_components/event-status-badge';


export default function EngagementEventsPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('engagement');
  const [events, setEvents] = React.useState<EventRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [view, setView] = React.useState<'table' | 'cards'>('cards');

  const fetchEvents = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
      });

      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('event_type', typeFilter);
      if (search.trim()) params.set('search', search.trim());

      const response = await apiClient<PaginatedResponse<EventRecord>>(
        `/api/v1/engagement/events?${params.toString()}`,
      );

      setEvents(response.data);
    } catch (error) {
      console.error('[EngagementEventsPage.fetchEvents]', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, typeFilter]);

  React.useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  React.useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, search, statusFilter, typeFilter]);

  const filteredEvents = React.useMemo(() => {
    return events.filter((event) => {
      const startDate = event.start_date ? new Date(event.start_date) : null;

      if (dateFrom && startDate && startDate < new Date(dateFrom)) {
        return false;
      }

      if (dateTo && startDate && startDate > new Date(dateTo)) {
        return false;
      }

      return true;
    });
  }, [dateFrom, dateTo, events]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.events.title')}
        description={t('pages.events.description')}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={view === 'cards' ? 'default' : 'outline'}
              onClick={() => setView('cards')}
            >
              <Shapes className="me-2 h-4 w-4" />
              {t('pages.events.cards')}
            </Button>
            <Button
              variant={view === 'table' ? 'default' : 'outline'}
              onClick={() => setView('table')}
            >
              <List className="me-2 h-4 w-4" />
              {t('pages.events.table')}
            </Button>
            <Button onClick={() => router.push(`/${locale}/engagement/events/new`)}>
              <Plus className="me-2 h-4 w-4" />
              {t('pages.events.newEvent')}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-3xl border border-border bg-surface p-4 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('shared.searchEvents')}
            className="ps-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('shared.allStatuses')}</SelectItem>
            {[
              'draft',
              'published',
              'open',
              'closed',
              'in_progress',
              'completed',
              'cancelled',
              'archived',
            ].map((status) => (
              <SelectItem key={status} value={status}>
                {t(`statuses.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('shared.allTypes')}</SelectItem>
            {EVENT_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(`eventTypes.${option.label}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
      </div>

      {view === 'cards' ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => router.push(`/${locale}/engagement/events/${event.id}`)}
              className="rounded-3xl border border-border bg-surface p-5 text-start transition-colors hover:border-primary-200 hover:bg-primary-50/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-text-primary">
                    {pickLocalizedValue(locale, event.title, event.title_ar)}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t(
                      `eventTypes.${
                        EVENT_TYPE_OPTIONS.find((option) => option.value === event.event_type)
                          ?.label ?? 'schoolTrip'
                      }`,
                    )}
                  </p>
                </div>
                <EventStatusBadge status={event.status} label={t(`statuses.${event.status}`)} />
              </div>
              <div className="mt-5 grid gap-3 rounded-2xl bg-surface-secondary/70 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-tertiary">{t('pages.events.startDate')}</span>
                  <span className="font-medium text-text-primary">
                    {formatDisplayDate(event.start_date, locale)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-tertiary">{t('pages.events.location')}</span>
                  <span className="font-medium text-text-primary">
                    {pickLocalizedValue(locale, event.location, event.location_ar) || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-tertiary">{t('pages.events.participants')}</span>
                  <span className="font-medium text-text-primary">
                    {event.participant_count ?? 0}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: 'title',
              header: t('pages.events.columns.title'),
              render: (row) => (
                <div>
                  <p className="font-medium text-text-primary">
                    {pickLocalizedValue(locale, row.title, row.title_ar)}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {t(
                      `eventTypes.${
                        EVENT_TYPE_OPTIONS.find((option) => option.value === row.event_type)
                          ?.label ?? 'schoolTrip'
                      }`,
                    )}
                  </p>
                </div>
              ),
            },
            {
              key: 'status',
              header: t('pages.events.columns.status'),
              render: (row) => (
                <EventStatusBadge status={row.status} label={t(`statuses.${row.status}`)} />
              ),
            },
            {
              key: 'date',
              header: t('pages.events.columns.date'),
              render: (row) => formatDisplayDate(row.start_date, locale),
            },
            {
              key: 'location',
              header: t('pages.events.columns.location'),
              render: (row) => pickLocalizedValue(locale, row.location, row.location_ar) || '—',
            },
            {
              key: 'participants',
              header: t('pages.events.columns.participants'),
              render: (row) => row.participant_count ?? 0,
            },
          ]}
          data={filteredEvents}
          page={page}
          pageSize={20}
          total={filteredEvents.length}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/${locale}/engagement/events/${row.id}`)}
          isLoading={loading}
        />
      )}

      {!loading && filteredEvents.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
          {t('pages.events.empty')}
        </div>
      ) : null}
    </div>
  );
}
