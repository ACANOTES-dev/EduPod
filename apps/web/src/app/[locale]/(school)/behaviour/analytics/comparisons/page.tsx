'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface ComparisonRow {
  group_id: string;
  group_name: string;
  incident_count: number;
  positive_count?: number;
  negative_count?: number;
  per_student_rate?: number;
}

export default function BehaviourAnalyticsComparisonsPage() {
  const t = useTranslations('behaviour.analyticsComparisons');
  const locale = useLocale();
  const [rows, setRows] = React.useState<ComparisonRow[]>([]);
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
      const res = await apiClient<{ data: ComparisonRow[] }>(
        `/api/v1/behaviour/analytics/comparisons${qs.toString() ? `?${qs}` : ''}`,
        { silent: true },
      );
      setRows(res.data ?? []);
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

  const maxCount = Math.max(1, ...rows.map((r) => r.incident_count));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${locale}/behaviour/analytics`}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          {t('backToAnalytics')}
        </Link>
      </div>
      <PageHeader title={t('title')} description={t('description')} />

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
            const pct = Math.round((r.incident_count / maxCount) * 100);
            return (
              <div
                key={r.group_id}
                className="rounded-lg border border-border bg-surface px-4 py-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">{r.group_name}</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {r.incident_count}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                  <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
                </div>
                {(r.positive_count !== undefined || r.negative_count !== undefined) && (
                  <div className="mt-1 flex gap-3 text-xs text-text-secondary">
                    <span className="text-success-text">+{r.positive_count ?? 0}</span>
                    <span className="text-danger-text">-{r.negative_count ?? 0}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
