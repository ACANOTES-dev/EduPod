/* eslint-disable max-lines -- Auto-Scheduler page: prereqs + feasibility + run history + confirm dialog live together by design */
'use client';

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Info,
  Loader2,
  Pin,
  RefreshCw,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { useSolverProgress } from '@/providers/solver-progress-provider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
  status?: string;
}

interface PrerequisiteCheck {
  key: string;
  passed: boolean;
  message: string;
  fix_href?: string;
}

interface PrerequisitesResponse {
  checks: PrerequisiteCheck[];
  ready: boolean;
}

// ─── Feasibility preview types ────────────────────────────────────────────────
// Mirror the backend `FeasibilityReport` shape. Each blocker ships with a
// `solutions` array of concrete actions the admin can take to close the gap,
// populated by the backend's buildSolutions() helper.

type FeasibilityVerdict = 'feasible' | 'infeasible' | 'tight';

interface FeasibilitySolution {
  id: string;
  headline: string;
  detail: string;
  effort: 'quick' | 'medium' | 'long';
  impact: {
    would_unblock_periods: number;
    would_unblock_percentage: number;
    side_effects: string[];
    confidence: 'high' | 'medium' | 'low';
  };
  link: { href: string; label: string };
}

interface FeasibilityBlocker {
  id: string;
  check: string;
  severity: 'critical' | 'high';
  headline: string;
  detail: string;
  quantified_impact: { blocked_periods: number; blocked_percentage: number };
  solutions?: FeasibilitySolution[];
}

interface FeasibilityReport {
  verdict: FeasibilityVerdict;
  checks: Array<{ code: string; passed: boolean }>;
  ceiling: {
    total_demand_periods: number;
    total_qualified_teacher_periods: number;
    slack_periods: number;
  };
  diagnosed_blockers: FeasibilityBlocker[];
}

interface SchedulingRun {
  id: string;
  status: string;
  mode: string;
  created_at: string;
  updated_at: string;
  entries_generated?: number | null;
  entries_pinned?: number | null;
  entries_unassigned?: number | null;
  solver_duration_ms?: number | null;
  failure_reason?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoSchedulerPage() {
  const t = useTranslations('scheduling.auto');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const solverProgress = useSolverProgress();

  const [years, setYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState<string>('');
  const [prerequisites, setPrerequisites] = React.useState<PrerequisitesResponse | null>(null);
  const [prereqLoading, setPrereqLoading] = React.useState(false);
  const [feasibility, setFeasibility] = React.useState<FeasibilityReport | null>(null);
  const [feasibilityLoading, setFeasibilityLoading] = React.useState(false);
  const [feasibilityExpanded, setFeasibilityExpanded] = React.useState(false);
  const [runs, setRuns] = React.useState<SchedulingRun[]>([]);
  const [runsLoading, setRunsLoading] = React.useState(false);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Load academic years on mount; auto-select the active one so the user
  // doesn't have to manually pick it for every visit.
  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years')
      .then((res) => {
        const list = res.data ?? [];
        setYears(list);
        setSelectedYear((current) => {
          if (current) return current;
          const active = list.find((y) => y.status === 'active');
          return active?.id ?? current;
        });
      })
      .catch((err) => {
        console.error('[SchedulingAutoPage]', err);
      });
  }, []);

  // Load prerequisites when year changes
  React.useEffect(() => {
    if (!selectedYear) {
      setPrerequisites(null);
      return;
    }
    setPrereqLoading(true);
    // NestJS's global response interceptor wraps all responses in `{ data }`.
    // `apiClient` returns the raw JSON, so the type here must include the
    // envelope and the setter must unwrap it — matching the pattern used for
    // `academic-years` above.
    apiClient<{ data: PrerequisitesResponse }>(
      `/api/v1/scheduling-runs/prerequisites?academic_year_id=${selectedYear}`,
    )
      .then((res) => setPrerequisites(res.data))
      .catch((err) => {
        console.error('[SchedulingAutoPage]', err);
        return setPrerequisites(null);
      })
      .finally(() => setPrereqLoading(false));
  }, [selectedYear]);

  // Load the mathematical-feasibility preview. Extracted into a callback so
  // the user can manually refresh after editing requirements / availability /
  // teachers / pins elsewhere — the endpoint itself is live (no caching), but
  // the page only auto-refetches when the academic year changes, so without
  // a manual trigger the card can appear stale relative to the current DB.
  const loadFeasibility = React.useCallback((yearId: string) => {
    if (!yearId) {
      setFeasibility(null);
      return;
    }
    setFeasibilityLoading(true);
    apiClient<{ data: FeasibilityReport }>(
      `/api/v1/scheduling-runs/feasibility?academic_year_id=${yearId}`,
    )
      .then((res) => setFeasibility(res.data))
      .catch((err) => {
        console.error('[SchedulingAutoPage.feasibility]', err);
        setFeasibility(null);
      })
      .finally(() => setFeasibilityLoading(false));
  }, []);

  React.useEffect(() => {
    loadFeasibility(selectedYear);
  }, [selectedYear, loadFeasibility]);

  // Load run history. Extracted into a callback so the Refresh control in
  // the feasibility card can re-trigger it — previously Refresh only
  // re-ran feasibility, so after a crash the freshly-failed run didn't
  // appear in Run History until a full page reload (observed 2026-04-17
  // NHQS run 5a38a832). The effect-wrapping `useEffect` handles the
  // year-change case while keeping a single source of truth for the
  // fetch logic.
  const loadRuns = React.useCallback((yearId: string) => {
    if (!yearId) {
      setRuns([]);
      return;
    }
    setRunsLoading(true);
    apiClient<{ data: SchedulingRun[] }>(`/api/v1/scheduling-runs?academic_year_id=${yearId}`)
      .then((res) => setRuns(res.data ?? []))
      .catch((err) => {
        console.error('[SchedulingAutoPage]', err);
        setRuns([]);
      })
      .finally(() => setRunsLoading(false));
  }, []);

  React.useEffect(() => {
    loadRuns(selectedYear);
  }, [selectedYear, loadRuns]);

  // When a tracked run transitions into a terminal state (solver finishes,
  // crashes, is cancelled), pull the fresh Run History row so the UI shows
  // it without requiring the operator to reload the page. ``isTerminal``
  // flips on the provider once it sees the first terminal status from the
  // progress endpoint.
  const prevTerminalRef = React.useRef<boolean>(solverProgress.isTerminal);
  React.useEffect(() => {
    if (solverProgress.isTerminal && !prevTerminalRef.current) {
      loadRuns(selectedYear);
    }
    prevTerminalRef.current = solverProgress.isTerminal;
  }, [solverProgress.isTerminal, selectedYear, loadRuns]);

  // Progress tracking lives in SolverProgressProvider + the bottom-end
  // SolverProgressWidget — a local center modal would block navigation and
  // silently cancel the solve on accidental dismissal (both real bugs we
  // hit pre-Stage-9.5.2 with 3600 s budgets).

  async function handleGenerate() {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/scheduling-runs', {
        method: 'POST',
        body: JSON.stringify({ academic_year_id: selectedYear }),
      });
      solverProgress.startTracking(res.data.id);
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'error' in err
          ? String((err as { error: { message?: string } }).error?.message ?? err)
          : 'Failed to start solver';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const allPassed = prerequisites?.ready ?? false;
  const modeLabel = t('modeAuto');

  // Crash-retry guard: if the most recent run for this year terminated
  // with a SOLVER_CRASH the backend banner in the progress widget warns
  // "don't retry with the same inputs until we've investigated" — but the
  // Generate button was still enabled and the confirm dialog said nothing
  // about the prior crash. Users could burn another 60 minutes on the
  // same inputs. We surface the warning directly in the confirm dialog
  // and force the user to explicitly acknowledge it. We don't disable
  // Generate outright because sometimes the operator has already fixed
  // the root cause (e.g. reduced ``max_solver_duration_seconds``) and
  // needs to retry right now.
  const lastRun: SchedulingRun | null = runs[0] ?? null;
  const lastRunCrashed = Boolean(
    lastRun &&
    lastRun.status === 'failed' &&
    typeof lastRun.failure_reason === 'string' &&
    lastRun.failure_reason.startsWith('SOLVER_CRASH'),
  );
  const [crashAcknowledged, setCrashAcknowledged] = React.useState(false);
  // Reset the acknowledgement whenever the dialog closes or the last-run
  // status flips, so it can't be smuggled across dialog re-opens or year
  // changes.
  React.useEffect(() => {
    if (!confirmOpen) setCrashAcknowledged(false);
  }, [confirmOpen]);
  React.useEffect(() => {
    setCrashAcknowledged(false);
  }, [lastRun?.id, lastRunCrashed]);

  // ─── Tooltip copy ──────────────────────────────────────────────────────────
  // Each prerequisite check has a short "what" explanation and an actionable
  // "how to fix" line. Keys returned by the backend are enumerated in
  // `scheduling-prerequisites.service.ts`.
  const KNOWN_CHECK_KEYS = new Set([
    'period_grid_exists',
    'all_classes_configured',
    'all_classes_have_teachers',
    'every_class_subject_has_teacher',
    'no_pinned_conflicts',
    'no_pinned_availability_violations',
  ]);

  function getCheckCopy(checkKey: string): { what: string; fix: string } {
    const key = KNOWN_CHECK_KEYS.has(checkKey) ? checkKey : 'unknown_check';
    return {
      what: t(`checkTooltip.${key}.what`),
      fix: t(`checkTooltip.${key}.fix`),
    };
  }

  function formatDuration(run: SchedulingRun): string {
    if (run.solver_duration_ms != null) {
      const secs = Math.round(run.solver_duration_ms / 1000);
      return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`;
    }
    // Fall back to wall time between created + updated if solver_duration_ms
    // was not written (e.g. the run never finished).
    const ms = new Date(run.updated_at).getTime() - new Date(run.created_at).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    const secs = Math.round(ms / 1000);
    return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`;
  }

  // Tier the badge by placement ratio rather than by raw DB status. A run
  // with 386 / 432 placed is useful to the admin even if it isn't "100 %";
  // the old red "failed" badge made partial timetables feel like broken
  // software when they're really just a data-constraint ceiling.
  function runPlacementTier(
    run: SchedulingRun,
  ): 'complete' | 'partial' | 'incomplete' | 'pending' | 'crashed' {
    if (run.status === 'queued' || run.status === 'running') return 'pending';
    if (run.status === 'discarded') return 'incomplete';
    const placed = run.entries_generated ?? 0;
    const unplaced = run.entries_unassigned ?? 0;
    const total = placed + unplaced;
    // Backend used to mark runs with any unplaced slots as 'failed'; we
    // now reserve 'failed' for crashes (no placements at all). A 'failed'
    // status with placed > 0 is a legacy run from before the Stage-10
    // classification rewrite.
    if (run.status === 'failed' && total === 0) return 'crashed';
    if (total <= 0) return 'incomplete';
    if (placed >= total) return 'complete';
    return placed / total >= 0.5 ? 'partial' : 'incomplete';
  }

  function badgeVariantForTier(
    tier: ReturnType<typeof runPlacementTier>,
  ): 'default' | 'secondary' | 'danger' | 'success' | 'info' {
    switch (tier) {
      case 'complete':
        return 'success';
      case 'partial':
        return 'info';
      case 'incomplete':
      case 'crashed':
        return 'danger';
      case 'pending':
      default:
        return 'secondary';
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('autoScheduler')}
        description={t('prerequisites')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('selectYear')} />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Feasibility Preview Card — mathematical analysis of whether a
          100 % placement is achievable with the current data. Does NOT
          block generation; warns the user when the answer is "no" so they
          don't wait an hour for a solve that was never going to hit 100 %.
          Refresh also refetches Run History so a just-completed (or just-
          crashed) solve appears without reloading the page. */}
      {selectedYear && (
        <FeasibilityPreviewCard
          report={feasibility}
          loading={feasibilityLoading}
          expanded={feasibilityExpanded}
          onToggleExpanded={() => setFeasibilityExpanded((v) => !v)}
          onRefresh={() => {
            loadFeasibility(selectedYear);
            loadRuns(selectedYear);
          }}
          t={t}
        />
      )}

      {/* Prerequisites Card */}
      {selectedYear && (
        <div className="rounded-xl border border-border bg-surface p-6 space-y-3">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            {t('prerequisites')}
          </h2>

          {prereqLoading ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('checkingPrerequisites')}</span>
            </div>
          ) : prerequisites ? (
            <TooltipProvider delayDuration={150}>
              {(prerequisites.checks ?? []).map((check) => {
                const copy = getCheckCopy(check.key);
                return (
                  <div key={check.key} className="flex items-start gap-3">
                    {check.passed ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 flex items-start gap-1.5">
                      <span className="text-sm text-text-primary">{check.message}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={t('whatIsThisCheck')}
                            className="mt-0.5 text-text-tertiary hover:text-text-secondary transition-colors cursor-help shrink-0"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs space-y-2 py-2 text-start">
                          <p className="text-xs leading-relaxed">
                            <span className="font-semibold">{t('whatItMeans')}:</span> {copy.what}
                          </p>
                          {!check.passed && (
                            <p className="text-xs leading-relaxed">
                              <span className="font-semibold">{t('howToFix')}:</span> {copy.fix}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {!check.passed && check.fix_href && (
                      <a
                        href={check.fix_href}
                        className="flex items-center gap-1 text-xs text-brand hover:underline shrink-0"
                      >
                        {t('fix')}
                        <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                      </a>
                    )}
                    <Badge
                      variant={check.passed ? 'default' : 'danger'}
                      className="text-xs shrink-0"
                    >
                      {check.passed ? 'Pass' : 'Fail'}
                    </Badge>
                  </div>
                );
              })}

              <div className="pt-3 border-t border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5">
                  <Pin className="h-3.5 w-3.5 text-text-tertiary" />
                  <span className="text-sm text-text-secondary">{modeLabel}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('whatArePinnedEntries')}
                        className="text-text-tertiary hover:text-text-secondary transition-colors cursor-help"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm py-2 text-start">
                      <p className="text-xs leading-relaxed">{t('pinnedEntriesExplainer')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!allPassed || submitting}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  {t('generateTimetable')}
                </Button>
              </div>

              {allPassed && (
                <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('allChecksPassed')}
                </div>
              )}
            </TooltipProvider>
          ) : (
            <p className="text-sm text-text-secondary">{t('selectAnAcademicYearTo')}</p>
          )}
        </div>
      )}

      {/* Run History */}
      <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">{t('runHistory')}</h2>

        {runsLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tCommon('loading')}
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('noRuns')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">
                    {t('runStatus')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">
                    {t('runMode')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">
                    {t('runCreated')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">
                    {t('runDuration')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">
                    {t('entriesGenerated')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">
                    {tCommon('actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const tier = runPlacementTier(run);
                  const placed = run.entries_generated ?? 0;
                  const unplaced = run.entries_unassigned ?? 0;
                  const total = placed + unplaced;
                  const canReview =
                    tier === 'complete' ||
                    tier === 'partial' ||
                    (tier === 'incomplete' && total > 0);
                  return (
                    <tr key={run.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2">
                        <Badge variant={badgeVariantForTier(tier)}>{t(`runTier.${tier}`)}</Badge>
                      </td>
                      <td className="px-3 py-2 text-text-secondary capitalize">{run.mode}</td>
                      <td className="px-3 py-2 text-text-secondary">
                        {new Date(run.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-text-secondary font-mono text-xs">
                        {formatDuration(run)}
                      </td>
                      <td className="px-3 py-2 text-text-secondary tabular-nums">
                        {total > 0 ? `${placed} / ${total}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {canReview && (
                          <button
                            type="button"
                            onClick={() => router.push(`/scheduling/runs/${run.id}/review`)}
                            className="text-xs text-brand hover:underline flex items-center gap-1"
                          >
                            {t('viewReview')}
                            <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('generateTimetable')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('confirmGenerate')}</p>
          <p className="text-sm text-text-tertiary mt-1">{modeLabel}</p>
          {lastRunCrashed && (
            <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                <div className="flex-1 space-y-2">
                  <p className="font-medium text-text-primary">
                    {t('lastRunCrashedWarning.title')}
                  </p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {t('lastRunCrashedWarning.detail')}
                  </p>
                  <label className="flex items-start gap-2 text-xs text-text-primary cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={crashAcknowledged}
                      onChange={(e) => setCrashAcknowledged(e.target.checked)}
                    />
                    <span>{t('lastRunCrashedWarning.acknowledge')}</span>
                  </label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('cancelSolve')}
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={submitting || (lastRunCrashed && !crashAcknowledged)}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('generateTimetable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress is rendered by <SolverProgressWidget /> in the school
          layout — it persists across navigation and stays out of the user's
          way until the solve is done. */}
    </div>
  );
}

// ─── Feasibility Preview ──────────────────────────────────────────────────────

function FeasibilityPreviewCard({
  report,
  loading,
  expanded,
  onToggleExpanded,
  onRefresh,
  t,
}: {
  report: FeasibilityReport | null;
  loading: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRefresh: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (loading && !report) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('feasibility.checking')}</span>
        </div>
      </div>
    );
  }
  if (!report) return null;

  const { verdict, ceiling, diagnosed_blockers: blockers } = report;
  const tone =
    verdict === 'feasible'
      ? { border: 'border-emerald-500/40', bg: 'bg-emerald-500/5', icon: 'text-emerald-600' }
      : verdict === 'tight'
        ? { border: 'border-amber-500/40', bg: 'bg-amber-500/5', icon: 'text-amber-600' }
        : { border: 'border-red-500/40', bg: 'bg-red-500/5', icon: 'text-red-600' };

  const Icon =
    verdict === 'feasible' ? CheckCircle2 : verdict === 'tight' ? AlertTriangleIcon : XCircle;

  return (
    <div className={`rounded-xl border p-6 space-y-3 ${tone.border} ${tone.bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${tone.icon}`} />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-text-primary">
            {t(`feasibility.verdict.${verdict}.title`)}
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {t(`feasibility.verdict.${verdict}.subtitle`)}
          </p>
        </div>
        {/* Refresh lets the admin recompute after editing requirements /
            availability / teachers / pins elsewhere. The endpoint is live
            but the page only auto-refetches on year change, so without this
            the card can silently lag behind DB state. Local TooltipProvider
            because this card renders outside the prereq card's provider. */}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                aria-label={t('feasibility.refresh')}
                className="shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="ms-2 hidden sm:inline">{t('feasibility.refresh')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('feasibility.refreshTooltip')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Ceiling numbers — the three that tell the whole story */}
      <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-surface p-3">
        <CeilingStat
          label={t('feasibility.totalDemand')}
          value={ceiling.total_demand_periods}
          suffix={t('feasibility.periodsPerWeek')}
        />
        <CeilingStat
          label={t('feasibility.qualifiedSupply')}
          value={ceiling.total_qualified_teacher_periods}
          suffix={t('feasibility.periodsPerWeek')}
        />
        <CeilingStat
          label={t('feasibility.slack')}
          value={ceiling.slack_periods}
          suffix={t('feasibility.periodsPerWeek')}
          negativeIsBad
        />
      </div>

      {blockers.length > 0 && (
        <div>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="flex items-center gap-1 text-sm font-medium text-text-primary hover:text-brand"
          >
            {expanded ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
            {t('feasibility.blockersCount', { count: blockers.length })}
          </button>
          {expanded && (
            <ol className="mt-3 space-y-3 text-sm">
              {blockers.map((b) => (
                <li key={b.id} className="rounded-lg border border-border bg-surface p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                        b.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary">{b.headline}</p>
                      <p className="mt-0.5 text-xs text-text-secondary leading-relaxed">
                        {b.detail}
                      </p>
                      {b.quantified_impact.blocked_periods > 0 && (
                        <p className="mt-1 text-xs text-text-tertiary">
                          {t('feasibility.impact', {
                            periods: b.quantified_impact.blocked_periods,
                            pct: b.quantified_impact.blocked_percentage,
                          })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actionable solutions — each one is a concrete next step with
                      a deep-link into the page where the fix is applied. Ranked
                      by effort (quick → medium → long). */}
                  {b.solutions && b.solutions.length > 0 && (
                    <div className="ms-4 space-y-2 border-s-2 border-border ps-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        <Wrench className="h-3 w-3" />
                        {t('feasibility.howToFix')}
                      </p>
                      {[...b.solutions]
                        .sort((a, z) => effortRank(a.effort) - effortRank(z.effort))
                        .map((s) => (
                          <div
                            key={s.id}
                            className="rounded-md border border-border bg-background/50 p-3 space-y-1"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-text-primary">{s.headline}</p>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${effortChip(
                                  s.effort,
                                )}`}
                              >
                                {t(`feasibility.effort.${s.effort}`)}
                              </span>
                            </div>
                            <p className="text-xs text-text-secondary leading-relaxed">
                              {s.detail}
                            </p>
                            {s.impact.side_effects.length > 0 && (
                              <p className="text-[11px] text-text-tertiary">
                                {t('feasibility.sideEffect')}: {s.impact.side_effects.join(' ')}
                              </p>
                            )}
                            <Link
                              href={s.link.href}
                              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                            >
                              {s.link.label}
                              <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                            </Link>
                          </div>
                        ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function effortRank(e: FeasibilitySolution['effort']): number {
  return e === 'quick' ? 0 : e === 'medium' ? 1 : 2;
}

function effortChip(e: FeasibilitySolution['effort']): string {
  switch (e) {
    case 'quick':
      return 'bg-emerald-500/10 text-emerald-700';
    case 'medium':
      return 'bg-amber-500/10 text-amber-700';
    case 'long':
      return 'bg-red-500/10 text-red-700';
  }
}

function CeilingStat({
  label,
  value,
  suffix,
  negativeIsBad,
}: {
  label: string;
  value: number;
  suffix: string;
  negativeIsBad?: boolean;
}) {
  const tone =
    negativeIsBad && value < 0
      ? 'text-red-600'
      : negativeIsBad && value === 0
        ? 'text-amber-600'
        : 'text-text-primary';
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>
        {value > 0 && negativeIsBad ? '+' : ''}
        {value}
      </p>
      <p className="text-[11px] text-text-tertiary">{suffix}</p>
    </div>
  );
}

// Re-export the lucide icons we need here under local aliases so the
// component-level import block in the main file stays sorted. Doing them
// inline here avoids churning the alphabetical import list.
function AlertTriangleIcon(props: React.SVGProps<SVGSVGElement>) {
  return <AlertCircle {...props} />;
}
function ChevronUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return <ChevronRight {...props} className={`${props.className ?? ''} -rotate-90`} />;
}
function ChevronDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return <ChevronRight {...props} className={`${props.className ?? ''} rotate-90`} />;
}
