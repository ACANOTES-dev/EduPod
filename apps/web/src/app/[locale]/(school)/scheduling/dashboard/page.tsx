'use client';

import { BarChart3, BookOpen, CheckCircle2, Loader2, Pin, Sparkles } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge, Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardOverview {
  total_classes: number;
  configured_classes: number;
  scheduled_classes: number;
  pinned_entries: number;
  active_run: boolean;
  room_utilisation_pct: number | null;
  teacher_utilisation_pct: number | null;
  avg_gaps: number | null;
  preference_score: number | null;
  latest_run: {
    id: string;
    status: string;
    mode: string;
    entries_generated: number | null;
    entries_pinned: number | null;
    entries_unassigned: number | null;
    created_at: string;
    applied_at: string | null;
  } | null;
}

interface WorkloadCell {
  teacher_id: string;
  teacher_name: string;
  weekday: number;
  period_order: number;
  period_name: string;
  teaching_count: number;
  max_periods: number;
}

interface RoomUtilisation {
  room_id: string;
  room_name: string;
  room_type: string;
  capacity: number;
  utilisation_pct: number;
  peak_period: string | null;
}

interface TrendPoint {
  label: string;
  room_utilisation: number;
  teacher_utilisation: number;
  avg_gaps: number;
  preference_score: number;
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
  sub?: string;
}

function KpiCard({ label, value, icon, highlight, sub }: KpiCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${highlight ? 'border-brand/40 bg-brand/5' : 'border-border bg-surface'}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-tertiary uppercase tracking-wide">{label}</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-text-tertiary">{sub}</p>}
        </div>
        <div className="text-text-tertiary">{icon}</div>
      </div>
    </div>
  );
}

// ─── Workload Heatmap ─────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function WorkloadHeatmap({ academicYearId }: { academicYearId: string }) {
  const t = useTranslations('scheduling.auto');
  const tCommon = useTranslations('common');
  const [cells, setCells] = React.useState<WorkloadCell[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<{ data: WorkloadCell[] }>(
      `/api/v1/scheduling-dashboard/workload?academic_year_id=${academicYearId}`,
    )
      .then((res) => setCells(res.data ?? []))
      .catch((err) => {
        console.error('[SchedulingDashboardPage]', err);
        return setCells([]);
      })
      .finally(() => setLoading(false));
  }, [academicYearId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tCommon('loading')}
      </div>
    );
  }

  if (cells.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">{t('noWorkloadDataAvailable')}</p>
    );
  }

  // Build unique teachers and periods
  const teacherMap = new Map<string, string>();
  const periodMap = new Map<number, string>();
  const weekdaySet = new Set<number>();

  for (const c of cells) {
    teacherMap.set(c.teacher_id, c.teacher_name);
    periodMap.set(c.period_order, c.period_name);
    weekdaySet.add(c.weekday);
  }

  const teachers = [...teacherMap.entries()];
  const periods = [...periodMap.entries()].sort((a, b) => a[0] - b[0]);
  const weekdays = [...weekdaySet].sort();

  // Build lookup
  const lookup = new Map<string, WorkloadCell>();
  for (const c of cells) {
    lookup.set(`${c.teacher_id}-${c.weekday}-${c.period_order}`, c);
  }

  function cellColour(count: number, max: number): string {
    if (max === 0) return 'bg-surface-secondary';
    const ratio = count / max;
    if (ratio === 0) return 'bg-surface-secondary';
    if (ratio < 0.4) return 'bg-green-100 text-green-800';
    if (ratio < 0.7) return 'bg-yellow-100 text-yellow-800';
    if (ratio < 0.9) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-border bg-surface-secondary px-3 py-2 text-start text-xs font-semibold text-text-tertiary">
              {t('workloadTab')}
            </th>
            {weekdays.flatMap((wd) =>
              periods.map(([po, pn]) => (
                <th
                  key={`${wd}-${po}`}
                  className="border border-border bg-surface-secondary px-2 py-2 text-center text-xs font-semibold text-text-tertiary"
                >
                  {WEEKDAY_SHORT[wd]}
                  <br />
                  {pn}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {teachers.map(([teacherId, teacherName]) => (
            <tr key={teacherId}>
              <td className="border border-border bg-surface-secondary px-3 py-2 font-medium text-text-secondary whitespace-nowrap">
                {teacherName}
              </td>
              {weekdays.flatMap((wd) =>
                periods.map(([po]) => {
                  const cell = lookup.get(`${teacherId}-${wd}-${po}`);
                  const count = cell?.teaching_count ?? 0;
                  const max = cell?.max_periods ?? 5;
                  return (
                    <td
                      key={`${wd}-${po}`}
                      className={`border border-border px-2 py-2 text-center font-medium ${cellColour(count, max)}`}
                      title={count > 0 ? `${count} periods` : '—'}
                    >
                      {count > 0 ? count : ''}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <span className="font-medium">{t('load')}</span>
        {[
          { label: 'Free', cls: 'bg-surface-secondary' },
          { label: 'Light (<40%)', cls: 'bg-green-100' },
          { label: 'Moderate (<70%)', cls: 'bg-yellow-100' },
          { label: 'Heavy (<90%)', cls: 'bg-orange-100' },
          { label: 'Overloaded', cls: 'bg-red-100' },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`h-3 w-3 rounded ${cls} border border-border`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Room Utilisation ─────────────────────────────────────────────────────────

function RoomUtilisationTab({ academicYearId }: { academicYearId: string }) {
  const tCommon = useTranslations('common');
  const t = useTranslations('scheduling.auto');
  const [rooms, setRooms] = React.useState<RoomUtilisation[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<{ data: RoomUtilisation[] }>(
      `/api/v1/scheduling-dashboard/room-utilisation?academic_year_id=${academicYearId}`,
    )
      .then((res) => setRooms(res.data ?? []))
      .catch((err) => {
        console.error('[SchedulingDashboardPage]', err);
        return setRooms([]);
      })
      .finally(() => setLoading(false));
  }, [academicYearId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tCommon('loading')}
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">{t('noRoomDataAvailable')}</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => {
        const pct = room.utilisation_pct;
        const barColor =
          pct >= 90
            ? 'bg-red-500'
            : pct >= 70
              ? 'bg-yellow-500'
              : pct >= 40
                ? 'bg-green-500'
                : 'bg-blue-300';
        return (
          <div
            key={room.room_id}
            className="rounded-xl border border-border bg-surface p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">{room.room_name}</p>
                <p className="text-xs text-text-tertiary">
                  {room.room_type} &middot; {t('capacity')}: {room.capacity}
                </p>
              </div>
              <span
                className={`text-sm font-bold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-yellow-600' : 'text-green-600'}`}
              >
                {Math.round(pct)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
              <div
                className={`h-2 rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {pct >= 90 && (
              <p className="text-xs text-red-600 font-medium">{t('bottleneckHighDemand')}</p>
            )}
            {pct < 30 && (
              <p className="text-xs text-blue-600">{t('underutilisedConsiderReassigning')}</p>
            )}
            {room.peak_period && (
              <p className="text-xs text-text-tertiary">
                {t('peak')}
                {room.peak_period}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Trends Tab ───────────────────────────────────────────────────────────────

function TrendsTab({ academicYearId }: { academicYearId: string }) {
  const t = useTranslations('scheduling.auto');
  const tCommon = useTranslations('common');
  const [trends, setTrends] = React.useState<TrendPoint[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<{ data: TrendPoint[] }>(
      `/api/v1/scheduling-dashboard/trends?academic_year_id=${academicYearId}`,
    )
      .then((res) => setTrends(res.data ?? []))
      .catch((err) => {
        console.error('[SchedulingDashboardPage]', err);
        return setTrends([]);
      })
      .finally(() => setLoading(false));
  }, [academicYearId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tCommon('loading')}
      </div>
    );
  }

  if (trends.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">{t('noTrendDataAvailable')}</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Utilisation trends */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('utilisationOverTime')}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trends} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} unit="%" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="room_utilisation"
              stroke="#3b82f6"
              name="Room Util %"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="teacher_utilisation"
              stroke="#8b5cf6"
              name="Teacher Util %"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Gaps & preference score */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('qualityMetrics')}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trends} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="avg_gaps"
              stroke="#f59e0b"
              name="Avg Gaps"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="preference_score"
              stroke="#22c55e"
              name="Preference Score %"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Overview Tab (original content) ─────────────────────────────────────────

function OverviewTab({
  overview,
  loading,
  locale,
}: {
  overview: DashboardOverview | null;
  loading: boolean;
  locale: string;
}) {
  const tCommon = useTranslations('common');
  const t = useTranslations('scheduling.auto');
  const router = useRouter();

  function statusBadgeVariant(status: string): 'default' | 'secondary' | 'danger' {
    if (status === 'completed' || status === 'applied') return 'default';
    if (status === 'failed') return 'danger';
    return 'secondary';
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tCommon('loading')}
      </div>
    );
  }

  if (!overview) return null;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label={t('totalSlots')}
          value={overview.total_classes}
          icon={<BookOpen className="h-5 w-5" />}
        />
        <KpiCard
          label={t('configured')}
          value={overview.configured_classes}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <KpiCard
          label={t('assignedSlots')}
          value={overview.scheduled_classes}
          icon={<Sparkles className="h-5 w-5" />}
          highlight
        />
        <KpiCard
          label={t('pinnedSlots')}
          value={overview.pinned_entries}
          icon={<Pin className="h-5 w-5" />}
        />
        <KpiCard
          label={t('completionPct')}
          value={
            overview.total_classes > 0
              ? `${Math.round((overview.scheduled_classes / overview.total_classes) * 100)}%`
              : '0%'
          }
          icon={<BarChart3 className="h-5 w-5" />}
          highlight
        />
      </div>

      {/* Scheduling efficiency metrics */}
      {(overview.room_utilisation_pct != null || overview.teacher_utilisation_pct != null) && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {overview.room_utilisation_pct != null && (
            <KpiCard
              label={t('roomUtilisation')}
              value={`${Math.round(overview.room_utilisation_pct)}%`}
              icon={<BarChart3 className="h-5 w-5" />}
            />
          )}
          {overview.teacher_utilisation_pct != null && (
            <KpiCard
              label={t('teacherUtilisation')}
              value={`${Math.round(overview.teacher_utilisation_pct)}%`}
              icon={<BarChart3 className="h-5 w-5" />}
            />
          )}
          {overview.avg_gaps != null && (
            <KpiCard
              label={t('avgTeacherGaps')}
              value={overview.avg_gaps.toFixed(1)}
              icon={<BarChart3 className="h-5 w-5" />}
            />
          )}
          {overview.preference_score != null && (
            <KpiCard
              label={t('preferenceScore')}
              value={`${Math.round(overview.preference_score)}%`}
              icon={<Sparkles className="h-5 w-5" />}
              highlight
            />
          )}
        </div>
      )}

      {/* Latest run card */}
      {overview.latest_run && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-text-tertiary" />
              <div>
                <p className="text-sm font-medium text-text-primary">{t('lastRun')}</p>
                <p className="text-xs text-text-tertiary">
                  {new Date(overview.latest_run.created_at).toLocaleString()} &middot;{' '}
                  <Badge
                    variant={statusBadgeVariant(overview.latest_run.status)}
                    className="text-[10px]"
                  >
                    {overview.latest_run.status}
                  </Badge>
                </p>
              </div>
            </div>
            {overview.latest_run.status === 'completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/${locale}/scheduling/runs/${overview.latest_run!.id}/review`)
                }
              >
                {t('viewReview')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type DashTab = 'overview' | 'workload' | 'rooms' | 'trends';

export default function SchedulingDashboardPage() {
  const t = useTranslations('scheduling.auto');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [activeTab, setActiveTab] = React.useState<DashTab>('overview');
  const [overview, setOverview] = React.useState<DashboardOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    apiClient<{ data: Array<{ id: string; name: string }> }>('/api/v1/academic-years?pageSize=20')
      .then((yearsRes) => {
        const yearId = yearsRes.data?.[0]?.id;
        if (!yearId) {
          setLoading(false);
          return;
        }
        setAcademicYearId(yearId);
        return apiClient<{ data: DashboardOverview }>(
          `/api/v1/scheduling-dashboard/overview?academic_year_id=${yearId}`,
          { silent: true },
        ).then((ov) => setOverview(ov.data));
      })
      .catch((err) => {
        console.error('[SchedulingDashboardPage]', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const tabs: Array<{ key: DashTab; label: string }> = [
    { key: 'overview', label: t('overviewTab') },
    { key: 'workload', label: t('workloadTab') },
    { key: 'rooms', label: 'Rooms' },
    { key: 'trends', label: 'Trends' },
  ];

  const tHub = useTranslations('scheduling.hub');

  return (
    <div className="space-y-6">
      <PageHeader
        title={tHub('analyticsDashboard')}
        description={tHub('analyticsDashboardDesc')}
        actions={
          <Button onClick={() => router.push(`/${locale}/scheduling/auto`)} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            {t('generateTimetable')}
          </Button>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab overview={overview} loading={loading} locale={locale} />
      )}
      {activeTab === 'workload' && academicYearId && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <WorkloadHeatmap academicYearId={academicYearId} />
        </div>
      )}
      {activeTab === 'rooms' && academicYearId && (
        <RoomUtilisationTab academicYearId={academicYearId} />
      )}
      {activeTab === 'trends' && academicYearId && <TrendsTab academicYearId={academicYearId} />}
    </div>
  );
}
