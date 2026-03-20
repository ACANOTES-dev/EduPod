'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
  EmptyState,
} from '@school/ui';
import { TrendingUp } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ---- Types ----

interface AcademicYear {
  id: string;
  name: string;
}

interface PromotionSummary {
  promoted: number;
  held_back: number;
  graduated: number;
  withdrawn: number;
}

interface PromotionDetail {
  student_id: string;
  student_name: string;
  from_grade: string;
  to_grade: string;
  status: 'promoted' | 'held_back' | 'graduated' | 'withdrawn';
}

interface PromotionReport {
  summary: PromotionSummary;
  details: PromotionDetail[];
}

// ---- Page ----

export default function PromotionRolloverPage() {
  const t = useTranslations('reports');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearFilter, setYearFilter] = React.useState('');
  const [report, setReport] = React.useState<PromotionReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=100')
      .then((res) => {
        const years = Array.isArray(res.data) ? res.data : [];
        setAcademicYears(years);
        const first = years[0];
        if (first) {
          setYearFilter(first.id);
        }
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!yearFilter) return;
    setIsLoading(true);
    apiClient<{ data: PromotionReport }>(
      `/api/v1/reports/promotion-rollover?academic_year_id=${yearFilter}`,
    )
      .then((res) => setReport(res.data))
      .catch(() => setReport(null))
      .finally(() => setIsLoading(false));
  }, [yearFilter]);

  const statusColor: Record<string, string> = {
    promoted: 'text-emerald-700 bg-emerald-50',
    held_back: 'text-amber-700 bg-amber-50',
    graduated: 'text-blue-700 bg-blue-50',
    withdrawn: 'text-red-700 bg-red-50',
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('promotionRollover')} />

      <div className="flex items-center gap-3">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('selectYear')} />
          </SelectTrigger>
          <SelectContent>
            {academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
        </div>
      ) : !report ? (
        <EmptyState
          icon={TrendingUp}
          title={t('noData')}
          description={t('noPromotionData')}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('promoted')} value={report.summary?.promoted ?? 0} />
            <StatCard label={t('heldBack')} value={report.summary?.held_back ?? 0} />
            <StatCard label={t('graduated')} value={report.summary?.graduated ?? 0} />
            <StatCard label={t('withdrawn')} value={report.summary?.withdrawn ?? 0} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('studentName')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('fromGrade')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('toGrade')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(report.details ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm text-text-tertiary">
                      {t('noData')}
                    </td>
                  </tr>
                ) : (
                  (report.details ?? []).map((row) => (
                    <tr key={row.student_id} className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary">
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.student_name}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{row.from_grade}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{row.to_grade}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[row.status] ?? ''}`}>
                          {t(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
