'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface WorkloadRow {
  teacher_id: string;
  teacher_name: string;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  total_periods: number;
  total_hours: number;
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkloadReportPage() {
  const t = useTranslations('scheduling');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearFilter, setYearFilter] = React.useState('');
  const [data, setData] = React.useState<WorkloadRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=100')
      .then((res) => {
        setAcademicYears(res.data);
        const first = res.data[0];
        if (first) {
          const active = res.data.find((y) => y.name.toLowerCase().includes('active'));
          setYearFilter(active?.id ?? first.id);
        }
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!yearFilter) return;
    setIsLoading(true);
    apiClient<ListResponse<WorkloadRow>>(
      `/api/v1/reports/workload?academic_year_id=${yearFilter}`,
    )
      .then((res) => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, [yearFilter]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('workload')} />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('teacher')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('monday')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('tuesday')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('wednesday')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('thursday')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('friday')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('totalPeriods')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('totalHours')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-border last:border-b-0">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-12 animate-pulse rounded bg-surface-secondary" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-text-tertiary">
                  No workload data available
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.teacher_id} className="border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.teacher_name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.monday}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.tuesday}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.wednesday}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.thursday}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.friday}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary">{row.total_periods}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary">{row.total_hours}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
