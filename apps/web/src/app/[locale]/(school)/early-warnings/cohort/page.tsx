'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/page-header';

import { CohortHeatmap } from './_components/cohort-heatmap';

export default function CohortPage() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('cohort.title')}
        description={t('cohort.description')}
        back={{ href: `/${locale}/early-warnings`, label: t('cohort.back_to_list') }}
      />

      <CohortHeatmap />
    </div>
  );
}
