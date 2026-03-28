'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';

import { RegulatoryNav } from '../../_components/regulatory-nav';
import { SarWizard } from '../_components/sar-wizard';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TuslaSarPage() {
  const t = useTranslations('regulatory');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('tusla.sarTitle')}
        description={t('tusla.sarDescription')}
      />

      <RegulatoryNav />

      <SarWizard />
    </div>
  );
}
