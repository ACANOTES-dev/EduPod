'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { toast } from '@school/ui';

import { CohortFilters, type CohortGroupBy } from './cohort-filters';

import { apiClient } from '@/lib/api-client';
import { getHeatmapColor, type CohortResponse, type CohortRow } from '@/lib/early-warning';

const DOMAIN_KEYS = [
  'avg_attendance',
  'avg_grades',
  'avg_behaviour',
  'avg_wellbeing',
  'avg_engagement',
] as const;

export function CohortHeatmap() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const router = useRouter();

  const [groupBy, setGroupBy] = React.useState<CohortGroupBy>('year_group');
  const [rows, setRows] = React.useState<CohortRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiClient<CohortResponse>(`/api/v1/early-warnings/cohort?group_by=${groupBy}`)
      .then((res) => {
        if (!cancelled) setRows(res.data ?? []);
      })
      .catch((err) => {
        console.error('[CohortHeatmap]', err);
        toast.error(t('errors.load_failed'));
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupBy, t]);

  const handleCellClick = (groupId: string, domain?: string) => {
    const params = new URLSearchParams();
    if (groupBy === 'year_group') params.set('year_group_id', groupId);
    if (groupBy === 'class') params.set('class_id', groupId);
    if (domain) params.set('domain', domain);
    router.push(`/${locale}/early-warnings?${params.toString()}`);
  };

  const domainLabels: Record<string, string> = {
    avg_attendance: t('domains.attendance' as never),
    avg_grades: t('domains.grades' as never),
    avg_behaviour: t('domains.behaviour' as never),
    avg_wellbeing: t('domains.wellbeing' as never),
    avg_engagement: t('domains.engagement' as never),
  };

  return (
    <div className="space-y-4">
      <CohortFilters groupBy={groupBy} onGroupByChange={setGroupBy} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm text-text-tertiary">{t('list.no_data')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t(`cohort.${groupBy}` as never)}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('cohort.students')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('cohort.avg_score')}
                </th>
                {DOMAIN_KEYS.map((key) => (
                  <th
                    key={key}
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                  >
                    {domainLabels[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.group_id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {row.group_name}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-text-secondary">
                    {row.student_count}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleCellClick(row.group_id)}
                      className={`rounded-lg px-3 py-1 font-mono text-sm font-medium transition-opacity hover:opacity-80 ${getHeatmapColor(row.avg_composite)}`}
                    >
                      {row.avg_composite.toFixed(0)}
                    </button>
                  </td>
                  {DOMAIN_KEYS.map((key) => {
                    const value = row[key];
                    const domain = key.replace('avg_', '');
                    return (
                      <td key={key} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleCellClick(row.group_id, domain)}
                          className={`rounded-lg px-3 py-1 font-mono text-sm font-medium transition-opacity hover:opacity-80 ${getHeatmapColor(value)}`}
                        >
                          {value.toFixed(0)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
