'use client';

import { AlertTriangle, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState, Skeleton, StatCard } from '@school/ui';

import { CHART_COLORS, humanise } from './shared';

import { apiClient } from '@/lib/api-client';


// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfessionalSummary {
  total_involvements: number;
  pending_referrals: number;
  completed_assessments: number;
  reports_received: number;
}

interface ProfessionalInvolvementData {
  summary: ProfessionalSummary;
  by_professional_type: Array<{ professional_type: string; count: number }>;
  by_status: Array<{ status: string; count: number }>;
  grouped_counts: Array<{ professional_type: string; status: string; count: number }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfessionalInvolvementTab() {
  const t = useTranslations('sen');
  const [data, setData] = React.useState<ProfessionalInvolvementData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data: ProfessionalInvolvementData }>('/api/v1/sen/reports/professional-involvement')
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        console.error('[ProfessionalInvolvementTab] load report', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const typeChartData = React.useMemo(() => {
    if (!data?.by_professional_type) return [];
    return data.by_professional_type.map((item) => ({
      name: humanise(item.professional_type),
      value: item.count,
    }));
  }, [data]);

  const statusChartData = React.useMemo(() => {
    if (!data?.by_status) return [];
    return data.by_status.map((item) => ({
      name: humanise(item.status),
      value: item.count,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`prof-sk-${i}`} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('reports.errorTitle')}
        description={t('reports.errorDescription')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('reports.professional.totalInvolvements')}
          value={data.summary.total_involvements}
        />
        <StatCard
          label={t('reports.professional.pendingReferrals')}
          value={data.summary.pending_referrals}
        />
        <StatCard
          label={t('reports.professional.completedAssessments')}
          value={data.summary.completed_assessments}
        />
        <StatCard
          label={t('reports.professional.reportsReceived')}
          value={data.summary.reports_received}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* By type pie chart */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('reports.professional.byType')}
          </h3>
          {typeChartData.length === 0 ? (
            <EmptyState icon={Stethoscope} title={t('reports.noData')} className="py-12" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={typeChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {typeChartData.map((entry, index) => (
                    <Cell
                      key={`type-${entry.name}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By status bar chart */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('reports.professional.byStatus')}
          </h3>
          {statusChartData.length === 0 ? (
            <EmptyState icon={Stethoscope} title={t('reports.noData')} className="py-12" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statusChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {statusChartData.map((entry, index) => (
                    <Cell
                      key={`status-${entry.name}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
