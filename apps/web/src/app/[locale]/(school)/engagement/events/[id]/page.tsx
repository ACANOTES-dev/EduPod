'use client';

import { ClipboardCheck, Eye, Settings, Users, UsersRound, Map as MapIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';


import { CompletionDashboard } from '../../_components/completion-dashboard';
import {
  EVENT_TYPE_OPTIONS,
  formatDisplayDate,
  humanizeStatus,
  isConferenceEvent,
  isTripEvent,
  pickLocalizedValue,
  type EventDashboardData,
  type EventParticipantRow,
  type EventRecord,
  type PaginatedResponse,
  type StaffOption,
} from '../../_components/engagement-types';
import { EventStatusBadge } from '../../_components/event-status-badge';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

type EventTab = 'participants' | 'staff' | 'settings';

export default function EngagementEventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [tab, setTab] = React.useState<EventTab>('participants');
  const [event, setEvent] = React.useState<EventRecord | null>(null);
  const [dashboard, setDashboard] = React.useState<EventDashboardData | null>(null);
  const [participants, setParticipants] = React.useState<EventParticipantRow[]>([]);
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actionBusy, setActionBusy] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [eventResponse, dashboardResponse, participantsResponse, staffResponse] =
        await Promise.all([
          apiClient<EventRecord>(`/api/v1/engagement/events/${id}`),
          apiClient<EventDashboardData>(`/api/v1/engagement/events/${id}/dashboard`),
          apiClient<PaginatedResponse<EventParticipantRow>>(
            `/api/v1/engagement/events/${id}/participants?page=1&pageSize=5`,
          ),
          apiClient<PaginatedResponse<StaffOption>>('/api/v1/staff-profiles?page=1&pageSize=100'),
        ]);

      setEvent(eventResponse);
      setDashboard(dashboardResponse);
      setParticipants(participantsResponse.data);
      setStaffOptions(staffResponse.data);
    } catch (error) {
      console.error('[EngagementEventDetailPage.loadData]', error);
      toast.error(t('pages.eventDetail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  async function runLifecycleAction(action: 'publish' | 'open' | 'close' | 'cancel') {
    setActionBusy(action);

    try {
      await apiClient(`/api/v1/engagement/events/${id}/${action}`, {
        method: 'POST',
      });
      toast.success(t(`pages.eventDetail.actions.${action}Success`));
      await loadData();
    } catch (error) {
      console.error('[EngagementEventDetailPage.runLifecycleAction]', error);
      toast.error(t(`pages.eventDetail.actions.${action}Error`));
    } finally {
      setActionBusy(null);
    }
  }

  if (loading || !event || !dashboard) {
    return <div className="h-64 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  const staffLookup = new Map(
    staffOptions.map((staffMember) => [
      staffMember.id,
      staffMember.user?.name ||
        [staffMember.first_name, staffMember.last_name].filter(Boolean).join(' ') ||
        staffMember.staff_number ||
        staffMember.id,
    ]),
  );
  const showTripActions = isTripEvent(event.event_type);
  const showConferenceActions = isConferenceEvent(event.event_type);

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickLocalizedValue(locale, event.title, event.title_ar)}
        description={pickLocalizedValue(locale, event.description, event.description_ar)}
        actions={
          <div className="flex flex-wrap gap-2">
            {event.status === 'draft' ? (
              <Button
                disabled={actionBusy === 'publish'}
                onClick={() => void runLifecycleAction('publish')}
              >
                {t('pages.eventDetail.actions.publish')}
              </Button>
            ) : null}
            {event.status === 'published' ? (
              <Button
                disabled={actionBusy === 'open'}
                onClick={() => void runLifecycleAction('open')}
              >
                {t('pages.eventDetail.actions.open')}
              </Button>
            ) : null}
            {event.status === 'open' ? (
              <Button
                variant="outline"
                disabled={actionBusy === 'close'}
                onClick={() => void runLifecycleAction('close')}
              >
                {t('pages.eventDetail.actions.close')}
              </Button>
            ) : null}
            {!['completed', 'archived', 'cancelled'].includes(event.status) ? (
              <Button
                variant="outline"
                disabled={actionBusy === 'cancel'}
                onClick={() => void runLifecycleAction('cancel')}
              >
                {t('pages.eventDetail.actions.cancel')}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-border bg-surface p-5">
        <EventStatusBadge status={event.status} label={t(`statuses.${event.status}`)} />
        <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
          {t(
            `eventTypes.${
              EVENT_TYPE_OPTIONS.find((option) => option.value === event.event_type)?.label ??
              'schoolTrip'
            }`,
          )}
        </span>
        <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
          {formatDisplayDate(event.start_date, locale)}
        </span>
        <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
          {pickLocalizedValue(locale, event.location, event.location_ar) ||
            humanizeStatus(event.target_type)}
        </span>
      </div>

      <CompletionDashboard
        consentGranted={dashboard.consent_stats.granted}
        consentTotal={dashboard.total_invited}
        paymentPaid={dashboard.payment_stats.paid + dashboard.payment_stats.waived}
        paymentTotal={dashboard.total_invited}
        registered={dashboard.total_registered}
        invited={dashboard.total_invited}
        capacity={dashboard.capacity}
        capacityUsed={dashboard.capacity_used}
      />

      <div className="flex flex-wrap gap-4 rounded-3xl border border-border bg-surface p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="rounded-2xl bg-surface-secondary p-3 text-text-secondary">
            <UsersRound className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('pages.eventDetail.staffCount')}</p>
            <p className="text-xl font-semibold text-text-primary">{dashboard.staff_count}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="rounded-2xl bg-surface-secondary p-3 text-text-secondary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-text-tertiary">
              {t('pages.eventDetail.staffToStudentRatio')}
            </p>
            <p className="text-xl font-semibold text-text-primary">
              {dashboard.staff_to_student_ratio ?? t('pages.eventDetail.ratioNotAvailable')}
            </p>
          </div>
        </div>
      </div>

      {showTripActions || showConferenceActions ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {showTripActions ? (
            <>
              <div className="rounded-3xl border border-border bg-surface p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-primary-50 p-3 text-primary-700">
                    <MapIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      {t('pages.eventDetail.tripLogisticsTitle')}
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      {t('pages.eventDetail.tripLogisticsDescription')}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/engagement/events/${event.id}/trip-pack`}>
                      {t('pages.eventDetail.tripPack')}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/engagement/events/${event.id}/attendance`}>
                      {t('pages.eventDetail.attendance')}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/engagement/events/${event.id}/risk-assessment`}>
                      {t('pages.eventDetail.riskAssessment')}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/engagement/events/${event.id}/incidents`}>
                      {t('pages.eventDetail.incidents')}
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          {showConferenceActions ? (
            <div className="rounded-3xl border border-border bg-surface p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {t('pages.eventDetail.conferenceTitle')}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t('pages.eventDetail.conferenceDescription')}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={`/${locale}/engagement/conferences/${event.id}/setup`}>
                    {t('pages.eventDetail.setupConference')}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/${locale}/engagement/conferences/${event.id}/schedule`}>
                    {t('pages.eventDetail.viewConferenceSchedule')}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/${locale}/engagement/conferences/${event.id}/my-schedule`}>
                    {t('pages.eventDetail.myConferenceSchedule')}
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex gap-1 overflow-x-auto rounded-3xl border border-border bg-surface p-2">
        {[
          {
            key: 'participants' as const,
            label: t('pages.eventDetail.tabs.participants'),
            icon: Users,
          },
          { key: 'staff' as const, label: t('pages.eventDetail.tabs.staff'), icon: Eye },
          { key: 'settings' as const, label: t('pages.eventDetail.tabs.settings'), icon: Settings },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium ${
              tab === item.key ? 'bg-primary text-white' : 'text-text-secondary'
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'participants' ? (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t('pages.eventDetail.participantsTitle')}
              </h2>
              <p className="text-sm text-text-secondary">
                {t('pages.eventDetail.participantsDescription')}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/${locale}/engagement/events/${event.id}/participants`}>
                {t('pages.eventDetail.manageParticipants')}
              </Link>
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
              >
                <div>
                  <p className="font-medium text-text-primary">
                    {participant.student.first_name} {participant.student.last_name}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {humanizeStatus(participant.consent_status)} /{' '}
                    {humanizeStatus(participant.payment_status)}
                  </p>
                </div>
                <span className="text-sm text-text-secondary">
                  {humanizeStatus(participant.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'staff' ? (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('pages.eventDetail.staffTitle')}
          </h2>
          <div className="mt-5 space-y-3">
            {event.staff?.length ? (
              event.staff.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-text-primary">
                      {staffLookup.get(assignment.staff.id) ?? assignment.staff.id}
                    </p>
                    <p className="text-xs text-text-tertiary">{assignment.staff.user_id ?? '—'}</p>
                  </div>
                  <span className="text-sm text-text-secondary">
                    {humanizeStatus(assignment.role)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">{t('pages.eventDetail.noStaff')}</p>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'settings' ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">
              {t('pages.eventDetail.settingsTitle')}
            </h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-text-tertiary">{t('pages.eventDetail.capacity')}</dt>
                <dd className="font-medium text-text-primary">{event.capacity ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-tertiary">{t('pages.eventDetail.targeting')}</dt>
                <dd className="font-medium text-text-primary">
                  {humanizeStatus(event.target_type)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-tertiary">{t('pages.eventDetail.fee')}</dt>
                <dd className="font-medium text-text-primary">{event.fee_amount ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-tertiary">{t('pages.eventDetail.consentDeadline')}</dt>
                <dd className="font-medium text-text-primary">
                  {formatDisplayDate(event.consent_deadline, locale)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-tertiary">{t('pages.eventDetail.paymentDeadline')}</dt>
                <dd className="font-medium text-text-primary">
                  {formatDisplayDate(event.payment_deadline, locale)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">
              {t('pages.eventDetail.linkedTemplates')}
            </h2>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-border px-4 py-3">
                <p className="text-xs text-text-tertiary">
                  {t('pages.eventDetail.consentTemplate')}
                </p>
                <p className="font-medium text-text-primary">
                  {event.consent_form_template?.name ?? '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-border px-4 py-3">
                <p className="text-xs text-text-tertiary">{t('pages.eventDetail.riskTemplate')}</p>
                <p className="font-medium text-text-primary">
                  {event.risk_assessment_template?.name ?? '—'}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
