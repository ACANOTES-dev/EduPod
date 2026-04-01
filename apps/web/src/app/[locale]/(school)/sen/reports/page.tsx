'use client';

import {
  AlertTriangle,
  BarChart3,
  Calendar,
  ClipboardCheck,
  FileText,
  Stethoscope,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
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

import {
  cn,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatCard,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  'ncseReturn',
  'overview',
  'resourceUtilisation',
  'planCompliance',
  'professionalInvolvement',
] as const;

type ReportTab = (typeof TABS)[number];

const TAB_ICONS: Record<ReportTab, React.ElementType> = {
  ncseReturn: FileText,
  overview: BarChart3,
  resourceUtilisation: Users,
  planCompliance: ClipboardCheck,
  professionalInvolvement: Stethoscope,
};

const CHART_COLORS = [
  '#0f766e',
  '#2563eb',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#65a30d',
  '#be185d',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
  status: string;
}

interface NcseReturnData {
  academic_year: string;
  total_sen_students: number;
  by_category: Array<{ category: string; count: number }>;
  by_support_level: Array<{ level: string; count: number }>;
  by_year_group: Array<{ year_group_id: string; year_group_name: string; count: number }>;
  by_gender: Array<{ gender: string; count: number }>;
  resource_hours: {
    seno_allocated: number;
    school_allocated: number;
    total_assigned: number;
    total_used: number;
  };
  sna_count: number;
  accommodation_count: number;
}

interface OverviewData {
  total_sen_students: number;
  by_category: Array<{ category: string; count: number }>;
  by_support_level: Array<{ level: string; count: number }>;
  by_year_group: Array<{ year_group_id: string; year_group_name: string; count: number }>;
}

interface UtilisationTotals {
  total_allocated_hours: number;
  total_assigned_hours: number;
  total_used_hours: number;
  assigned_percentage: number;
  used_percentage: number;
}

interface UtilisationBySource extends UtilisationTotals {
  source: string;
}

interface UtilisationByYearGroup {
  year_group_id: string | null;
  year_group_name: string;
  total_assigned_hours: number;
  total_used_hours: number;
  assigned_percentage: number;
  used_percentage: number;
}

interface UtilisationData {
  academic_year_id: string | null;
  totals: UtilisationTotals;
  bySource: UtilisationBySource[];
  byYearGroup: UtilisationByYearGroup[];
}

interface PlanCompliancePlan {
  plan_id: string;
  plan_number: string;
  sen_profile_id: string;
  next_review_date: string | null;
  status: string;
  student: {
    id: string;
    name: string;
    year_group: { id: string; name: string } | null;
  };
}

interface StaleGoal {
  goal_id: string;
  title: string;
  status: string;
  last_progress_at: string | null;
  support_plan: {
    id: string;
    plan_number: string;
    next_review_date: string | null;
  };
  student: {
    id: string;
    name: string;
    year_group: { id: string; name: string } | null;
  };
}

interface PlanComplianceData {
  due_within_days: number;
  stale_goal_weeks: number;
  due_for_review: PlanCompliancePlan[];
  overdue_plans: PlanCompliancePlan[];
  stale_goals: StaleGoal[];
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function humanise(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

// ─── Tab content components ───────────────────────────────────────────────────

function NcseReturnTab() {
  const t = useTranslations('sen');
  const [yearId, setYearId] = React.useState('');
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [data, setData] = React.useState<NcseReturnData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=100')
      .then((res) => {
        const years = res.data ?? [];
        setAcademicYears(years);
        const active = years.find((y) => y.status === 'active');
        if (active) setYearId(active.id);
      })
      .catch((err: unknown) => {
        console.error('[NcseReturnTab] load academic years', err);
      });
  }, []);

  React.useEffect(() => {
    if (!yearId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiClient<{ data: NcseReturnData }>(
      `/api/v1/sen/reports/ncse-return?academic_year_id=${yearId}`,
    )
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        console.error('[NcseReturnTab] load NCSE return', err);
        toast.error(t('reports.loadError'));
      })
      .finally(() => setLoading(false));
  }, [yearId, t]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={`ncse-sk-${i}`} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Year filter */}
      <div className="flex items-end gap-4">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label htmlFor="ncse-year">{t('reports.academicYear')}</Label>
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger id="ncse-year" className="w-full text-base">
              <SelectValue placeholder={t('reports.selectYear')} />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!data ? (
        <EmptyState
          icon={FileText}
          title={t('reports.noNcseData')}
          description={t('reports.selectYearPrompt')}
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('reports.ncse.totalSenStudents')} value={data.total_sen_students} />
            <StatCard label={t('reports.ncse.activeSna')} value={data.sna_count} />
            <StatCard
              label={t('reports.ncse.activeAccommodations')}
              value={data.accommodation_count}
            />
            <StatCard
              label={t('reports.ncse.totalResourceHoursUsed')}
              value={data.resource_hours.total_used}
            />
          </div>

          {/* Category breakdown */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('reports.ncse.byCategory')}
            </h3>
            {data.by_category.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">{t('reports.noData')}</p>
            ) : (
              <div className="space-y-2">
                {data.by_category.map((item) => (
                  <div
                    key={item.category}
                    className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2"
                  >
                    <span className="text-sm text-text-primary">{humanise(item.category)}</span>
                    <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Support level breakdown */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('reports.ncse.bySupportLevel')}
            </h3>
            {data.by_support_level.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">{t('reports.noData')}</p>
            ) : (
              <div className="space-y-2">
                {data.by_support_level.map((item) => (
                  <div
                    key={item.level}
                    className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2"
                  >
                    <span className="text-sm text-text-primary">{humanise(item.level)}</span>
                    <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resource hours */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('reports.ncse.resourceHours')}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-surface-secondary px-4 py-3">
                <p className="text-xs text-text-tertiary">{t('reports.ncse.senoAllocated')}</p>
                <p className="text-lg font-semibold text-text-primary">
                  {data.resource_hours.seno_allocated}h
                </p>
              </div>
              <div className="rounded-lg bg-surface-secondary px-4 py-3">
                <p className="text-xs text-text-tertiary">{t('reports.ncse.schoolAllocated')}</p>
                <p className="text-lg font-semibold text-text-primary">
                  {data.resource_hours.school_allocated}h
                </p>
              </div>
              <div className="rounded-lg bg-surface-secondary px-4 py-3">
                <p className="text-xs text-text-tertiary">{t('reports.ncse.totalAssigned')}</p>
                <p className="text-lg font-semibold text-text-primary">
                  {data.resource_hours.total_assigned}h
                </p>
              </div>
              <div className="rounded-lg bg-surface-secondary px-4 py-3">
                <p className="text-xs text-text-tertiary">{t('reports.ncse.totalUsed')}</p>
                <p className="text-lg font-semibold text-text-primary">
                  {data.resource_hours.total_used}h
                </p>
              </div>
            </div>
          </div>

          {/* Gender & year group */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('reports.ncse.byGender')}
              </h3>
              <div className="space-y-2">
                {data.by_gender.map((item) => (
                  <div
                    key={item.gender}
                    className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2"
                  >
                    <span className="text-sm text-text-primary">{humanise(item.gender)}</span>
                    <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('reports.ncse.byYearGroup')}
              </h3>
              <div className="space-y-2">
                {data.by_year_group.map((item) => (
                  <div
                    key={item.year_group_id}
                    className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2"
                  >
                    <span className="text-sm text-text-primary">{item.year_group_name}</span>
                    <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OverviewTab() {
  const t = useTranslations('sen');
  const [data, setData] = React.useState<OverviewData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data: OverviewData }>('/api/v1/sen/reports/overview')
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        console.error('[OverviewTab] load overview', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const categoryChartData = React.useMemo(() => {
    if (!data?.by_category) return [];
    return data.by_category.map((item) => ({ name: item.category, value: item.count }));
  }, [data]);

  const supportLevelChartData = React.useMemo(() => {
    if (!data?.by_support_level) return [];
    return data.by_support_level.map((item) => ({ name: item.level, value: item.count }));
  }, [data]);

  const yearGroupChartData = React.useMemo(() => {
    if (!data?.by_year_group) return [];
    return data.by_year_group.map((item) => ({
      name: item.year_group_name,
      value: item.count,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
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
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('reports.overview.totalProfiles')} value={data.total_sen_students} />
        <StatCard label={t('reports.overview.categories')} value={data.by_category.length} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category pie chart */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('reports.overview.categoryBreakdown')}
          </h3>
          {categoryChartData.length === 0 ? (
            <EmptyState icon={BarChart3} title={t('reports.noData')} className="py-12" />
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
                    `${humanise(name ?? '')} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {categoryChartData.map((entry, index) => (
                    <Cell
                      key={`cat-${entry.name}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [String(value), '']} />
                <Legend formatter={(value) => humanise(String(value))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Support level bar chart */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('reports.overview.supportLevelBreakdown')}
          </h3>
          {supportLevelChartData.length === 0 ? (
            <EmptyState icon={BarChart3} title={t('reports.noData')} className="py-12" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={supportLevelChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value: string) => humanise(value)}
                />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [String(value), '']}
                  labelFormatter={(label) => humanise(String(label))}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {supportLevelChartData.map((entry, index) => (
                    <Cell
                      key={`sl-${entry.name}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Year group bar chart */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">
          {t('reports.overview.yearGroupBreakdown')}
        </h3>
        {yearGroupChartData.length === 0 ? (
          <EmptyState icon={BarChart3} title={t('reports.noData')} className="py-12" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={yearGroupChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip formatter={(value) => [String(value), '']} />
              <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function ResourceUtilisationTab() {
  const t = useTranslations('sen');
  const [yearId, setYearId] = React.useState('');
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [data, setData] = React.useState<UtilisationData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=100')
      .then((res) => {
        const years = res.data ?? [];
        setAcademicYears(years);
        const active = years.find((y) => y.status === 'active');
        if (active) setYearId(active.id);
      })
      .catch((err: unknown) => {
        console.error('[ResourceUtilisationTab] load academic years', err);
      });
  }, []);

  React.useEffect(() => {
    if (!yearId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiClient<{ data: UtilisationData }>(
      `/api/v1/sen/reports/resource-utilisation?academic_year_id=${yearId}`,
    )
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        console.error('[ResourceUtilisationTab] load utilisation', err);
        toast.error(t('reports.loadError'));
      })
      .finally(() => setLoading(false));
  }, [yearId, t]);

  const sourceChartData = React.useMemo(() => {
    if (!data?.bySource) return [];
    return data.bySource.map((s) => ({
      name: humanise(s.source),
      allocated: s.total_allocated_hours,
      assigned: s.total_assigned_hours,
      used: s.total_used_hours,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`util-sk-${i}`} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Year filter */}
      <div className="flex items-end gap-4">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label htmlFor="util-year">{t('reports.academicYear')}</Label>
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger id="util-year" className="w-full text-base">
              <SelectValue placeholder={t('reports.selectYear')} />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!data ? (
        <EmptyState
          icon={BarChart3}
          title={t('reports.noUtilisationData')}
          description={t('reports.selectYearPrompt')}
        />
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label={t('reports.utilisation.totalAllocated')}
              value={`${data.totals.total_allocated_hours}h`}
            />
            <StatCard
              label={t('reports.utilisation.totalAssigned')}
              value={`${data.totals.total_assigned_hours}h`}
              trend={
                data.totals.assigned_percentage > 0
                  ? {
                      direction: 'up' as const,
                      label: `${Math.round(data.totals.assigned_percentage)}%`,
                    }
                  : undefined
              }
            />
            <StatCard
              label={t('reports.utilisation.totalUsed')}
              value={`${data.totals.total_used_hours}h`}
              trend={
                data.totals.used_percentage > 0
                  ? {
                      direction: 'up' as const,
                      label: `${Math.round(data.totals.used_percentage)}%`,
                    }
                  : undefined
              }
            />
          </div>

          {/* Source comparison bar chart */}
          {sourceChartData.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('reports.utilisation.bySource')}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sourceChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="allocated"
                    name={t('reports.utilisation.allocated')}
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="assigned"
                    name={t('reports.utilisation.assigned')}
                    fill="#0f766e"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="used"
                    name={t('reports.utilisation.used')}
                    fill="#d97706"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Year group breakdown table */}
          {data.byYearGroup.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('reports.utilisation.byYearGroup')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.utilisation.yearGroup')}
                      </th>
                      <th className="px-4 py-2 text-end font-medium text-text-secondary">
                        {t('reports.utilisation.assigned')}
                      </th>
                      <th className="px-4 py-2 text-end font-medium text-text-secondary">
                        {t('reports.utilisation.used')}
                      </th>
                      <th className="px-4 py-2 text-end font-medium text-text-secondary">
                        {t('reports.utilisation.usedPct')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byYearGroup.map((yg) => (
                      <tr
                        key={yg.year_group_id ?? 'unassigned'}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-4 py-2 text-text-primary">{yg.year_group_name}</td>
                        <td className="px-4 py-2 text-end text-text-primary">
                          {yg.total_assigned_hours}h
                        </td>
                        <td className="px-4 py-2 text-end text-text-primary">
                          {yg.total_used_hours}h
                        </td>
                        <td className="px-4 py-2 text-end text-text-primary">
                          {Math.round(yg.used_percentage)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlanComplianceTab() {
  const t = useTranslations('sen');
  const router = useRouter();
  const [dueWithinDays, setDueWithinDays] = React.useState(14);
  const [staleGoalWeeks, setStaleGoalWeeks] = React.useState(4);
  const [data, setData] = React.useState<PlanComplianceData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchCompliance = React.useCallback(() => {
    setLoading(true);
    apiClient<{ data: PlanComplianceData }>(
      `/api/v1/sen/reports/plan-compliance?due_within_days=${dueWithinDays}&stale_goal_weeks=${staleGoalWeeks}`,
    )
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        console.error('[PlanComplianceTab] load compliance', err);
        toast.error(t('reports.loadError'));
      })
      .finally(() => setLoading(false));
  }, [dueWithinDays, staleGoalWeeks, t]);

  React.useEffect(() => {
    fetchCompliance();
  }, [fetchCompliance]);

  const navigateToPlan = React.useCallback(
    (planId: string) => {
      router.push(`/sen/plans/${planId}`);
    },
    [router],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-xl sm:w-96" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="due-days">{t('reports.compliance.dueWithinDays')}</Label>
          <Input
            id="due-days"
            type="number"
            min={1}
            max={365}
            value={dueWithinDays}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > 0) setDueWithinDays(v);
            }}
            className="w-full text-base"
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="stale-weeks">{t('reports.compliance.staleGoalWeeks')}</Label>
          <Input
            id="stale-weeks"
            type="number"
            min={1}
            max={52}
            value={staleGoalWeeks}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > 0) setStaleGoalWeeks(v);
            }}
            className="w-full text-base"
          />
        </div>
      </div>

      {!data ? (
        <EmptyState icon={ClipboardCheck} title={t('reports.compliance.noData')} />
      ) : (
        <>
          {/* Plans due for review */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-1 text-sm font-semibold text-text-primary">
              <Calendar className="me-2 inline-block h-4 w-4" />
              {t('reports.compliance.dueForReview')} ({data.due_for_review.length})
            </h3>
            <p className="mb-4 text-xs text-text-tertiary">
              {t('reports.compliance.dueForReviewDesc', { days: dueWithinDays })}
            </p>
            {data.due_for_review.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">
                {t('reports.compliance.noPlansDue')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.planNumber')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.student')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.nextReview')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.due_for_review.map((plan) => (
                      <tr
                        key={plan.plan_id}
                        className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-secondary"
                        onClick={() => navigateToPlan(plan.plan_id)}
                      >
                        <td className="px-4 py-2 font-medium text-primary">{plan.plan_number}</td>
                        <td className="px-4 py-2 text-text-primary">{plan.student.name}</td>
                        <td className="px-4 py-2 text-text-primary">
                          {formatDateShort(plan.next_review_date)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex rounded-full bg-surface-secondary px-2 py-0.5 text-xs font-medium text-text-secondary">
                            {humanise(plan.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Overdue plans */}
          <div className="rounded-2xl border border-destructive/30 bg-surface p-6">
            <h3 className="mb-1 text-sm font-semibold text-destructive">
              <AlertTriangle className="me-2 inline-block h-4 w-4" />
              {t('reports.compliance.overduePlans')} ({data.overdue_plans.length})
            </h3>
            <p className="mb-4 text-xs text-text-tertiary">{t('reports.compliance.overdueDesc')}</p>
            {data.overdue_plans.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">
                {t('reports.compliance.noOverdue')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.planNumber')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.student')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.nextReview')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.overdue_plans.map((plan) => (
                      <tr
                        key={plan.plan_id}
                        className="cursor-pointer border-b border-border last:border-b-0 hover:bg-destructive/5"
                        onClick={() => navigateToPlan(plan.plan_id)}
                      >
                        <td className="px-4 py-2 font-medium text-destructive">
                          {plan.plan_number}
                        </td>
                        <td className="px-4 py-2 text-text-primary">{plan.student.name}</td>
                        <td className="px-4 py-2 text-destructive">
                          {formatDateShort(plan.next_review_date)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                            {humanise(plan.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Stale goals */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-1 text-sm font-semibold text-text-primary">
              <ClipboardCheck className="me-2 inline-block h-4 w-4" />
              {t('reports.compliance.staleGoals')} ({data.stale_goals.length})
            </h3>
            <p className="mb-4 text-xs text-text-tertiary">
              {t('reports.compliance.staleGoalsDesc', { weeks: staleGoalWeeks })}
            </p>
            {data.stale_goals.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">
                {t('reports.compliance.noStaleGoals')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.goalTitle')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.planNumber')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.student')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.lastUpdated')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stale_goals.map((goal) => (
                      <tr
                        key={goal.goal_id}
                        className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-secondary"
                        onClick={() => navigateToPlan(goal.support_plan.id)}
                      >
                        <td className="px-4 py-2 text-text-primary">{goal.title}</td>
                        <td className="px-4 py-2 font-medium text-primary">
                          {goal.support_plan.plan_number}
                        </td>
                        <td className="px-4 py-2 text-text-primary">{goal.student.name}</td>
                        <td className="px-4 py-2 text-text-tertiary">
                          {formatDateShort(goal.last_progress_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProfessionalInvolvementTab() {
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

// ─── Tab content map ──────────────────────────────────────────────────────────

const TAB_CONTENT: Record<ReportTab, React.FC> = {
  ncseReturn: NcseReturnTab,
  overview: OverviewTab,
  resourceUtilisation: ResourceUtilisationTab,
  planCompliance: PlanComplianceTab,
  professionalInvolvement: ProfessionalInvolvementTab,
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SenReportsPage() {
  const t = useTranslations('sen');
  const [activeTab, setActiveTab] = React.useState<ReportTab>('overview');

  const ActiveContent = TAB_CONTENT[activeTab];

  return (
    <div className="space-y-6">
      <PageHeader title={t('reports.title')} description={t('reports.description')} />

      {/* Tab navigation */}
      <div className="overflow-x-auto border-b border-border">
        <nav className="-mb-px flex gap-1" aria-label="Report tabs">
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:border-border hover:text-text-primary',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{t(`reports.tabs.${tab}`)}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active tab content */}
      <ActiveContent />
    </div>
  );
}
