'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import { Button, StatCard } from '@school/ui';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  funnel: Array<{
    stage: string;
    count: number;
  }>;
  total_applications: number;
  conversion_rate: number;
  avg_days_to_decision: number;
}

// ─── Funnel Chart ─────────────────────────────────────────────────────────────

function FunnelChart({ data }: { data: Array<{ stage: string; count: number }> }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-text-primary">Admissions Funnel</h3>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" />
            <YAxis type="category" dataKey="stage" width={80} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdmissionsAnalyticsPage() {
  const t = useTranslations('admissions');
  const tc = useTranslations('common');
  const router = useRouter();

  const [analytics, setAnalytics] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<{ data: AnalyticsData }>('/api/v1/applications/analytics')
      .then((res) => setAnalytics(res.data))
      .catch(() => {
        // ignore
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
          <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
          <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
        </div>
        <div className="h-[380px] animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('analytics')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />

      {/* Summary cards */}
      {analytics && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label={t('totalApplications')}
            value={analytics.total_applications}
          />
          <StatCard
            label={t('conversionRate')}
            value={`${analytics.conversion_rate.toFixed(1)}%`}
          />
          <StatCard
            label={t('avgDaysToDecision')}
            value={analytics.avg_days_to_decision.toFixed(1)}
          />
        </div>
      )}

      {/* Funnel chart */}
      {analytics?.funnel && analytics.funnel.length > 0 ? (
        <FunnelChart data={analytics.funnel} />
      ) : (
        <div className="rounded-xl border border-border bg-surface p-12 text-center shadow-sm">
          <p className="text-sm text-text-tertiary">{t('noApplicationsYet')}</p>
        </div>
      )}
    </div>
  );
}
