'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';


import { RegulatoryNav } from '../../_components/regulatory-nav';
import { AarWizard } from '../_components/aar-wizard';

import { PageHeader } from '@/components/page-header';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TuslaAarPage() {
  const t = useTranslations('regulatory');

  return (
    <div className="space-y-6">
      <PageHeader title={t('tusla.aarTitle')} description={t('tusla.aarDescription')} />

      <RegulatoryNav />

      <AarWizard />
    </div>
  );
}
