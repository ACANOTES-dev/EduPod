'use client';

import { Button, toast } from '@school/ui';
import { CreditCard, FileSignature } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  formatDisplayDate,
  isConferenceEvent,
  pickLocalizedValue,
  type ParentEventDetail,
  type ParentPendingForm,
} from '../../../_components/engagement-types';
import { EventStatusBadge } from '../../../_components/event-status-badge';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


export default function ParentEngagementEventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [event, setEvent] = React.useState<ParentEventDetail | null>(null);
  const [pendingForms, setPendingForms] = React.useState<ParentPendingForm[]>([]);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    try {
      const [eventResponse, formsResponse] = await Promise.all([
        apiClient<ParentEventDetail>(`/api/v1/parent/engagement/events/${id}`),
        apiClient<ParentPendingForm[]>('/api/v1/parent/engagement/pending-forms'),
      ]);

      setEvent(eventResponse);
      setPendingForms(formsResponse.filter((form) => form.event_id === id));
    } catch (error) {
      console.error('[ParentEngagementEventDetailPage.loadData]', error);
      toast.error(t('parent.eventLoadError'));
    }
  }, [id, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  async function runAction(action: 'register' | 'withdraw', studentId: string) {
    setBusyAction(`${action}:${studentId}`);
    try {
      await apiClient(`/api/v1/parent/engagement/events/${id}/${action}/${studentId}`, {
        method: 'POST',
      });
      toast.success(t(`parent.${action}Success`));
      await loadData();
    } catch (error) {
      console.error('[ParentEngagementEventDetailPage.runAction]', error);
      toast.error(t(`parent.${action}Error`));
    } finally {
      setBusyAction(null);
    }
  }

  if (!event) {
    return <div className="h-64 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  const isConference = isConferenceEvent(event.event_type);

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickLocalizedValue(locale, event.title, event.title_ar)}
        description={pickLocalizedValue(locale, event.description, event.description_ar)}
      />

      <div className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <EventStatusBadge status={event.status} label={t(`statuses.${event.status}`)} />
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
            {formatDisplayDate(event.start_date, locale)}
          </span>
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
            {pickLocalizedValue(locale, event.location, event.location_ar) || '—'}
          </span>
        </div>
      </div>

      {isConference ? (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t('parent.conferenceActionsTitle')}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {t('parent.conferenceActionsDescription')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/${locale}/engagement/parent/conferences/${event.id}/book`}>
                  {t('parent.bookConference')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/${locale}/engagement/parent/conferences/${event.id}/my-bookings`}>
                  {t('parent.myConferenceBookings')}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{t('parent.childrenActions')}</h2>
          <div className="mt-5 space-y-4">
            {event.my_participants.map((participant) => {
              const pendingForm = pendingForms.find(
                (form) => form.student_id === participant.student_id,
              );
              const canRegister = ['invited', 'withdrawn'].includes(participant.status);
              const canWithdraw = [
                'registered',
                'confirmed',
                'consent_pending',
                'payment_pending',
              ].includes(participant.status);

              return (
                <article key={participant.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-text-primary">
                        {participant.student.first_name} {participant.student.last_name}
                      </p>
                      <p className="text-sm text-text-secondary">
                        {t('parent.statusSummary', {
                          registration: participant.status.replace(/_/g, ' '),
                          consent: (participant.consent_status ?? 'pending').replace(/_/g, ' '),
                          payment: (participant.payment_status ?? 'not_required').replace(
                            /_/g,
                            ' ',
                          ),
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {canRegister ? (
                      <Button
                        disabled={busyAction === `register:${participant.student_id}`}
                        onClick={() => void runAction('register', participant.student_id)}
                      >
                        {t('parent.register')}
                      </Button>
                    ) : null}
                    {canWithdraw ? (
                      <Button
                        variant="outline"
                        disabled={busyAction === `withdraw:${participant.student_id}`}
                        onClick={() => void runAction('withdraw', participant.student_id)}
                      >
                        {t('parent.withdraw')}
                      </Button>
                    ) : null}
                    {pendingForm ? (
                      <Button asChild variant="outline">
                        <Link href={`/${locale}/engagement/parent/forms/${pendingForm.id}`}>
                          <FileSignature className="me-2 h-4 w-4" />
                          {t('parent.completeConsent')}
                        </Link>
                      </Button>
                    ) : null}
                    {participant.payment_status === 'pending' && event.fee_amount ? (
                      <Button asChild variant="outline">
                        <Link href={`/${locale}/dashboard`}>
                          <CreditCard className="me-2 h-4 w-4" />
                          {t('parent.pay')}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{t('parent.eventSummary')}</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-text-tertiary">{t('parent.starts')}</dt>
              <dd className="font-medium text-text-primary">
                {formatDisplayDate(event.start_date, locale)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-tertiary">{t('parent.ends')}</dt>
              <dd className="font-medium text-text-primary">
                {formatDisplayDate(event.end_date, locale)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-tertiary">{t('parent.location')}</dt>
              <dd className="font-medium text-text-primary">
                {pickLocalizedValue(locale, event.location, event.location_ar) || '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-tertiary">{t('parent.fee')}</dt>
              <dd className="font-medium text-text-primary">{event.fee_amount ?? 0}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
