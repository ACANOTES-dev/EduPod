'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { PageHeader } from '@/components/page-header';

import { RegulatoryNav } from '../../_components/regulatory-nav';
import { SyncLogTable } from '../_components/sync-log-table';

// ─── Types ────────────────────────────────────────────────────────────────────

type DatabaseFilter = 'all' | 'ppod' | 'pod';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PpodSyncLogPage() {
  const t = useTranslations('regulatory');

  const [filter, setFilter] = React.useState<DatabaseFilter>('all');

  const databaseType = filter === 'all' ? undefined : filter;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('ppod.syncLogTitle')}
        description={t('ppod.syncLogDescription')}
        actions={
          <Select value={filter} onValueChange={(value) => setFilter(value as DatabaseFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ppod.allDatabases')}</SelectItem>
              <SelectItem value="ppod">PPOD</SelectItem>
              <SelectItem value="pod">POD</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <RegulatoryNav />

      <SyncLogTable databaseType={databaseType} />
    </div>
  );
}
