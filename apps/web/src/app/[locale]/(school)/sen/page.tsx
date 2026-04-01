'use client';

import { EmptyState, Skeleton, StatCard } from '@school/ui';
import { AlertTriangle, HeartHandshake } from 'lucide-react';
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

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewResponse {
  total_profiles: number;
  active_profiles: number;
  by_category: Record<string, number>;
  by_support_level: Record<string, number>;
}

interface ComplianceResponse {
  due_plans: number;
  overdue_plans: number;
  stale_goals: number;
}

interface UtilisationResponse {
  total_allocated_hours: number;
  total_used_hours: number;
  utilisation_percentage: number;
}

// ─── Chart colours ────────────────────────────────────────────────────────────

const CATEGORY_COLORS = [
  '#0f766e',
  '#2563eb',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#65a30d',
  '#be185d',
];

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function SenDashboardPage() {
  const t = useTranslations('sen');

  const [overview, setOverview] = React.useState<OverviewResponse | null>(null);
  const [compliance, setCompliance] = React.useState<ComplianceResponse | null>(null);
  const [utilisation, setUtilisation] = React.useState<UtilisationResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [overviewRes, complianceRes, utilisationRes] = await Promise.all([
          apiClient<OverviewResponse>('/api/v1/sen/overview'),
          apiClient<ComplianceResponse>(
            '/api/v1/sen/reports/plan-compliance?due_within_days=14&overdue=true',
          ),
          apiClient<UtilisationResponse>('/api/v1/sen/resource-utilisation'),
        ]);

        if (!cancelled) {
          setOverview(overviewRes);
          setCompliance(complianceRes);
          setUtilisation(utilisationRes);
        }
      } catch (err) {
        console.error('[SenDashboardPage] fetchData', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Derive chart data ────────────────────────────────────────────────────

  const categoryChartData = React.useMemo(() => {
    if (!overview?.by_category) return [];
    return Object.entries(overview.by_category).map(([name, value]) => ({
      name,
      value,
    }));
  }, [overview]);

  const supportLevelChartData = React.useMemo(() => {
    if (!overview?.by_support_level) return [];
    return Object.entries(overview.by_support_level).map(([name, value]) => ({
      name,
      value,
    }));
  }, [overview]);

  // ─── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('dashboard.title')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={`stat-skeleton-${i}`} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────

  if (error || !overview) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('dashboard.title')} />
        <EmptyState
          icon={AlertTriangle}
          title={t('dashboard.errorTitle')}
          description={t('dashboard.errorDescription')}
        />
      </div>
    );
  }

  // ─── KPI cards ────────────────────────────────────────────────────────────

  const schoolSupport = overview.by_support_level?.school_support ?? 0;
  const schoolSupportPlus = overview.by_support_level?.school_support_plus ?? 0;
  const plansDue = (compliance?.due_plans ?? 0) + (compliance?.overdue_plans ?? 0);
  const utilisationPct = utilisation?.utilisation_percentage ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} description={t('dashboard.description')} />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t('dashboard.totalSenStudents')} value={overview.total_profiles} />
        <StatCard label={t('dashboard.schoolSupport')} value={schoolSupport} />
        <StatCard label={t('dashboard.schoolSupportPlus')} value={schoolSupportPlus} />
        <StatCard
          label={t('dashboard.plansDue')}
          value={plansDue}
          trend={
            (compliance?.overdue_plans ?? 0) > 0
              ? {
                  direction: 'down' as const,
                  label: `${compliance?.overdue_plans} ${t('dashboard.overdue')}`,
                }
              : undefined
          }
        />
        <StatCard
          label={t('dashboard.resourceUtilisation')}
          value={`${Math.round(utilisationPct)}%`}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category distribution — donut chart */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('dashboard.categoryDistribution')}
          </h3>
          {categoryChartData.length === 0 ? (
            <EmptyState
              icon={HeartHandshake}
              title={t('dashboard.noCategories')}
              className="py-12"
            />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={categoryChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ? t(`category.${name}`) : ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {categoryChartData.map((_, index) => (
                    <Cell
                      key={`cell-${categoryChartData[index]?.name ?? index}`}
                      fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [String(value), '']} />
                <Legend formatter={(value) => t(`category.${String(value)}`)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Support level distribution — bar chart */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('dashboard.supportLevelDistribution')}
          </h3>
          {supportLevelChartData.length === 0 ? (
            <EmptyState
              icon={HeartHandshake}
              title={t('dashboard.noSupportLevels')}
              className="py-12"
            />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={supportLevelChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value: string) => t(`supportLevel.${value}`)}
                />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip formatter={(value) => [String(value), '']} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {supportLevelChartData.map((entry, index) => (
                    <Cell key={`bar-${entry.name}`} fill={index === 0 ? '#2563eb' : '#0f766e'} />
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
