'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/page-header';

import { FeeGenerationWizard } from './_components/fee-generation-wizard';

export default function FeeGenerationPage() {
  const t = useTranslations('finance');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('feeGeneration.title')}
        description={t('feeGeneration.description')}
      />
      <FeeGenerationWizard />
    </div>
  );
}
