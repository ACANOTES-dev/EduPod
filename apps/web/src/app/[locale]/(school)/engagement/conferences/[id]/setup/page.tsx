'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarRange, Clock3, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import type { GenerateTimeSlotsDto } from '@school/shared';
import { generateTimeSlotsSchema } from '@school/shared';
import { Button, Checkbox, Input, Label, toast } from '@school/ui';

import {
  getStaffDisplayName,
  pickLocalizedValue,
  type EventRecord,
  type PaginatedResponse,
  type StaffOption,
} from '../../../_components/engagement-types';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


function calculateSlotsPerTeacher(values: Partial<GenerateTimeSlotsDto>): number {
  if (
    !values.date ||
    !values.start_time ||
    !values.end_time ||
    !values.slot_duration_minutes ||
    values.buffer_minutes === undefined
  ) {
    return 0;
  }

  const start = new Date(`${values.date}T${values.start_time}`);
  const end = new Date(`${values.date}T${values.end_time}`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return 0;
  }

  const slotMs = values.slot_duration_minutes * 60_000;
  const stepMs = slotMs + values.buffer_minutes * 60_000;
  let total = 0;
  let current = start.getTime();

  while (current + slotMs <= end.getTime()) {
    total += 1;
    current += stepMs;
  }

  return total;
}

export default function ConferenceSetupPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [event, setEvent] = React.useState<EventRecord | null>(null);
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const form = useForm<GenerateTimeSlotsDto>({
    resolver: zodResolver(generateTimeSlotsSchema),
    defaultValues: {
      date: '',
      start_time: '16:00',
      end_time: '20:00',
      slot_duration_minutes: 10,
      buffer_minutes: 2,
      teacher_ids: [],
    },
  });

  React.useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);

      try {
        const [eventResponse, staffResponse] = await Promise.all([
          apiClient<EventRecord>(`/api/v1/engagement/events/${eventId}`),
          apiClient<PaginatedResponse<StaffOption>>('/api/v1/staff-profiles?page=1&pageSize=500'),
        ]);

        if (!isMounted) {
          return;
        }

        setEvent(eventResponse);
        setStaffOptions(staffResponse.data);

        const preselectedTeacherIds =
          eventResponse.staff?.map((assignment) => assignment.staff.id) ?? [];

        form.reset({
          date: eventResponse.start_date?.slice(0, 10) ?? '',
          start_time: eventResponse.start_time ?? '16:00',
          end_time: eventResponse.end_time ?? '20:00',
          slot_duration_minutes: eventResponse.slot_duration_minutes ?? 10,
          buffer_minutes: eventResponse.buffer_minutes ?? 2,
          teacher_ids:
            preselectedTeacherIds.length > 0
              ? preselectedTeacherIds
              : staffResponse.data.map((staffMember) => staffMember.id),
        });
      } catch (error) {
        console.error('[ConferenceSetupPage.loadData]', error);
        toast.error(t('conferenceSetup.loadError'));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [eventId, form, t]);

  const watchedValues = form.watch();
  const slotsPerTeacher = calculateSlotsPerTeacher(watchedValues);
  const selectedTeacherIds = watchedValues.teacher_ids ?? [];
  const selectedTeachers = staffOptions.filter((staffMember) =>
    selectedTeacherIds.includes(staffMember.id),
  );

  async function onSubmit(values: GenerateTimeSlotsDto) {
    try {
      const response = await apiClient<{ created: number; per_teacher: number }>(
        `/api/v1/engagement/conferences/${eventId}/time-slots/generate`,
        {
          method: 'POST',
          body: JSON.stringify(values),
        },
      );
      toast.success(
        t('conferenceSetup.generateSuccess', {
          total: response.created,
          perTeacher: response.per_teacher,
        }),
      );
    } catch (error) {
      console.error('[ConferenceSetupPage.onSubmit]', error);
      toast.error(t('conferenceSetup.generateError'));
    }
  }

  function toggleTeacher(teacherId: string) {
    const currentTeacherIds = form.getValues('teacher_ids');
    const nextTeacherIds = currentTeacherIds.includes(teacherId)
      ? currentTeacherIds.filter((id) => id !== teacherId)
      : [...currentTeacherIds, teacherId];

    form.setValue('teacher_ids', nextTeacherIds, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  if (isLoading || !event) {
    return <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickLocalizedValue(locale, event.title, event.title_ar)}
        description={t('conferenceSetup.description')}
        actions={
          <Button asChild variant="outline">
            <Link href={`/${locale}/engagement/conferences/${eventId}/schedule`}>
              {t('conferenceSetup.viewSchedule')}
            </Link>
          </Button>
        }
      />

      <form onSubmit={form.handleSubmit((values) => void onSubmit(values))} className="space-y-6">
        <section className="grid gap-6 rounded-3xl border border-border bg-surface p-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="conference-date">{t('conferenceSetup.fields.date')}</Label>
              <Input id="conference-date" type="date" {...form.register('date')} />
              {form.formState.errors.date ? (
                <p className="text-xs text-danger-text">{form.formState.errors.date.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="conference-start">{t('conferenceSetup.fields.startTime')}</Label>
              <Input id="conference-start" type="time" {...form.register('start_time')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conference-end">{t('conferenceSetup.fields.endTime')}</Label>
              <Input id="conference-end" type="time" {...form.register('end_time')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conference-slot-duration">
                {t('conferenceSetup.fields.slotDuration')}
              </Label>
              <Input
                id="conference-slot-duration"
                type="number"
                min={5}
                max={60}
                {...form.register('slot_duration_minutes', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conference-buffer">{t('conferenceSetup.fields.buffer')}</Label>
              <Input
                id="conference-buffer"
                type="number"
                min={0}
                max={15}
                {...form.register('buffer_minutes', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface-secondary/60 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary-50 p-3 text-primary-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">{t('conferenceSetup.previewTitle')}</p>
                <p className="text-2xl font-semibold text-text-primary">
                  {slotsPerTeacher * selectedTeacherIds.length}
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm text-text-secondary">
              <div className="flex items-center justify-between">
                <span>{t('conferenceSetup.previewPerTeacher')}</span>
                <span className="font-medium text-text-primary">{slotsPerTeacher}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('conferenceSetup.previewTeachers')}</span>
                <span className="font-medium text-text-primary">{selectedTeacherIds.length}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary-50 p-3 text-primary-700">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t('conferenceSetup.teacherHeading')}
              </h2>
              <p className="text-sm text-text-secondary">
                {t('conferenceSetup.teacherDescription')}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {staffOptions.map((staffMember) => {
              const checked = selectedTeacherIds.includes(staffMember.id);

              return (
                <label
                  key={staffMember.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                    checked
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-border bg-surface hover:border-primary-200 hover:bg-primary-50/40'
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleTeacher(staffMember.id)}
                  />
                  <div>
                    <p className="font-medium text-text-primary">
                      {getStaffDisplayName(staffMember)}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {staffMember.staff_number || staffMember.user?.email || '—'}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          {form.formState.errors.teacher_ids ? (
            <p className="mt-3 text-xs text-danger-text">
              {form.formState.errors.teacher_ids.message}
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t('conferenceSetup.previewListTitle')}
              </h2>
              <p className="text-sm text-text-secondary">
                {t('conferenceSetup.previewListDescription')}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {selectedTeachers.map((staffMember) => (
              <div key={staffMember.id} className="rounded-2xl border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">
                    {getStaffDisplayName(staffMember)}
                  </p>
                  <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-semibold text-text-secondary">
                    {t('conferenceSetup.previewTeacherCount', { count: slotsPerTeacher })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? t('conferenceSetup.generating')
              : t('conferenceSetup.generateSlots')}
          </Button>
        </div>
      </form>
    </div>
  );
}
