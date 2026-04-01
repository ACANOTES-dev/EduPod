'use client';

import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  EmptyState,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatCard,
  toast,
} from '@school/ui';

import { humanise } from './shared';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
  status: string;
}

interface NcseReturnData {
  academic_year: string;
  total_sen_students: number;
  by_category: Array<{ category: string; count: number }>;
  by_support_level: Array<{ level: string; count: number }>;
  by_year_group: Array<{ year_group_id: string; year_group_name: string; count: number }>;
  by_gender: Array<{ gender: string; count: number }>;
  resource_hours: {
    seno_allocated: number;
    school_allocated: number;
    total_assigned: number;
    total_used: number;
  };
  sna_count: number;
  accommodation_count: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NcseReturnTab() {
  const t = useTranslations('sen');
  const [yearId, setYearId] = React.useState('');
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [data, setData] = React.useState<NcseReturnData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=100')
      .then((res) => {
        const years = res.data ?? [];
        setAcademicYears(years);
        const active = years.find((y) => y.status === 'active');
        if (active) setYearId(active.id);
      })
      .catch((err: unknown) => {
        console.error('[NcseReturnTab] load academic years', err);
      });
  }, []);

  React.useEffect(() => {
    if (!yearId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiClient<{ data: NcseReturnData }>(
      `/api/v1/sen/reports/ncse-return?academic_year_id=${yearId}`,
    )
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        console.error('[NcseReturnTab] load NCSE return', err);
        toast.error(t('reports.loadError'));
      })
      .finally(() => setLoading(false));
  }, [yearId, t]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={`ncse-sk-${i}`} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Year filter */}
      <div className="flex items-end gap-4">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label htmlFor="ncse-year">{t('reports.academicYear')}</Label>
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger id="ncse-year" className="w-full text-base">
              <SelectValue placeholder={t('reports.selectYear')} />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!data ? (
        <EmptyState
          icon={FileText}
          title={t('reports.noNcseData')}
          description={t('reports.selectYearPrompt')}
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('reports.ncse.totalSenStudents')} value={data.total_sen_students} />
            <StatCard label={t('reports.ncse.activeSna')} value={data.sna_count} />
            <StatCard
              label={t('reports.ncse.activeAccommodations')}
              value={data.accommodation_count}
            />
            <StatCard
              label={t('reports.ncse.totalResourceHoursUsed')}
              value={data.resource_hours.total_used}
            />
          </div>

          {/* Category breakdown */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('reports.ncse.byCategory')}
            </h3>
            {data.by_category.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">{t('reports.noData')}</p>
            ) : (
              <div className="space-y-2">
                {data.by_category.map((item) => (
                  <div
                    key={item.category}
                    className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2"
                  >
                    <span className="text-sm text-text-primary">{humanise(item.category)}</span>
                    <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Support level breakdown */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('reports.ncse.bySupportLevel')}
            </h3>
            {data.by_support_level.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">{t('reports.noData')}</p>
            ) : (
              <div className="space-y-2">
                {data.by_support_level.map((item) => (
                  <div
                    key={item.level}
                    className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2"
                  >
                    <span className="text-sm text-text-primary">{humanise(item.level)}</span>
                    <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resource hours */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('reports.ncse.resourceHours')}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-surface-secondary px-4 py-3">
                <p className="text-xs text-text-tertiary">{t('reports.ncse.senoAllocated')}</p>
                <p className="text-lg font-semibold text-text-primary">
                  {data.resource_hours.seno_allocated}h
                </p>
              </div>
              <div className="rounded-lg bg-surface-secondary px-4 py-3">
                <p className="text-xs text-text-tertiary">{t('reports.ncse.schoolAllocated')}</p>
                <p className="text-lg font-semibold text-text-primary">
                  {data.resource_hours.school_allocated}h
                </p>
              </div>
              <div className="rounded-lg bg-surface-secondary px-4 py-3">
                <p className="text-xs text-text-tertiary">{t('reports.ncse.totalAssigned')}</p>
                <p className="text-lg font-semibold text-text-primary">
                  {data.resource_hours.total_assigned}h
                </p>
              </div>
              <div className="rounded-lg bg-surface-secondary px-4 py-3">
                <p className="text-xs text-text-tertiary">{t('reports.ncse.totalUsed')}</p>
                <p className="text-lg font-semibold text-text-primary">
                  {data.resource_hours.total_used}h
                </p>
              </div>
            </div>
          </div>

          {/* Gender & year group */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('reports.ncse.byGender')}
              </h3>
              <div className="space-y-2">
                {data.by_gender.map((item) => (
                  <div
                    key={item.gender}
                    className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2"
                  >
                    <span className="text-sm text-text-primary">{humanise(item.gender)}</span>
                    <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('reports.ncse.byYearGroup')}
              </h3>
              <div className="space-y-2">
                {data.by_year_group.map((item) => (
                  <div
                    key={item.year_group_id}
                    className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2"
                  >
                    <span className="text-sm text-text-primary">{item.year_group_name}</span>
                    <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
