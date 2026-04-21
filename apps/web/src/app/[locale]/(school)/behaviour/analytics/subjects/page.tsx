'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface SubjectRow {
  subject_id: string | null;
  subject_name: string;
  raw_count: number;
  rate?: number | null;
  polarity_breakdown?: { positive: number; negative: number; neutral: number };
}

interface SubjectsResponse {
  data: { subjects: SubjectRow[]; data_quality: unknown };
}

export default function BehaviourAnalyticsSubjectsPage() {
  const t = useTranslations('behaviour.analyticsSubjects');
  const locale = useLocale();
  const [rows, setRows] = React.useState<SubjectRow[]>([]);
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
      const res = await apiClient<SubjectsResponse>(
        `/api/v1/behaviour/analytics/subjects${qs.toString() ? `?${qs}` : ''}`,
        { silent: true },
      );
      setRows(res.data?.subjects ?? []);
    } catch (err: unknown) {
      console.error('[BehaviourAnalyticsSubjects]', err);
      setLoadError((err as { error?: { message?: string } }).error?.message ?? t('errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-3 py-2 text-start text-xs font-medium text-text-secondary">
                  {t('subject')}
                </th>
                <th className="px-3 py-2 text-end text-xs font-medium text-text-secondary">
                  {t('incidents')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.subject_id ?? `row-${i}`}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-2 text-sm text-text-primary">{r.subject_name}</td>
                  <td className="px-3 py-2 text-end text-sm font-semibold text-text-primary">
                    {r.raw_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
