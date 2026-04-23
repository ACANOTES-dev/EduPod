'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';

import { CsvImportWizard } from '../_components/csv-import-wizard';
import { DatabaseToggle, type DatabaseType } from '../_components/database-toggle';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PpodImportPage() {
  const t = useTranslations('regulatory.ppod');
  const locale = useLocale();

  const [databaseType, setDatabaseType] = React.useState<DatabaseType>('ppod');
  const [isComplete, setIsComplete] = React.useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('importTitle')}
        description={t('importDescription')}
        back={{ href: `/${locale}/regulatory/ppod`, label: t('backToPpod') }}
        actions={!isComplete && <DatabaseToggle value={databaseType} onChange={setDatabaseType} />}
      />

      {isComplete ? (
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-teal-200 bg-teal-50/60 px-6 py-12">
          <CheckCircle2 className="h-12 w-12 text-teal-600" />
          <div className="text-center">
            <p className="text-lg font-semibold text-teal-900">{t('importSuccessTitle')}</p>
            <p className="mt-1 text-sm text-teal-800/80">{t('importSuccessDescription')}</p>
          </div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Link href={`/${locale}/regulatory/ppod`}>
              <Button variant="outline" className="min-h-[44px] w-full sm:w-auto">
                {t('backToPpod')}
              </Button>
            </Link>
            <Link href={`/${locale}/regulatory/ppod/sync-log`}>
              <Button variant="outline" className="min-h-[44px] w-full sm:w-auto">
                {t('viewSyncLog')}
              </Button>
            </Link>
            <Button onClick={() => setIsComplete(false)} className="min-h-[44px] w-full sm:w-auto">
              {t('importAnother')}
            </Button>
          </div>
        </section>
      ) : (
        <CsvImportWizard
          databaseType={databaseType}
          onComplete={() => setIsComplete(true)}
          onCancel={() => window.history.back()}
        />
      )}
    </div>
  );
}
