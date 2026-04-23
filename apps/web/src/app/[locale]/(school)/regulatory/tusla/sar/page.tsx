'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';

import { SarWizard } from '../_components/sar-wizard';

export default function TuslaSarPage() {
  const t = useTranslations('regulatory.tusla');
  const locale = useLocale();

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('sarTitle')}
        description={t('sarDescription')}
        back={{ href: `/${locale}/regulatory/tusla`, label: t('backToTusla') }}
      />
      <SarWizard locale={locale} />
    </div>
  );
}
