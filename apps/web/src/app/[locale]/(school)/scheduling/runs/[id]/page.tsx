'use client';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  GitCompare,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { HealthScore, type ValidationResult } from './_components/health-score';
import { ScheduleGrid, type PeriodSlot, type ScheduleEntry } from './_components/schedule-grid';
import { ValidateResults } from './_components/validate-results';
import { WorkloadSidebar } from './_components/workload-sidebar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YearGroupTab {
  year_group_id: string;
  name: string;
  sections?: Array<{ class_id: string; class_name: string }>;
}

interface RunDetailData {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'applied' | 'discarded';
  mode: 'auto' | 'hybrid';
  academic_year_id: string;
  created_at: string;
  completed_at?: string;
  assigned_count: number;
  unassigned_count: number;
  year_groups: YearGroupTab[];
  entries: ScheduleEntry[];
  period_grids: Record<string, PeriodSlot[]>;
  teacher_configs?: Array<{
    staff_profile_id: string;
    name: string;
    max_periods_per_week: number | null;
    max_periods_per_day: number | null;
  }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? '';
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  // State
  const [data, setData] = React.useState<RunDetailData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<string>('');
  const [highlightTeacherId, setHighlightTeacherId] = React.useState<string | null>(null);
  const [validationResult, setValidationResult] = React.useState<ValidationResult | null>(null);
  const [validating, setValidating] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [actioning, setActioning] = React.useState(false);

  // Per-slot cover teacher suggestion dialog removed with the cover-teacher module.
  // Manual substitute assignment continues via /scheduling/substitutions; auto-
  // suggestion returns in Stage 7 against the substitute_teacher_competencies table.

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<RunDetailData>(`/api/v1/scheduling-runs/${id}`);
      setData(res);
      if (res.year_groups.length > 0 && !activeTab) {
        setActiveTab(res.year_groups[0]!.year_group_id);
      }
    } catch (err) {
      console.error('[SchedulingRunsPage]', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id, activeTab]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ─── Derived State ────────────────────────────────────────────────────────

  const isProposed = data?.status === 'completed';
  const isApplied = data?.status === 'applied';
  const readOnly = !isProposed;

  const activeEntries = React.useMemo(
    () => (data?.entries ?? []).filter((e) => e.year_group_id === activeTab),
    [data?.entries, activeTab],
  );
  const activePeriodGrid = activeTab ? (data?.period_grids[activeTab] ?? []) : [];

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function handleValidate() {
    setValidating(true);
    try {
      const result = await apiClient<ValidationResult>(`/api/v1/scheduling-runs/${id}/validate`, {
        method: 'POST',
      });
      setValidationResult(result);
    } catch (err) {
      console.error('[SchedulingRunsPage]', err);
      toast.error(t('runs.validateFailed'));
    } finally {
      setValidating(false);
    }
  }

  async function handleApply() {
    setActioning(true);
    try {
      await apiClient(`/api/v1/scheduling-runs/${id}/apply`, { method: 'POST' });
      toast.success(t('runs.applySuccess'));
      setApplyOpen(false);
      void fetchData();
    } catch (err) {
      console.error('[SchedulingRunsPage]', err);
      toast.error(t('runs.applyFailed'));
    } finally {
      setActioning(false);
    }
  }

  async function handleDiscard() {
    setActioning(true);
    try {
      await apiClient(`/api/v1/scheduling-runs/${id}/discard`, { method: 'POST' });
      toast.success(t('runs.discardSuccess'));
      setDiscardOpen(false);
      router.push(`/${locale}/scheduling/runs`);
    } catch (err) {
      console.error('[SchedulingRunsPage]', err);
      toast.error(t('runs.discardFailed'));
    } finally {
      setActioning(false);
    }
  }

  async function handleEntryMove(entryId: string, toWeekday: number, toPeriodOrder: number) {
    try {
      await apiClient(`/api/v1/scheduling-runs/${id}/adjustments`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'move',
          entry_id: entryId,
          to_weekday: toWeekday,
          to_period_order: toPeriodOrder,
        }),
      });
      // Re-fetch to get updated state
      const res = await apiClient<RunDetailData>(`/api/v1/scheduling-runs/${id}`);
      setData(res);
      // Clear validation (user should re-validate after changes)
      setValidationResult(null);
    } catch (err) {
      console.error('[SchedulingRunsPage]', err);
      toast.error(t('runs.moveFailed'));
    }
  }

  function handleEntryAdd(_weekday: number, _periodOrder: number) {
    // For now, show a toast — full "add entry" dialog would be an extension
    toast.info(t('runs.addEntryHint'));
  }

  function handleSave() {
    void handleApply();
  }

  function handleAcknowledgeAndSave() {
    void handleApply();
  }

  function handleExport(type: 'year_group' | 'teacher' | 'full', targetId?: string) {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    let url = '';
    if (type === 'year_group' && targetId) {
      url = `${baseUrl}/api/v1/scheduling/export/year-group/${targetId}?format=pdf&academic_year_id=${data?.academic_year_id}`;
    } else if (type === 'teacher' && targetId) {
      url = `${baseUrl}/api/v1/scheduling/export/teacher/${targetId}?format=pdf&academic_year_id=${data?.academic_year_id}`;
    } else {
      url = `${baseUrl}/api/v1/scheduling/export/full?format=pdf&academic_year_id=${data?.academic_year_id}`;
    }
    window.open(url, '_blank');
  }

  // ─── Render: Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-96 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <AlertCircle className="h-8 w-8 text-text-tertiary" />
        <p className="text-sm text-text-secondary">{t('runs.loadFailed')}</p>
        <Button variant="outline" onClick={() => router.back()}>
          {t('auto.backToSolver')}
        </Button>
      </div>
    );
  }

  // ─── Render: Main ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {isProposed && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {t('runs.proposedBanner')}
          </span>
        </div>
      )}

      {isApplied && (
        <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
          <span className="text-sm font-medium text-green-800 dark:text-green-300">
            {t('runs.appliedBanner')}
          </span>
          <Badge variant="success" className="ms-auto">
            {t('auto.applied')}
          </Badge>
        </div>
      )}

      {/* Page Header + Action Bar */}
      <PageHeader
        title={t('runs.reviewTitle')}
        description={`${t('auto.runMode')}: ${data.mode} | ${t('auto.assignedSlots')}: ${data.assigned_count} | ${t('auto.entriesUnassigned')}: ${data.unassigned_count}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/${locale}/scheduling/runs`)}
            >
              <ArrowLeft className="h-4 w-4 me-1.5 rtl:rotate-180" />
              {t('runs.backToRuns')}
            </Button>

            {/* Validate */}
            <Button size="sm" onClick={handleValidate} disabled={validating}>
              {validating ? (
                <Loader2 className="h-4 w-4 animate-spin me-1.5" />
              ) : (
                <ShieldCheck className="h-4 w-4 me-1.5" />
              )}
              {t('runs.validate')}
            </Button>

            {/* Apply */}
            {isProposed && (
              <Button
                size="sm"
                variant="default"
                onClick={() => setApplyOpen(true)}
                disabled={actioning}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 me-1.5" />
                {t('runs.applySchedule')}
              </Button>
            )}

            {/* Discard */}
            {isProposed && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDiscardOpen(true)}
                disabled={actioning}
                className="text-danger-text hover:bg-danger-fill/10"
              >
                <Trash2 className="h-4 w-4 me-1.5" />
                {t('runs.discard')}
              </Button>
            )}

            {/* Export */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 me-1.5" />
                  {t('runs.exportPdf')}
                  <ChevronDown className="h-3.5 w-3.5 ms-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {data.year_groups.map((yg) => (
                  <DropdownMenuItem
                    key={yg.year_group_id}
                    onClick={() => handleExport('year_group', yg.year_group_id)}
                  >
                    {yg.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => handleExport('full')}>
                  {t('runs.exportFullSchool')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Compare */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/${locale}/scheduling/runs/compare?run_a=${id}`)}
            >
              <GitCompare className="h-4 w-4 me-1.5" />
              {t('runs.compare')}
            </Button>
          </div>
        }
      />

      {/* Year Group Tabs */}
      {data.year_groups.length > 0 && (
        <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
          {data.year_groups.map((yg) => (
            <button
              key={yg.year_group_id}
              type="button"
              onClick={() => {
                setActiveTab(yg.year_group_id);
                setHighlightTeacherId(null);
              }}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === yg.year_group_id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {yg.name}
            </button>
          ))}
        </div>
      )}

      {/* Main content: Grid + Sidebar */}
      <div className="flex gap-6">
        {/* Grid area */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Drag hint */}
          {!readOnly && (
            <div className="text-xs text-text-tertiary flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              {t('runs.dragToMove')}
            </div>
          )}

          <ScheduleGrid
            yearGroupId={activeTab}
            entries={activeEntries}
            periodGrid={activePeriodGrid}
            violations={validationResult?.cell_violations}
            onEntryMove={!readOnly ? handleEntryMove : undefined}
            onEntryAdd={!readOnly ? handleEntryAdd : undefined}
            onEntryContextMenu={undefined}
            highlightTeacherId={highlightTeacherId}
            readOnly={readOnly}
          />

          {/* Validation Results (shown after validate) */}
          {validationResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HealthScore
                result={validationResult}
                onCellClick={() => {
                  // Could scroll to cell - for now just visual indicator
                }}
              />
              {isProposed && (
                <ValidateResults
                  result={validationResult}
                  onSave={handleSave}
                  onAcknowledgeAndSave={handleAcknowledgeAndSave}
                  saving={actioning}
                />
              )}
            </div>
          )}
        </div>

        {/* Workload sidebar */}
        {!readOnly && (
          <div className="w-64 shrink-0 hidden xl:block">
            <div className="sticky top-20">
              <WorkloadSidebar
                entries={data.entries}
                teacherConfigs={data.teacher_configs}
                onHighlightTeacher={setHighlightTeacherId}
                highlightTeacherId={highlightTeacherId}
              />
            </div>
          </div>
        )}
      </div>

      {/* Apply Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('runs.applySchedule')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('runs.confirmApply')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleApply} disabled={actioning}>
              {actioning && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('runs.applySchedule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Dialog */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('runs.discard')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('runs.confirmDiscard')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDiscard} disabled={actioning}>
              {actioning && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('runs.discard')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
