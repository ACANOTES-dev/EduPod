'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { FeeStructureForm, type FeeStructureFormValues } from '../_components/fee-structure-form';


export default function NewFeeStructurePage() {
  const t = useTranslations('finance');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const handleSubmit = async (values: FeeStructureFormValues) => {
    const payload = {
      name: values.name,
      amount: parseFloat(values.amount),
      billing_frequency: values.billing_frequency,
      year_group_id: values.year_group_id || undefined,
    };
    await apiClient('/api/v1/finance/fee-structures', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    router.push(`/${locale}/finance/fee-structures`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('feeStructures.newTitle')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />
      <FeeStructureForm
        onSubmit={handleSubmit}
        submitLabel={t('feeStructures.createButton')}
        onCancel={() => router.push(`/${locale}/finance/fee-structures`)}
      />
    </div>
  );
}
