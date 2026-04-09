'use client';

import { BarChart2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { AnalyticsTab } from '../gradebook/[classId]/analytics-tab';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassOption {
  id: string;
  name: string;
  assessment_count?: number;
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const t = useTranslations('gradebook');

  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [classId, setClassId] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);

  // Load available classes
  React.useEffect(() => {
    setIsLoading(true);
    apiClient<ListResponse<ClassOption>>('/api/v1/classes?pageSize=100&status=active')
      .then((res) => {
        const sorted = res.data.sort((a, b) => a.name.localeCompare(b.name));
        setClasses(sorted);
      })
      .catch((err) => console.error('[AnalyticsPage]', err))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-5 w-5 text-primary-600" />
        <PageHeader title={t('analytics')} />
      </div>

      {/* Class selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Select a class" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : !classId ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BarChart2 className="mb-4 h-12 w-12 text-text-tertiary/40" />
          <p className="text-sm text-text-tertiary">Select a class to view grade analytics.</p>
        </div>
      ) : (
        <AnalyticsTab key={classId} classId={classId} />
      )}
    </div>
  );
}
