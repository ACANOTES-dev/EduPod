'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { CreateHomeworkDto } from '@school/shared';
import { toast } from '@school/ui';

import { HomeworkQuickForm } from '../_components/homework-quick-form';

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewHomeworkPage() {
  const t = useTranslations('homework');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [academicYears, setAcademicYears] = React.useState<SelectOption[]>([]);
  const [academicPeriods, setAcademicPeriods] = React.useState<SelectOption[]>([]);
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [ready, setReady] = React.useState(false);

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
      })
      .catch((err) => console.error('[NewHomework] Failed to load options', err))
      .finally(() => setReady(true));
  }, []);

  const handleSubmit = React.useCallback(
    async (data: CreateHomeworkDto) => {
      setIsSubmitting(true);
      try {
        const res = await apiClient<{ data: { id: string } }>('/api/v1/homework', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        toast.success(t('homeworkCreated'));
        router.push(`/${locale}/homework/${res.data.id}`);
      } catch (err: unknown) {
        const ex = err as { error?: { message?: string } };
        toast.error(ex?.error?.message ?? 'Failed to create homework');
      } finally {
        setIsSubmitting(false);
      }
    },
    [locale, router, t],
  );

  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('newHomework')} />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('newHomework')} />
      <div className="rounded-2xl bg-surface-secondary p-4 sm:p-6">
        <HomeworkQuickForm
          classes={classes}
          subjects={subjects}
          academicYears={academicYears}
          academicPeriods={academicPeriods}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
