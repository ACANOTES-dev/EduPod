'use client';

import { Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import {
  formatDisplayDate,
  formatDisplayTimeRange,
  pickLocalizedValue,
  type EventRecord,
  type TeacherConferenceSchedule,
} from '../../../_components/engagement-types';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


export default function TeacherConferenceSchedulePage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [event, setEvent] = React.useState<EventRecord | null>(null);
  const [schedule, setSchedule] = React.useState<TeacherConferenceSchedule | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [togglingSlotId, setTogglingSlotId] = React.useState<string | null>(null);

  const loadData = React.useCallback(
    async (isMounted: { current: boolean }) => {
      setIsLoading(true);

      try {
        const [eventResponse, scheduleResponse] = await Promise.all([
          apiClient<EventRecord>(`/api/v1/engagement/events/${eventId}`),
          apiClient<TeacherConferenceSchedule>(
            `/api/v1/engagement/conferences/${eventId}/my-schedule`,
          ),
        ]);

        if (!isMounted.current) {
          return;
        }

        setEvent(eventResponse);
        setSchedule(scheduleResponse);
      } catch (error) {
        console.error('[TeacherConferenceSchedulePage.loadData]', error);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    },
    [eventId],
  );

  React.useEffect(() => {
    const isMounted = { current: true };
    void loadData(isMounted);
    return () => {
      isMounted.current = false;
    };
  }, [loadData]);

  async function handleToggleSlot(slotId: string, currentStatus: 'available' | 'blocked') {
    const newStatus = currentStatus === 'available' ? 'blocked' : 'available';
    setTogglingSlotId(slotId);

    try {
      await apiClient(`/api/v1/engagement/conferences/${eventId}/my-slots/${slotId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });

      const isMounted = { current: true };
      await loadData(isMounted);
    } catch (error) {
      console.error('[TeacherConferenceSchedulePage.handleToggleSlot]', error);
      toast.error(t('teacherConferenceSchedule.toggleError'));
    } finally {
      setTogglingSlotId(null);
    }
  }

  if (isLoading || !event || !schedule) {
    return <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  return (
    <div className="space-y-6 print:space-y-4">
      <style jsx global>{`
        @media print {
          nav,
          header,
          aside,
          .print-hidden {
            display: none !important;
          }

          body {
            background: white !important;
          }

          .print-surface {
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <PageHeader
        title={pickLocalizedValue(locale, event.title, event.title_ar)}
        description={t('teacherConferenceSchedule.description')}
        actions={
          <Button className="print-hidden" onClick={() => window.print()}>
            <Printer className="me-2 h-4 w-4" />
            {t('teacherConferenceSchedule.print')}
          </Button>
        }
      />

      <section className="print-surface rounded-3xl border border-border bg-surface p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-surface-secondary/60 p-4">
            <p className="text-sm text-text-secondary">{t('teacherConferenceSchedule.date')}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">
              {formatDisplayDate(event.start_date, locale)}
            </p>
          </div>
          <div className="rounded-2xl bg-surface-secondary/60 p-4">
            <p className="text-sm text-text-secondary">
              {t('teacherConferenceSchedule.totalSlots')}
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{schedule.slots.length}</p>
          </div>
          <div className="rounded-2xl bg-surface-secondary/60 p-4">
            <p className="text-sm text-text-secondary">{t('teacherConferenceSchedule.booked')}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">
              {schedule.slots.filter((slot) => slot.booking).length}
            </p>
          </div>
        </div>
      </section>

      <section className="print-surface rounded-3xl border border-border bg-surface p-6">
        <div className="space-y-4">
          {schedule.slots.map((slot) => {
            const bookedByName =
              [slot.booking?.booked_by?.first_name, slot.booking?.booked_by?.last_name]
                .filter(Boolean)
                .join(' ') ||
              slot.booking?.booked_by?.email ||
              t('teacherConferenceSchedule.notBooked');

            const canToggle = slot.status === 'available' || slot.status === 'blocked';

            return (
              <article key={slot.id} className="rounded-2xl border border-border p-4">
                <div className="grid gap-4 md:grid-cols-[180px_1fr_1fr_auto]">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {formatDisplayTimeRange(slot.start_time, slot.end_time, locale)}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {t(`conferenceSchedule.statuses.${slot.status}`)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                      {t('teacherConferenceSchedule.student')}
                    </p>
                    <p className="mt-1 text-sm text-text-primary">
                      {slot.booking
                        ? `${slot.booking.student.first_name} ${slot.booking.student.last_name}`
                        : t('teacherConferenceSchedule.freeSlot')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                      {t('teacherConferenceSchedule.parent')}
                    </p>
                    <p className="mt-1 text-sm text-text-primary">{bookedByName}</p>
                  </div>
                  {canToggle && (
                    <div className="flex items-center print-hidden">
                      <Button
                        size="sm"
                        variant={slot.status === 'blocked' ? 'default' : 'outline'}
                        disabled={togglingSlotId === slot.id}
                        onClick={() => {
                          void handleToggleSlot(slot.id, slot.status as 'available' | 'blocked');
                        }}
                      >
                        {slot.status === 'blocked'
                          ? t('teacherConferenceSchedule.markAvailable')
                          : t('teacherConferenceSchedule.markBlocked')}
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
