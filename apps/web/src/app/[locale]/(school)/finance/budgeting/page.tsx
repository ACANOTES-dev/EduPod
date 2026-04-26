'use client';

import { Compass, LineChart, SlidersHorizontal } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { HubTile } from '@/components/hub-tile';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { RecentActivity, type RecentActivityItem } from './_components/recent-activity';

interface FinancialModelRow {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  fiscal_year_start: string;
  updated_at: string;
}

interface EventBudgetRow {
  id: string;
  name: string;
  status: 'draft' | 'confirmed' | 'fees_generated' | 'completed' | 'cancelled';
  event_date: string | null;
  updated_at: string;
}

export default function BudgetingHubPage() {
  const t = useTranslations('financeBudgeting');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [recentItems, setRecentItems] = React.useState<RecentActivityItem[] | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void Promise.all([
      apiClient<{ data: FinancialModelRow[] }>('/api/v1/budgeting/financial-models?pageSize=5', {
        silent: true,
      }).catch((err) => {
        console.error('[BudgetingHub.recent.models]', err);
        return { data: [] as FinancialModelRow[] };
      }),
      apiClient<{ data: EventBudgetRow[] }>('/api/v1/budgeting/event-budgets?pageSize=5', {
        silent: true,
      }).catch((err) => {
        console.error('[BudgetingHub.recent.events]', err);
        return { data: [] as EventBudgetRow[] };
      }),
    ]).then(([modelsRes, eventsRes]) => {
      if (cancelled) return;

      const modelsAsItems: RecentActivityItem[] = (modelsRes.data ?? []).map((m) => ({
        kind: 'model',
        id: m.id,
        name: m.name,
        status: m.status,
        updated_at: m.updated_at,
        fiscal_year_start: m.fiscal_year_start,
      }));
      const eventsAsItems: RecentActivityItem[] = (eventsRes.data ?? []).map((e) => ({
        kind: 'event',
        id: e.id,
        name: e.name,
        status: e.status,
        updated_at: e.updated_at,
        event_date: e.event_date,
      }));

      const merged = [...modelsAsItems, ...eventsAsItems]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 5);

      setRecentItems(merged);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-8 p-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/finance`, label: t('backToFinance') }}
      />

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <HubTile
          icon={LineChart}
          title={t('cards.models.title')}
          description={t('cards.models.description')}
          href="/finance/budgeting/models"
          accent="from-emerald-400 via-emerald-500 to-emerald-600"
          iconBg="bg-emerald-100 text-emerald-700"
          glow="from-emerald-50/80"
          animationIndex={0}
        />
        <HubTile
          icon={Compass}
          title={t('cards.events.title')}
          description={t('cards.events.description')}
          href="/finance/budgeting/events"
          accent="from-amber-400 via-amber-500 to-amber-600"
          iconBg="bg-amber-100 text-amber-700"
          glow="from-amber-50/80"
          animationIndex={1}
        />
        <HubTile
          icon={SlidersHorizontal}
          title={t('cards.settings.title')}
          description={t('cards.settings.description')}
          href="/finance/budgeting/settings"
          accent="from-slate-400 via-slate-500 to-slate-600"
          iconBg="bg-slate-100 text-slate-700"
          glow="from-slate-50/80"
          animationIndex={2}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">
          {t('recent.title')}
        </h2>
        <RecentActivity items={recentItems} isLoading={isLoading} locale={locale} />
      </section>
    </div>
  );
}
