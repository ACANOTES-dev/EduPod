'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { StaffForm, type StaffFormValues } from '../../_components/staff-form';


interface StaffDetail {
  id: string;
  staff_number: string | null;
  job_title: string | null;
  department: string | null;
  employment_status: string;
  employment_type: string;
  user: { id: string; first_name: string; last_name: string };
}

export default function EditStaffPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [staff, setStaff] = React.useState<StaffDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!id) return;
    apiClient<{ data: StaffDetail }>(`/api/v1/staff-profiles/${id}`)
      .then((res) => setStaff(res.data))
      .catch((err) => { console.error('[StaffEditPage]', err); return setError(t('loadError')); })
      .finally(() => setLoading(false));
  }, [id, t]);

  const handleSubmit = async (values: StaffFormValues) => {
    await apiClient(`/api/v1/staff-profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        job_title: values.job_title || undefined,
        employment_status: values.employment_status,
        department: values.department || undefined,
        employment_type: values.employment_type,
      }),
    });
    router.push(`/${locale}/staff/${id}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-60 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (error || !staff) {
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
        title={t('editStaff')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />
      <StaffForm
        initialValues={{
          job_title: staff.job_title ?? '',
          employment_status: staff.employment_status,
          department: staff.department ?? '',
          employment_type: staff.employment_type,
        }}
        onSubmit={handleSubmit}
        isEdit={true}
        showBankDetails={false}
        submitLabel={tc('save')}
        onCancel={() => router.push(`/${locale}/staff/${id}`)}
      />
    </div>
  );
}
