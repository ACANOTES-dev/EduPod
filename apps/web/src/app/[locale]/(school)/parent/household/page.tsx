'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { RegisteredLocale } from '@school/shared';
import { EmptyState } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { LocalePreferencesCard } from './_components/locale-preferences-card';

interface ParentDashboardHousehold {
  dual_language_opt_in: boolean;
  household_name: string;
  id: string;
  secondary_locale: RegisteredLocale | null;
}

interface ParentDashboardData {
  households: ParentDashboardHousehold[];
}

export default function ParentHouseholdPage(): React.ReactElement {
  const t = useTranslations('parent.household');
  const [household, setHousehold] = React.useState<ParentDashboardHousehold | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function loadHousehold() {
      try {
        const result = await apiClient<{ data: ParentDashboardData }>('/api/v1/dashboard/parent');
        if (!cancelled) {
          setHousehold(result.data.households[0] ?? null);
        }
      } catch (err) {
        console.error('[ParentHouseholdPage]', err);
        if (!cancelled) setHousehold(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadHousehold();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-text-secondary">{t('loading')}</div>;
  }

  if (!household) {
    return <EmptyState title={t('notFound')} description={t('notFoundDescription')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{household.household_name}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
      </div>
      <LocalePreferencesCard
        householdId={household.id}
        initial={{
          dual_language_opt_in: household.dual_language_opt_in,
          secondary_locale: household.secondary_locale,
        }}
      />
    </div>
  );
}
