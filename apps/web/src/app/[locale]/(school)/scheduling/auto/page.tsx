'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Pin,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
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
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface PrerequisiteCheck {
  key: string;
  passed: boolean;
  message: string;
  fix_href?: string;
}

interface PrerequisitesResponse {
  checks: PrerequisiteCheck[];
  all_passed: boolean;
  pinned_count: number;
}

interface SchedulingRun {
  id: string;
  status: string;
  mode: string;
  created_at: string;
  completed_at?: string;
  assigned_count?: number;
  unassigned_count?: number;
  pinned_count?: number;
}

interface RunProgress {
  phase: string;
  assigned: number;
  total: number;
  elapsed_seconds: number;
  status: string;
  error?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoSchedulerPage() {
  const t = useTranslations('scheduling.auto');
  const router = useRouter();

  const [years, setYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState<string>('');
  const [prerequisites, setPrerequisites] = React.useState<PrerequisitesResponse | null>(null);
  const [prereqLoading, setPrereqLoading] = React.useState(false);
  const [runs, setRuns] = React.useState<SchedulingRun[]>([]);
  const [runsLoading, setRunsLoading] = React.useState(false);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [progressOpen, setProgressOpen] = React.useState(false);
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<RunProgress | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Load academic years on mount
  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years')
      .then((res) => setYears(res.data ?? []))
      .catch(() => {});
  }, []);

  // Load prerequisites when year changes
  React.useEffect(() => {
    if (!selectedYear) {
      setPrerequisites(null);
      return;
    }
    setPrereqLoading(true);
    apiClient<PrerequisitesResponse>(
      `/api/v1/scheduling-runs/prerequisites?academic_year_id=${selectedYear}`
    )
      .then((res) => setPrerequisites(res))
      .catch(() => setPrerequisites(null))
      .finally(() => setPrereqLoading(false));
  }, [selectedYear]);

  // Load run history
  React.useEffect(() => {
    if (!selectedYear) { setRuns([]); return; }
    setRunsLoading(true);
    apiClient<{ data: SchedulingRun[] }>(`/api/v1/scheduling-runs?academic_year_id=${selectedYear}`)
      .then((res) => setRuns(res.data ?? []))
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  }, [selectedYear]);

  // Poll progress
  React.useEffect(() => {
    if (!activeRunId) return;
    pollRef.current = setInterval(async () => {
      try {
        const prog = await apiClient<RunProgress>(
          `/api/v1/scheduling-runs/${activeRunId}/progress`
        );
        setProgress(prog);
        if (prog.status === 'completed') {
          clearInterval(pollRef.current!);
          setProgressOpen(false);
          router.push(`/scheduling/runs/${activeRunId}/review`);
        } else if (prog.status === 'failed') {
          clearInterval(pollRef.current!);
          toast.error(prog.error ?? 'Solver failed');
          setProgressOpen(false);
          setActiveRunId(null);
        }
      } catch {
        clearInterval(pollRef.current!);
        setProgressOpen(false);
        setActiveRunId(null);
      }
    }, 2000);
    return () => clearInterval(pollRef.current!);
  }, [activeRunId, router]);

  async function handleGenerate() {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const run = await apiClient<{ id: string }>('/api/v1/scheduling-runs', {
        method: 'POST',
        body: JSON.stringify({ academic_year_id: selectedYear }),
      });
      setActiveRunId(run.id);
      setProgress(null);
      setProgressOpen(true);
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

  async function handleCancelSolve() {
    if (!activeRunId) return;
    clearInterval(pollRef.current!);
    await apiClient(`/api/v1/scheduling-runs/${activeRunId}/cancel`, { method: 'POST' }).catch(
      () => {}
    );
    setProgressOpen(false);
    setActiveRunId(null);
    setProgress(null);
  }

  const allPassed = prerequisites?.all_passed ?? false;
  const pinnedCount = prerequisites?.pinned_count ?? 0;
  const modeLabel =
    pinnedCount > 0 ? t('modeHybrid', { count: pinnedCount }) : t('modeAuto');

  function formatDuration(run: SchedulingRun): string {
    if (!run.completed_at) return '—';
    const ms =
      new Date(run.completed_at).getTime() - new Date(run.created_at).getTime();
    const secs = Math.round(ms / 1000);
    return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`;
  }

  function statusBadgeVariant(status: string): 'default' | 'secondary' | 'danger' {
    if (status === 'completed' || status === 'applied') return 'default';
    if (status === 'failed') return 'danger';
    return 'secondary';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('autoScheduler')}
        description={t('prerequisites')}
        actions={
          <div className="flex items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select year..." />
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
              <span>Checking prerequisites...</span>
            </div>
          ) : prerequisites ? (
            <>
              {(prerequisites.checks ?? []).map((check) => (
                <div key={check.key} className="flex items-start gap-3">
                  {check.passed ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-text-primary">{check.message}</span>
                  </div>
                  {!check.passed && check.fix_href && (
                    <a
                      href={check.fix_href}
                      className="flex items-center gap-1 text-xs text-brand hover:underline shrink-0"
                    >
                      Fix
                      <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                    </a>
                  )}
                  <Badge variant={check.passed ? 'default' : 'danger'} className="text-xs shrink-0">
                    {check.passed ? 'Pass' : 'Fail'}
                  </Badge>
                </div>
              ))}

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pin className="h-3.5 w-3.5 text-text-tertiary" />
                  <span className="text-sm text-text-secondary">{modeLabel}</span>
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
            </>
          ) : (
            <p className="text-sm text-text-secondary">
              Select an academic year to check prerequisites.
            </p>
          )}
        </div>
      )}

      {/* Run History */}
      <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">{t('runHistory')}</h2>

        {runsLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
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
                    Actions
                  </th>
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
                    <td className="px-3 py-2 text-text-secondary font-mono text-xs">
                      {formatDuration(run)}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      {run.assigned_count != null ? run.assigned_count : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {run.status === 'completed' && (
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
                ))}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('generateTimetable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Modal */}
      <Dialog open={progressOpen} onOpenChange={(open) => {
          if (!open) void handleCancelSolve();
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-brand" />
              {t('solving')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {progress ? (
              <>
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span>{progress.phase}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">
                    {t('slotsAssigned', {
                      assigned: progress.assigned,
                      total: progress.total,
                    })}
                  </span>
                  <div className="flex items-center gap-1 text-text-tertiary">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="font-mono text-xs">{progress.elapsed_seconds}s</span>
                  </div>
                </div>
                <div className="w-full bg-surface-secondary rounded-full h-2">
                  <div
                    className="bg-brand rounded-full h-2 transition-all duration-300"
                    style={{
                      width:
                        progress.total > 0
                          ? `${Math.round((progress.assigned / progress.total) * 100)}%`
                          : '0%',
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('preparing')}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelSolve}>
              {t('cancelSolve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
