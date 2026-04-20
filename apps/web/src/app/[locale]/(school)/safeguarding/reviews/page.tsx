'use client';

import { ArrowLeft, Binoculars, Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';

import { canViewSafeguarding } from '../_components/visibility';

export default function SafeguardingReviewsPlaceholder() {
  const t = useTranslations('safeguardingHub.reviews');
  const tHub = useTranslations('safeguardingHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { roleKeys } = useRoleCheck();

  if (!canViewSafeguarding(roleKeys)) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader title={t('title')} description={t('description')} />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{tHub('denied.body')}</p>
          <Link
            href={`/${locale}/wellbeing`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {tHub('denied.backToHub')}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link
            href={`/${locale}/safeguarding`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {tHub('denied.backToHub')}
          </Link>
        }
      />

      <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
          <Binoculars className="h-6 w-6" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold text-text-primary">{t('placeholder.title')}</h2>
          <p className="text-sm text-text-secondary">{t('placeholder.body')}</p>
          <p className="text-xs text-text-tertiary">{t('placeholder.nextWave')}</p>
        </div>
      </section>
    </div>
  );
}
