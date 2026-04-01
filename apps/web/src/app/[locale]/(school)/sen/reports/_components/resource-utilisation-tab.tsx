'use client';

import { BarChart3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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

import { apiClient } from '@/lib/api-client';

import { humanise } from './shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
  status: string;
}

interface UtilisationTotals {
  total_allocated_hours: number;
  total_assigned_hours: number;
  total_used_hours: number;
  assigned_percentage: number;
  used_percentage: number;
}

interface UtilisationBySource extends UtilisationTotals {
  source: string;
}

interface UtilisationByYearGroup {
  year_group_id: string | null;
  year_group_name: string;
  total_assigned_hours: number;
  total_used_hours: number;
  assigned_percentage: number;
  used_percentage: number;
}

interface UtilisationData {
  academic_year_id: string | null;
  totals: UtilisationTotals;
  bySource: UtilisationBySource[];
  byYearGroup: UtilisationByYearGroup[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ResourceUtilisationTab() {
  const t = useTranslations('sen');
  const [yearId, setYearId] = React.useState('');
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [data, setData] = React.useState<UtilisationData | null>(null);
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
        console.error('[ResourceUtilisationTab] load academic years', err);
      });
  }, []);

  React.useEffect(() => {
    if (!yearId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiClient<{ data: UtilisationData }>(
      `/api/v1/sen/reports/resource-utilisation?academic_year_id=${yearId}`,
    )
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        console.error('[ResourceUtilisationTab] load utilisation', err);
        toast.error(t('reports.loadError'));
      })
      .finally(() => setLoading(false));
  }, [yearId, t]);

  const sourceChartData = React.useMemo(() => {
    if (!data?.bySource) return [];
    return data.bySource.map((s) => ({
      name: humanise(s.source),
      allocated: s.total_allocated_hours,
      assigned: s.total_assigned_hours,
      used: s.total_used_hours,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`util-sk-${i}`} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Year filter */}
      <div className="flex items-end gap-4">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label htmlFor="util-year">{t('reports.academicYear')}</Label>
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger id="util-year" className="w-full text-base">
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
          icon={BarChart3}
          title={t('reports.noUtilisationData')}
          description={t('reports.selectYearPrompt')}
        />
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label={t('reports.utilisation.totalAllocated')}
              value={`${data.totals.total_allocated_hours}h`}
            />
            <StatCard
              label={t('reports.utilisation.totalAssigned')}
              value={`${data.totals.total_assigned_hours}h`}
              trend={
                data.totals.assigned_percentage > 0
                  ? {
                      direction: 'up' as const,
                      label: `${Math.round(data.totals.assigned_percentage)}%`,
                    }
                  : undefined
              }
            />
            <StatCard
              label={t('reports.utilisation.totalUsed')}
              value={`${data.totals.total_used_hours}h`}
              trend={
                data.totals.used_percentage > 0
                  ? {
                      direction: 'up' as const,
                      label: `${Math.round(data.totals.used_percentage)}%`,
                    }
                  : undefined
              }
            />
          </div>

          {/* Source comparison bar chart */}
          {sourceChartData.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('reports.utilisation.bySource')}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sourceChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="allocated"
                    name={t('reports.utilisation.allocated')}
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="assigned"
                    name={t('reports.utilisation.assigned')}
                    fill="#0f766e"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="used"
                    name={t('reports.utilisation.used')}
                    fill="#d97706"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Year group breakdown table */}
          {data.byYearGroup.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('reports.utilisation.byYearGroup')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.utilisation.yearGroup')}
                      </th>
                      <th className="px-4 py-2 text-end font-medium text-text-secondary">
                        {t('reports.utilisation.assigned')}
                      </th>
                      <th className="px-4 py-2 text-end font-medium text-text-secondary">
                        {t('reports.utilisation.used')}
                      </th>
                      <th className="px-4 py-2 text-end font-medium text-text-secondary">
                        {t('reports.utilisation.usedPct')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byYearGroup.map((yg) => (
                      <tr
                        key={yg.year_group_id ?? 'unassigned'}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-4 py-2 text-text-primary">{yg.year_group_name}</td>
                        <td className="px-4 py-2 text-end text-text-primary">
                          {yg.total_assigned_hours}h
                        </td>
                        <td className="px-4 py-2 text-end text-text-primary">
                          {yg.total_used_hours}h
                        </td>
                        <td className="px-4 py-2 text-end text-text-primary">
                          {Math.round(yg.used_percentage)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
