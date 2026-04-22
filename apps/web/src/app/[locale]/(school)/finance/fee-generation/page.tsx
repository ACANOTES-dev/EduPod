'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/page-header';

import { FeeGenerationWizard } from './_components/fee-generation-wizard';



export default function FeeGenerationPage() {
  const t = useTranslations('finance');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('feeGeneration.title')}
        description={t('feeGeneration.description')}
        back={{ href: `/${locale}/finance/all-finances`, label: t('backToAllFinances') }}
      />
      <FeeGenerationWizard />
    </div>
  );
}
