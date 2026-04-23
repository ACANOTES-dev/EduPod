'use client';

import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';

import { FileGenerationWizard } from '../_components/file-generation-wizard';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DesGenerateFilesPage() {
  const t = useTranslations('regulatory.desReturns');
  const locale = useLocale();
  const searchParams = useSearchParams();

  const initialFileType = searchParams?.get('file_type') ?? undefined;
  const initialYear = searchParams?.get('year') ?? undefined;

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('generateTitle')}
        description={t('generateDescription')}
        back={{ href: `/${locale}/regulatory/des-returns`, label: t('backToDesReturns') }}
      />

      <FileGenerationWizard initialFileType={initialFileType} initialAcademicYear={initialYear} />
    </div>
  );
}
