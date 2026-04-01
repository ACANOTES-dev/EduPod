'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import {
  FeeAssignmentForm,
  type FeeAssignmentFormValues,
} from '../_components/fee-assignment-form';


export default function NewFeeAssignmentPage() {
  const t = useTranslations('finance');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const handleSubmit = async (values: FeeAssignmentFormValues) => {
    const payload = {
      household_id: values.household_id,
      student_id: values.student_id || undefined,
      fee_structure_id: values.fee_structure_id,
      discount_id: values.discount_id || undefined,
      effective_from: values.effective_from,
    };
    await apiClient('/api/v1/finance/fee-assignments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    router.push(`/${locale}/finance/fee-assignments`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('feeAssignments.newTitle')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />
      <FeeAssignmentForm
        onSubmit={handleSubmit}
        submitLabel={t('feeAssignments.createButton')}
        onCancel={() => router.push(`/${locale}/finance/fee-assignments`)}
      />
    </div>
  );
}
