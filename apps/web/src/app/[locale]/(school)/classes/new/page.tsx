'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ClassForm, type ClassFormValues } from '../_components/class-form';

export default function NewClassPage() {
  const t = useTranslations('classes');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  const handleSubmit = async (values: ClassFormValues) => {
    await apiClient('/api/v1/classes', {
      method: 'POST',
      body: JSON.stringify({
        name: values.name,
        academic_year_id: values.academic_year_id,
        year_group_id: values.year_group_id,
        subject_id: values.subject_id || undefined,
        homeroom_teacher_staff_id: values.homeroom_teacher_staff_id || undefined,
        status: values.status,
      }),
    });
    router.push(`/${locale}/classes`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('newClass')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {tc('back')}
          </Button>
        }
      />
      <ClassForm
        onSubmit={handleSubmit}
        submitLabel={t('createClass')}
        onCancel={() => router.push(`/${locale}/classes`)}
      />
    </div>
  );
}
