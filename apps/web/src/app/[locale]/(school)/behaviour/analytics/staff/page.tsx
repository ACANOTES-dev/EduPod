'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { InfoTooltip } from '@/components/info-tooltip';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface StaffRow {
  staff_id: string;
  staff_name: string;
  last_7_days: number;
  last_30_days: number;
  total_year: number;
  last_logged_at: string | null;
  inactive_flag: boolean;
}

interface StaffResponse {
  data: { staff: StaffRow[]; data_quality: unknown };
}

export default function BehaviourAnalyticsStaffPage() {
  const t = useTranslations('behaviour.analyticsStaff');
  const locale = useLocale();
  const [rows, setRows] = React.useState<StaffRow[]>([]);
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
      const res = await apiClient<StaffResponse>(
        `/api/v1/behaviour/analytics/staff${qs.toString() ? `?${qs}` : ''}`,
        { silent: true },
      );
      setRows(res.data?.staff ?? []);
    } catch (err: unknown) {
      console.error('[BehaviourAnalyticsStaff]', err);
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
                  {t('staff')}
                </th>
                <th className="px-3 py-2 text-end text-xs font-medium text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    Last 7 days
                    <InfoTooltip content="Incidents this staff member logged in the last 7 days." />
                  </span>
                </th>
                <th className="px-3 py-2 text-end text-xs font-medium text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    Last 30 days
                    <InfoTooltip content="Incidents this staff member logged in the last 30 days." />
                  </span>
                </th>
                <th className="px-3 py-2 text-end text-xs font-medium text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    Year total
                    <InfoTooltip content="Total incidents this staff member has logged across the current academic year." />
                  </span>
                </th>
                <th className="px-3 py-2 text-start text-xs font-medium text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    Last logged
                    <InfoTooltip content="Most recent occurred_at among incidents this staff member authored — flags inactive loggers." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staff_id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-sm text-text-primary">
                    {r.staff_name}
                    {r.inactive_flag && (
                      <span className="ms-2 text-xs text-text-tertiary">· inactive</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end text-sm text-text-primary">{r.last_7_days}</td>
                  <td className="px-3 py-2 text-end text-sm text-text-primary">{r.last_30_days}</td>
                  <td className="px-3 py-2 text-end text-sm font-semibold text-text-primary">
                    {r.total_year}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-tertiary">
                    {r.last_logged_at ? new Date(r.last_logged_at).toLocaleDateString() : '—'}
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
