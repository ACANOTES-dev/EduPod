'use client';

import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  Pin,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardOverview {
  total_slots: number;
  assigned_slots: number;
  pinned_slots: number;
  auto_slots: number;
  manual_slots: number;
  unassigned_slots: number;
  completion_pct: number;
  last_run_at?: string;
  is_stale: boolean;
}

interface WorkloadRow {
  staff_id: string;
  teacher_name: string;
  teaching_periods: number;
  supervision_periods: number;
  total_periods: number;
  utilisation_pct: number;
}

interface UnassignedRow {
  class_id: string;
  class_name: string;
  subject_name?: string;
  periods_needed: number;
  periods_assigned: number;
  periods_remaining: number;
  blocked_reason?: string;
}

interface PreferenceRow {
  staff_id: string;
  teacher_name: string;
  satisfaction_pct: number;
  total_preferences: number;
  satisfied: number;
}

interface SchedulingRun {
  id: string;
  status: string;
  mode: string;
  created_at: string;
  completed_at?: string;
  assigned_count?: number;
  pinned_count?: number;
  unassigned_count?: number;
}

type TabKey = 'overview' | 'workload' | 'unassigned' | 'satisfaction' | 'history';

// ─── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
}

function KpiCard({ label, value, icon, highlight }: KpiCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        highlight
          ? 'border-brand/40 bg-brand/5'
          : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-tertiary uppercase tracking-wide">{label}</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
        </div>
        <div className="text-text-tertiary">{icon}</div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulingDashboardPage() {
  const t = useTranslations('scheduling.auto');
  const router = useRouter();

  const [activeTab, setActiveTab] = React.useState<TabKey>('overview');
  const [overview, setOverview] = React.useState<DashboardOverview | null>(null);
  const [workload, setWorkload] = React.useState<WorkloadRow[]>([]);
  const [unassigned, setUnassigned] = React.useState<UnassignedRow[]>([]);
  const [preferences, setPreferences] = React.useState<PreferenceRow[]>([]);
  const [runs, setRuns] = React.useState<SchedulingRun[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      apiClient<DashboardOverview>('/api/v1/scheduling-dashboard/overview'),
      apiClient<{ data: WorkloadRow[] }>('/api/v1/scheduling-dashboard/workload'),
      apiClient<{ data: UnassignedRow[] }>('/api/v1/scheduling-dashboard/unassigned'),
      apiClient<{ data: PreferenceRow[] }>('/api/v1/scheduling-dashboard/preferences'),
      apiClient<{ data: SchedulingRun[] }>('/api/v1/scheduling-runs?page=1&pageSize=20'),
    ]).then(([ov, wl, un, pref, runsRes]) => {
      if (ov.status === 'fulfilled') setOverview(ov.value);
      if (wl.status === 'fulfilled') setWorkload(wl.value.data ?? []);
      if (un.status === 'fulfilled') setUnassigned(un.value.data ?? []);
      if (pref.status === 'fulfilled') setPreferences(pref.value.data ?? []);
      if (runsRes.status === 'fulfilled') setRuns(runsRes.value.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  function utilisationColor(pct: number): string {
    if (pct >= 90) return 'text-red-600 dark:text-red-400';
    if (pct >= 70) return 'text-amber-600 dark:text-amber-400';
    return 'text-green-600 dark:text-green-400';
  }

  function statusBadgeVariant(status: string): 'default' | 'secondary' | 'danger' {
    if (status === 'completed' || status === 'applied') return 'default';
    if (status === 'failed') return 'danger';
    return 'secondary';
  }

  function formatDuration(run: SchedulingRun): string {
    if (!run.completed_at) return '—';
    const secs = Math.round(
      (new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()) / 1000
    );
    return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`;
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: t('overviewTab') },
    { key: 'workload', label: t('workloadTab') },
    { key: 'unassigned', label: t('unassignedTab') },
    { key: 'satisfaction', label: t('satisfactionTab') },
    { key: 'history', label: t('historyTab') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard')}
        actions={
          <Button size="sm" onClick={() => router.push('/scheduling/auto')} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            {t('autoScheduler')}
          </Button>
        }
      />

      {overview?.is_stale && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-300">{t('staleWarning')}</span>
        </div>
      )}

      {/* Tab Nav */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : overview ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard
                label={t('totalSlots')}
                value={overview.total_slots}
                icon={<BookOpen className="h-5 w-5" />}
              />
              <KpiCard
                label={t('assignedSlots')}
                value={overview.assigned_slots}
                icon={<CheckCircle2 className="h-5 w-5" />}
                highlight
              />
              <KpiCard
                label={t('pinnedSlots')}
                value={overview.pinned_slots}
                icon={<Pin className="h-5 w-5" />}
              />
              <KpiCard
                label={t('autoSlots')}
                value={overview.auto_slots}
                icon={<Sparkles className="h-5 w-5" />}
              />
              <KpiCard
                label={t('unassignedSlots')}
                value={overview.unassigned_slots}
                icon={<XCircle className="h-5 w-5" />}
              />
              <KpiCard
                label={t('completionPct')}
                value={`${overview.completion_pct}%`}
                icon={<BarChart3 className="h-5 w-5" />}
                highlight
              />
            </div>
          ) : (
            <p className="text-sm text-text-secondary">No overview data available.</p>
          )}
          {overview?.last_run_at && (
            <p className="text-xs text-text-tertiary flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {t('lastRun')}: {new Date(overview.last_run_at).toLocaleString()}
            </p>
          )}
        </>
      )}

      {/* Workload Tab */}
      {activeTab === 'workload' && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('workloadTab')}
          </h2>
          {workload.length === 0 ? (
            <p className="text-sm text-text-secondary">No workload data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">Teacher</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('teachingPeriods')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('supervisionPeriods')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">Total</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('utilisation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {workload.map((row) => (
                    <tr key={row.staff_id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-medium text-text-primary">{row.teacher_name}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.teaching_periods}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.supervision_periods}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.total_periods}</td>
                      <td className={`px-3 py-2 font-mono font-semibold ${utilisationColor(row.utilisation_pct)}`}>
                        {row.utilisation_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Unassigned Tab */}
      {activeTab === 'unassigned' && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            {t('unassignedTab')}
          </h2>
          {unassigned.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-2">
              <CheckCircle2 className="h-4 w-4" />
              All slots assigned
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">Class</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">Subject</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('periodsNeeded')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('periodsAssigned')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('periodsRemaining')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('blockedReason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.map((row) => (
                    <tr key={row.class_id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-medium text-text-primary">{row.class_name}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.subject_name ?? '—'}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.periods_needed}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.periods_assigned}</td>
                      <td className="px-3 py-2">
                        <Badge variant="danger">{row.periods_remaining}</Badge>
                      </td>
                      <td className="px-3 py-2 text-text-tertiary text-xs">{row.blocked_reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Satisfaction Tab */}
      {activeTab === 'satisfaction' && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">{t('satisfactionTab')}</h2>
          {preferences.length === 0 ? (
            <p className="text-sm text-text-secondary">No preference data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">Teacher</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">Preferences</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">Satisfied</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('satisfactionPct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preferences.map((row) => (
                    <tr key={row.staff_id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-medium text-text-primary">{row.teacher_name}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.total_preferences}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.satisfied}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-surface-secondary rounded-full h-1.5 min-w-[60px]">
                            <div
                              className="bg-brand rounded-full h-1.5"
                              style={{ width: `${row.satisfaction_pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-text-primary">
                            {row.satisfaction_pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">{t('runHistory')}</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-text-secondary">{t('noRuns')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('runStatus')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('runMode')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('runCreated')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('runDuration')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('entriesGenerated')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('entriesPinned')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">{t('entriesUnassigned')}</th>
                    <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2">
                        <Badge variant={statusBadgeVariant(run.status)}>
                          {run.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-text-secondary capitalize">{run.mode}</td>
                      <td className="px-3 py-2 text-text-secondary">
                        {new Date(run.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-text-secondary">
                        {formatDuration(run)}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{run.assigned_count ?? '—'}</td>
                      <td className="px-3 py-2 text-text-secondary">{run.pinned_count ?? '—'}</td>
                      <td className="px-3 py-2 text-text-secondary">{run.unassigned_count ?? '—'}</td>
                      <td className="px-3 py-2">
                        {run.status === 'completed' && (
                          <button
                            type="button"
                            onClick={() => router.push(`/scheduling/runs/${run.id}/review`)}
                            className="text-xs text-brand hover:underline"
                          >
                            {t('viewReview')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
