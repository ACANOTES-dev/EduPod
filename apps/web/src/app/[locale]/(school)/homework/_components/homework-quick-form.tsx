'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createHomeworkSchema, HOMEWORK_TYPE_VALUES } from '@school/shared';
import type { CreateHomeworkDto } from '@school/shared';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

interface ClassOption {
  id: string;
  name: string;
  subject_id?: string;
  subject_name?: string;
}

interface SelectOption {
  id: string;
  name: string;
}

interface HomeworkQuickFormProps {
  classes: ClassOption[];
  subjects: SelectOption[];
  academicYears: SelectOption[];
  academicPeriods: SelectOption[];
  onSubmit: (data: CreateHomeworkDto) => Promise<void>;
  isSubmitting: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeworkQuickForm({
  classes,
  subjects,
  academicYears,
  academicPeriods,
  onSubmit,
  isSubmitting,
}: HomeworkQuickFormProps) {
  const t = useTranslations('homework');
  const [showMore, setShowMore] = React.useState(false);

  const form = useForm<CreateHomeworkDto>({
    resolver: zodResolver(createHomeworkSchema),
    defaultValues: {
      title: '',
      class_id: '',
      homework_type: 'written',
      due_date: tomorrow(),
      due_time: '09:00',
      academic_year_id: academicYears[0]?.id ?? '',
    },
  });

  const watchClassId = form.watch('class_id');

  React.useEffect(() => {
    const cls = classes.find((c) => c.id === watchClassId);
    if (cls?.subject_id) {
      form.setValue('subject_id', cls.subject_id);
    }
  }, [watchClassId, classes, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Class */}
        <div className="space-y-1.5">
          <Label>{t('class')} *</Label>
          <Controller
            control={form.control}
            name="class_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="text-base"><SelectValue placeholder={t('class')} /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.class_id && <p className="text-sm text-danger-text">{form.formState.errors.class_id.message}</p>}
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <Label>{t('title')} *</Label>
          <Input {...form.register('title')} className="text-base" maxLength={255} />
          {form.formState.errors.title && <p className="text-sm text-danger-text">{form.formState.errors.title.message}</p>}
        </div>

        {/* Due Date */}
        <div className="space-y-1.5">
          <Label>{t('dueDate')} *</Label>
          <Input type="date" {...form.register('due_date')} className="text-base" />
          {form.formState.errors.due_date && <p className="text-sm text-danger-text">{form.formState.errors.due_date.message}</p>}
        </div>

        {/* Homework Type */}
        <div className="space-y-1.5">
          <Label>{t('homeworkType')} *</Label>
          <Controller
            control={form.control}
            name="homework_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOMEWORK_TYPE_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>{v.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Academic Year */}
        <div className="space-y-1.5">
          <Label>{t('academicYear')} *</Label>
          <Controller
            control={form.control}
            name="academic_year_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {academicYears.map((y) => (
                    <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <button type="button" onClick={() => setShowMore(!showMore)} className="text-sm font-medium text-primary-600 hover:text-primary-700">
        {t('moreOptions')} {showMore ? '▲' : '▼'}
      </button>

      {showMore && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('description')}</Label>
            <Textarea {...form.register('description')} rows={3} className="text-base" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('dueTime')}</Label>
            <Input type="time" {...form.register('due_time')} className="text-base" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('maxPoints')}</Label>
            <Input type="number" {...form.register('max_points', { valueAsNumber: true })} min={0} max={100} className="text-base" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('subject')}</Label>
            <Controller
              control={form.control}
              name="subject_id"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger className="text-base"><SelectValue placeholder={t('subject')} /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('academicPeriod')}</Label>
            <Controller
              control={form.control}
              name="academic_period_id"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger className="text-base"><SelectValue placeholder={t('academicPeriod')} /></SelectTrigger>
                  <SelectContent>
                    {academicPeriods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      )}

      <p className="text-xs text-text-tertiary">{t('publishImmediately')}</p>

      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? t('loading') : t('setHomework')}
      </Button>
    </form>
  );
}
