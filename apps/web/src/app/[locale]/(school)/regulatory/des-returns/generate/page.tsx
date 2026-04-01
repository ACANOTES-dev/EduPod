'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';


import { RegulatoryNav } from '../../_components/regulatory-nav';
import { FileGenerationWizard } from '../_components/file-generation-wizard';

import { PageHeader } from '@/components/page-header';

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
