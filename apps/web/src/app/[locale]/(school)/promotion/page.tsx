'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/page-header';

import { PromotionWizard } from './_components/promotion-wizard';



export default function PromotionPage() {
  const t = useTranslations('promotion');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <PromotionWizard />
    </div>
  );
}
