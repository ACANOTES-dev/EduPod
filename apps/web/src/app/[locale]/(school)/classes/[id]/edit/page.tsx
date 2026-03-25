'use client';

import { Button } from '@school/ui';
import { ArrowLeft } from 'lucide-react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';


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
  max_capacity: number | null;
}

export default function EditClassPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('classes');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [cls, setCls] = React.useState<ClassDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!id) return;
    apiClient<{ data: ClassDetail }>(`/api/v1/classes/${id}`)
      .then((res) => setCls(res.data))
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
        homeroom_teacher_staff_id: values.homeroom_teacher_staff_id || undefined,
        max_capacity: values.max_capacity ? Number(values.max_capacity) : null,
        homeroom_id: values.homeroom_id || undefined,
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
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
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
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />
      <ClassForm
        initialValues={{
          name: cls.name,
          academic_year_id: cls.academic_year.id,
          year_group_id: cls.year_group.id,
          homeroom_teacher_staff_id: cls.homeroom_teacher_staff_id ?? '',
          max_capacity: cls.max_capacity ? String(cls.max_capacity) : '',
          class_type: cls.homeroom_id ? 'fixed' : 'floating',
          homeroom_id: cls.homeroom_id ?? '',
          status: cls.status,
        }}
        onSubmit={handleSubmit}
        submitLabel={tc('save')}
        onCancel={() => router.push(`/${locale}/classes/${id}`)}
      />
    </div>
  );
}
