'use client';

import { AlertTriangle, BarChart2, CheckCircle, TrendingDown } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

// Teacher consistency
interface ConsistencyRow {
  teacher_id: string;
  teacher_name: string;
  subject_id: string;
  subject_name: string;
  class_id: string;
  class_name: string;
  mean_score: number;
  pass_rate: number;
  std_dev: number;
  grade_count: number;
  deviation_flag: boolean;
}

interface ConsistencyResponse {
  data: ConsistencyRow[];
}

// Benchmarking
interface BenchmarkClass {
  class_id: string;
  class_name: string;
  mean_score: number;
  pass_rate: number;
  student_count: number;
}

interface BenchmarkResponse {
  data: BenchmarkClass[];
  subject_name: string;
  year_group_name: string;
}

// At-risk alerts
interface RiskAlert {
  id: string;
  student_id: string;
  student_name: string;
  risk_level: 'low' | 'medium' | 'high';
  alert_type: string;
  subject_name: string | null;
  trigger_reason: string;
  detected_date: string;
  status: 'active' | 'acknowledged' | 'resolved';
}

interface RiskAlertsResponse {
  data: RiskAlert[];
  meta: { page: number; pageSize: number; total: number };
}

type InsightsTab = 'consistency' | 'benchmarking' | 'at-risk';

const RISK_VARIANT: Record<string, 'warning' | 'neutral' | 'info'> = {
  low: 'info',
  medium: 'warning',
  high: 'neutral',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  '#4f46e5',
  '#7c3aed',
  '#0891b2',
  '#0d9488',
  '#059669',
  '#d97706',
  '#dc2626',
  '#db2777',
];

// ─── Teacher Consistency Tab ─────────────────────────────────────────────────

function TeacherConsistencyTab({
  subjects,
  periods,
}: {
  subjects: SelectOption[];
  periods: SelectOption[];
}) {
  const t = useTranslations('gradebook');

  const [subjectId, setSubjectId] = React.useState('');
  const [periodId, setPeriodId] = React.useState('');
  const [data, setData] = React.useState<ConsistencyRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!subjectId || !periodId) return;
    setIsLoading(true);
    const params = new URLSearchParams({ subject_id: subjectId, academic_period_id: periodId });
    apiClient<ConsistencyResponse>(
      `/api/v1/gradebook/insights/teacher-consistency?${params.toString()}`,
    )
      .then((res) => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, [subjectId, periodId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={subjectId} onValueChange={setSubjectId}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('subject')} />
          </SelectTrigger>
          <SelectContent>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('period')} />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!subjectId || !periodId ? (
        <p className="py-12 text-center text-sm text-text-tertiary">
          {t('selectFiltersForInsights')}
        </p>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="py-12 text-center text-sm text-text-tertiary">{t('noConsistencyData')}</p>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {t('teacher')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {t('class')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {t('analyticsMean')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {t('analyticsPassRate')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {t('analyticsStdDev')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {t('grades')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {t('flag')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr
                    key={`${row.teacher_id}-${row.class_id}`}
                    className={`border-b border-border ${i % 2 === 1 ? 'bg-surface-secondary/40' : ''} ${row.deviation_flag ? 'bg-warning-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {row.teacher_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.class_name}</td>
                    <td
                      className="px-4 py-3 text-end text-sm font-mono tabular-nums text-text-primary"
                      dir="ltr"
                    >
                      {row.mean_score.toFixed(1)}
                    </td>
                    <td
                      className="px-4 py-3 text-end text-sm font-mono tabular-nums text-text-primary"
                      dir="ltr"
                    >
                      {row.pass_rate.toFixed(0)}%
                    </td>
                    <td
                      className="px-4 py-3 text-end text-sm font-mono tabular-nums text-text-secondary"
                      dir="ltr"
                    >
                      {row.std_dev.toFixed(1)}
                    </td>
                    <td
                      className="px-4 py-3 text-end text-sm font-mono tabular-nums text-text-secondary"
                      dir="ltr"
                    >
                      {row.grade_count}
                    </td>
                    <td className="px-4 py-3">
                      {row.deviation_flag && (
                        <span className="inline-flex items-center gap-1 text-xs text-warning-text">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {t('unusualPattern')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Benchmarking Tab ─────────────────────────────────────────────────────────

function BenchmarkingTab({
  subjects,
  yearGroups,
  periods,
}: {
  subjects: SelectOption[];
  yearGroups: SelectOption[];
  periods: SelectOption[];
}) {
  const t = useTranslations('gradebook');

  const [subjectId, setSubjectId] = React.useState('');
  const [yearGroupId, setYearGroupId] = React.useState('');
  const [periodId, setPeriodId] = React.useState('');
  const [data, setData] = React.useState<BenchmarkClass[]>([]);
  const [subjectName, setSubjectName] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!subjectId || !yearGroupId || !periodId) return;
    setIsLoading(true);
    const params = new URLSearchParams({
      subject_id: subjectId,
      year_group_id: yearGroupId,
      academic_period_id: periodId,
    });
    apiClient<BenchmarkResponse>(`/api/v1/gradebook/insights/benchmarking?${params.toString()}`)
      .then((res) => {
        setData(res.data);
        setSubjectName(res.subject_name);
      })
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, [subjectId, yearGroupId, periodId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={subjectId} onValueChange={setSubjectId}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('subject')} />
          </SelectTrigger>
          <SelectContent>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={yearGroupId} onValueChange={setYearGroupId}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('yearGroup')} />
          </SelectTrigger>
          <SelectContent>
            {yearGroups.map((yg) => (
              <SelectItem key={yg.id} value={yg.id}>
                {yg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('period')} />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!subjectId || !yearGroupId || !periodId ? (
        <p className="py-12 text-center text-sm text-text-tertiary">
          {t('selectFiltersForInsights')}
        </p>
      ) : isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      ) : data.length === 0 ? (
        <p className="py-12 text-center text-sm text-text-tertiary">{t('noBenchmarkData')}</p>
      ) : (
        <div className="space-y-5">
          {/* Mean score comparison */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {subjectName} — {t('classMeanComparison')}
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                <XAxis
                  dataKey="class_name"
                  tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #6b7280)' }}
                  tickLine={false}
                  axisLine={false}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #6b7280)' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface, #fff)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) => {
                    const n = typeof value === 'number' ? value : 0;
                    return [`${n.toFixed(1)}`, t('analyticsMean')];
                  }}
                />
                <Bar dataKey="mean_score" radius={[4, 4, 0, 0]}>
                  {data.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pass rate comparison */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {subjectName} — {t('classPassRateComparison')}
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                <XAxis
                  dataKey="class_name"
                  tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #6b7280)' }}
                  tickLine={false}
                  axisLine={false}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #6b7280)' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface, #fff)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) => {
                    const n = typeof value === 'number' ? value : 0;
                    return [`${n.toFixed(0)}%`, t('analyticsPassRate')];
                  }}
                />
                <Bar dataKey="pass_rate" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={
                        entry.pass_rate >= 70
                          ? 'var(--color-success-500, #22c55e)'
                          : entry.pass_rate >= 50
                            ? 'var(--color-warning-500, #f59e0b)'
                            : 'var(--color-danger-500, #ef4444)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── At-Risk Tab ──────────────────────────────────────────────────────────────

function AtRiskTab({ subjects, periods }: { subjects: SelectOption[]; periods: SelectOption[] }) {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');

  const [subjectId, setSubjectId] = React.useState('all');
  const [periodId, setPeriodId] = React.useState('all');
  const [riskLevel, setRiskLevel] = React.useState('all');
  const [data, setData] = React.useState<RiskAlert[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchAlerts = React.useCallback(
    async (p: number, subject: string, period: string, level: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(PAGE_SIZE),
          status: 'active',
        });
        if (subject !== 'all') params.set('subject_id', subject);
        if (period !== 'all') params.set('academic_period_id', period);
        if (level !== 'all') params.set('risk_level', level);
        const res = await apiClient<RiskAlertsResponse>(
          `/api/v1/gradebook/risk-alerts?${params.toString()}`,
        );
        setData(res.data);
        setTotal(res.meta.total);
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchAlerts(page, subjectId, periodId, riskLevel);
  }, [page, subjectId, periodId, riskLevel, fetchAlerts]);

  const handleAction = async (alertId: string, action: 'acknowledged' | 'resolved') => {
    try {
      await apiClient(`/api/v1/gradebook/risk-alerts/${alertId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: action }),
      });
      void fetchAlerts(page, subjectId, periodId, riskLevel);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={riskLevel}
          onValueChange={(v) => {
            setRiskLevel(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={t('riskLevel')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="high">{t('riskHigh')}</SelectItem>
            <SelectItem value="medium">{t('riskMedium')}</SelectItem>
            <SelectItem value="low">{t('riskLow')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={subjectId}
          onValueChange={(v) => {
            setSubjectId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('subject')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={periodId}
          onValueChange={(v) => {
            setPeriodId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('period')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All periods</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Alert count */}
      {total > 0 && (
        <p className="text-sm text-text-secondary">
          {total} {t('activeAlerts')}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <CheckCircle className="h-10 w-10 text-success-text" />
          <p className="text-sm text-text-secondary">{t('noActiveAlerts')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 ${
                alert.risk_level === 'high'
                  ? 'border-danger-200 bg-danger-50'
                  : alert.risk_level === 'medium'
                    ? 'border-warning-200 bg-warning-50'
                    : 'border-info-200 bg-info-50'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <TrendingDown
                      className={`h-4 w-4 ${
                        alert.risk_level === 'high'
                          ? 'text-danger-text'
                          : alert.risk_level === 'medium'
                            ? 'text-warning-text'
                            : 'text-info-text'
                      }`}
                    />
                    <span className="font-semibold text-text-primary text-sm">
                      {alert.student_name}
                    </span>
                    <StatusBadge status={RISK_VARIANT[alert.risk_level] ?? 'neutral'}>
                      {t(
                        `risk${alert.risk_level.charAt(0).toUpperCase()}${alert.risk_level.slice(1)}` as
                          | 'riskHigh'
                          | 'riskMedium'
                          | 'riskLow',
                      )}
                    </StatusBadge>
                    {alert.subject_name && (
                      <Badge variant="secondary" className="text-xs">
                        {alert.subject_name}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">{alert.trigger_reason}</p>
                  <p className="text-xs text-text-tertiary" dir="ltr">
                    {alert.detected_date}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleAction(alert.id, 'acknowledged')}
                  >
                    {t('acknowledge')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleAction(alert.id, 'resolved')}
                  >
                    {t('resolve')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {tc('previous')}
          </Button>
          <span className="text-sm text-text-secondary">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {tc('next')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradingInsightsPage() {
  const t = useTranslations('gradebook');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [activeTab, setActiveTab] = React.useState<InsightsTab>('consistency');

  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [yearGroups, setYearGroups] = React.useState<SelectOption[]>([]);
  const [periods, setPeriods] = React.useState<SelectOption[]>([]);

  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setSubjects(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/year-groups?pageSize=100')
      .then((res) => setYearGroups(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
  }, []);

  const tabs: { key: InsightsTab; label: string }[] = [
    { key: 'consistency', label: t('teacherConsistency') },
    { key: 'benchmarking', label: t('benchmarking') },
    { key: 'at-risk', label: t('atRiskStudents') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/gradebook`)}>
          <BarChart2 className="h-4 w-4" />
        </Button>
        <PageHeader title={t('gradingInsights')} />
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Insights tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              activeTab === tab.key
                ? 'text-primary-700 bg-surface-secondary border-b-2 border-primary-700'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
            }`}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'consistency' && (
        <TeacherConsistencyTab subjects={subjects} periods={periods} />
      )}
      {activeTab === 'benchmarking' && (
        <BenchmarkingTab subjects={subjects} yearGroups={yearGroups} periods={periods} />
      )}
      {activeTab === 'at-risk' && <AtRiskTab subjects={subjects} periods={periods} />}
    </div>
  );
}
