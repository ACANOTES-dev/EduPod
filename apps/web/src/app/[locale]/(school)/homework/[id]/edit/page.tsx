'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { CreateHomeworkDto, UpdateHomeworkDto } from '@school/shared';
import { toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { HomeworkQuickForm } from '../../_components/homework-quick-form';

interface SelectOption {
  id: string;
  name: string;
}

interface ClassOption extends SelectOption {
  subject_id?: string;
  subject_name?: string;
}

interface HomeworkDetail {
  id: string;
  title: string;
  description?: string | null;
  class_id: string;
  subject_id?: string | null;
  academic_year_id: string;
  academic_period_id?: string | null;
  homework_type: CreateHomeworkDto['homework_type'];
  due_date: string;
  due_time?: string | null;
  max_points?: number | null;
  status: 'draft' | 'published' | 'archived';
}

function isoToDateInput(iso: string): string {
  return iso.slice(0, 10);
}

function isoToTimeInput(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const match = iso.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : undefined;
}

export default function EditHomeworkPage() {
  const t = useTranslations('homework');
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [hw, setHw] = React.useState<HomeworkDetail | null>(null);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [academicYears, setAcademicYears] = React.useState<SelectOption[]>([]);
  const [academicPeriods, setAcademicPeriods] = React.useState<SelectOption[]>([]);
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!id) return;
    Promise.all([
      apiClient<{ data: HomeworkDetail }>(`/api/v1/homework/${id}`),
      apiClient<{ data: ClassOption[] }>('/api/v1/classes?pageSize=200', { silent: true }),
      apiClient<{ data: SelectOption[] }>('/api/v1/academic-years', { silent: true }),
      apiClient<{ data: SelectOption[] }>('/api/v1/academic-periods?pageSize=100', {
        silent: true,
      }),
    ])
      .then(([hwRes, c, y, p]) => {
        if (hwRes.data.status !== 'draft') {
          toast.error(t('onlyDraftsEditable'));
          router.replace(`/${locale}/homework/${id}`);
          return;
        }
        setHw(hwRes.data);
        setClasses(c.data ?? []);
        setAcademicYears(y.data ?? []);
        setAcademicPeriods(p.data ?? []);
        const subs = (c.data ?? [])
          .filter((cls) => cls.subject_id && cls.subject_name)
          .map((cls) => ({ id: cls.subject_id!, name: cls.subject_name! }));
        const unique = Array.from(new Map(subs.map((s) => [s.id, s])).values());
        setSubjects(unique);
      })
      .catch((err) => {
        console.error('[EditHomework] Failed to load', err);
        toast.error(t('notFound'));
        router.replace(`/${locale}/homework`);
      })
      .finally(() => setReady(true));
  }, [id, locale, router, t]);

  const handleSubmit = React.useCallback(
    async (data: CreateHomeworkDto) => {
      setIsSubmitting(true);
      try {
        const payload: UpdateHomeworkDto = {
          title: data.title,
          description: data.description,
          class_id: data.class_id,
          subject_id: data.subject_id,
          academic_year_id: data.academic_year_id,
          academic_period_id: data.academic_period_id,
          homework_type: data.homework_type,
          due_date: data.due_date,
          due_time: data.due_time,
          max_points: data.max_points,
        };
        await apiClient(`/api/v1/homework/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast.success(t('homeworkUpdated'));
        router.push(`/${locale}/homework/${id}`);
      } catch (err: unknown) {
        const ex = err as { error?: { message?: string } };
        toast.error(ex?.error?.message ?? 'Failed to update homework');
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, locale, router, t],
  );

  if (!ready || !hw) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('editHomework')} />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  const initialValues: Partial<CreateHomeworkDto> = {
    title: hw.title,
    description: hw.description ?? undefined,
    class_id: hw.class_id,
    subject_id: hw.subject_id ?? undefined,
    academic_year_id: hw.academic_year_id,
    academic_period_id: hw.academic_period_id ?? undefined,
    homework_type: hw.homework_type,
    due_date: isoToDateInput(hw.due_date),
    due_time: isoToTimeInput(hw.due_time),
    max_points: hw.max_points ?? undefined,
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('editHomework')} />
      <div className="rounded-2xl bg-surface-secondary p-4 sm:p-6">
        <HomeworkQuickForm
          classes={classes}
          subjects={subjects}
          academicYears={academicYears}
          academicPeriods={academicPeriods}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          initialValues={initialValues}
          submitLabel={t('saveChanges')}
        />
      </div>
    </div>
  );
}
