'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';


import { RegulatoryNav } from '../../_components/regulatory-nav';
import { StudentMappingTable } from '../_components/student-mapping-table';

import { PageHeader } from '@/components/page-header';

// ─── Types ────────────────────────────────────────────────────────────────────

type DatabaseType = 'ppod' | 'pod';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PpodStudentsPage() {
  const t = useTranslations('regulatory');

  const [databaseType, setDatabaseType] = React.useState<DatabaseType>('ppod');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('ppod.studentsTitle')}
        description={t('ppod.studentsDescription')}
        actions={
          <Select
            value={databaseType}
            onValueChange={(value) => setDatabaseType(value as DatabaseType)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ppod">PPOD</SelectItem>
              <SelectItem value="pod">POD</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <RegulatoryNav />

      <StudentMappingTable databaseType={databaseType} />
    </div>
  );
}
