'use client';

import { BarChart3, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { EarlyWarningList } from './_components/early-warning-list';

import { PageHeader } from '@/components/page-header';


export default function EarlyWarningsPage() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/${locale}/early-warnings/cohort`}>
              <Button variant="outline">
                <BarChart3 className="me-2 h-4 w-4" />
                {t('cohort.title')}
              </Button>
            </Link>
            <Link href={`/${locale}/early-warnings/settings`}>
              <Button variant="outline">
                <Settings className="me-2 h-4 w-4" />
                {t('settings.title')}
              </Button>
            </Link>
          </div>
        }
      />

      <EarlyWarningList />
    </div>
  );
}
