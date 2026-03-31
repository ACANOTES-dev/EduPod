'use client';

import { Button } from '@school/ui';
import { CalendarDays } from 'lucide-react';
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

export default function ParentEngagementEventsPage() {
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [events, setEvents] = React.useState<ParentEventRow[]>([]);
  const [pendingForms, setPendingForms] = React.useState<ParentPendingForm[]>([]);
  const [loading, setLoading] = React.useState(true);

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

      <div className="grid gap-4 md:grid-cols-2">
        {events.map((event) => {
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

      {events.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
          <CalendarDays className="mx-auto mb-3 h-6 w-6 text-text-tertiary" />
          {t('parent.noEvents')}
        </div>
      ) : null}
    </div>
  );
}
