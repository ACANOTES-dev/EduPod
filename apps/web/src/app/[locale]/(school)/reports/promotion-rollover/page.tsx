'use client';

import { TrendingUp } from 'lucide-react';
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

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types — mirror reports.service.ts `promotionRollover` return shape ─────

interface AcademicYear {
  id: string;
  name: string;
}

interface PromotionDetail {
  year_group_id: string;
  year_group_name: string;
  promoted: number;
  held_back: number;
  graduated: number;
}

interface PromotionReport {
  promoted: number;
  held_back: number;
  graduated: number;
  withdrawn: number;
  details: PromotionDetail[];
}

// ─── Page ────────────────────────────────────────────────────────────────────

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
      .catch((err: unknown) => {
        console.error('[ReportsPromotionRolloverPage] years', err);
      });
  }, []);

  React.useEffect(() => {
    if (!yearFilter) return;
    setIsLoading(true);
    apiClient<{ data: PromotionReport }>(
      `/api/v1/reports/promotion-rollover?academic_year_id=${yearFilter}`,
    )
      .then((res) => setReport(res.data))
      .catch((err: unknown) => {
        console.error('[ReportsPromotionRolloverPage] report', err);
        setReport(null);
      })
      .finally(() => setIsLoading(false));
  }, [yearFilter]);

  const details = report?.details ?? [];
  const hasDetails = details.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('promotionRollover')} />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('selectYear')} />
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
        <EmptyState icon={TrendingUp} title={t('noData')} description={t('noPromotionData')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('promoted')} value={report.promoted ?? 0} />
            <StatCard label={t('heldBack')} value={report.held_back ?? 0} />
            <StatCard label={t('graduated')} value={report.graduated ?? 0} />
            <StatCard label={t('withdrawn')} value={report.withdrawn ?? 0} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('yearGroup')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('promoted')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('heldBack')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('graduated')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {!hasDetails ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm text-text-tertiary">
                      {t('noData')}
                    </td>
                  </tr>
                ) : (
                  details.map((row) => (
                    <tr
                      key={row.year_group_id}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        {row.year_group_name}
                      </td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums text-text-primary">
                        {row.promoted}
                      </td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums text-text-primary">
                        {row.held_back}
                      </td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums text-text-primary">
                        {row.graduated}
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
