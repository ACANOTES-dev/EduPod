'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { DiscountForm, type DiscountFormValues } from '../_components/discount-form';

export default function NewDiscountPage() {
  const t = useTranslations('finance');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const handleSubmit = async (values: DiscountFormValues) => {
    const payload = {
      name: values.name,
      discount_type: values.discount_type,
      value: parseFloat(values.value),
    };
    await apiClient('/api/v1/finance/discounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    router.push(`/${locale}/finance/discounts`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('discounts.newTitle')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />
      <DiscountForm
        onSubmit={handleSubmit}
        submitLabel={t('discounts.createButton')}
        onCancel={() => router.push(`/${locale}/finance/discounts`)}
      />
    </div>
  );
}
