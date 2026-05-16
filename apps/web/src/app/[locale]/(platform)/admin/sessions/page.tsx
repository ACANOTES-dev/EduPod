'use client';

import { CalendarClock, DatabaseZap, MonitorSmartphone } from 'lucide-react';
import * as React from 'react';

import { Button, cn } from '@school/ui';

import { PageHeader } from '@/components/page-header';

import { ActiveSessionsTab } from './_components/active-sessions-tab';
import { CacheControlTab } from './_components/cache-control-tab';
import { MaintenanceTab } from './_components/maintenance-tab';

type OperationsTab = 'sessions' | 'cache' | 'maintenance';

const TABS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  key: OperationsTab;
  label: string;
}> = [
  { icon: MonitorSmartphone, key: 'sessions', label: 'Active Sessions' },
  { icon: DatabaseZap, key: 'cache', label: 'Cache Control' },
  { icon: CalendarClock, key: 'maintenance', label: 'Maintenance' },
];

export default function PlatformSessionsPage() {
  const [activeTab, setActiveTab] = React.useState<OperationsTab>('sessions');

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title="Sessions & Cache"
        description="Review active sessions, flush platform caches, and manage per-tenant maintenance windows."
      />

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 rounded-lg border border-border bg-surface p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <Button
                key={tab.key}
                type="button"
                variant="ghost"
                className={cn(
                  'h-10 rounded-md px-3 text-sm',
                  active
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-text-secondary hover:bg-surface-secondary',
                )}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon className="me-2 h-4 w-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>
      </div>

      {activeTab === 'sessions' ? <ActiveSessionsTab /> : null}
      {activeTab === 'cache' ? <CacheControlTab /> : null}
      {activeTab === 'maintenance' ? <MaintenanceTab /> : null}
    </div>
  );
}
