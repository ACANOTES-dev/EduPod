'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';


import { PageHeader } from '@/components/page-header';

import { RegulatoryNav } from '../../_components/regulatory-nav';
import { CsvImportWizard } from '../_components/csv-import-wizard';


// ─── Page ────────────────────────────────────────────────────────────────────

export default function PpodImportPage() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();

  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';

  const [databaseType, setDatabaseType] = React.useState<'ppod' | 'pod'>('ppod');
  const [isComplete, setIsComplete] = React.useState(false);

  const handleComplete = React.useCallback(() => {
    setIsComplete(true);
  }, []);

  const handleCancel = React.useCallback(() => {
    // Navigate back — use window.history for SPA back navigation
    window.history.back();
  }, []);

  const handleReset = React.useCallback(() => {
    setIsComplete(false);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title={t('ppod.importTitle')} description={t('ppod.importDescription')} />

      <RegulatoryNav />

      {isComplete ? (
        // ─── Success State ───────────────────────────────────────────────
        <div className="flex flex-col items-center gap-4 rounded-xl border border-success-text/20 bg-success-fill px-6 py-12">
          <CheckCircle2 className="h-12 w-12 text-success-text" />
          <div className="text-center">
            <p className="text-lg font-semibold text-success-text">
              {t('ppod.importSuccessTitle')}
            </p>
            <p className="mt-1 text-sm text-success-text/80">
              {t('ppod.importSuccessDescription')}
            </p>
          </div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Link href={`/${locale}/regulatory/ppod`}>
              <Button variant="outline" className="min-h-[44px] w-full sm:w-auto">
                {t('ppod.backToDashboard')}
              </Button>
            </Link>
            <Button onClick={handleReset} className="min-h-[44px] w-full sm:w-auto">
              {t('ppod.importAnother')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* ─── Database Type Selector ───────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-surface-primary px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-text-primary">
                {t('ppod.databaseType')}
              </label>
              <Select
                value={databaseType}
                onValueChange={(val) => setDatabaseType(val as 'ppod' | 'pod')}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ppod">{t('ppod.typePpod')}</SelectItem>
                  <SelectItem value="pod">{t('ppod.typePod')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ─── Import Wizard ────────────────────────────────────────────── */}
          <CsvImportWizard
            databaseType={databaseType}
            onComplete={handleComplete}
            onCancel={handleCancel}
          />
        </>
      )}
    </div>
  );
}
