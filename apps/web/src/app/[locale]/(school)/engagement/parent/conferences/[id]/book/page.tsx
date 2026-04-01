'use client';

import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import {
  getStaffDisplayName,
  pickLocalizedValue,
  type ConferenceBookingRecord,
  type ConferenceTimeSlotRecord,
  type ParentConferenceBookingsResponse,
  type ParentEventDetail,
  type PaginatedResponse,
  type StaffOption,
} from '../../../../_components/engagement-types';
import { SlotPicker } from '../../../../_components/slot-picker';

function overlaps(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
): boolean {
  return new Date(leftStart) < new Date(rightEnd) && new Date(rightStart) < new Date(leftEnd);
}

export default function ParentConferenceBookingPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [event, setEvent] = React.useState<ParentEventDetail | null>(null);
  const [availableSlots, setAvailableSlots] = React.useState<ConferenceTimeSlotRecord[]>([]);
  const [bookings, setBookings] = React.useState<ConferenceBookingRecord[]>([]);
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);
  const [selectedSlotByTeacher, setSelectedSlotByTeacher] = React.useState<Record<string, string>>(
    {},
  );
  const [selectedStudentByTeacher, setSelectedStudentByTeacher] = React.useState<
    Record<string, string>
  >({});
  const [busyTeacherId, setBusyTeacherId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const [eventResponse, slotsResponse, bookingsResponse, staffResponse] = await Promise.all([
        apiClient<ParentEventDetail>(`/api/v1/parent/engagement/events/${eventId}`),
        apiClient<{ data: ConferenceTimeSlotRecord[] }>(
          `/api/v1/parent/engagement/conferences/${eventId}/available-slots`,
        ),
        apiClient<ParentConferenceBookingsResponse>(
          `/api/v1/parent/engagement/conferences/${eventId}/my-bookings`,
        ),
        apiClient<PaginatedResponse<StaffOption>>('/api/v1/staff-profiles?page=1&pageSize=500'),
      ]);

      setEvent(eventResponse);
      setAvailableSlots(slotsResponse.data);
      setBookings(bookingsResponse.data);
      setStaffOptions(staffResponse.data);

      const defaultStudentMap: Record<string, string> = {};

      for (const slot of slotsResponse.data) {
        const existingValue = defaultStudentMap[slot.teacher_id];

        if (!existingValue) {
          defaultStudentMap[slot.teacher_id] = eventResponse.my_participants[0]?.student_id ?? '';
        }
      }

      setSelectedStudentByTeacher(defaultStudentMap);
    } catch (error) {
      console.error('[ParentConferenceBookingPage.loadData]', error);
      toast.error(t('parentConferenceBooking.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const staffLookup = new Map(staffOptions.map((staffMember) => [staffMember.id, staffMember]));
  const slotsByTeacher = availableSlots.reduce<Record<string, ConferenceTimeSlotRecord[]>>(
    (accumulator, slot) => {
      accumulator[slot.teacher_id] = [...(accumulator[slot.teacher_id] ?? []), slot];
      return accumulator;
    },
    {},
  );

  async function bookSlot(teacherId: string) {
    const selectedSlotId = selectedSlotByTeacher[teacherId];
    const selectedStudentId = selectedStudentByTeacher[teacherId];

    if (!selectedSlotId || !selectedStudentId) {
      return;
    }

    setBusyTeacherId(teacherId);

    try {
      await apiClient(`/api/v1/parent/engagement/conferences/${eventId}/book`, {
        method: 'POST',
        body: JSON.stringify({
          time_slot_id: selectedSlotId,
          student_id: selectedStudentId,
        }),
      });
      toast.success(t('parentConferenceBooking.bookSuccess'));
      await loadData();
    } catch (error) {
      console.error('[ParentConferenceBookingPage.bookSlot]', error);
      toast.error(t('parentConferenceBooking.bookError'));
    } finally {
      setBusyTeacherId(null);
    }
  }

  if (isLoading || !event) {
    return <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickLocalizedValue(locale, event.title, event.title_ar)}
        description={t('parentConferenceBooking.description')}
        actions={
          <Button asChild variant="outline">
            <Link href={`/${locale}/engagement/parent/conferences/${eventId}/my-bookings`}>
              {t('parentConferenceBooking.viewMyBookings')}
            </Link>
          </Button>
        }
      />

      {Object.keys(slotsByTeacher).length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">{t('parentConferenceBooking.empty')}</p>
        </section>
      ) : (
        Object.entries(slotsByTeacher).map(([teacherId, teacherSlots]) => {
          const teacherLabel = getStaffDisplayName(
            staffLookup.get(teacherId) ?? { user: { email: teacherId }, staff_number: teacherId },
          );
          const warningBySlotId = teacherSlots.reduce<Record<string, string>>(
            (accumulator, slot) => {
              const overlappingBooking = bookings.find((booking) =>
                overlaps(
                  slot.start_time,
                  slot.end_time,
                  booking.time_slot.start_time,
                  booking.time_slot.end_time,
                ),
              );

              if (overlappingBooking) {
                const overlappingTeacher = getStaffDisplayName(
                  staffLookup.get(overlappingBooking.time_slot.teacher?.id ?? '') ?? {
                    user: { email: overlappingBooking.time_slot.teacher?.id ?? '' },
                    staff_number: overlappingBooking.time_slot.teacher?.id ?? '',
                  },
                );
                accumulator[slot.id] = t('parentConferenceBooking.overlapWarning', {
                  teacher: overlappingTeacher,
                  time: new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', {
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(overlappingBooking.time_slot.start_time)),
                });
              }

              return accumulator;
            },
            {},
          );

          return (
            <section key={teacherId} className="rounded-3xl border border-border bg-surface p-6">
              <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
                <SlotPicker
                  locale={locale}
                  teacherLabel={teacherLabel}
                  slots={teacherSlots}
                  selectedSlotId={selectedSlotByTeacher[teacherId] ?? null}
                  warningBySlotId={warningBySlotId}
                  onSelectSlot={(slot) =>
                    setSelectedSlotByTeacher((current) => ({
                      ...current,
                      [teacherId]: slot.id,
                    }))
                  }
                />
                <div className="rounded-3xl border border-border bg-surface-secondary/50 p-4">
                  <p className="text-sm font-semibold text-text-primary">
                    {t('parentConferenceBooking.chooseStudent')}
                  </p>
                  <Select
                    value={selectedStudentByTeacher[teacherId] ?? ''}
                    onValueChange={(value) =>
                      setSelectedStudentByTeacher((current) => ({
                        ...current,
                        [teacherId]: value,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {event.my_participants.map((participant) => (
                        <SelectItem key={participant.student_id} value={participant.student_id}>
                          {participant.student.first_name} {participant.student.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    className="mt-4 w-full"
                    disabled={
                      !selectedSlotByTeacher[teacherId] ||
                      !selectedStudentByTeacher[teacherId] ||
                      busyTeacherId === teacherId
                    }
                    onClick={() => void bookSlot(teacherId)}
                  >
                    {busyTeacherId === teacherId
                      ? t('parentConferenceBooking.booking')
                      : t('parentConferenceBooking.bookButton')}
                  </Button>
                </div>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
