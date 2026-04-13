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

interface AnalyticsResponse {
  funnel: Record<string, number>;
  total: number;
  conversion_rate: number;
  avg_days_to_decision: number | null;
}

interface WaitingListMeta {
  meta: { total: number };
}

// ─── Funnel Chart ─────────────────────────────────────────────────────────────

function FunnelChart({
  data,
  title,
}: {
  data: Array<{ stage: string; count: number }>;
  title: string;
}) {
  // Defer mounting the chart until after first paint so ResponsiveContainer
  // measures a parent that already has its computed width. Without this gate,
  // Recharts logs a `width(-1) height(-1)` warning during SSR/hydration even
  // when the wrapper has explicit pixel dimensions. (ADM-019.) Uses a
  // requestAnimationFrame so the layout pass for the explicit-height parent
  // completes before ResponsiveContainer takes its first measurement.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-text-primary">{title}</h3>
      <div className="h-[300px] min-h-[300px] w-full">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 20, bottom: 0, left: 170 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="stage" width={160} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}

// Canonical funnel order: submitted → ready_to_admit → conditional_approval → approved.
const FUNNEL_STAGES = ['submitted', 'ready_to_admit', 'conditional_approval', 'approved'] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdmissionsAnalyticsPage() {
  const t = useTranslations('admissions');
  const tc = useTranslations('common');
  const router = useRouter();

  const [analytics, setAnalytics] = React.useState<AnalyticsResponse | null>(null);
  const [waitingListCount, setWaitingListCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AnalyticsResponse }>('/api/v1/applications/analytics'),
      apiClient<WaitingListMeta>(
        '/api/v1/applications?status=waiting_list&page=1&pageSize=1',
      ).catch((err) => {
        console.error('[AdmissionsAnalyticsPage.waitingList]', err);
        return null;
      }),
    ])
      .then(([analyticsRes, waitingRes]) => {
        setAnalytics(analyticsRes.data);
        setWaitingListCount(waitingRes?.meta?.total ?? 0);
      })
      .catch((err) => {
        console.error('[AdmissionsAnalyticsPage]', err);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('totalApplications')} value={analytics.total} />
          <StatCard
            label={t('conversionRate')}
            value={`${analytics.conversion_rate.toFixed(1)}%`}
          />
          <StatCard
            label={t('avgDaysToDecision')}
            value={
              analytics.avg_days_to_decision != null
                ? analytics.avg_days_to_decision.toFixed(1)
                : '—'
            }
          />
          <StatCard label={t('waitingList')} value={waitingListCount ?? '—'} />
        </div>
      )}

      {/* Funnel chart */}
      {analytics?.funnel && analytics.total > 0 ? (
        <FunnelChart
          title={t('funnel')}
          data={FUNNEL_STAGES.map((stage) => ({
            stage: t(
              stage === 'submitted'
                ? 'submitted'
                : stage === 'ready_to_admit'
                  ? 'readyToAdmit'
                  : stage === 'conditional_approval'
                    ? 'conditionalApproval'
                    : 'approved',
            ),
            count: analytics.funnel[stage] ?? 0,
          }))}
        />
      ) : analytics?.total === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center shadow-sm">
          <p className="text-sm text-text-tertiary">{t('noApplicationsYet')}</p>
        </div>
      ) : null}
    </div>
  );
}
