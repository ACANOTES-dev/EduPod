'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { InfoTooltip } from '@/components/info-tooltip';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface ComparisonEntry {
  year_group_id: string;
  year_group_name: string;
  incident_rate: number | null;
  positive_rate: number | null;
  negative_rate: number | null;
  student_count: number;
}

interface ComparisonResponse {
  data: { entries: ComparisonEntry[]; data_quality: unknown };
}

export default function BehaviourAnalyticsComparisonsPage() {
  const t = useTranslations('behaviour.analyticsComparisons');
  const locale = useLocale();
  const [rows, setRows] = React.useState<ComparisonEntry[]>([]);
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
      const res = await apiClient<ComparisonResponse>(
        `/api/v1/behaviour/analytics/comparisons${qs.toString() ? `?${qs}` : ''}`,
        { silent: true },
      );
      setRows(res.data?.entries ?? []);
    } catch (err: unknown) {
      console.error('[BehaviourAnalyticsComparisons]', err);
      setLoadError((err as { error?: { message?: string } }).error?.message ?? t('errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const maxRate = Math.max(
    1,
    ...rows.map((r) => (typeof r.incident_rate === 'number' ? r.incident_rate : 0)),
  );

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
        <div className="space-y-2">
          {rows.map((r) => {
            const rate = r.incident_rate ?? 0;
            const pct = Math.round((rate / maxRate) * 100);
            return (
              <div
                key={r.year_group_id}
                className="rounded-lg border border-border bg-surface px-4 py-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-sm font-medium text-text-primary">
                    {r.year_group_name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-primary">
                    {r.incident_rate !== null ? `${rate.toFixed(1)}%` : '—'}
                    <InfoTooltip content="Incident rate for this year group — normalised per-student so cohorts of different sizes can be compared." />
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                  <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary">
                  <span className="inline-flex items-center gap-1 text-success-text">
                    +{r.positive_rate !== null ? `${r.positive_rate.toFixed(1)}%` : '0'}
                    <InfoTooltip content="Positive recognition rate — praise, merit, awards normalised per-student for this cohort." />
                  </span>
                  <span className="inline-flex items-center gap-1 text-danger-text">
                    -{r.negative_rate !== null ? `${r.negative_rate.toFixed(1)}%` : '0'}
                    <InfoTooltip content="Negative incident rate — warnings, detentions, suspensions normalised per-student for this cohort." />
                  </span>
                  <span>· {r.student_count} students</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
