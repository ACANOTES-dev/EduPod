'use client';

import { useParams } from 'next/navigation';

import { PageHeader } from '@/components/page-header';

import { ActiveAlertsPanel } from './_components/active-alerts-panel';
import { ActiveIncidentsPanel } from './_components/active-incidents-panel';
import { ActivityFeed } from './_components/activity-feed';
import { HealthStrip } from './_components/health-strip';
import { QuickActions } from './_components/quick-actions';
import { ReadinessScoreHeroCard } from './_components/readiness-score-hero-card';
import { RecentRecommendations } from './_components/recent-recommendations';
import { TenantCards } from './_components/tenant-cards';

export default function PlatformDashboardPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title="Platform Dashboard"
        description="Live operating picture across system health, alerts, tenants, queues, and platform activity."
      />

      <HealthStrip />

      <ReadinessScoreHeroCard href={`/${locale}/admin/readiness`} />

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,0.9fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <ActiveAlertsPanel />
          <TenantCards />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <QuickActions />
          <ActiveIncidentsPanel />
          <RecentRecommendations />
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
