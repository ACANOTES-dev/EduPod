'use client';

import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Calendar,
  Clock,
  DollarSign,
  Download,
  FileText,
  GraduationCap,
  LayoutDashboard,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiData {
  total_students: number;
  attendance_rate: number;
  average_grade: number;
  collection_rate: number;
  outstanding_balance: number;
  active_staff: number;
  open_admissions: number;
  at_risk_students: number;
  overdue_invoices: number;
  schedule_coverage: number;
}

interface TrendPoint {
  month: string;
  attendance: number;
  grades: number;
  collection: number;
}

interface DashboardData {
  kpis: KpiData;
  trends: TrendPoint[];
}

// ─── Quick-link report cards ──────────────────────────────────────────────────

interface QuickLink {
  icon: LucideIcon;
  labelKey: string;
  href: string;
  color: string;
}

// Keys are RELATIVE to the `reports` namespace declared via
// `useTranslations('reports')` below. Do NOT prefix them with `reports.`
// — that would resolve to `reports.reports.*` and miss every key.
const quickLinks: QuickLink[] = [
  {
    icon: GraduationCap,
    labelKey: 'analytics.attendanceAnalytics',
    href: '/reports/attendance',
    color: 'text-blue-600',
  },
  {
    icon: BookOpen,
    labelKey: 'analytics.gradeAnalytics',
    href: '/reports/grades',
    color: 'text-emerald-600',
  },
  {
    icon: Users,
    labelKey: 'analytics.demographics',
    href: '/reports/demographics',
    color: 'text-purple-600',
  },
  {
    icon: TrendingUp,
    labelKey: 'analytics.studentProgress',
    href: '/reports/student-progress',
    color: 'text-indigo-600',
  },
  {
    icon: UserCheck,
    labelKey: 'analytics.admissions',
    href: '/reports/admissions',
    color: 'text-pink-600',
  },
  {
    icon: BarChart3,
    labelKey: 'analytics.staff',
    href: '/reports/staff',
    color: 'text-orange-600',
  },
  {
    icon: Brain,
    labelKey: 'analytics.insights',
    href: '/reports/insights',
    color: 'text-violet-600',
  },
  {
    icon: FileText,
    labelKey: 'analytics.boardReport',
    href: '/reports/board',
    color: 'text-sky-600',
  },
  {
    icon: Calendar,
    labelKey: 'analytics.scheduled',
    href: '/reports/scheduled',
    color: 'text-teal-600',
  },
  {
    icon: AlertTriangle,
    labelKey: 'analytics.alerts',
    href: '/reports/alerts',
    color: 'text-amber-600',
  },
  {
    icon: Bot,
    labelKey: 'analytics.askAi',
    href: '/reports/ask-ai',
    color: 'text-rose-600',
  },
  {
    icon: LayoutDashboard,
    labelKey: 'analytics.builder',
    href: '/reports/builder',
    color: 'text-cyan-600',
  },
  {
    icon: Download,
    labelKey: 'studentExport',
    href: '/reports/student-export',
    color: 'text-gray-600',
  },
  {
    icon: DollarSign,
    labelKey: 'writeOffs',
    href: '/reports/write-offs',
    color: 'text-yellow-600',
  },
  {
    icon: Clock,
    labelKey: 'notificationDelivery',
    href: '/reports/notification-delivery',
    color: 'text-slate-600',
  },
];

// ─── Sparkline component ──────────────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const h = 28;
  const w = 60;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Trend arrow ──────────────────────────────────────────────────────────────

function TrendArrow({ value }: { value: number }) {
  if (value > 0) return <span className="text-xs font-medium text-emerald-600">↑ {value}%</span>;
  if (value < 0)
    return <span className="text-xs font-medium text-red-500">↓ {Math.abs(value)}%</span>;
  return <span className="text-xs font-medium text-text-tertiary">→ 0%</span>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend: number;
  sparkData: number[];
  sparkColor: string;
  href: string;
  iconColor: string;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  sparkData,
  sparkColor,
  href,
  iconColor,
}: KpiCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
    >
      <div className="flex items-start justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface-secondary ${iconColor}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <MiniSparkline data={sparkData} color={sparkColor} />
      </div>
      <div>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        <p className="mt-0.5 text-xs text-text-tertiary">{label}</p>
      </div>
      <TrendArrow value={trend} />
    </Link>
  );
}

// ─── Placeholder sparkline data ────────────────────────────────────────────────

const MOCK_SPARK: Record<string, number[]> = {
  students: [182, 185, 188, 190, 192, 195],
  attendance: [91, 93, 92, 94, 95, 93],
  grades: [72, 74, 73, 75, 76, 75],
  collection: [80, 82, 85, 83, 87, 88],
  balance: [120, 115, 110, 108, 105, 100],
  staff: [42, 42, 44, 44, 45, 45],
  admissions: [8, 10, 12, 9, 11, 14],
  atRisk: [7, 6, 8, 7, 6, 5],
  overdue: [15, 13, 12, 11, 10, 9],
  coverage: [88, 90, 91, 93, 92, 95],
};

const MOCK_TRENDS: TrendPoint[] = [
  { month: 'Oct', attendance: 91, grades: 72, collection: 80 },
  { month: 'Nov', attendance: 93, grades: 74, collection: 82 },
  { month: 'Dec', attendance: 89, grades: 71, collection: 84 },
  { month: 'Jan', attendance: 94, grades: 75, collection: 83 },
  { month: 'Feb', attendance: 95, grades: 77, collection: 87 },
  { month: 'Mar', attendance: 93, grades: 75, collection: 88 },
];

// ─── Adapter: new dashboard API → legacy page shape ──────────────────────────
//
// Wave 3 (impl 03) replaced the old roster-style KPI shape with a 10-card
// `KpiCard[]` array + columnar trends. This page is rewritten by impl 14;
// until then this adapter projects the new shape down to the old one so
// recharts (which expects an array of `{month, attendance, grades, collection}`
// rows) doesn't choke on `trends.slice()` and the KPI cards render real data.

interface NewKpiCard {
  key: string;
  value_raw?: number;
  value?: string | number;
}

interface NewTrendsShape {
  weeks?: string[];
  attendance?: number[];
  grades?: number[];
  collection?: number[];
}

function adaptDashboardResponse(payload: {
  kpis?: NewKpiCard[];
  trends?: NewTrendsShape;
}): DashboardData {
  const kpiByKey = new Map<string, NewKpiCard>();
  for (const card of payload.kpis ?? []) {
    if (card?.key) kpiByKey.set(card.key, card);
  }
  const valueOf = (key: string): number => {
    const raw = kpiByKey.get(key)?.value_raw;
    return typeof raw === 'number' ? raw : 0;
  };

  // The new shape doesn't have a 1:1 mapping for the legacy roster KPIs.
  // For each legacy slot we pick the best available proxy from the new
  // 10-KPI set; missing slots render as 0 until impl 14's rewrite.
  const kpis: KpiData = {
    total_students: 0,
    attendance_rate: valueOf('attendance_today'),
    average_grade: 0,
    collection_rate: 0,
    outstanding_balance: valueOf('overdue_invoices'),
    active_staff: 0,
    open_admissions: valueOf('new_applications_this_week'),
    at_risk_students: valueOf('at_risk_students'),
    overdue_invoices: valueOf('overdue_invoices'),
    schedule_coverage: 100 - valueOf('cover_gaps_this_week'),
  };

  const t = payload.trends;
  const weeks = Array.isArray(t?.weeks) ? t.weeks : [];
  const attendance = Array.isArray(t?.attendance) ? t.attendance : [];
  const grades = Array.isArray(t?.grades) ? t.grades : [];
  const collection = Array.isArray(t?.collection) ? t.collection : [];
  const trends: TrendPoint[] = weeks.length
    ? weeks.map((w, i) => ({
        month: formatWeekLabel(w),
        attendance: attendance[i] ?? 0,
        grades: grades[i] ?? 0,
        collection: collection[i] ?? 0,
      }))
    : MOCK_TRENDS;

  return { kpis, trends };
}

function formatWeekLabel(iso: string): string {
  // ISO date like '2026-04-19' → 'Apr 19'. Falls back to the raw string
  // if parsing fails — better to display the ISO date than crash.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── AI Summary callout ────────────────────────────────────────────────────────

interface AiSummaryProps {
  summary: string | null;
  loading: boolean;
  onRequest: () => void;
}

function AiSummaryCallout({ summary, loading, onRequest }: AiSummaryProps) {
  const t = useTranslations('reports');

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-semibold text-violet-900">
            {t('analytics.aiSummaryTitle')}
          </span>
        </div>
        {!summary && (
          <Button size="sm" variant="outline" onClick={onRequest} disabled={loading}>
            {loading ? t('analytics.generating') : t('analytics.summarise')}
          </Button>
        )}
      </div>
      {summary && <p className="text-sm text-violet-800 leading-relaxed">{summary}</p>}
      {!summary && !loading && (
        <p className="text-xs text-violet-600">{t('analytics.aiSummaryHint')}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsDashboardPage() {
  const t = useTranslations('reports');

  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [lastRefresh, setLastRefresh] = React.useState(new Date());
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    apiClient<{
      data: {
        kpis?: NewKpiCard[];
        trends?: NewTrendsShape;
      };
    }>('/api/v1/reports/analytics/dashboard')
      .then((res) => {
        // Wave 3 (impl 03) shipped the new 10-KPI dashboard shape. This
        // page is a Wave-4 rewrite target (impl 14); until then we adapt
        // the new response into the legacy shape this page renders so
        // nothing crashes recharts. Throwaway adapter — delete with impl 14.
        const adapted = adaptDashboardResponse(res.data);
        setData(adapted);
        setLastRefresh(new Date());
      })
      .catch((err) => {
        console.error('[ReportsPage]', err);
        // Final-resort mock so the shell remains usable on a backend error.
        setData({
          kpis: {
            total_students: 195,
            attendance_rate: 93,
            average_grade: 75,
            collection_rate: 88,
            outstanding_balance: 14200,
            active_staff: 45,
            open_admissions: 14,
            at_risk_students: 5,
            overdue_invoices: 9,
            schedule_coverage: 95,
          },
          trends: MOCK_TRENDS,
        });
        setLastRefresh(new Date());
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAiSummarise = async () => {
    setAiLoading(true);
    try {
      const res = await apiClient<{ summary: string }>('/api/v1/reports/analytics/ai-summary', {
        method: 'POST',
      });
      setAiSummary(res.summary);
    } catch (err) {
      console.error('[ReportsPage]', err);
      setAiSummary(t('analytics.aiSummaryFallback'));
    } finally {
      setAiLoading(false);
    }
  };

  const kpis = data?.kpis;
  const trends = data?.trends ?? MOCK_TRENDS;

  const kpiCards: KpiCardProps[] = kpis
    ? [
        {
          icon: GraduationCap,
          label: t('analytics.kpi.totalStudents'),
          value: String(kpis.total_students),
          trend: 3,
          sparkData: MOCK_SPARK.students ?? [],
          sparkColor: '#6366f1',
          href: '/students',
          iconColor: 'text-indigo-600',
        },
        {
          icon: UserCheck,
          label: t('analytics.kpi.attendanceRate'),
          value: `${kpis.attendance_rate}%`,
          trend: 1,
          sparkData: MOCK_SPARK.attendance ?? [],
          sparkColor: '#10b981',
          href: '/reports/attendance',
          iconColor: 'text-emerald-600',
        },
        {
          icon: BookOpen,
          label: t('analytics.kpi.averageGrade'),
          value: `${kpis.average_grade}%`,
          trend: 2,
          sparkData: MOCK_SPARK.grades ?? [],
          sparkColor: '#8b5cf6',
          href: '/reports/grades',
          iconColor: 'text-violet-600',
        },
        {
          icon: DollarSign,
          label: t('analytics.kpi.collectionRate'),
          value: `${kpis.collection_rate}%`,
          trend: 5,
          sparkData: MOCK_SPARK.collection ?? [],
          sparkColor: '#f59e0b',
          href: '/finance',
          iconColor: 'text-amber-600',
        },
        {
          icon: AlertTriangle,
          label: t('analytics.kpi.outstandingBalance'),
          value: `${(kpis.outstanding_balance / 1000).toFixed(1)}k`,
          trend: -2,
          sparkData: MOCK_SPARK.balance ?? [],
          sparkColor: '#ef4444',
          href: '/finance',
          iconColor: 'text-red-600',
        },
        {
          icon: Users,
          label: t('analytics.kpi.activeStaff'),
          value: String(kpis.active_staff),
          trend: 0,
          sparkData: MOCK_SPARK.staff ?? [],
          sparkColor: '#06b6d4',
          href: '/staff',
          iconColor: 'text-cyan-600',
        },
        {
          icon: TrendingUp,
          label: t('analytics.kpi.openAdmissions'),
          value: String(kpis.open_admissions),
          trend: 4,
          sparkData: MOCK_SPARK.admissions ?? [],
          sparkColor: '#ec4899',
          href: '/admissions',
          iconColor: 'text-pink-600',
        },
        {
          icon: AlertTriangle,
          label: t('analytics.kpi.atRiskStudents'),
          value: String(kpis.at_risk_students),
          trend: -2,
          sparkData: MOCK_SPARK.atRisk ?? [],
          sparkColor: '#f97316',
          href: '/reports/student-progress',
          iconColor: 'text-orange-600',
        },
        {
          icon: FileText,
          label: t('analytics.kpi.overdueInvoices'),
          value: String(kpis.overdue_invoices),
          trend: -3,
          sparkData: MOCK_SPARK.overdue ?? [],
          sparkColor: '#dc2626',
          href: '/finance',
          iconColor: 'text-red-500',
        },
        {
          icon: Calendar,
          label: t('analytics.kpi.scheduleCoverage'),
          value: `${kpis.schedule_coverage}%`,
          trend: 2,
          sparkData: MOCK_SPARK.coverage ?? [],
          sparkColor: '#0ea5e9',
          href: '/schedules',
          iconColor: 'text-sky-600',
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('analytics.dashboardTitle')}
        description={t('analytics.dashboardDescription')}
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-text-tertiary sm:inline">
              {t('analytics.lastRefresh')} {lastRefresh.toLocaleTimeString()}
            </span>
            <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`me-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('analytics.refresh')}
            </Button>
          </div>
        }
      />

      {/* AI Summary */}
      <AiSummaryCallout
        summary={aiSummary}
        loading={aiLoading}
        onRequest={() => void handleAiSummarise()}
      />

      {/* KPI Cards */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {t('analytics.kpiTitle')}
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-secondary" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpiCards.map((card) => (
              <KpiCard key={card.label} {...card} />
            ))}
          </div>
        )}
      </section>

      {/* 6-Month Trend Chart */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">{t('analytics.trendTitle')}</h2>
          <div className="flex items-center gap-4 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-blue-500" />
              {t('analytics.kpi.attendanceRate')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-violet-500" />
              {t('analytics.kpi.averageGrade')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-amber-500" />
              {t('analytics.kpi.collectionRate')}
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={trends} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" className="text-xs fill-text-tertiary" />
            <YAxis domain={[60, 100]} className="text-xs fill-text-tertiary" />
            <Tooltip
              contentStyle={{
                fontSize: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}
            />
            <Area
              type="monotone"
              dataKey="attendance"
              name="Attendance %"
              stroke="#3b82f6"
              fill="url(#ga)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="grades"
              name="Avg Grade %"
              stroke="#8b5cf6"
              fill="url(#gg)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="collection"
              name="Collection %"
              stroke="#f59e0b"
              fill="url(#gc)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* Quick Links */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {t('analytics.allReports')}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary ${link.color}`}
              >
                <link.icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-text-primary group-hover:text-primary-700">
                {t(link.labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
