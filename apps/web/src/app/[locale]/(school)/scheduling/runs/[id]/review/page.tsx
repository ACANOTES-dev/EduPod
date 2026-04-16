/* eslint-disable max-lines -- scheduling review page: timetable grid + diagnostics panel */
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
type SolutionEffort = 'quick' | 'medium' | 'long';
type FeasibilityVerdict = 'feasible' | 'infeasible' | 'tight';

interface Solution {
  id: string;
  headline: string;
  detail: string;
  effort: SolutionEffort;
  impact?: {
    would_unblock_periods: number;
    would_unblock_percentage: number;
    confidence: 'high' | 'medium' | 'low';
  };
  link?: { href: string; label: string };
  // Legacy compat
  label?: string;
  href?: string;
}

interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  category: string;
  headline?: string;
  title?: string;
  detail?: string;
  description?: string;
  solutions: Solution[];
  affected: {
    subject?: { id: string; name: string };
    year_group?: { id: string; name: string };
    classes?: Array<{ id: string; name: string }>;
    teachers?: Array<{ id: string; name: string }>;
    rooms?: Array<{ id: string; name: string }>;
  };
  quantified_impact?: {
    blocked_periods: number;
    blocked_percentage: number;
  };
  metrics?: Record<string, number>;
}

interface WhyNot100 {
  structural: number;
  pin_conflict: number;
  budget_bound: number;
  total_unplaced: number;
}

interface DiagnosticsResult {
  summary: {
    total_unassigned_periods: number;
    total_unassigned_gaps: number;
    critical_issues: number;
    high_issues: number;
    medium_issues: number;
    can_proceed: boolean;
    feasibility_verdict?: FeasibilityVerdict | null;
    structural_blockers?: number;
    budget_bound?: number;
    pin_conflict?: number;
  };
  diagnostics: Diagnostic[];
  feasibility?: {
    verdict: FeasibilityVerdict;
    ceiling: {
      total_demand_periods: number;
      total_qualified_teacher_periods: number;
      slack_periods: number;
    };
  };
  why_not_100?: WhyNot100;
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

// ─── Placement summary (top-of-page headline numbers) ────────────────────────
//
// Two metrics were previously conflated in the sidebar:
//   - Placement = "how many curriculum periods did the solver fit?"
//   - Preference satisfaction = "of the fitted periods, how many honour
//     soft preferences like teacher gaps, room consistency, etc.?"
//
// A run could show "100 % preferences" while still being 46 periods short of
// demand, which reads as "everything is fine" at a glance. The banner below
// pulls those apart: demand / placed / remaining are the headline trio,
// preference satisfaction is a separate smaller pill so it's no longer
// mistaken for completion.

function PlacementSummaryBanner({
  placed,
  unplaced,
  hardViolations,
}: {
  placed: number;
  unplaced: number;
  hardViolations: number;
}) {
  const t = useTranslations('scheduling.auto.placementSummary');
  const total = placed + unplaced;
  const ratio = total > 0 ? placed / total : 0;
  const tier: 'complete' | 'partial' | 'incomplete' =
    total <= 0
      ? 'incomplete'
      : placed >= total
        ? 'complete'
        : ratio >= 0.5
          ? 'partial'
          : 'incomplete';

  const theme = {
    complete: {
      border: 'border-emerald-500/40',
      bg: 'bg-emerald-500/5',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      title: t('tier.complete.title'),
      subtitle: t('tier.complete.subtitle'),
    },
    partial: {
      border: 'border-amber-500/40',
      bg: 'bg-amber-500/5',
      icon: AlertTriangle,
      iconColor: 'text-amber-600',
      title: t('tier.partial.title'),
      subtitle: t('tier.partial.subtitle'),
    },
    incomplete: {
      border: 'border-red-500/40',
      bg: 'bg-red-500/5',
      icon: AlertCircle,
      iconColor: 'text-red-600',
      title: t('tier.incomplete.title'),
      subtitle: t('tier.incomplete.subtitle'),
    },
  }[tier];

  const Icon = theme.icon;
  const pct = total > 0 ? Math.round(ratio * 100) : 0;

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${theme.border} ${theme.bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${theme.iconColor}`} />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{theme.title}</h2>
          <p className="mt-0.5 text-sm text-text-secondary">{theme.subtitle}</p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-2xl font-semibold tabular-nums text-text-primary">{pct}%</p>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">{t('placedPct')}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-surface p-3">
        <SummaryStat
          label={t('totalDemand')}
          value={total}
          suffix={t('periodsPerWeek')}
          tone="text-text-primary"
        />
        <SummaryStat
          label={t('placed')}
          value={placed}
          suffix={t('periodsPerWeek')}
          tone="text-emerald-600"
        />
        <SummaryStat
          label={t('remaining')}
          value={unplaced}
          suffix={t('periodsPerWeek')}
          tone={unplaced > 0 ? 'text-red-600' : 'text-text-primary'}
        />
      </div>

      {/* The banner deliberately omits the soft-preference score to avoid
          anyone reading "preference score: 100%" as "timetable is 100%
          complete". Preference satisfaction remains visible, clearly
          labelled, in the Constraint Report sidebar card below. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              hardViolations === 0 ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          {hardViolations === 0
            ? t('hardAllSatisfied')
            : t('hardViolations', { count: hardViolations })}
        </span>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix: string;
  tone: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="text-[11px] text-text-tertiary">{suffix}</p>
    </div>
  );
}

// ─── Back-to-timetable floating button ────────────────────────────────────────
//
// Appears at bottom-end once the user has scrolled past the timetable grid,
// so they can jump back up from the diagnostics analysis without a long
// manual scroll. Uses IntersectionObserver on the ref so it only shows
// when the grid is off-screen.

function BackToTimetableButton({ targetRef }: { targetRef: React.RefObject<HTMLDivElement> }) {
  const t = useTranslations('scheduling.auto');
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    // The school shell scrolls the `<main>` element, not the window — so a
    // plain IntersectionObserver tied to the viewport sees the timetable
    // as permanently visible and the button never appears. Walk up to the
    // first scrollable ancestor and watch its scroll position against
    // the timetable's bottom.
    const scroller = (() => {
      let node: HTMLElement | null = el.parentElement;
      while (node) {
        const overflowY = window.getComputedStyle(node).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return node;
        node = node.parentElement;
      }
      return null;
    })();
    if (!scroller) return;
    const check = () => {
      const rect = el.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      // Show once the grid has fully scrolled above the top of the
      // scroll viewport (bottom < top).
      setShow(rect.bottom < scrollerRect.top + 40);
    };
    scroller.addEventListener('scroll', check, { passive: true });
    check();
    return () => scroller.removeEventListener('scroll', check);
  }, [targetRef]);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      aria-label={t('backToTimetable')}
      className="pointer-events-auto fixed bottom-4 end-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-text-primary shadow-lg transition-colors hover:bg-surface-secondary animate-in fade-in-0 slide-in-from-bottom-2"
    >
      <ChevronUp className="h-3.5 w-3.5" />
      {t('backToTimetable')}
    </button>
  );
}

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
              <h4 className="text-sm font-semibold text-text-primary leading-tight">
                {d.headline || d.title}
              </h4>
              <Badge variant={theme.badge} className="text-[10px] uppercase tracking-wide">
                {theme.label}
              </Badge>
              {d.quantified_impact && d.quantified_impact.blocked_periods > 0 && (
                <span className="text-[10px] font-mono text-text-tertiary">
                  {d.quantified_impact.blocked_periods} period(s)
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
              {d.detail || d.description}
            </p>
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
                          <p className="text-xs font-medium text-text-primary">
                            {s.headline || s.label}
                          </p>
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
                        {(s.link?.href || s.href) && (
                          <a
                            href={`/${locale}${s.link?.href || s.href}`}
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

// ─── Verdict banner (§G) ──────────────────────────────────────────────────────

function VerdictBanner({ result }: { result: DiagnosticsResult }) {
  const verdict = result.summary.feasibility_verdict;
  const total = result.summary.total_unassigned_periods;

  if (total === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/60 dark:bg-emerald-900/10 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            100% placed
          </p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/70">
            Every required period has a valid slot. The solver confirmed no better placement exists.
          </p>
        </div>
      </div>
    );
  }

  if (verdict === 'infeasible') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-700/40 bg-red-50/60 dark:bg-red-900/10 px-4 py-3">
        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">
            {total} period(s) cannot be placed
          </p>
          <p className="text-xs text-red-700/80 dark:text-red-400/70">
            Structural issues prevent scheduling. Fix the items below, then re-run.
          </p>
        </div>
      </div>
    );
  }

  if (verdict === 'tight') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Tight fit — {total} period(s) at risk
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/70">
            The solver placed most periods, but some subjects are close to capacity.
          </p>
        </div>
      </div>
    );
  }

  // Default: unassigned but no feasibility verdict (e.g., V2 legacy runs)
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          {total} period(s) unplaced
        </p>
        <p className="text-xs text-amber-700/80 dark:text-amber-400/70">
          See diagnostics below for recommended fixes.
        </p>
      </div>
    </div>
  );
}

// ─── Top-5 solutions card (§G) ──────────────────────────────────────────────

function TopSolutionsCard({ diagnostics }: { diagnostics: Diagnostic[]; locale: string }) {
  // Collect all solutions across diagnostics, ranked by impact
  const allSolutions: Array<Solution & { parentCategory: string }> = [];
  for (const d of diagnostics) {
    for (const s of d.solutions) {
      allSolutions.push({ ...s, parentCategory: d.category });
    }
  }

  // Sort by would_unblock_periods desc, then effort asc
  const effortOrder: Record<string, number> = { quick: 0, medium: 1, long: 2 };
  allSolutions.sort((a, b) => {
    const impactA = a.impact?.would_unblock_periods ?? 0;
    const impactB = b.impact?.would_unblock_periods ?? 0;
    if (impactB !== impactA) return impactB - impactA;
    return (effortOrder[a.effort] ?? 1) - (effortOrder[b.effort] ?? 1);
  });

  const top5 = allSolutions.slice(0, 5);
  if (top5.length === 0) return null;

  return (
    <div className="rounded-xl border border-brand/20 bg-brand/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-brand" />
        <h4 className="text-sm font-semibold text-text-primary">Top fixes</h4>
      </div>
      <div className="space-y-2">
        {top5.map((s, i) => {
          const effort = EFFORT_THEME[s.effort];
          const EffortIcon = effort.icon;
          const displayLabel = s.headline || s.label || '';
          const displayHref = s.link?.href || s.href;
          return (
            <div
              key={s.id ?? i}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <div className="flex items-center justify-center rounded-full bg-brand/10 text-brand h-7 w-7 shrink-0 text-xs font-bold">
                {s.impact?.would_unblock_periods ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary truncate">
                    {displayLabel}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${effort.className}`}
                  >
                    <EffortIcon className="h-2.5 w-2.5" />
                    {effort.label}
                  </span>
                </div>
                <p className="text-[11px] text-text-tertiary mt-0.5 line-clamp-2">{s.detail}</p>
                {displayHref && (
                  <a
                    href={displayHref}
                    className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline mt-1"
                  >
                    Fix it <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Why not 100% explainer (§G) ────────────────────────────────────────────

function WhyNot100Explainer({ whyNot }: { whyNot: WhyNot100 }) {
  if (whyNot.total_unplaced === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-secondary/40 p-4 space-y-3">
      <h4 className="text-sm font-semibold text-text-primary">Why not 100%?</h4>
      <p className="text-xs text-text-secondary">
        Of your {whyNot.total_unplaced} unplaced period(s):
      </p>
      <div className="space-y-2">
        {whyNot.structural > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-text-primary font-medium">{whyNot.structural}</span>
            <span className="text-text-secondary">
              blocked by data structure (add or change config)
            </span>
          </div>
        )}
        {whyNot.pin_conflict > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            <span className="text-text-primary font-medium">{whyNot.pin_conflict}</span>
            <span className="text-text-secondary">blocked by conflicting pins (review pins)</span>
          </div>
        )}
        {whyNot.budget_bound > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
            <span className="text-text-primary font-medium">{whyNot.budget_bound}</span>
            <span className="text-text-secondary">
              within solver budget but not yet placed (extend budget or retry)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main DiagnosticsPanel ────────────────────────────────────────────────────

function DiagnosticsPanel({
  result,
  locale,
  fullWidth = false,
}: {
  result: DiagnosticsResult;
  locale: string;
  // When rendered below the timetable grid (not in the 1/4-width sidebar),
  // `fullWidth` lays the severity cards out in a 2-column responsive grid
  // so the reading length is compact and the panel doesn't push the rest
  // of the page for pages of scroll.
  fullWidth?: boolean;
}) {
  const [mediumExpanded, setMediumExpanded] = React.useState(false);

  const critical = result.diagnostics.filter((d) => d.severity === 'critical');
  const high = result.diagnostics.filter((d) => d.severity === 'high');
  const medium = result.diagnostics.filter((d) => d.severity === 'medium');

  const { total_unassigned_periods, total_unassigned_gaps, critical_issues, high_issues } =
    result.summary;
  const listGridClass = fullWidth ? 'grid grid-cols-1 lg:grid-cols-2 gap-2' : 'space-y-2';

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
        {/* Verdict banner */}
        <VerdictBanner result={result} />

        {/* Top-5 solutions */}
        {result.diagnostics.length > 0 && (
          <TopSolutionsCard diagnostics={result.diagnostics} locale={locale} />
        )}

        {result.diagnostics.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>No issues detected — this timetable is ready to apply.</span>
          </div>
        ) : (
          <>
            {critical.length > 0 && (
              <section className={listGridClass}>
                {critical.map((d) => (
                  <DiagnosticCard key={d.id} d={d} locale={locale} />
                ))}
              </section>
            )}

            {high.length > 0 && (
              <section className={listGridClass}>
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
                  <div className={listGridClass}>
                    {medium.map((d) => (
                      <DiagnosticCard key={d.id} d={d} locale={locale} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {/* Why not 100%? */}
        {result.why_not_100 && <WhyNot100Explainer whyNot={result.why_not_100} />}
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
  // Picks the most common (start, end) pair across the week so the row
  // header time matches what the majority of cells in that row display.
  const rowLabelByPeriod = React.useMemo(() => {
    const out = new Map<number, { label: string; start: string; end: string; isBreak: boolean }>();
    for (const po of periodOrders) {
      const slots = periodSlots.filter((s) => s.period_order === po);
      if (slots.length === 0) continue;
      const counts = new Map<string, { slot: PeriodSlot; count: number }>();
      for (const s of slots) {
        const key = `${s.start_time}|${s.end_time}`;
        const existing = counts.get(key);
        if (existing) existing.count += 1;
        else counts.set(key, { slot: s, count: 1 });
      }
      // Most common time wins; ties broken by picking the earliest weekday
      let best: { slot: PeriodSlot; count: number } | null = null;
      for (const candidate of counts.values()) {
        if (!best || candidate.count > best.count) best = candidate;
      }
      const rep = best?.slot ?? slots[0];
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
                  <td className="px-3 py-2 text-xs font-mono text-text-tertiary align-top">
                    <div>{rowMeta?.label ?? `P${period}`}</div>
                    {rowMeta?.start && rowMeta?.end && (
                      <div className="font-mono text-[10px] text-text-tertiary/80 mt-0.5 leading-tight">
                        <div>{rowMeta.start}</div>
                        <div>{rowMeta.end}</div>
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
                                ? 'border-sky-200 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-900/15 text-sky-700 dark:text-sky-300'
                                : 'border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/15 text-amber-800 dark:text-amber-300'
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
                                : 'bg-emerald-50 dark:bg-emerald-900/15 border border-dashed border-emerald-200 dark:border-emerald-700/60'
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
                            {(() => {
                              const start = slot?.start_time || entry.start_time;
                              const end = slot?.end_time || entry.end_time;
                              if (!start && !end) return null;
                              return (
                                <div className="font-mono text-[10px] text-text-tertiary mt-0.5 truncate">
                                  {start}
                                  {start && end ? '–' : ''}
                                  {end}
                                </div>
                              );
                            })()}
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

  // Ref to the timetable grid — BackToTimetableButton scrolls to it when
  // the user has dropped well into the diagnostics section below. scroll-mt
  // on the grid accounts for the fixed morph bar + sub-strip height so the
  // target lands neatly below the nav instead of being hidden behind it.
  const timetableRef = React.useRef<HTMLDivElement | null>(null);

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

      <PlacementSummaryBanner
        placed={data.entries.length}
        unplaced={report?.unassigned_count ?? diagnostics?.summary.total_unassigned_periods ?? 0}
        hardViolations={report?.hard_violations ?? 0}
      />

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

      <div ref={timetableRef} className="grid grid-cols-1 lg:grid-cols-4 gap-6 scroll-mt-24">
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
              <div className="w-3 h-3 rounded-sm border border-dashed border-emerald-200 bg-emerald-50 dark:bg-emerald-900/15 shrink-0" />
              <span>{t('autoGeneratedDashed')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className="w-3 h-3 rounded-sm border border-dashed border-rose-200 bg-rose-50 dark:bg-rose-900/15 shrink-0" />
              <span>Unplaced (solver could not fit)</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className="w-3 h-3 rounded-sm border border-dashed border-amber-200 bg-amber-50 dark:bg-amber-900/15 shrink-0" />
              <span>Break</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className="w-3 h-3 rounded-sm border border-dashed border-sky-200 bg-sky-50 dark:bg-sky-900/15 shrink-0" />
              <span>Lunch</span>
            </div>
          </div>
        </div>
      </div>

      {/* Timetable Analysis — moved out of the right sidebar (where it made
          the page scroll for ever) into a full-width section below the
          grid. Wider layout lets each diagnostic card breathe and the Top
          Fixes render horizontally. The BackToTimetableButton floats while
          the user is reading here so they can jump straight back up. */}
      {diagnostics && diagnostics.diagnostics.length > 0 && (
        <section className="space-y-4">
          <DiagnosticsPanel result={diagnostics} locale={locale} fullWidth />
        </section>
      )}

      <BackToTimetableButton targetRef={timetableRef} />

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
