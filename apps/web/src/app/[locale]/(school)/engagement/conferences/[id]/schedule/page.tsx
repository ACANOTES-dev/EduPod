'use client';

import { Ban, Search, UserPlus, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@school/ui';

import {
  formatDisplayDate,
  formatDisplayTimeRange,
  getStaffDisplayName,
  pickLocalizedValue,
  type ConferenceBookingRecord,
  type ConferenceBookingStats,
  type ConferenceTimeSlotRecord,
  type EventRecord,
  type PaginatedResponse,
  type StaffOption,
  type StudentOption,
} from '../../../_components/engagement-types';
import { ScheduleGrid } from '../../../_components/schedule-grid';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

export default function ConferenceSchedulePage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [event, setEvent] = React.useState<EventRecord | null>(null);
  const [slots, setSlots] = React.useState<ConferenceTimeSlotRecord[]>([]);
  const [stats, setStats] = React.useState<ConferenceBookingStats | null>(null);
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);
  const [selectedSlot, setSelectedSlot] = React.useState<ConferenceTimeSlotRecord | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = React.useState(false);
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentOption | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const [eventResponse, slotResponse, statsResponse, staffResponse] = await Promise.all([
        apiClient<EventRecord>(`/api/v1/engagement/events/${eventId}`),
        apiClient<PaginatedResponse<ConferenceTimeSlotRecord>>(
          `/api/v1/engagement/conferences/${eventId}/time-slots?page=1&pageSize=500`,
        ),
        apiClient<ConferenceBookingStats>(`/api/v1/engagement/conferences/${eventId}/stats`),
        apiClient<PaginatedResponse<StaffOption>>('/api/v1/staff-profiles?page=1&pageSize=500'),
      ]);

      setEvent(eventResponse);
      setSlots(slotResponse.data);
      setStats(statsResponse);
      setStaffOptions(staffResponse.data);
    } catch (error) {
      console.error('[ConferenceSchedulePage.loadData]', error);
      toast.error(t('conferenceSchedule.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    if (!isBookingDialogOpen || !studentSearch.trim()) {
      setStudentResults([]);
      return;
    }

    let isMounted = true;

    apiClient<{ data: StudentOption[] }>(
      `/api/v1/students?search=${encodeURIComponent(studentSearch)}&pageSize=10&status=active`,
    )
      .then((response) => {
        if (isMounted) {
          setStudentResults(response.data);
        }
      })
      .catch((error) => {
        console.error('[ConferenceSchedulePage.studentSearch]', error);
        if (isMounted) {
          setStudentResults([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isBookingDialogOpen, studentSearch]);

  const staffLookup = new Map(staffOptions.map((staffMember) => [staffMember.id, staffMember]));
  const teacherIds = Array.from(new Set(slots.map((slot) => slot.teacher_id))).sort(
    (left, right) => {
      const leftLabel = getStaffDisplayName(
        staffLookup.get(left) ?? { user: { email: left }, staff_number: left },
      );
      const rightLabel = getStaffDisplayName(
        staffLookup.get(right) ?? { user: { email: right }, staff_number: right },
      );

      return leftLabel.localeCompare(rightLabel);
    },
  );

  const teachers = teacherIds.map((teacherId) => ({
    id: teacherId,
    name: getStaffDisplayName(
      staffLookup.get(teacherId) ?? { user: { email: teacherId }, staff_number: teacherId },
    ),
  }));

  async function updateSlotStatus(status: 'available' | 'blocked') {
    if (!selectedSlot) {
      return;
    }

    setIsSubmitting(true);

    try {
      await apiClient(`/api/v1/engagement/conferences/${eventId}/time-slots/${selectedSlot.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(
        status === 'blocked'
          ? t('conferenceSchedule.blockSuccess')
          : t('conferenceSchedule.unblockSuccess'),
      );
      await loadData();
    } catch (error) {
      console.error('[ConferenceSchedulePage.updateSlotStatus]', error);
      toast.error(
        status === 'blocked'
          ? t('conferenceSchedule.blockError')
          : t('conferenceSchedule.unblockError'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createAdminBooking() {
    if (!selectedSlot || !selectedStudent) {
      return;
    }

    setIsSubmitting(true);

    try {
      await apiClient(`/api/v1/engagement/conferences/${eventId}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          time_slot_id: selectedSlot.id,
          student_id: selectedStudent.id,
          booking_type: 'admin_booked',
        }),
      });
      toast.success(t('conferenceSchedule.bookSuccess'));
      setIsBookingDialogOpen(false);
      setSelectedStudent(null);
      setStudentSearch('');
      await loadData();
    } catch (error) {
      console.error('[ConferenceSchedulePage.createAdminBooking]', error);
      toast.error(t('conferenceSchedule.bookError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelBooking(
    booking: ConferenceBookingRecord | ConferenceTimeSlotRecord['booking'],
  ) {
    if (!booking) {
      return;
    }

    setIsSubmitting(true);

    try {
      await apiClient(`/api/v1/engagement/conferences/${eventId}/bookings/${booking.id}`, {
        method: 'DELETE',
      });
      toast.success(t('conferenceSchedule.cancelBookingSuccess'));
      await loadData();
    } catch (error) {
      console.error('[ConferenceSchedulePage.cancelBooking]', error);
      toast.error(t('conferenceSchedule.cancelBookingError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || !event) {
    return <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickLocalizedValue(locale, event.title, event.title_ar)}
        description={t('conferenceSchedule.description')}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/${locale}/engagement/conferences/${eventId}/setup`}>
                {t('conferenceSchedule.backToSetup')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/${locale}/engagement/conferences/${eventId}/my-schedule`}>
                {t('conferenceSchedule.teacherView')}
              </Link>
            </Button>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm text-text-secondary">{t('conferenceSchedule.date')}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {formatDisplayDate(event.start_date, locale)}
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm text-text-secondary">{t('conferenceSchedule.totalSlots')}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {stats?.totals.total ?? slots.length}
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-sm text-text-secondary">{t('conferenceSchedule.bookedSlots')}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {stats?.totals.booked ?? 0}
          </p>
        </div>
      </section>

      <ScheduleGrid
        locale={locale}
        slots={slots}
        stats={stats?.per_teacher}
        teachers={teachers}
        selectedSlotId={selectedSlot?.id ?? null}
        onSelectSlot={setSelectedSlot}
      />

      {stats?.per_teacher?.length ? (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('conferenceSchedule.statsRow')}
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stats.per_teacher.map((entry) => (
              <div key={entry.teacher_id} className="rounded-2xl border border-border px-4 py-3">
                <p className="font-medium text-text-primary">
                  {getStaffDisplayName(
                    staffLookup.get(entry.teacher_id) ?? {
                      user: { email: entry.teacher_id },
                      staff_number: entry.teacher_id,
                    },
                  )}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {t('conferenceSchedule.bookedStat', {
                    booked: entry.booked,
                    total: entry.total,
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {selectedSlot ? (
        <section className="rounded-3xl border border-border bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t('conferenceSchedule.selectedSlot')}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {formatDisplayTimeRange(selectedSlot.start_time, selectedSlot.end_time, locale)}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {teachers.find((teacher) => teacher.id === selectedSlot.teacher_id)?.name ??
                  selectedSlot.teacher_id}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedSlot.status === 'available' ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => void updateSlotStatus('blocked')}
                    disabled={isSubmitting}
                  >
                    <Ban className="me-2 h-4 w-4" />
                    {t('conferenceSchedule.blockSlot')}
                  </Button>
                  <Button onClick={() => setIsBookingDialogOpen(true)} disabled={isSubmitting}>
                    <UserPlus className="me-2 h-4 w-4" />
                    {t('conferenceSchedule.manualBook')}
                  </Button>
                </>
              ) : null}
              {selectedSlot.status === 'blocked' ? (
                <Button onClick={() => void updateSlotStatus('available')} disabled={isSubmitting}>
                  {t('conferenceSchedule.unblockSlot')}
                </Button>
              ) : null}
              {selectedSlot.status === 'booked' && selectedSlot.booking ? (
                <Button
                  variant="outline"
                  onClick={() => void cancelBooking(selectedSlot.booking)}
                  disabled={isSubmitting}
                >
                  {t('conferenceSchedule.cancelBooking')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border p-4">
              <p className="text-sm text-text-secondary">{t('conferenceSchedule.slotStatus')}</p>
              <p className="mt-1 font-medium text-text-primary">
                {t(`conferenceSchedule.statuses.${selectedSlot.status}`)}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-4">
              <p className="text-sm text-text-secondary">
                {t('conferenceSchedule.bookingDetails')}
              </p>
              {selectedSlot.booking ? (
                <div className="mt-1 space-y-2">
                  <p className="text-sm text-text-primary">
                    {selectedSlot.booking.student.first_name}{' '}
                    {selectedSlot.booking.student.last_name}
                  </p>
                  {selectedSlot.booking.video_call_link ? (
                    <a
                      href={selectedSlot.booking.video_call_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <Video className="h-3.5 w-3.5" />
                      {t('conferenceSchedule.videoCallLink')}
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-sm text-text-secondary">
                  {t('conferenceSchedule.noBooking')}
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <Dialog open={isBookingDialogOpen} onOpenChange={setIsBookingDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('conferenceSchedule.manualBookTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-surface-secondary/50 px-4 py-3 text-sm text-text-secondary">
              {selectedSlot ? (
                <>
                  {teachers.find((teacher) => teacher.id === selectedSlot.teacher_id)?.name ??
                    selectedSlot.teacher_id}
                  {' · '}
                  {formatDisplayTimeRange(selectedSlot.start_time, selectedSlot.end_time, locale)}
                </>
              ) : null}
            </div>

            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder={t('conferenceSchedule.searchStudents')}
                className="ps-9"
              />
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {studentResults.map((student) => {
                const isSelected = selectedStudent?.id === student.id;

                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => setSelectedStudent(student)}
                    className={`w-full rounded-2xl border px-4 py-3 text-start transition-colors ${
                      isSelected
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-border bg-surface hover:border-primary-200 hover:bg-primary-50/40'
                    }`}
                  >
                    <p className="font-medium text-text-primary">
                      {student.first_name} {student.last_name}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBookingDialogOpen(false)}>
              {t('conferenceSchedule.close')}
            </Button>
            <Button
              onClick={() => void createAdminBooking()}
              disabled={!selectedStudent || isSubmitting}
            >
              {t('conferenceSchedule.confirmBooking')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
