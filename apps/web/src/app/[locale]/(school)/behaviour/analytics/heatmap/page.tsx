'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { InfoTooltip } from '@/components/info-tooltip';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface HeatmapCell {
  weekday: number;
  period_order: number;
  raw_count: number;
  rate: number | null;
  polarity_breakdown?: { positive: number; negative: number; neutral: number };
}

interface HeatmapResponse {
  data: { cells: HeatmapCell[]; data_quality: unknown };
}

export default function BehaviourAnalyticsHeatmapPage() {
  const t = useTranslations('behaviour.analyticsHeatmap');
  const locale = useLocale();
  const [rows, setRows] = React.useState<HeatmapCell[]>([]);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await apiClient<HeatmapResponse>(
        `/api/v1/behaviour/analytics/heatmap${qs.toString() ? `?${qs}` : ''}`,
        { silent: true },
      );
      setRows(res.data?.cells ?? []);
    } catch (err: unknown) {
      console.error('[BehaviourAnalyticsHeatmap]', err);
      setLoadError((err as { error?: { message?: string } }).error?.message ?? t('errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const maxCount = Math.max(1, ...rows.map((r) => r.raw_count));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/behaviour/analytics`, label: t('backToAnalytics') }}
      />

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">{t('from')}</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">{t('to')}</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-danger-300 bg-danger-50 p-4">
          <p className="text-sm text-text-primary">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <p className="text-sm text-text-primary">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-3 py-2 text-start text-xs font-medium text-text-secondary">
                  {t('day')}
                </th>
                <th className="px-3 py-2 text-start text-xs font-medium text-text-secondary">
                  {t('period')}
                </th>
                <th className="px-3 py-2 text-end text-xs font-medium text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    {t('incidents')}
                    <InfoTooltip content="Count of incidents logged during this weekday and period across the date range." />
                  </span>
                </th>
                <th className="px-3 py-2 text-start text-xs font-medium text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    {t('density')}
                    <InfoTooltip content="Relative intensity — the darker and longer the bar, the higher the incident count for that weekday/period slot." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((cell, i) => {
                const pct = Math.round((cell.raw_count / maxCount) * 100);
                return (
                  <tr
                    key={`${cell.weekday}-${cell.period_order}-${i}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-3 py-2 text-sm text-text-primary">
                      {t(`days.${cell.weekday}` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-3 py-2 text-sm text-text-primary">P{cell.period_order}</td>
                    <td className="px-3 py-2 text-end text-sm font-semibold text-text-primary">
                      {cell.raw_count}
                    </td>
                    <td className="px-3 py-2">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                        <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
