'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';

import { RegulatoryNav } from '../../_components/regulatory-nav';
import { FileGenerationWizard } from '../_components/file-generation-wizard';


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DESGenerateFilesPage() {
  const t = useTranslations('regulatory');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('desReturns.generateTitle')}
        description={t('desReturns.generateDescription')}
      />

      <RegulatoryNav />

      <FileGenerationWizard />
    </div>
  );
}
