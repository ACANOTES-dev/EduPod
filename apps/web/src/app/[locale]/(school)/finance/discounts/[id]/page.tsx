'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname, useParams } from 'next/navigation';
import * as React from 'react';

import { Button } from '@school/ui';
import type { DiscountType } from '@school/shared';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { DiscountForm, type DiscountFormValues } from '../_components/discount-form';

interface DiscountDetail {
  id: string;
  name: string;
  discount_type: DiscountType;
  value: number;
  active: boolean;
}

export default function EditDiscountPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('finance');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [discount, setDiscount] = React.useState<DiscountDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!id) return;
    apiClient<{ data: DiscountDetail }>(`/api/v1/finance/discounts/${id}`)
      .then((res) => setDiscount(res.data))
      .catch(() => setError(t('discounts.loadError')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const handleSubmit = async (values: DiscountFormValues) => {
    const payload = {
      name: values.name,
      discount_type: values.discount_type,
      value: parseFloat(values.value),
      active: values.active,
    };
    await apiClient(`/api/v1/finance/discounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    router.push(`/${locale}/finance/discounts`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (error || !discount) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{error || t('discounts.notFound')}</p>
      </div>
    );
  }

  const initialValues: Partial<DiscountFormValues> = {
    name: discount.name,
    discount_type: discount.discount_type,
    value: String(discount.value),
    active: discount.active,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('discounts.editTitle')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />
      <DiscountForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        isEdit
        submitLabel={t('discounts.updateButton')}
        onCancel={() => router.push(`/${locale}/finance/discounts`)}
      />
    </div>
  );
}
