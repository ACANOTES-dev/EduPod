'use client';

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  DoorOpen,
  Loader2,
  Sparkles,
  TrendingUp,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
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

// ─── Narrative Cards ─────────────────────────────────────────────────────────

type NarrativeTone = 'good' | 'warn' | 'bad' | 'neutral';

const TONE_STYLES: Record<
  NarrativeTone,
  { border: string; bg: string; iconBg: string; iconText: string; accent: string }
> = {
  good: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50/60',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    accent: 'text-emerald-700',
  },
  warn: {
    border: 'border-amber-200',
    bg: 'bg-amber-50/60',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    accent: 'text-amber-700',
  },
  bad: {
    border: 'border-red-200',
    bg: 'bg-red-50/60',
    iconBg: 'bg-red-100',
    iconText: 'text-red-700',
    accent: 'text-red-700',
  },
  neutral: {
    border: 'border-border',
    bg: 'bg-surface',
    iconBg: 'bg-surface-secondary',
    iconText: 'text-text-secondary',
    accent: 'text-text-primary',
  },
};

function NarrativeCard({
  icon: Icon,
  title,
  headline,
  detail,
  metrics,
  tone,
  onDrillDown,
  drillDownLabel,
}: {
  icon: LucideIcon;
  title: string;
  headline: string;
  detail: string;
  metrics: Array<{ label: string; value: string | number }>;
  tone: NarrativeTone;
  onDrillDown?: () => void;
  drillDownLabel?: string;
}) {
  const s = TONE_STYLES[tone];
  return (
    <div className={`rounded-2xl border ${s.border} ${s.bg} p-5 flex flex-col gap-3`}>
      <div className="flex items-center gap-2.5">
        <div className={`rounded-xl p-2 ${s.iconBg} ${s.iconText}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">{title}</p>
      </div>
      <div>
        <p className={`text-xl font-bold leading-tight ${s.accent}`}>{headline}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{detail}</p>
      </div>
      {metrics.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{m.label}</p>
              <p className="text-base font-semibold text-text-primary tabular-nums">{m.value}</p>
            </div>
          ))}
        </div>
      )}
      {onDrillDown && drillDownLabel && (
        <button
          type="button"
          onClick={onDrillDown}
          className={`flex items-center gap-1 text-xs font-medium ${s.accent} hover:underline mt-1`}
        >
          {drillDownLabel}
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </button>
      )}
    </div>
  );
}

function HealthBanner({
  score,
  label,
  summary,
}: {
  score: number;
  label: string;
  summary: string;
}) {
  const tone: NarrativeTone = score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad';
  const s = TONE_STYLES[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${s.border} ${s.bg} p-6 flex flex-col gap-4 md:flex-row md:items-center`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl ${s.iconBg} ${s.iconText} shadow-sm`}
        >
          <span className="text-2xl font-bold leading-none tabular-nums">{score}</span>
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider">/100</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            {label}
          </p>
          <p className={`mt-1 text-lg font-bold leading-tight ${s.accent}`}>{summary}</p>
        </div>
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

// ─── Overview Tab ────────────────────────────────────────────────────────────
// Principal briefing layout: a single Scheduling Health score at the top, then
// three narrative story cards (Coverage, Teacher QoL, Room Efficiency) that
// turn raw numbers into a one-sentence read. Drill-downs live in the tabs.

function OverviewTab({
  overview,
  loading,
  locale,
  onGoToTab,
}: {
  overview: DashboardOverview | null;
  loading: boolean;
  locale: string;
  onGoToTab: (tab: 'workload' | 'rooms' | 'trends') => void;
}) {
  const tCommon = useTranslations('common');
  const t = useTranslations('scheduling.auto');
  const tDash = useTranslations('scheduling.dashboard');
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

  // ─── Derive narratives ──────────────────────────────────────────────────────

  const total = overview.total_classes;
  const scheduled = overview.scheduled_classes;
  const completionPct = total > 0 ? Math.round((scheduled / total) * 100) : 0;
  const unassigned = Math.max(0, total - scheduled);

  const coverageTone: NarrativeTone =
    total === 0 ? 'neutral' : completionPct >= 100 ? 'good' : completionPct >= 80 ? 'warn' : 'bad';
  const coverageHeadline =
    total === 0
      ? tDash('coverage.empty')
      : completionPct >= 100
        ? tDash('coverage.full')
        : completionPct >= 80
          ? tDash('coverage.almost', { pct: completionPct })
          : tDash('coverage.partial', { pct: completionPct });
  const coverageDetail =
    total === 0
      ? tDash('coverage.emptyDetail')
      : unassigned === 0
        ? tDash('coverage.fullDetail', { scheduled, total })
        : tDash('coverage.partialDetail', { scheduled, total, unassigned });

  const teacherUtil = overview.teacher_utilisation_pct;
  const avgGaps = overview.avg_gaps;
  const teacherTone: NarrativeTone = (() => {
    if (teacherUtil == null && avgGaps == null) return 'neutral';
    const gapsBad = avgGaps != null && avgGaps >= 2;
    const utilHeavy = teacherUtil != null && teacherUtil >= 90;
    const utilLight = teacherUtil != null && teacherUtil < 40;
    if (gapsBad || utilHeavy) return 'bad';
    if ((teacherUtil != null && teacherUtil >= 75) || (avgGaps != null && avgGaps >= 1))
      return 'warn';
    if (utilLight) return 'warn';
    return 'good';
  })();
  const teacherHeadline = (() => {
    if (teacherUtil == null && avgGaps == null) return tDash('teachers.empty');
    if (teacherTone === 'bad') return tDash('teachers.strained');
    if (teacherTone === 'warn') return tDash('teachers.fair');
    return tDash('teachers.healthy');
  })();
  const teacherDetail = (() => {
    if (teacherUtil == null && avgGaps == null) return tDash('teachers.emptyDetail');
    const utilPart =
      teacherUtil != null ? tDash('teachers.utilPart', { pct: Math.round(teacherUtil) }) : '';
    const gapsPart =
      avgGaps != null ? tDash('teachers.gapsPart', { gaps: avgGaps.toFixed(1) }) : '';
    return [utilPart, gapsPart].filter(Boolean).join(' ');
  })();

  const roomUtil = overview.room_utilisation_pct;
  const roomTone: NarrativeTone = (() => {
    if (roomUtil == null) return 'neutral';
    if (roomUtil >= 90) return 'bad';
    if (roomUtil >= 70) return 'warn';
    if (roomUtil < 25) return 'warn';
    return 'good';
  })();
  const roomHeadline =
    roomUtil == null
      ? tDash('rooms.empty')
      : roomUtil >= 90
        ? tDash('rooms.bottleneck', { pct: Math.round(roomUtil) })
        : roomUtil >= 70
          ? tDash('rooms.busy', { pct: Math.round(roomUtil) })
          : roomUtil < 25
            ? tDash('rooms.idle', { pct: Math.round(roomUtil) })
            : tDash('rooms.balanced', { pct: Math.round(roomUtil) });
  const roomDetail =
    roomUtil == null
      ? tDash('rooms.emptyDetail')
      : roomUtil >= 90
        ? tDash('rooms.bottleneckDetail')
        : roomUtil >= 70
          ? tDash('rooms.busyDetail')
          : roomUtil < 25
            ? tDash('rooms.idleDetail')
            : tDash('rooms.balancedDetail');

  // Composite health score: completion (50%), teacher (25%), rooms (15%), preference (10%)
  const completionScore = total > 0 ? completionPct : 0;
  const teacherScore = (() => {
    if (teacherUtil == null && avgGaps == null) return 50;
    const utilScore =
      teacherUtil == null
        ? 60
        : teacherUtil >= 90
          ? 40
          : teacherUtil >= 75
            ? 80
            : teacherUtil >= 40
              ? 100
              : 70;
    const gapScore = avgGaps == null ? 80 : Math.max(0, 100 - avgGaps * 25);
    return Math.round(utilScore * 0.5 + gapScore * 0.5);
  })();
  const roomScore = (() => {
    if (roomUtil == null) return 60;
    if (roomUtil >= 90) return 50;
    if (roomUtil >= 70) return 80;
    if (roomUtil >= 25) return 100;
    return 70;
  })();
  const prefScore = overview.preference_score == null ? 70 : Math.round(overview.preference_score);
  const overallScore = Math.round(
    completionScore * 0.5 + teacherScore * 0.25 + roomScore * 0.15 + prefScore * 0.1,
  );
  const healthSummary = (() => {
    if (overallScore >= 85) return tDash('health.good');
    if (overallScore >= 60) return tDash('health.okay');
    return tDash('health.poor');
  })();

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <HealthBanner score={overallScore} label={tDash('health.label')} summary={healthSummary} />

      {/* Narrative story cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <NarrativeCard
          icon={CheckCircle2}
          title={tDash('coverage.title')}
          headline={coverageHeadline}
          detail={coverageDetail}
          tone={coverageTone}
          metrics={[
            { label: tDash('coverage.assigned'), value: scheduled },
            { label: tDash('coverage.total'), value: total },
            { label: tDash('coverage.unassigned'), value: unassigned },
          ]}
          drillDownLabel={unassigned > 0 ? tDash('coverage.drillDown') : undefined}
          onDrillDown={
            unassigned > 0 && overview.latest_run
              ? () => router.push(`/${locale}/scheduling/runs/${overview.latest_run!.id}/review`)
              : undefined
          }
        />
        <NarrativeCard
          icon={UserCheck}
          title={tDash('teachers.title')}
          headline={teacherHeadline}
          detail={teacherDetail}
          tone={teacherTone}
          metrics={[
            {
              label: tDash('teachers.utilisation'),
              value: teacherUtil != null ? `${Math.round(teacherUtil)}%` : '—',
            },
            {
              label: tDash('teachers.avgGaps'),
              value: avgGaps != null ? avgGaps.toFixed(1) : '—',
            },
          ]}
          drillDownLabel={tDash('teachers.drillDown')}
          onDrillDown={() => onGoToTab('workload')}
        />
        <NarrativeCard
          icon={DoorOpen}
          title={tDash('rooms.title')}
          headline={roomHeadline}
          detail={roomDetail}
          tone={roomTone}
          metrics={[
            {
              label: tDash('rooms.avgUtilisation'),
              value: roomUtil != null ? `${Math.round(roomUtil)}%` : '—',
            },
          ]}
          drillDownLabel={tDash('rooms.drillDown')}
          onDrillDown={() => onGoToTab('rooms')}
        />
      </div>

      {/* Latest run strip */}
      {overview.latest_run && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-100 p-2 text-violet-700">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">{t('lastRun')}</p>
                  <Badge
                    variant={statusBadgeVariant(overview.latest_run.status)}
                    className="text-[10px]"
                  >
                    {overview.latest_run.status}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {new Date(overview.latest_run.created_at).toLocaleString()}
                  {overview.latest_run.entries_generated != null
                    ? ` · ${overview.latest_run.entries_generated} ${tDash('generatedEntries')}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onGoToTab('trends')}
                className="gap-1"
              >
                <TrendingUp className="h-3.5 w-3.5 me-1" />
                {tDash('trendsAction')}
              </Button>
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
        </div>
      )}

      {/* Quick actions — drill directly into the tabs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onGoToTab('workload')}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-start transition hover:border-border-strong hover:shadow-sm"
        >
          <div className="rounded-lg bg-sky-100 p-2 text-sky-700">
            <Activity className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">{tDash('actions.workload')}</p>
            <p className="text-xs text-text-tertiary">{tDash('actions.workloadHint')}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" />
        </button>
        <button
          type="button"
          onClick={() => onGoToTab('rooms')}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-start transition hover:border-border-strong hover:shadow-sm"
        >
          <div className="rounded-lg bg-teal-100 p-2 text-teal-700">
            <DoorOpen className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">{tDash('actions.rooms')}</p>
            <p className="text-xs text-text-tertiary">{tDash('actions.roomsHint')}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" />
        </button>
        <button
          type="button"
          onClick={() => onGoToTab('trends')}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-start transition hover:border-border-strong hover:shadow-sm"
        >
          <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">{tDash('actions.trends')}</p>
            <p className="text-xs text-text-tertiary">{tDash('actions.trendsHint')}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" />
        </button>
      </div>

      {/* Subtle alerts band */}
      {unassigned > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {tDash('alerts.unassignedTitle', { count: unassigned })}
            </p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              {tDash('alerts.unassignedDetail')}
            </p>
          </div>
          {overview.latest_run && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/${locale}/scheduling/runs/${overview.latest_run!.id}/review`)
              }
            >
              {tDash('alerts.reviewRun')}
            </Button>
          )}
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
        <OverviewTab
          overview={overview}
          loading={loading}
          locale={locale}
          onGoToTab={(tab) => setActiveTab(tab)}
        />
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
