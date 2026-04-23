'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';

import { AarWizard } from '../_components/aar-wizard';

export default function TuslaAarPage() {
  const t = useTranslations('regulatory.tusla');
  const locale = useLocale();

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('aarTitle')}
        description={t('aarDescription')}
        back={{ href: `/${locale}/regulatory/tusla`, label: t('backToTusla') }}
      />
      <AarWizard locale={locale} />
    </div>
  );
}
