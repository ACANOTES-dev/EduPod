'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { BudgetingTenantPreferences } from '@school/shared/budgeting';
import { Skeleton } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { SettingsForm } from './_components/settings-form';

interface Props {
  params: { locale: string };
}

export default function BudgetingSettingsPage({ params }: Props) {
  const t = useTranslations('financeBudgetingSettings');
  const locale = params.locale ?? 'en';

  const [initialValues, setInitialValues] = React.useState<BudgetingTenantPreferences | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = React.useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient<BudgetingTenantPreferences>(
          '/api/v1/budgeting/tenant-preferences',
          { silent: true },
        );
        if (cancelled) return;
        setInitialValues(res);
      } catch (err) {
        const apiErr = err as { error?: { code?: string; message?: string }; status?: number };
        if (apiErr?.error?.code === 'PERMISSION_DENIED' || apiErr?.status === 403) {
          setPermissionDenied(true);
          return;
        }
        console.error('[BudgetingSettings.load]', err);
        setError(apiErr?.error?.message ?? t('loadError'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (permissionDenied) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <article className="max-w-md rounded-3xl border border-border bg-surface p-8 text-center">
          <h1 className="text-lg font-semibold text-text-primary">{t('permissionDenied.title')}</h1>
          <p className="mt-3 text-sm text-text-secondary">{t('permissionDenied.body')}</p>
          <a
            href={`/${locale}/finance/budgeting`}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-pill border border-border-strong px-6 py-2 text-sm font-semibold text-text-primary"
          >
            {t('permissionDenied.cta')}
          </a>
        </article>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 p-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        back={{ href: `/${locale}/finance/budgeting`, label: t('backToHub') }}
      />

      {initialValues === null ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
        </div>
      ) : (
        <SettingsForm initialValues={initialValues} />
      )}
    </div>
  );
}
