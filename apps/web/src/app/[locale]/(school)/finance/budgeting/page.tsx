'use client';

import { LineChart, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';

export default function FinanceBudgetingComingSoonPage() {
  const t = useTranslations('financeBudgeting');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/finance`, label: t('backToFinance') }}
      />

      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-sky-50 via-white to-primary-50 p-10 text-center shadow-sm sm:p-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600" />
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 shadow-sm ring-1 ring-inset ring-black/5">
          <LineChart className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-text-primary">
          {t('heroTitle')}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">{t('heroBody')}</p>

        <div className="mt-8 grid grid-cols-1 gap-4 text-start sm:grid-cols-3">
          {(['forecasting', 'varianceAnalysis', 'departmentCosts'] as const).map((key) => (
            <div
              key={key}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-600" />
                <p className="text-sm font-semibold text-text-primary">
                  {t(`preview.${key}.title`)}
                </p>
              </div>
              <p className="mt-1.5 text-xs text-text-tertiary">
                {t(`preview.${key}.description`)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
          {t('badge')}
        </div>
      </div>
    </div>
  );
}
