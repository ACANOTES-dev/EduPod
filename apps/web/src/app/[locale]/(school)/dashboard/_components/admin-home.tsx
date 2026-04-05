'use client';

import { ActivityFeed } from './activity-feed';
import { GreetingRow } from './greeting-row';
import { PriorityFeed } from './priority-feed';
import { QuickActions } from './quick-actions';
import { SchoolSnapshot } from './school-snapshot';
import { ThisWeekCard } from './this-week-card';

export function AdminHome({ schoolName, data }: { schoolName: string, data: Record<string, unknown> }) {
  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <GreetingRow schoolName={schoolName} />
        
        <div className="lg:hidden space-y-6">
          <QuickActions variant="horizontal" />
          <SchoolSnapshot variant="compact" data={data} />
        </div>

        <PriorityFeed />
        <ActivityFeed />
      </div>

      <div className="hidden lg:block w-[360px] shrink-0 space-y-6 lg:pt-[56px] xl:pt-0">
        <SchoolSnapshot variant="default" data={data} />
        <ThisWeekCard />
        <QuickActions variant="grid" />
      </div>
    </div>
  );
}
