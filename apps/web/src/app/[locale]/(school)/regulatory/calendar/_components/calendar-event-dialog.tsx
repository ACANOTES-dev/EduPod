'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createCalendarEventSchema, REGULATORY_DOMAINS } from '@school/shared/regulatory';
import type { CreateCalendarEventDto } from '@school/shared/regulatory';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface CalendarEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  defaultAcademicYear?: string;
}

type FormValues = CreateCalendarEventDto;

const EVENT_TYPES: Array<CreateCalendarEventDto['event_type']> = [
  'hard_deadline',
  'soft_deadline',
  'preparation',
  'reminder',
];

export function CalendarEventDialog({
  open,
  onOpenChange,
  onCreated,
  defaultAcademicYear,
}: CalendarEventDialogProps) {
  const t = useTranslations('regulatory.calendar');
  const eventTypeLabel = useTranslations('regulatory.calendar');

  const form = useForm<FormValues>({
    resolver: zodResolver(createCalendarEventSchema),
    defaultValues: {
      domain: 'tusla_attendance',
      event_type: 'hard_deadline',
      title: '',
      description: '',
      due_date: new Date().toISOString().slice(0, 10),
      academic_year: defaultAcademicYear ?? '',
      notes: '',
      reminder_days: [],
      is_recurring: false,
    },
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  React.useEffect(() => {
    if (open) {
      reset({
        domain: 'tusla_attendance',
        event_type: 'hard_deadline',
        title: '',
        description: '',
        due_date: new Date().toISOString().slice(0, 10),
        academic_year: defaultAcademicYear ?? '',
        notes: '',
        reminder_days: [],
        is_recurring: false,
      });
    }
  }, [open, defaultAcademicYear, reset]);

  async function onSubmit(values: FormValues) {
    try {
      await apiClient('/api/v1/regulatory/calendar', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast.success(t('createSuccess'));
      onCreated();
      onOpenChange(false);
    } catch (err) {
      const msg = (err as { error?: { message?: string }; message?: string })?.error?.message;
      toast.error(msg ?? (err as { message?: string })?.message ?? t('createError'));
    }
  }

  function eventTypeText(key: CreateCalendarEventDto['event_type']) {
    switch (key) {
      case 'hard_deadline':
        return eventTypeLabel('hardDeadline');
      case 'soft_deadline':
        return eventTypeLabel('softDeadline');
      case 'preparation':
        return eventTypeLabel('preparation');
      case 'reminder':
        return eventTypeLabel('reminder');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('newEvent')}</DialogTitle>
          <DialogDescription>{t('newEventDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="calendar-domain">{t('domain')}</Label>
              <Controller
                control={control}
                name="domain"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="calendar-domain">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REGULATORY_DOMAINS).map(([key, val]) => (
                        <SelectItem key={key} value={key}>
                          {val.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.domain && <p className="text-xs text-danger-600">{errors.domain.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="calendar-event-type">{t('eventTypeLabel')}</Label>
              <Controller
                control={control}
                name="event_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="calendar-event-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((key) => (
                        <SelectItem key={key} value={key}>
                          {eventTypeText(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calendar-title">{t('eventTitle')}</Label>
            <Input
              id="calendar-title"
              {...register('title')}
              placeholder={t('eventTitlePlaceholder')}
            />
            {errors.title && <p className="text-xs text-danger-600">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="calendar-due-date">{t('dueDate')}</Label>
              <Input id="calendar-due-date" type="date" {...register('due_date')} />
              {errors.due_date && (
                <p className="text-xs text-danger-600">{errors.due_date.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="calendar-academic-year">{t('academicYear')}</Label>
              <Input
                id="calendar-academic-year"
                {...register('academic_year')}
                placeholder={t('academicYearPlaceholder')}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calendar-description">{t('eventDescription')}</Label>
            <Textarea
              id="calendar-description"
              rows={3}
              {...register('description')}
              placeholder={t('eventDescriptionPlaceholder')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calendar-notes">{t('notes')}</Label>
            <Textarea
              id="calendar-notes"
              rows={2}
              {...register('notes')}
              placeholder={t('notesPlaceholder')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('createEvent')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
