'use client';

import { ArrowLeft } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { BillingFrequency } from '@school/shared';
import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { FeeStructureForm, type FeeStructureFormValues } from '../_components/fee-structure-form';

interface FeeStructureDetail {
  id: string;
  name: string;
  amount: number;
  billing_frequency: BillingFrequency;
  active: boolean;
  year_group_id: string | null;
  fee_type_id: string | null;
}

export default function EditFeeStructurePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('finance');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [feeStructure, setFeeStructure] = React.useState<FeeStructureDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!id) return;
    apiClient<{ data: FeeStructureDetail }>(`/api/v1/finance/fee-structures/${id}`)
      .then((res) => setFeeStructure(res.data))
      .catch((err) => {
        console.error('[FinanceFeeStructuresPage]', err);
        return setError(t('feeStructures.loadError'));
      })
      .finally(() => setLoading(false));
  }, [id, t]);

  const handleSubmit = async (values: FeeStructureFormValues) => {
    const payload = {
      name: values.name,
      amount: values.amount,
      billing_frequency: values.billing_frequency,
      year_group_id: values.year_group_id || null,
      fee_type_id: values.fee_type_id || null,
      active: values.active,
    };
    await apiClient(`/api/v1/finance/fee-structures/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    router.push(`/${locale}/finance/fee-structures`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (error || !feeStructure) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{error || t('feeStructures.notFound')}</p>
      </div>
    );
  }

  const initialValues: Partial<FeeStructureFormValues> = {
    name: feeStructure.name,
    amount: feeStructure.amount,
    billing_frequency: feeStructure.billing_frequency,
    year_group_id: feeStructure.year_group_id ?? '',
    fee_type_id: feeStructure.fee_type_id ?? '',
    active: feeStructure.active,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('feeStructures.editTitle')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />
      <FeeStructureForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        isEdit
        submitLabel={t('feeStructures.updateButton')}
        onCancel={() => router.push(`/${locale}/finance/fee-structures`)}
      />
    </div>
  );
}
