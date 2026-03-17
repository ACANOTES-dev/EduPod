'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ClassForm, type ClassFormValues } from '../../_components/class-form';

interface ClassDetail {
  id: string;
  name: string;
  status: string;
  academic_year: { id: string; name: string };
  year_group: { id: string; name: string };
  subject: { id: string } | null;
  homeroom_teacher_staff_id: string | null;
}

interface PageProps {
  params: { id: string };
}

export default function EditClassPage({ params }: PageProps) {
  const t = useTranslations('classes');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';
  const { id } = params;

  const [cls, setCls] = React.useState<ClassDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    apiClient<ClassDetail>(`/api/v1/classes/${id}`)
      .then((res) => setCls(res))
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const handleSubmit = async (values: ClassFormValues) => {
    await apiClient(`/api/v1/classes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: values.name,
        academic_year_id: values.academic_year_id,
        year_group_id: values.year_group_id,
        subject_id: values.subject_id || undefined,
        homeroom_teacher_staff_id: values.homeroom_teacher_staff_id || undefined,
        status: values.status,
      }),
    });
    router.push(`/${locale}/classes/${id}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-60 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (error || !cls) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{error || t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('editClass')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {tc('back')}
          </Button>
        }
      />
      <ClassForm
        initialValues={{
          name: cls.name,
          academic_year_id: cls.academic_year.id,
          year_group_id: cls.year_group.id,
          subject_id: cls.subject?.id ?? '',
          homeroom_teacher_staff_id: cls.homeroom_teacher_staff_id ?? '',
          status: cls.status,
        }}
        onSubmit={handleSubmit}
        submitLabel={tc('save')}
        onCancel={() => router.push(`/${locale}/classes/${id}`)}
      />
    </div>
  );
}
