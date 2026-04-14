'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GripVertical,
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

interface PeriodSlot {
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  period_type: 'teaching' | 'break_supervision' | 'lunch_duty' | 'assembly' | 'free';
  supervision_mode: string | null;
}

interface RunReview {
  id: string;
  status: string;
  mode: string;
  updated_at: string;
  entries: ReviewEntry[];
  period_grids: Record<string, PeriodSlot[]>;
  class_to_year_group: Record<string, string>;
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

// ─── Severity theming ─────────────────────────────────────────────────────────

const SEVERITY_THEME: Record<
  DiagnosticSeverity,
  {
    label: string;
    accent: string;
    bg: string;
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
      <div className={`absolute start-0 top-0 h-full w-1 ${theme.accent}`} aria-hidden="true" />

      <div className="ps-4 pe-4 py-4 space-y-3">
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
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                          >
                            Go to settings (new tab)
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

// ─── Per-class timetable grid ─────────────────────────────────────────────────

interface EmptySlot {
  class_id: string;
  weekday: number;
  period_order: number;
}

interface DragPayload {
  type: 'entry' | 'empty';
  entry_id?: string;
  class_id: string;
  weekday: number;
  period_order: number;
}

interface ClassTimetableProps {
  classId: string;
  className: string;
  entries: ReviewEntry[];
  weekdays: number[];
  periodSlots: PeriodSlot[];
  readOnly: boolean;
  dragPayload: DragPayload | null;
  hoverCell: { class_id: string; weekday: number; period_order: number } | null;
  onPinToggle: (entryId: string, pinned: boolean) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragOver: (class_id: string, weekday: number, period_order: number) => void;
  onDragEnd: () => void;
  onDrop: (target: { class_id: string; weekday: number; period_order: number }) => void;
}

function periodTypeLabel(type: PeriodSlot['period_type']): string {
  switch (type) {
    case 'break_supervision':
      return 'Break';
    case 'lunch_duty':
      return 'Lunch';
    case 'assembly':
      return 'Assembly';
    case 'free':
      return 'Free';
    default:
      return '';
  }
}

function ClassTimetable({
  classId,
  className,
  entries,
  weekdays,
  periodSlots,
  readOnly,
  dragPayload,
  hoverCell,
  onPinToggle,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: ClassTimetableProps) {
  const entryByCell = React.useMemo(() => {
    const map = new Map<string, ReviewEntry>();
    for (const e of entries) {
      map.set(`${e.weekday}:${e.period_order}`, e);
    }
    return map;
  }, [entries]);

  // For each (weekday, period_order) resolve the period slot metadata (type + time)
  const slotByCell = React.useMemo(() => {
    const map = new Map<string, PeriodSlot>();
    for (const s of periodSlots) {
      map.set(`${s.weekday}:${s.period_order}`, s);
    }
    return map;
  }, [periodSlots]);

  // Union of period orders present anywhere in the grid (rows). Break/lunch rows
  // at a given order sort naturally among teaching rows by period_order.
  const periodOrders = React.useMemo(() => {
    const set = new Set<number>();
    for (const s of periodSlots) set.add(s.period_order);
    const list = [...set];
    return list.sort((a, b) => a - b);
  }, [periodSlots]);

  // Representative slot per period_order used for the row label + time range.
  // If a row mixes types across days (rare), the representative prefers the
  // most common non-teaching type so the label carries meaning.
  const rowLabelByPeriod = React.useMemo(() => {
    const out = new Map<number, { label: string; start: string; end: string; isBreak: boolean }>();
    for (const po of periodOrders) {
      const slots = periodSlots.filter((s) => s.period_order === po);
      const firstBreakish = slots.find(
        (s) => s.period_type === 'break_supervision' || s.period_type === 'lunch_duty',
      );
      const rep = firstBreakish ?? slots[0];
      if (!rep) continue;
      out.set(po, {
        label: `P${po}`,
        start: rep.start_time,
        end: rep.end_time,
        isBreak: rep.period_type !== 'teaching',
      });
    }
    return out;
  }, [periodOrders, periodSlots]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          Class <span className="font-mono">{className}</span>
        </h3>
        <p className="text-xs text-text-tertiary">
          Drag lessons to swap. Drop onto an empty orange slot to move.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[640px] table-fixed">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary w-16">
                Period
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
            {periodOrders.map((period) => {
              const rowMeta = rowLabelByPeriod.get(period);
              return (
                <tr key={period} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-xs font-mono text-text-tertiary align-top whitespace-nowrap">
                    <div>{rowMeta?.label ?? `P${period}`}</div>
                    {rowMeta?.start && rowMeta?.end && (
                      <div className="font-mono text-[10px] text-text-tertiary/80 mt-0.5">
                        {rowMeta.start}–{rowMeta.end}
                      </div>
                    )}
                  </td>
                  {weekdays.map((day) => {
                    const entry = entryByCell.get(`${day}:${period}`);
                    const slot = slotByCell.get(`${day}:${period}`);
                    const isNonTeaching =
                      slot != null &&
                      (slot.period_type === 'break_supervision' ||
                        slot.period_type === 'lunch_duty' ||
                        slot.period_type === 'assembly' ||
                        slot.period_type === 'free');
                    const isHoverTarget =
                      hoverCell?.class_id === classId &&
                      hoverCell?.weekday === day &&
                      hoverCell?.period_order === period;
                    const isDraggedSource =
                      dragPayload?.type === 'entry' && dragPayload.entry_id === entry?.id;

                    if (isNonTeaching && !entry) {
                      const label = periodTypeLabel(slot.period_type);
                      return (
                        <td key={day} className="px-2 py-1.5 align-top">
                          <div
                            className={`h-12 rounded-lg border border-dashed flex flex-col items-center justify-center text-[11px] font-semibold uppercase tracking-wide ${
                              slot.period_type === 'lunch_duty'
                                ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/15 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-700/40 bg-slate-50 dark:bg-slate-800/20 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <span>{label}</span>
                            {slot.start_time && slot.end_time && (
                              <span className="font-mono text-[10px] font-normal opacity-75">
                                {slot.start_time}–{slot.end_time}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    if (entry) {
                      return (
                        <td key={day} className="px-2 py-1.5 align-top">
                          <div
                            draggable={!readOnly && !entry.is_pinned}
                            onDragStart={() =>
                              onDragStart({
                                type: 'entry',
                                entry_id: entry.id,
                                class_id: entry.class_id,
                                weekday: entry.weekday,
                                period_order: entry.period_order,
                              })
                            }
                            onDragOver={(e) => {
                              if (readOnly) return;
                              e.preventDefault();
                              onDragOver(classId, day, period);
                            }}
                            onDragLeave={() => onDragOver('', -1, -1)}
                            onDragEnd={onDragEnd}
                            onDrop={(e) => {
                              if (readOnly) return;
                              e.preventDefault();
                              onDrop({ class_id: classId, weekday: day, period_order: period });
                            }}
                            className={`relative rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                              entry.is_pinned
                                ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700'
                                : 'bg-sky-50 dark:bg-sky-900/15 border border-dashed border-sky-200 dark:border-sky-700/60'
                            } ${isDraggedSource ? 'opacity-40' : ''} ${
                              isHoverTarget ? 'ring-2 ring-brand shadow-sm' : ''
                            } ${!readOnly && !entry.is_pinned ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          >
                            {entry.subject_name && (
                              <div className="font-medium text-text-primary pe-6 truncate">
                                {entry.subject_name}
                              </div>
                            )}
                            {entry.teacher_name && (
                              <div className="text-text-secondary truncate">
                                {entry.teacher_name}
                              </div>
                            )}
                            {entry.room_name && (
                              <div className="text-text-tertiary truncate">{entry.room_name}</div>
                            )}
                            {(entry.start_time || entry.end_time) && (
                              <div className="font-mono text-[10px] text-text-tertiary mt-0.5 truncate">
                                {entry.start_time}
                                {entry.start_time && entry.end_time ? '–' : ''}
                                {entry.end_time}
                              </div>
                            )}
                            <div
                              className="absolute top-1 end-1 flex items-center gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                              onDragStart={(e) => e.stopPropagation()}
                            >
                              {entry.is_pinned && <Pin className="h-2.5 w-2.5 text-violet-500" />}
                              {!readOnly && !entry.is_pinned && (
                                <GripVertical className="h-3 w-3 text-text-tertiary opacity-60" />
                              )}
                              <PinToggle
                                scheduleId={entry.id}
                                isPinned={entry.is_pinned}
                                onToggle={(pinned) => onPinToggle(entry.id, pinned)}
                              />
                            </div>
                          </div>
                        </td>
                      );
                    }

                    // Empty cell — red-orange shading + drop target
                    return (
                      <td key={day} className="px-2 py-1.5 align-top">
                        <div
                          onDragOver={(e) => {
                            if (readOnly) return;
                            e.preventDefault();
                            onDragOver(classId, day, period);
                          }}
                          onDragLeave={() => onDragOver('', -1, -1)}
                          onDrop={(e) => {
                            if (readOnly) return;
                            e.preventDefault();
                            onDrop({ class_id: classId, weekday: day, period_order: period });
                          }}
                          className={`h-12 rounded-lg border border-dashed transition-colors flex items-center justify-center text-[10px] font-medium ${
                            isHoverTarget
                              ? 'border-brand bg-brand/10 text-brand ring-2 ring-brand/40'
                              : 'border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-900/15 text-rose-600 dark:text-rose-300'
                          }`}
                        >
                          Unplaced
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
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
  const [activeClassId, setActiveClassId] = React.useState<string>('');

  const [dragPayload, setDragPayload] = React.useState<DragPayload | null>(null);
  const [hoverCell, setHoverCell] = React.useState<EmptySlot | null>(null);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient<{ data: RunReview }>(`/api/v1/scheduling-runs/${id}`),
      apiClient<{ data: DiagnosticsResult }>(`/api/v1/scheduling-runs/${id}/diagnostics`, {
        silent: true,
      }).catch((err) => {
        console.error('[RunsReviewPage] diagnostics fetch failed', err);
        return null;
      }),
    ])
      .then(([runRes, diagRes]) => {
        setData(runRes.data);
        setDiagnostics(diagRes?.data ?? null);
        // default to first class
        const firstClass = runRes.data.entries[0]?.class_id;
        if (firstClass) setActiveClassId((prev) => prev || firstClass);
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

  function handlePinToggle(entryId: string, pinned: boolean) {
    if (!data) return;
    setData({
      ...data,
      entries: data.entries.map((e) => (e.id === entryId ? { ...e, is_pinned: pinned } : e)),
    });
  }

  function handleDragStart(payload: DragPayload) {
    setDragPayload(payload);
  }

  function handleDragOver(class_id: string, weekday: number, period_order: number) {
    if (!class_id || weekday < 0) {
      setHoverCell(null);
      return;
    }
    setHoverCell({ class_id, weekday, period_order });
  }

  function handleDragEnd() {
    setDragPayload(null);
    setHoverCell(null);
  }

  async function handleDrop(target: { class_id: string; weekday: number; period_order: number }) {
    const source = dragPayload;
    setDragPayload(null);
    setHoverCell(null);
    if (!source || !data) return;
    if (source.type !== 'entry') return;
    if (source.class_id !== target.class_id) {
      toast.error('Lessons can only be swapped within the same class.');
      return;
    }
    if (source.weekday === target.weekday && source.period_order === target.period_order) {
      return;
    }

    const existingEntries = data.entries;
    const sourceEntry = existingEntries.find((e) => e.id === source.entry_id);
    if (!sourceEntry) return;

    const destEntry = existingEntries.find(
      (e) =>
        e.class_id === target.class_id &&
        e.weekday === target.weekday &&
        e.period_order === target.period_order,
    );

    const previousData = data;

    const adjustment = destEntry
      ? {
          type: 'swap' as const,
          entry_a: {
            class_id: sourceEntry.class_id,
            weekday: sourceEntry.weekday,
            period_order: sourceEntry.period_order,
          },
          entry_b: {
            class_id: destEntry.class_id,
            weekday: destEntry.weekday,
            period_order: destEntry.period_order,
          },
        }
      : {
          type: 'move' as const,
          class_id: sourceEntry.class_id,
          from_weekday: sourceEntry.weekday,
          from_period_order: sourceEntry.period_order,
          to_weekday: target.weekday,
          to_period_order: target.period_order,
        };

    const updatedEntries = existingEntries.map((e) => {
      if (e.id === sourceEntry.id) {
        return { ...e, weekday: target.weekday, period_order: target.period_order };
      }
      if (destEntry && e.id === destEntry.id && adjustment.type === 'swap') {
        return { ...e, weekday: sourceEntry.weekday, period_order: sourceEntry.period_order };
      }
      return e;
    });

    setData({ ...data, entries: updatedEntries });

    try {
      const res = await apiClient<{ data: { updated_at: string } }>(
        `/api/v1/scheduling-runs/${id}/adjustments`,
        {
          method: 'PATCH',
          body: JSON.stringify({ adjustment, expected_updated_at: data.updated_at }),
        },
      );
      const nextUpdatedAt = res.data.updated_at;
      setData((prev) =>
        prev ? { ...prev, entries: updatedEntries, updated_at: nextUpdatedAt } : prev,
      );

      // Refresh diagnostics so the constraint report reflects the new layout.
      try {
        const diagRes = await apiClient<{ data: DiagnosticsResult }>(
          `/api/v1/scheduling-runs/${id}/diagnostics`,
          { silent: true },
        );
        setDiagnostics(diagRes.data ?? null);
      } catch (diagErr) {
        console.error('[RunsReviewPage] diagnostics refresh failed', diagErr);
      }

      toast.success(adjustment.type === 'swap' ? 'Swap saved' : 'Lesson moved');
    } catch (err) {
      console.error('[RunsReviewPage]', err);
      setData(previousData);
      toast.error('Could not save the change. The run may have been modified — reload the page.');
    }
  }

  const entries = React.useMemo(() => data?.entries ?? [], [data?.entries]);

  const classList = React.useMemo<Array<{ id: string; name: string }>>(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (!map.has(e.class_id)) map.set(e.class_id, e.class_name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const periodGrids = React.useMemo(() => data?.period_grids ?? {}, [data?.period_grids]);
  const classToYearGroup = React.useMemo(
    () => data?.class_to_year_group ?? {},
    [data?.class_to_year_group],
  );

  const weekdays = React.useMemo(() => {
    // Prefer weekdays from the period grid if available so break/lunch-only days still show
    const set = new Set<number>();
    for (const grid of Object.values(periodGrids)) {
      for (const s of grid) set.add(s.weekday);
    }
    if (set.size === 0) {
      for (const e of entries) set.add(e.weekday);
    }
    const list = [...set];
    if (list.length === 0) return [1, 2, 3, 4, 5];
    return list.sort((a, b) => a - b);
  }, [entries, periodGrids]);

  const activeClassIdResolved = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (!map.has(e.class_id)) map.set(e.class_id, e.class_name);
    }
    const list = [...map.keys()].sort();
    return activeClassId || list[0] || '';
  }, [activeClassId, entries]);

  // Period slots for the active class's year group. Fall back to synthesising
  // slot metadata from entries if the API response (or config snapshot) doesn't
  // carry a period grid for this class's year group.
  const activePeriodSlots: PeriodSlot[] = React.useMemo(() => {
    if (!activeClassIdResolved) return [];
    const ygId = classToYearGroup[activeClassIdResolved];
    const grid = ygId ? periodGrids[ygId] : undefined;
    if (grid && grid.length > 0) return grid;
    // Fallback: synthesise teaching slots from entries so the grid renders
    const synth = new Map<string, PeriodSlot>();
    for (const e of entries) {
      if (e.class_id !== activeClassIdResolved) continue;
      const key = `${e.weekday}:${e.period_order}`;
      if (!synth.has(key)) {
        synth.set(key, {
          weekday: e.weekday,
          period_order: e.period_order,
          start_time: e.start_time,
          end_time: e.end_time,
          period_type: 'teaching',
          supervision_mode: null,
        });
      }
    }
    return [...synth.values()];
  }, [activeClassIdResolved, entries, classToYearGroup, periodGrids]);

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

  const isProposed = data.status === 'completed';
  const readOnly = !isProposed;
  const report = data.constraint_report;

  const activeClass = classList.find((c) => c.id === activeClassId) ?? classList[0];
  const activeEntries = activeClass
    ? data.entries.filter((e) => e.class_id === activeClass.id)
    : [];

  return (
    <div className="space-y-6">
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
        <div className="lg:col-span-3 space-y-4">
          {/* Class tabs */}
          {classList.length > 0 && (
            <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
              {classList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveClassId(c.id)}
                  className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeClassId === c.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {activeClass ? (
            <ClassTimetable
              classId={activeClass.id}
              className={activeClass.name}
              entries={activeEntries}
              weekdays={weekdays}
              periodSlots={activePeriodSlots}
              readOnly={readOnly}
              dragPayload={dragPayload}
              hoverCell={hoverCell}
              onPinToggle={handlePinToggle}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
            />
          ) : (
            <div className="rounded-xl border border-border bg-surface py-16 text-center">
              <p className="text-sm text-text-tertiary">No classes in this run</p>
            </div>
          )}
        </div>

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
              <div className="w-3 h-3 rounded-sm border border-violet-200 bg-violet-50 dark:bg-violet-900/20 shrink-0" />
              <span>
                {t('pinEntry')}
                {t('solid')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className="w-3 h-3 rounded-sm border border-dashed border-sky-200 bg-sky-50 dark:bg-sky-900/15 shrink-0" />
              <span>{t('autoGeneratedDashed')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className="w-3 h-3 rounded-sm border border-dashed border-rose-200 bg-rose-50 dark:bg-rose-900/15 shrink-0" />
              <span>Unplaced (solver could not fit)</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className="w-3 h-3 rounded-sm border border-dashed border-slate-200 bg-slate-50 dark:bg-slate-800/20 shrink-0" />
              <span>Break</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className="w-3 h-3 rounded-sm border border-dashed border-emerald-200 bg-emerald-50 dark:bg-emerald-900/15 shrink-0" />
              <span>Lunch</span>
            </div>
          </div>
        </div>
      </div>

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
