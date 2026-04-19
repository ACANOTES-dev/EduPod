'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { HOMEWORK_TYPE_VALUES } from '@school/shared';
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
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface SelectOption {
  id: string;
  name: string;
}

interface ClassOption extends SelectOption {
  subject_id?: string;
  subject_name?: string;
}

const FREQUENCIES = ['daily', 'weekly', 'custom'] as const;
const WEEKDAYS = [
  { value: 0, key: 'sun' as const },
  { value: 1, key: 'mon' as const },
  { value: 2, key: 'tue' as const },
  { value: 3, key: 'wed' as const },
  { value: 4, key: 'thu' as const },
  { value: 5, key: 'fri' as const },
  { value: 6, key: 'sat' as const },
];

const recurringFormSchema = z
  .object({
    title: z.string().min(1).max(255),
    class_id: z.string().uuid(),
    subject_id: z.string().uuid().optional(),
    academic_year_id: z.string().uuid(),
    academic_period_id: z.string().uuid().optional(),
    homework_type: z.enum(HOMEWORK_TYPE_VALUES),
    description: z.string().optional(),
    max_points: z.coerce.number().int().min(0).max(100).optional(),
    frequency: z.enum(FREQUENCIES),
    interval: z.coerce.number().int().min(1).default(1),
    days_of_week: z.array(z.number().int().min(0).max(6)).default([]),
    start_date: z.string().min(1),
    end_date: z.string().min(1),
  })
  .refine((v) => new Date(v.end_date) >= new Date(v.start_date), {
    path: ['end_date'],
    message: 'end_date must be on or after start_date',
  })
  .refine((v) => v.frequency !== 'custom' || v.days_of_week.length > 0, {
    path: ['days_of_week'],
    message: 'days_required',
  });

type RecurringFormValues = z.infer<typeof recurringFormSchema>;

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function inTwoWeeks(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export default function NewRecurringHomeworkPage() {
  const t = useTranslations('homework');
  const tRec = useTranslations('homework.recurring');
  const tDays = useTranslations('homework.recurring.days');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [academicYears, setAcademicYears] = React.useState<SelectOption[]>([]);
  const [academicPeriods, setAcademicPeriods] = React.useState<SelectOption[]>([]);
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [ready, setReady] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: {
      title: '',
      class_id: '',
      homework_type: 'written',
      frequency: 'weekly',
      interval: 1,
      days_of_week: [],
      start_date: tomorrow(),
      end_date: inTwoWeeks(),
      academic_year_id: '',
    },
  });

  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: ClassOption[] }>('/api/v1/classes?pageSize=200', { silent: true }),
      apiClient<{ data: SelectOption[] }>('/api/v1/academic-years', { silent: true }),
      apiClient<{ data: SelectOption[] }>('/api/v1/academic-periods?pageSize=100', {
        silent: true,
      }),
    ])
      .then(([c, y, p]) => {
        setClasses(c.data ?? []);
        setAcademicYears(y.data ?? []);
        setAcademicPeriods(p.data ?? []);
        const subs = (c.data ?? [])
          .filter((cls) => cls.subject_id && cls.subject_name)
          .map((cls) => ({ id: cls.subject_id!, name: cls.subject_name! }));
        const unique = Array.from(new Map(subs.map((s) => [s.id, s])).values());
        setSubjects(unique);
        if (!form.getValues('academic_year_id') && y.data?.[0]) {
          form.setValue('academic_year_id', y.data[0].id);
        }
      })
      .catch((err) => console.error('[NewRecurringHomework] load options', err))
      .finally(() => setReady(true));
  }, [form]);

  const watchClassId = form.watch('class_id');
  React.useEffect(() => {
    const cls = classes.find((c) => c.id === watchClassId);
    if (cls?.subject_id) form.setValue('subject_id', cls.subject_id);
  }, [watchClassId, classes, form]);

  const frequency = form.watch('frequency');
  const daysOfWeek = form.watch('days_of_week');

  const handleSubmit = form.handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      const rule = await apiClient<{ id: string }>('/api/v1/homework/recurrence-rules', {
        method: 'POST',
        body: JSON.stringify({
          frequency: values.frequency,
          interval: values.interval,
          days_of_week: values.frequency === 'custom' ? values.days_of_week : [],
          start_date: values.start_date,
          end_date: values.end_date,
        }),
      });

      const created = await apiClient<{ data: unknown[]; count: number }>(
        '/api/v1/homework/bulk-create',
        {
          method: 'POST',
          body: JSON.stringify({
            recurrence_rule_id: rule.id,
            class_id: values.class_id,
            subject_id: values.subject_id || undefined,
            academic_year_id: values.academic_year_id,
            academic_period_id: values.academic_period_id || undefined,
            title: values.title,
            homework_type: values.homework_type,
            description: values.description || undefined,
            max_points: values.max_points,
            start_date: values.start_date,
            end_date: values.end_date,
          }),
        },
      );

      const startMs = new Date(values.start_date).getTime();
      const endMs = new Date(values.end_date).getTime();
      const rangeDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
      toast.success(tRec('created', { count: created.count, rangeDays }));
      router.push(`/${locale}/homework`);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      toast.error(ex?.error?.message ?? 'Failed to create recurring homework');
    } finally {
      setIsSubmitting(false);
    }
  });

  const toggleDay = (day: number) => {
    const current = form.getValues('days_of_week');
    if (current.includes(day)) {
      form.setValue(
        'days_of_week',
        current.filter((d) => d !== day),
      );
    } else {
      form.setValue(
        'days_of_week',
        [...current, day].sort((a, b) => a - b),
      );
    }
  };

  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeader title={tRec('title')} />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={tRec('title')}
        actions={
          <Link
            href={`/${locale}/homework/new`}
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            {t('newHomework')} →
          </Link>
        }
      />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-6 rounded-2xl bg-surface-secondary p-4 sm:p-6"
      >
        {/* Template fields */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('class')} *</Label>
            <Controller
              control={form.control}
              name="class_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="text-base">
                    <SelectValue placeholder={t('class')} />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.class_id && (
              <p className="text-sm text-danger-text">{form.formState.errors.class_id.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('title')} *</Label>
            <Input {...form.register('title')} className="text-base" maxLength={255} />
            {form.formState.errors.title && (
              <p className="text-sm text-danger-text">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('type')} *</Label>
            <Controller
              control={form.control}
              name="homework_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOMEWORK_TYPE_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('subject')}</Label>
            <Controller
              control={form.control}
              name="subject_id"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger className="text-base">
                    <SelectValue placeholder={t('subject')} />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('academicYear')} *</Label>
            <Controller
              control={form.control}
              name="academic_year_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.name}
                      </SelectItem>
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
                  <SelectTrigger className="text-base">
                    <SelectValue placeholder={t('academicPeriod')} />
                  </SelectTrigger>
                  <SelectContent>
                    {academicPeriods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('maxPoints')}</Label>
            <Input
              type="number"
              {...form.register('max_points', { valueAsNumber: true })}
              min={0}
              max={100}
              className="text-base"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('description')}</Label>
            <Textarea {...form.register('description')} rows={3} className="text-base" />
          </div>
        </div>

        {/* Recurrence section */}
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-text-primary">{tRec('title')}</h2>
            <p className="text-sm text-text-secondary">{tRec('toggleHint')}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{tRec('frequency')} *</Label>
              <Controller
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {tRec(f)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {frequency !== 'custom' && (
              <div className="space-y-1.5">
                <Label>{tRec('interval')} *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    {...form.register('interval', { valueAsNumber: true })}
                    className="w-20 text-base"
                  />
                  <span className="text-sm text-text-secondary">
                    {frequency === 'daily' ? tRec('intervalUnitDaily') : tRec('intervalUnitWeekly')}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{tRec('startDate')} *</Label>
              <Input type="date" {...form.register('start_date')} className="text-base" />
              {form.formState.errors.start_date && (
                <p className="text-sm text-danger-text">
                  {form.formState.errors.start_date.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{tRec('endDate')} *</Label>
              <Input type="date" {...form.register('end_date')} className="text-base" />
              <p className="text-xs text-text-tertiary">{tRec('endDateHint')}</p>
              {form.formState.errors.end_date && (
                <p className="text-sm text-danger-text">
                  {form.formState.errors.end_date.message ===
                  'end_date must be on or after start_date'
                    ? tRec('endBeforeStart')
                    : form.formState.errors.end_date.message}
                </p>
              )}
            </div>
          </div>

          {frequency === 'custom' && (
            <div className="space-y-2">
              <Label>{tRec('daysOfWeek')} *</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const selected = daysOfWeek.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`min-w-11 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        selected
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-border bg-surface text-text-primary hover:border-primary-400'
                      }`}
                    >
                      {tDays(d.key)}
                    </button>
                  );
                })}
              </div>
              {form.formState.errors.days_of_week && (
                <p className="text-sm text-danger-text">{tRec('daysRequired')}</p>
              )}
            </div>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? t('loading') : tRec('submit')}
        </Button>
      </form>
    </div>
  );
}
