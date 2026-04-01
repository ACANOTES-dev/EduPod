'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { CohortHeatmap } from './_components/cohort-heatmap';

import { PageHeader } from '@/components/page-header';


export default function CohortPage() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('cohort.title')}
        description={t('cohort.description')}
        actions={
          <Link href={`/${locale}/early-warnings`}>
            <Button variant="ghost">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('cohort.back_to_list')}
            </Button>
          </Link>
        }
      />

      <CohortHeatmap />
    </div>
  );
}
