'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Lightbulb,
  Loader2,
  Pin,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { PinToggle } from '@/components/scheduling/pin-toggle';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewEntry {
  id: string;
  class_id: string;
  class_name: string;
  subject_name?: string;
  teacher_name?: string;
  room_name?: string;
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  is_pinned: boolean;
}

interface ConstraintReport {
  hard_violations: number;
  preference_satisfaction_pct: number;
  unassigned_count: number;
  workload_summary: { teacher: string; periods: number }[];
}

interface RunReview {
  id: string;
  status: string;
  mode: string;
  updated_at: string;
  entries: ReviewEntry[];
  constraint_report: ConstraintReport;
}

type DiagnosticSeverity = 'critical' | 'high' | 'medium' | 'info';
type DiagnosticCategory =
  | 'teacher_supply_shortage'
  | 'workload_cap_hit'
  | 'availability_pinch'
  | 'unassigned_slots';
type SolutionEffort = 'quick' | 'medium' | 'long';

interface Solution {
  label: string;
  detail: string;
  effort: SolutionEffort;
  href?: string;
}

interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  title: string;
  description: string;
  solutions: Solution[];
  affected: {
    subject?: { id: string; name: string };
    year_group?: { id: string; name: string };
    classes?: Array<{ id: string; name: string }>;
    teachers?: Array<{ id: string; name: string }>;
  };
  metrics?: Record<string, number>;
}

interface DiagnosticsResult {
  summary: {
    total_unassigned_periods: number;
    total_unassigned_gaps: number;
    critical_issues: number;
    high_issues: number;
    medium_issues: number;
    can_proceed: boolean;
  };
  diagnostics: Diagnostic[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

function groupEntries(entries: ReviewEntry[]) {
  const byDay: Record<number, ReviewEntry[]> = {};
  for (const e of entries) {
    if (!byDay[e.weekday]) byDay[e.weekday] = [];
    byDay[e.weekday]!.push(e);
  }
  for (const day of Object.keys(byDay)) {
    byDay[Number(day)]!.sort((a, b) => a.period_order - b.period_order);
  }
  return byDay;
}

// ─── Diagnostics panel ────────────────────────────────────────────────────────

// ─── Severity theming ─────────────────────────────────────────────────────────

const SEVERITY_THEME: Record<
  DiagnosticSeverity,
  {
    label: string;
    accent: string; // left stripe + icon bg
    bg: string; // card bg
    border: string;
    iconColor: string;
    icon: typeof AlertCircle;
    badge: 'danger' | 'default' | 'secondary';
  }
> = {
  critical: {
    label: 'Critical',
    accent: 'bg-red-500',
    bg: 'bg-red-50/60 dark:bg-red-900/10',
    border: 'border-red-200 dark:border-red-700/40',
    iconColor: 'text-red-600 dark:text-red-400',
    icon: AlertCircle,
    badge: 'danger',
  },
  high: {
    label: 'High priority',
    accent: 'bg-amber-500',
    bg: 'bg-amber-50/60 dark:bg-amber-900/10',
    border: 'border-amber-200 dark:border-amber-700/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    icon: AlertTriangle,
    badge: 'default',
  },
  medium: {
    label: 'Needs attention',
    accent: 'bg-blue-500',
    bg: 'bg-blue-50/60 dark:bg-blue-900/10',
    border: 'border-blue-200 dark:border-blue-700/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
    icon: Info,
    badge: 'secondary',
  },
  info: {
    label: 'Info',
    accent: 'bg-text-tertiary',
    bg: 'bg-surface-secondary/40',
    border: 'border-border',
    iconColor: 'text-text-tertiary',
    icon: Info,
    badge: 'secondary',
  },
};

const EFFORT_THEME: Record<SolutionEffort, { label: string; className: string; icon: typeof Zap }> =
  {
    quick: {
      label: 'Quick fix',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50',
      icon: Zap,
    },
    medium: {
      label: 'Medium effort',
      className:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700/50',
      icon: Sparkles,
    },
    long: {
      label: 'Long-term',
      className:
        'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-700/50',
      icon: Users,
    },
  };

// ─── Diagnostic card ──────────────────────────────────────────────────────────

function DiagnosticCard({ d, locale }: { d: Diagnostic; locale: string }) {
  const theme = SEVERITY_THEME[d.severity];
  const SeverityIcon = theme.icon;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${theme.border} ${theme.bg} shadow-sm`}
    >
      {/* Severity accent stripe */}
      <div className={`absolute start-0 top-0 h-full w-1 ${theme.accent}`} aria-hidden="true" />

      <div className="ps-4 pe-4 py-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 rounded-lg bg-surface p-1.5 border ${theme.border} ${theme.iconColor}`}
          >
            <SeverityIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-text-primary leading-tight">{d.title}</h4>
              <Badge variant={theme.badge} className="text-[10px] uppercase tracking-wide">
                {theme.label}
              </Badge>
            </div>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{d.description}</p>
          </div>
        </div>

        {/* Solutions */}
        {d.solutions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              <Lightbulb className="h-3 w-3" />
              <span>Suggested solutions</span>
            </div>
            <ol className="space-y-2">
              {d.solutions.map((s, i) => {
                const effortTheme = EFFORT_THEME[s.effort];
                const EffortIcon = effortTheme.icon;
                return (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-surface p-2.5 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-brand/10 text-brand text-[11px] font-bold">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-medium text-text-primary">{s.label}</p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${effortTheme.className}`}
                          >
                            <EffortIcon className="h-2.5 w-2.5" />
                            {effortTheme.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-secondary leading-relaxed">
                          {s.detail}
                        </p>
                        {s.href && (
                          <a
                            href={`/${locale}${s.href}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                          >
                            Go to settings
                            <ArrowUpRight className="h-3 w-3 rtl:rotate-[270deg]" />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Affected entities */}
        {((d.affected.classes && d.affected.classes.length > 0) ||
          (d.affected.teachers && d.affected.teachers.length > 0)) && (
          <div className="pt-2 border-t border-border/60 space-y-2">
            {d.affected.classes && d.affected.classes.length > 0 && (
              <div className="flex items-start gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary mt-0.5 shrink-0">
                  Classes
                </span>
                <div className="flex flex-wrap gap-1">
                  {d.affected.classes.slice(0, 16).map((c) => (
                    <span
                      key={c.id}
                      className="rounded-md bg-surface border border-border px-1.5 py-0.5 text-[10px] font-mono text-text-primary"
                    >
                      {c.name}
                    </span>
                  ))}
                  {d.affected.classes.length > 16 && (
                    <span className="text-[10px] text-text-tertiary py-0.5">
                      +{d.affected.classes.length - 16} more
                    </span>
                  )}
                </div>
              </div>
            )}
            {d.affected.teachers && d.affected.teachers.length > 0 && (
              <div className="flex items-start gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary mt-0.5 shrink-0">
                  Teachers
                </span>
                <div className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                  <Users className="h-3 w-3 text-text-tertiary" />
                  <span>
                    {d.affected.teachers
                      .slice(0, 5)
                      .map((t) => t.name)
                      .join(', ')}
                    {d.affected.teachers.length > 5 && ` +${d.affected.teachers.length - 5} more`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Diagnostics panel ────────────────────────────────────────────────────────

function DiagnosticsPanel({ result, locale }: { result: DiagnosticsResult; locale: string }) {
  const [mediumExpanded, setMediumExpanded] = React.useState(false);

  const critical = result.diagnostics.filter((d) => d.severity === 'critical');
  const high = result.diagnostics.filter((d) => d.severity === 'high');
  const medium = result.diagnostics.filter((d) => d.severity === 'medium');

  const { total_unassigned_periods, total_unassigned_gaps, critical_issues, high_issues } =
    result.summary;

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Header with gradient accent */}
      <div className="relative bg-gradient-to-br from-brand/5 via-transparent to-transparent border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-brand/10 p-1.5 text-brand">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Timetable analysis</h3>
              <p className="text-[11px] text-text-tertiary">
                {total_unassigned_periods > 0
                  ? `${total_unassigned_periods} unplaced period(s) across ${total_unassigned_gaps} gap(s)`
                  : 'Every required period was placed'}
              </p>
            </div>
          </div>
          {total_unassigned_periods > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {critical_issues > 0 && (
                <Badge variant="danger" className="text-[10px]">
                  {critical_issues} critical
                </Badge>
              )}
              {high_issues > 0 && (
                <Badge variant="default" className="text-[10px]">
                  {high_issues} high
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {result.diagnostics.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>No issues detected — this timetable is ready to apply.</span>
          </div>
        ) : (
          <>
            {critical.length > 0 && (
              <section className="space-y-2">
                {critical.map((d) => (
                  <DiagnosticCard key={d.id} d={d} locale={locale} />
                ))}
              </section>
            )}

            {high.length > 0 && (
              <section className="space-y-2">
                {high.map((d) => (
                  <DiagnosticCard key={d.id} d={d} locale={locale} />
                ))}
              </section>
            )}

            {medium.length > 0 && (
              <section className="space-y-2">
                <button
                  type="button"
                  onClick={() => setMediumExpanded((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-secondary/40 px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-secondary transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 text-blue-500" />
                    <span>
                      {medium.length} other gap{medium.length === 1 ? '' : 's'} need attention
                    </span>
                  </div>
                  {mediumExpanded ? (
                    <ChevronUp className="h-4 w-4 text-text-tertiary" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-text-tertiary" />
                  )}
                </button>
                {mediumExpanded && (
                  <div className="space-y-2">
                    {medium.map((d) => (
                      <DiagnosticCard key={d.id} d={d} locale={locale} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RunReviewPage() {
  const t = useTranslations('scheduling.auto');
  const _params = useParams<{ id: string; locale?: string }>();
  const id = _params?.id ?? '';
  const locale = _params?.locale ?? 'en';
  const router = useRouter();

  const [data, setData] = React.useState<RunReview | null>(null);
  const [diagnostics, setDiagnostics] = React.useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [actioning, setActioning] = React.useState(false);
  const [selectedEntry, setSelectedEntry] = React.useState<ReviewEntry | null>(null);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient<{ data: RunReview }>(`/api/v1/scheduling-runs/${id}`),
      apiClient<{ data: DiagnosticsResult }>(`/api/v1/scheduling-runs/${id}/diagnostics`, {
        silent: true,
      }).catch((err) => {
        // Diagnostics are best-effort — a failure here shouldn't hide the
        // timetable. Log and continue with the run payload only.
        console.error('[RunsReviewPage] diagnostics fetch failed', err);
        return null;
      }),
    ])
      .then(([runRes, diagRes]) => {
        setData(runRes.data);
        setDiagnostics(diagRes?.data ?? null);
      })
      .catch((err) => {
        console.error('[RunsReviewPage]', err);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleApply() {
    if (!data) return;
    setActioning(true);
    try {
      await apiClient(`/api/v1/scheduling-runs/${id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ expected_updated_at: data.updated_at }),
      });
      toast.success('Timetable applied successfully');
      setApplyOpen(false);
      router.push('/scheduling/auto');
    } catch (err) {
      console.error('[RunsReviewPage]', err);
      toast.error('Failed to apply timetable');
    } finally {
      setActioning(false);
    }
  }

  async function handleDiscard() {
    if (!data) return;
    setActioning(true);
    try {
      await apiClient(`/api/v1/scheduling-runs/${id}/discard`, {
        method: 'POST',
        body: JSON.stringify({ expected_updated_at: data.updated_at }),
      });
      toast.success('Timetable discarded');
      setDiscardOpen(false);
      router.push('/scheduling/auto');
    } catch (err) {
      console.error('[RunsReviewPage]', err);
      toast.error('Failed to discard timetable');
    } finally {
      setActioning(false);
    }
  }

  async function handleCellClick(entry: ReviewEntry) {
    if (!selectedEntry) {
      setSelectedEntry(entry);
      return;
    }
    if (selectedEntry.id === entry.id) {
      setSelectedEntry(null);
      return;
    }
    // Swap via PATCH
    try {
      await apiClient(`/api/v1/scheduling-runs/${id}/adjustments`, {
        method: 'PATCH',
        body: JSON.stringify({
          entry_a_id: selectedEntry.id,
          entry_b_id: entry.id,
        }),
      });
      toast.success('Swap applied');
      const updated = await apiClient<{ data: RunReview }>(`/api/v1/scheduling-runs/${id}`);
      setData(updated.data);
    } catch (err) {
      console.error('[RunsReviewPage]', err);
      toast.error('Swap failed');
    } finally {
      setSelectedEntry(null);
    }
  }

  function handlePinToggle(entryId: string, pinned: boolean) {
    if (!data) return;
    setData({
      ...data,
      entries: data.entries.map((e) => (e.id === entryId ? { ...e, is_pinned: pinned } : e)),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <AlertCircle className="h-8 w-8 text-text-tertiary" />
        <p className="text-sm text-text-secondary">{t('failedToLoadRun')}</p>
        <Button variant="outline" onClick={() => router.back()}>
          {t('backToSolver')}
        </Button>
      </div>
    );
  }

  const grouped = groupEntries(data.entries);
  const weekdays = Object.keys(grouped).map(Number).sort();
  const isProposed = data.status === 'completed';
  const report = data.constraint_report;

  // Unique sorted period orders
  const periodOrders = Array.from(
    new Set(
      Object.values(grouped)
        .flat()
        .map((e) => e.period_order),
    ),
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {/* Proposed Banner */}
      {isProposed && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {t('proposedBanner')}
          </span>
        </div>
      )}

      <PageHeader
        title={`${t('autoScheduler')} — ${t('viewReview')}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/scheduling/auto')}>
              <ArrowLeft className="h-4 w-4 me-1.5 rtl:rotate-180" />
              {t('backToSolver')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDiscardOpen(true)}
              disabled={actioning}
            >
              <Trash2 className="h-4 w-4 me-1.5" />
              {t('discardTimetable')}
            </Button>
            <Button
              size="sm"
              onClick={() => setApplyOpen(true)}
              disabled={actioning}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              {t('applyTimetable')}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Timetable Grid */}
        <div className="lg:col-span-3 space-y-4">
          {selectedEntry && (
            <div className="rounded-lg bg-brand/10 border border-brand/30 px-4 py-2 text-sm text-brand">
              {t('selected')}
              <strong>{selectedEntry.class_name}</strong> — {WEEKDAY_LABELS[selectedEntry.weekday]}{' '}
              P{selectedEntry.period_order}
              {t('clickAnotherSlotToSwap')}
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary w-16">
                    {t('period')}
                  </th>
                  {weekdays.map((day) => (
                    <th
                      key={day}
                      className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                    >
                      {WEEKDAY_LABELS[day] ?? `Day ${day}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodOrders.map((period) => (
                  <tr key={period} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-xs font-mono text-text-tertiary align-top">
                      P{period}
                    </td>
                    {weekdays.map((day) => {
                      const cellEntries = (grouped[day] ?? []).filter(
                        (e) => e.period_order === period,
                      );
                      return (
                        <td key={day} className="px-2 py-1.5 align-top">
                          <div className="flex flex-col gap-1">
                            {cellEntries.map((entry) => {
                              const isSelected = selectedEntry?.id === entry.id;
                              return (
                                <div
                                  key={entry.id}
                                  className={`relative rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-all ${
                                    entry.is_pinned
                                      ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-600'
                                      : 'bg-blue-50 dark:bg-blue-900/20 border border-dashed border-blue-300 dark:border-blue-600'
                                  } ${isSelected ? 'ring-2 ring-brand' : ''}`}
                                  onClick={() => handleCellClick(entry)}
                                >
                                  <div className="font-medium text-text-primary pe-6">
                                    {entry.class_name}
                                  </div>
                                  {entry.subject_name && (
                                    <div className="text-text-secondary opacity-75">
                                      {entry.subject_name}
                                    </div>
                                  )}
                                  {entry.room_name && (
                                    <div className="text-text-tertiary opacity-75">
                                      {entry.room_name}
                                    </div>
                                  )}
                                  <div
                                    className="absolute top-1 end-1 flex items-center gap-0.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {entry.is_pinned && (
                                      <Pin className="h-2.5 w-2.5 text-amber-500" />
                                    )}
                                    <PinToggle
                                      scheduleId={entry.id}
                                      isPinned={entry.is_pinned}
                                      onToggle={(pinned) => handlePinToggle(entry.id, pinned)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                            {cellEntries.length === 0 && (
                              <div className="h-8 rounded-lg border border-dashed border-border bg-transparent" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Constraint Report Side Panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">{t('constraintReport')}</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{t('hardViolations')}</span>
              <Badge variant={report?.hard_violations > 0 ? 'danger' : 'default'}>
                {report?.hard_violations ?? 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{t('softSatisfaction')}</span>
              <span className="font-mono font-semibold text-text-primary">
                {report?.preference_satisfaction_pct ?? 0}%
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex flex-col">
                <span className="text-text-secondary">Unplaced periods</span>
                <span className="text-[10px] text-text-tertiary">
                  total lessons the solver couldn&apos;t fit
                </span>
              </div>
              <Badge
                variant={
                  (diagnostics?.summary.total_unassigned_periods ?? 0) > 0 ? 'danger' : 'default'
                }
              >
                {diagnostics?.summary.total_unassigned_periods ?? report?.unassigned_count ?? 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex flex-col">
                <span className="text-text-secondary">Gaps (class × subject)</span>
                <span className="text-[10px] text-text-tertiary">
                  distinct combinations with at least one unplaced period
                </span>
              </div>
              <Badge
                variant={
                  (diagnostics?.summary.total_unassigned_gaps ?? report?.unassigned_count ?? 0) > 0
                    ? 'secondary'
                    : 'default'
                }
              >
                {diagnostics?.summary.total_unassigned_gaps ?? report?.unassigned_count ?? 0}
              </Badge>
            </div>
          </div>

          {diagnostics && diagnostics.diagnostics.length > 0 && (
            <DiagnosticsPanel result={diagnostics} locale={locale} />
          )}

          {report?.workload_summary && report.workload_summary.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">{t('workloadSummary')}</h3>
              {report.workload_summary.slice(0, 8).map((row) => (
                <div key={row.teacher} className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary truncate me-2">{row.teacher}</span>
                  <span className="font-mono text-text-primary shrink-0">{row.periods}p</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-4 space-y-1.5">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase mb-2">
              {t('legend')}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className="w-3 h-3 rounded-sm border border-amber-300 bg-amber-50 dark:bg-amber-900/20 shrink-0" />
              <span>
                {t('pinEntry')}
                {t('solid')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className="w-3 h-3 rounded-sm border border-dashed border-blue-300 bg-blue-50 dark:bg-blue-900/20 shrink-0" />
              <span>{t('autoGeneratedDashed')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Apply Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('applyTimetable')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('confirmApply')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>
              {t('cancelSolve')}
            </Button>
            <Button onClick={handleApply} disabled={actioning}>
              {actioning && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('applyTimetable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Dialog */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('discardTimetable')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('confirmDiscard')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              {t('cancelSolve')}
            </Button>
            <Button variant="destructive" onClick={handleDiscard} disabled={actioning}>
              {actioning && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('discardTimetable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
