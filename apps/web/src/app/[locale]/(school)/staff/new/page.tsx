'use client';

import { Button } from '@school/ui';
import { ArrowLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { StaffForm, type StaffFormValues } from '../_components/staff-form';

export default function NewStaffPage() {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const handleSubmit = async (values: StaffFormValues) => {
    const payload = {
      user_id: values.user_id,
      job_title: values.job_title || undefined,
      employment_status: values.employment_status,
      department: values.department || undefined,
      employment_type: values.employment_type,
      bank_name: values.bank_name || undefined,
      bank_account_number: values.bank_account_number || undefined,
      bank_iban: values.bank_iban || undefined,
    };
    await apiClient('/api/v1/staff-profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    router.push(`/${locale}/staff`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('newStaff')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />
      <StaffForm
        onSubmit={handleSubmit}
        showBankDetails={true}
        submitLabel={t('createStaff')}
        onCancel={() => router.push(`/${locale}/staff`)}
      />
    </div>
  );
}
