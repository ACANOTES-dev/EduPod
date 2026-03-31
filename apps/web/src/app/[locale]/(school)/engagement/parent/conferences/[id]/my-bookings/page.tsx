'use client';

import { Button, toast } from '@school/ui';
import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  formatDisplayDate,
  formatDisplayTimeRange,
  getStaffDisplayName,
  type ParentConferenceBookingsResponse,
  type PaginatedResponse,
  type StaffOption,
} from '../../../../_components/engagement-types';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

export default function ParentConferenceBookingsPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [response, setResponse] = React.useState<ParentConferenceBookingsResponse | null>(null);
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyBookingId, setBusyBookingId] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const [bookingsResponse, staffResponse] = await Promise.all([
        apiClient<ParentConferenceBookingsResponse>(
          `/api/v1/parent/engagement/conferences/${eventId}/my-bookings`,
        ),
        apiClient<PaginatedResponse<StaffOption>>('/api/v1/staff-profiles?page=1&pageSize=500'),
      ]);

      setResponse(bookingsResponse);
      setStaffOptions(staffResponse.data);
    } catch (error) {
      console.error('[ParentConferenceBookingsPage.loadData]', error);
      toast.error(t('parentConferenceBookings.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  async function cancelBooking(bookingId: string) {
    setBusyBookingId(bookingId);

    try {
      await apiClient(`/api/v1/parent/engagement/conferences/${eventId}/bookings/${bookingId}`, {
        method: 'DELETE',
      });
      toast.success(t('parentConferenceBookings.cancelSuccess'));
      await loadData();
    } catch (error) {
      console.error('[ParentConferenceBookingsPage.cancelBooking]', error);
      toast.error(t('parentConferenceBookings.cancelError'));
    } finally {
      setBusyBookingId(null);
    }
  }

  if (isLoading || !response) {
    return <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  const staffLookup = new Map(staffOptions.map((staffMember) => [staffMember.id, staffMember]));
  const allowCancellation = response.allow_parent_conference_cancellation !== false;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('parentConferenceBookings.title')}
        description={t('parentConferenceBookings.description')}
        actions={
          <Button asChild variant="outline">
            <Link href={`/${locale}/engagement/parent/conferences/${eventId}/book`}>
              {t('parentConferenceBookings.backToBooking')}
            </Link>
          </Button>
        }
      />

      {response.data.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">{t('parentConferenceBookings.empty')}</p>
        </section>
      ) : (
        <div className="space-y-4">
          {response.data.map((booking) => (
            <article key={booking.id} className="rounded-3xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-text-primary">
                    {getStaffDisplayName(
                      staffLookup.get(booking.time_slot.teacher?.id ?? '') ?? {
                        user: { email: booking.time_slot.teacher?.id ?? '' },
                        staff_number: booking.time_slot.teacher?.id ?? '',
                      },
                    )}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {booking.student.first_name} {booking.student.last_name}
                  </p>
                </div>
                {allowCancellation ? (
                  <Button
                    variant="outline"
                    onClick={() => void cancelBooking(booking.id)}
                    disabled={busyBookingId === booking.id}
                  >
                    {busyBookingId === booking.id
                      ? t('parentConferenceBookings.cancelling')
                      : t('parentConferenceBookings.cancel')}
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-surface-secondary/60 p-4">
                  <p className="text-sm text-text-secondary">
                    {t('parentConferenceBookings.date')}
                  </p>
                  <p className="mt-1 font-medium text-text-primary">
                    {formatDisplayDate(booking.time_slot.start_time, locale)}
                  </p>
                </div>
                <div className="rounded-2xl bg-surface-secondary/60 p-4">
                  <p className="text-sm text-text-secondary">
                    {t('parentConferenceBookings.time')}
                  </p>
                  <p className="mt-1 font-medium text-text-primary">
                    {formatDisplayTimeRange(
                      booking.time_slot.start_time,
                      booking.time_slot.end_time,
                      locale,
                    )}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
