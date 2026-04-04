'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { toast } from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { HouseholdForm, type HouseholdFormData } from '../_components/household-form';


export default function NewHouseholdPage() {
  const t = useTranslations('households');
  const router = useRouter();

  const handleSubmit = async (data: HouseholdFormData) => {
    const res = await apiClient<{ data: { id: string } }>('/api/v1/households', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    toast.success('Household created successfully');
    router.push(`/households/${res.data.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('newHousehold')} description="Create a new family household record" />
      <HouseholdForm onSubmit={handleSubmit} />
    </div>
  );
}
