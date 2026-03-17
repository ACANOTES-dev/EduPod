'use client';

import { BarChart3, CheckCircle2, Loader2, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SatisfactionDetail {
  preference_type: string;
  target_label: string;
  priority: string;
  direction: 'prefer' | 'avoid';
  satisfied: boolean;
}

interface MySatisfaction {
  overall_pct: number;
  total_preferences: number;
  satisfied_count: number;
  last_run_at?: string;
  details: SatisfactionDetail[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MySatisfactionPage() {
  const t = useTranslations('scheduling.auto');
  const [data, setData] = React.useState<MySatisfaction | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    apiClient<MySatisfaction>('/api/v1/scheduling-dashboard/my-satisfaction')
      .then((res) => setData(res))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('mySatisfaction')} />
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary">
            No satisfaction data available. Run the auto-scheduler first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('mySatisfaction')} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wide">
                {t('satisfactionPct')}
              </p>
              <p className="mt-1 text-3xl font-bold text-brand">{data.overall_pct}%</p>
            </div>
            <BarChart3 className="h-6 w-6 text-brand/50" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wide">Total Preferences</p>
              <p className="mt-1 text-3xl font-bold text-text-primary">{data.total_preferences}</p>
            </div>
            <Star className="h-6 w-6 text-text-tertiary" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wide">Satisfied</p>
              <p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-400">
                {data.satisfied_count}
              </p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-text-primary">
            {data.satisfied_count} of {data.total_preferences} preferences satisfied
          </span>
          <span className="text-sm font-bold text-brand">{data.overall_pct}%</span>
        </div>
        <div className="w-full bg-surface-secondary rounded-full h-3">
          <div
            className="bg-brand rounded-full h-3 transition-all"
            style={{ width: `${data.overall_pct}%` }}
          />
        </div>
      </div>

      {data.last_run_at && (
        <p className="text-xs text-text-tertiary">
          Based on run: {new Date(data.last_run_at).toLocaleString()}
        </p>
      )}

      {/* Preference Details */}
      {data.details.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Preference Details</h2>
          <div className="space-y-2">
            {data.details.map((detail, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                  detail.satisfied
                    ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800'
                    : 'bg-surface border border-border'
                }`}
              >
                <CheckCircle2
                  className={`h-4 w-4 shrink-0 ${
                    detail.satisfied
                      ? 'text-green-500'
                      : 'text-text-tertiary opacity-30'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-text-primary">{detail.target_label}</span>
                  <span className="text-xs text-text-tertiary ms-2 capitalize">
                    ({detail.preference_type})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant={detail.direction === 'prefer' ? 'default' : 'destructive'}
                    className="text-xs capitalize"
                  >
                    {detail.direction === 'prefer' ? t('prefer') : t('avoid')}
                  </Badge>
                  <Badge
                    variant={detail.priority === 'high' ? 'default' : 'secondary'}
                    className="text-xs capitalize"
                  >
                    {detail.priority}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
