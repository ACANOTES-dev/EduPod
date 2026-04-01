'use client';

import type { SenGoalStatus, SupportPlanStatus } from '@school/shared';
import { getValidGoalStatusTransitions, getValidSupportPlanTransitions } from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';
import { ChevronDown, ChevronUp, ClipboardCopy, Loader2, Plus, Target } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SupportPlan {
  id: string;
  plan_number: string;
  status: SupportPlanStatus;
  version: number;
  academic_year_name: string;
  academic_period_name: string | null;
  review_date: string | null;
  next_review_date: string | null;
  review_notes: string | null;
  parent_input: string | null;
  student_voice: string | null;
  staff_notes: string | null;
  sen_profile_id: string;
  student_name: string;
  created_at: string;
  updated_at: string;
}

interface SenGoal {
  id: string;
  title: string;
  status: SenGoalStatus;
  target: string;
  baseline: string;
  current_level: string | null;
  target_date: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface GoalStrategy {
  id: string;
  description: string;
  responsible_user_id: string | null;
  responsible_user_name: string | null;
  frequency: string | null;
  is_active: boolean;
  created_at: string;
}

interface GoalProgressEntry {
  id: string;
  note: string;
  current_level: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

interface AcademicYear {
  id: string;
  name: string;
}

// ─── Status badge maps ──────────────────────────────────────────────────────

const PLAN_STATUS_MAP: Record<SupportPlanStatus, 'info' | 'success' | 'warning' | 'neutral'> = {
  draft: 'info',
  active: 'success',
  under_review: 'warning',
  closed: 'neutral',
  archived: 'neutral',
};

const GOAL_STATUS_MAP: Record<
  SenGoalStatus,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  not_started: 'neutral',
  in_progress: 'info',
  partially_achieved: 'warning',
  achieved: 'success',
  discontinued: 'danger',
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SupportPlanDetailPage() {
  const t = useTranslations('sen');
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const planId = params?.planId as string;

  // ─── State ──────────────────────────────────────────────────────────────

  const [plan, setPlan] = React.useState<SupportPlan | null>(null);
  const [goals, setGoals] = React.useState<SenGoal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Expanded goal tracking
  const [expandedGoalId, setExpandedGoalId] = React.useState<string | null>(null);

  // Goal sub-data (keyed by goal ID)
  const [strategies, setStrategies] = React.useState<Record<string, GoalStrategy[]>>({});
  const [progress, setProgress] = React.useState<Record<string, GoalProgressEntry[]>>({});
  const [loadingGoalData, setLoadingGoalData] = React.useState<Record<string, boolean>>({});

  // Editable text sections
  const [parentInput, setParentInput] = React.useState('');
  const [studentVoice, setStudentVoice] = React.useState('');
  const [staffNotes, setStaffNotes] = React.useState('');

  // Dialogs
  const [cloneDialogOpen, setCloneDialogOpen] = React.useState(false);
  const [cloneYearId, setCloneYearId] = React.useState('');
  const [cloning, setCloning] = React.useState(false);
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);

  const [strategyDialogGoalId, setStrategyDialogGoalId] = React.useState<string | null>(null);
  const [strategyDescription, setStrategyDescription] = React.useState('');
  const [strategyFrequency, setStrategyFrequency] = React.useState('');
  const [savingStrategy, setSavingStrategy] = React.useState(false);

  const [progressDialogGoalId, setProgressDialogGoalId] = React.useState<string | null>(null);
  const [progressNote, setProgressNote] = React.useState('');
  const [progressLevel, setProgressLevel] = React.useState('');
  const [savingProgress, setSavingProgress] = React.useState(false);

  const [statusDialogGoalId, setStatusDialogGoalId] = React.useState<string | null>(null);
  const [goalNewStatus, setGoalNewStatus] = React.useState('');
  const [goalStatusNote, setGoalStatusNote] = React.useState('');
  const [savingGoalStatus, setSavingGoalStatus] = React.useState(false);

  // ─── Fetch plan ──────────────────────────────────────────────────────────

  const fetchPlan = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: SupportPlan }>(`/api/v1/sen/plans/${planId}`, {
        silent: true,
      });
      setPlan(res.data);
      setParentInput(res.data.parent_input ?? '');
      setStudentVoice(res.data.student_voice ?? '');
      setStaffNotes(res.data.staff_notes ?? '');
    } catch (err) {
      console.error('[SupportPlanDetailPage] fetchPlan', err);
      toast.error(t('planDetail.fetchError'));
    }
  }, [planId, t]);

  const fetchGoals = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: SenGoal[] }>(`/api/v1/sen/plans/${planId}/goals`, {
        silent: true,
      });
      setGoals(res.data);
    } catch (err) {
      console.error('[SupportPlanDetailPage] fetchGoals', err);
    }
  }, [planId]);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      await Promise.all([fetchPlan(), fetchGoals()]);
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchPlan, fetchGoals]);

  // ─── Fetch goal sub-data on expand ───────────────────────────────────────

  const fetchGoalData = React.useCallback(
    async (goalId: string) => {
      if (strategies[goalId] || loadingGoalData[goalId]) return;

      setLoadingGoalData((prev) => ({ ...prev, [goalId]: true }));
      try {
        const [strategiesRes, progressRes] = await Promise.all([
          apiClient<{ data: GoalStrategy[] }>(`/api/v1/sen/goals/${goalId}/strategies`, {
            silent: true,
          }),
          apiClient<{ data: GoalProgressEntry[] }>(`/api/v1/sen/goals/${goalId}/progress`, {
            silent: true,
          }),
        ]);
        setStrategies((prev) => ({ ...prev, [goalId]: strategiesRes.data }));
        setProgress((prev) => ({ ...prev, [goalId]: progressRes.data }));
      } catch (err) {
        console.error('[SupportPlanDetailPage] fetchGoalData', err);
      } finally {
        setLoadingGoalData((prev) => ({ ...prev, [goalId]: false }));
      }
    },
    [strategies, loadingGoalData],
  );

  const handleToggleGoal = React.useCallback(
    (goalId: string) => {
      setExpandedGoalId((prev) => {
        const nextId = prev === goalId ? null : goalId;
        if (nextId) void fetchGoalData(nextId);
        return nextId;
      });
    },
    [fetchGoalData],
  );

  // ─── Plan status transition ──────────────────────────────────────────────

  const handleStatusChange = React.useCallback(
    async (newStatus: string) => {
      setSaving(true);
      try {
        await apiClient(`/api/v1/sen/plans/${planId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        });
        toast.success(t('planDetail.statusUpdated'));
        await fetchPlan();
      } catch (err) {
        console.error('[SupportPlanDetailPage] handleStatusChange', err);
        toast.error(t('planDetail.statusError'));
      } finally {
        setSaving(false);
      }
    },
    [planId, fetchPlan, t],
  );

  // ─── Clone plan ──────────────────────────────────────────────────────────

  const openCloneDialog = React.useCallback(async () => {
    setCloneDialogOpen(true);
    setCloneYearId('');
    try {
      const res = await apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years', {
        silent: true,
      });
      setAcademicYears(res.data);
    } catch (err) {
      console.error('[SupportPlanDetailPage] fetchAcademicYears', err);
    }
  }, []);

  const handleClone = React.useCallback(async () => {
    if (!cloneYearId) return;
    setCloning(true);
    try {
      const res = await apiClient<{ data: { id: string } }>(`/api/v1/sen/plans/${planId}/clone`, {
        method: 'POST',
        body: JSON.stringify({ academic_year_id: cloneYearId }),
      });
      toast.success(t('planDetail.cloneSuccess'));
      setCloneDialogOpen(false);
      router.push(`/${locale}/sen/plans/${res.data.id}`);
    } catch (err) {
      console.error('[SupportPlanDetailPage] handleClone', err);
      toast.error(t('planDetail.cloneError'));
    } finally {
      setCloning(false);
    }
  }, [planId, cloneYearId, router, locale, t]);

  // ─── Save text sections on blur ──────────────────────────────────────────

  const handleSaveTextField = React.useCallback(
    async (field: 'parent_input' | 'student_voice' | 'staff_notes', value: string) => {
      try {
        await apiClient(`/api/v1/sen/plans/${planId}`, {
          method: 'PATCH',
          body: JSON.stringify({ [field]: value || null }),
          silent: true,
        });
      } catch (err) {
        console.error('[SupportPlanDetailPage] handleSaveTextField', err);
        toast.error(t('planDetail.saveError'));
      }
    },
    [planId, t],
  );

  // ─── Add strategy ────────────────────────────────────────────────────────

  const handleAddStrategy = React.useCallback(async () => {
    if (!strategyDialogGoalId || !strategyDescription.trim()) return;
    setSavingStrategy(true);
    try {
      await apiClient(`/api/v1/sen/goals/${strategyDialogGoalId}/strategies`, {
        method: 'POST',
        body: JSON.stringify({
          description: strategyDescription.trim(),
          frequency: strategyFrequency.trim() || undefined,
        }),
      });
      toast.success(t('planDetail.strategyAdded'));

      // Refresh strategies for this goal
      const res = await apiClient<{ data: GoalStrategy[] }>(
        `/api/v1/sen/goals/${strategyDialogGoalId}/strategies`,
        { silent: true },
      );
      setStrategies((prev) => ({ ...prev, [strategyDialogGoalId]: res.data }));

      setStrategyDialogGoalId(null);
      setStrategyDescription('');
      setStrategyFrequency('');
    } catch (err) {
      console.error('[SupportPlanDetailPage] handleAddStrategy', err);
      toast.error(t('planDetail.strategyError'));
    } finally {
      setSavingStrategy(false);
    }
  }, [strategyDialogGoalId, strategyDescription, strategyFrequency, t]);

  // ─── Record progress ─────────────────────────────────────────────────────

  const handleRecordProgress = React.useCallback(async () => {
    if (!progressDialogGoalId || !progressNote.trim()) return;
    setSavingProgress(true);
    try {
      await apiClient(`/api/v1/sen/goals/${progressDialogGoalId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          note: progressNote.trim(),
          current_level: progressLevel.trim() || undefined,
        }),
      });
      toast.success(t('planDetail.progressRecorded'));

      // Refresh progress for this goal
      const res = await apiClient<{ data: GoalProgressEntry[] }>(
        `/api/v1/sen/goals/${progressDialogGoalId}/progress`,
        { silent: true },
      );
      setProgress((prev) => ({ ...prev, [progressDialogGoalId]: res.data }));

      setProgressDialogGoalId(null);
      setProgressNote('');
      setProgressLevel('');
    } catch (err) {
      console.error('[SupportPlanDetailPage] handleRecordProgress', err);
      toast.error(t('planDetail.progressError'));
    } finally {
      setSavingProgress(false);
    }
  }, [progressDialogGoalId, progressNote, progressLevel, t]);

  // ─── Change goal status ───────────────────────────────────────────────────

  const handleGoalStatusChange = React.useCallback(async () => {
    if (!statusDialogGoalId || !goalNewStatus) return;
    setSavingGoalStatus(true);
    try {
      await apiClient(`/api/v1/sen/goals/${statusDialogGoalId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: goalNewStatus,
          note: goalStatusNote.trim() || undefined,
        }),
      });
      toast.success(t('planDetail.goalStatusUpdated'));
      await fetchGoals();
      setStatusDialogGoalId(null);
      setGoalNewStatus('');
      setGoalStatusNote('');
    } catch (err) {
      console.error('[SupportPlanDetailPage] handleGoalStatusChange', err);
      toast.error(t('planDetail.goalStatusError'));
    } finally {
      setSavingGoalStatus(false);
    }
  }, [statusDialogGoalId, goalNewStatus, goalStatusNote, fetchGoals, t]);

  // ─── Loading state ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!plan) {
    return (
      <EmptyState
        icon={Target}
        title={t('planDetail.notFound')}
        description={t('planDetail.notFoundDescription')}
      />
    );
  }

  // ─── Compute available transitions ────────────────────────────────────────

  const validTransitions = getValidSupportPlanTransitions(plan.status);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={plan.plan_number}
        description={`${plan.student_name} — ${t('planDetail.version', { version: plan.version })}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={PLAN_STATUS_MAP[plan.status]} dot>
              {t(`planStatus.${plan.status}`)}
            </StatusBadge>

            {validTransitions.length > 0 && (
              <Select value="" onValueChange={handleStatusChange} disabled={saving}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder={t('planDetail.changeStatus')} />
                </SelectTrigger>
                <SelectContent>
                  {validTransitions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`planStatus.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button variant="outline" size="sm" onClick={openCloneDialog}>
              <ClipboardCopy className="me-1.5 h-4 w-4" />
              {t('planDetail.clone')}
            </Button>
          </div>
        }
      />

      {/* Plan metadata */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('planDetail.academicYear')}
            </p>
            <p className="mt-1 text-sm font-semibold text-text-primary">
              {plan.academic_year_name}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('planDetail.period')}
            </p>
            <p className="mt-1 text-sm font-semibold text-text-primary">
              {plan.academic_period_name ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('planDetail.reviewDate')}
            </p>
            <p className="mt-1 text-sm font-semibold text-text-primary">
              {formatDate(plan.review_date) || '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('planDetail.nextReviewDate')}
            </p>
            <p className="mt-1 text-sm font-semibold text-text-primary">
              {formatDate(plan.next_review_date) || '—'}
            </p>
          </div>
        </div>
      </section>

      {/* Goals section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">{t('planDetail.goals')}</h2>
          <Button size="sm" onClick={() => router.push(`/${locale}/sen/plans/${planId}/goals/new`)}>
            <Plus className="me-1.5 h-4 w-4" />
            {t('planDetail.addGoal')}
          </Button>
        </div>

        {goals.length === 0 ? (
          <EmptyState
            icon={Target}
            title={t('planDetail.noGoals')}
            description={t('planDetail.noGoalsDescription')}
            action={{
              label: t('planDetail.addGoal'),
              onClick: () => router.push(`/${locale}/sen/plans/${planId}/goals/new`),
            }}
          />
        ) : (
          <div className="space-y-3">
            {goals.map((goal) => {
              const isExpanded = expandedGoalId === goal.id;
              const goalStrategies = strategies[goal.id] ?? [];
              const goalProgress = progress[goal.id] ?? [];
              const isLoadingSub = loadingGoalData[goal.id] ?? false;
              const goalValidTransitions = getValidGoalStatusTransitions(goal.status);

              return (
                <div key={goal.id} className="rounded-2xl border border-border bg-surface">
                  {/* Goal header — clickable to expand */}
                  <button
                    type="button"
                    onClick={() => handleToggleGoal(goal.id)}
                    className="flex w-full items-center justify-between p-4 text-start"
                  >
                    <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
                      <span className="font-medium text-text-primary truncate">{goal.title}</span>
                      <StatusBadge status={GOAL_STATUS_MAP[goal.status]}>
                        {t(`goalStatus.${goal.status}`)}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ms-2">
                      <span className="text-xs text-text-tertiary">
                        {formatDate(goal.target_date)}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-text-tertiary" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-text-tertiary" />
                      )}
                    </div>
                  </button>

                  {/* Goal body — expanded */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                      {/* Goal details */}
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                            {t('planDetail.target')}
                          </p>
                          <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">
                            {goal.target}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                            {t('planDetail.baseline')}
                          </p>
                          <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">
                            {goal.baseline}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                            {t('planDetail.currentLevel')}
                          </p>
                          <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">
                            {goal.current_level ?? '—'}
                          </p>
                        </div>
                      </div>

                      {/* Goal action buttons */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setStrategyDialogGoalId(goal.id);
                            setStrategyDescription('');
                            setStrategyFrequency('');
                          }}
                        >
                          {t('planDetail.addStrategy')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setProgressDialogGoalId(goal.id);
                            setProgressNote('');
                            setProgressLevel('');
                          }}
                        >
                          {t('planDetail.recordProgress')}
                        </Button>
                        {goalValidTransitions.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setStatusDialogGoalId(goal.id);
                              setGoalNewStatus('');
                              setGoalStatusNote('');
                            }}
                          >
                            {t('planDetail.changeGoalStatus')}
                          </Button>
                        )}
                      </div>

                      {isLoadingSub ? (
                        <div className="space-y-2">
                          <Skeleton className="h-6 w-48" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      ) : (
                        <>
                          {/* Strategies sub-section */}
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary mb-2">
                              {t('planDetail.strategies')}
                            </h4>
                            {goalStrategies.length === 0 ? (
                              <p className="text-sm text-text-tertiary">
                                {t('planDetail.noStrategies')}
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {goalStrategies.map((strategy) => (
                                  <div
                                    key={strategy.id}
                                    className="rounded-xl border border-border bg-surface-secondary/50 p-3"
                                  >
                                    <p className="text-sm text-text-primary">
                                      {strategy.description}
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-tertiary">
                                      {strategy.responsible_user_name && (
                                        <span>{strategy.responsible_user_name}</span>
                                      )}
                                      {strategy.frequency && <span>{strategy.frequency}</span>}
                                      {!strategy.is_active && (
                                        <span className="text-danger-text">
                                          {t('planDetail.inactive')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Progress timeline sub-section */}
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary mb-2">
                              {t('planDetail.progressTimeline')}
                            </h4>
                            {goalProgress.length === 0 ? (
                              <p className="text-sm text-text-tertiary">
                                {t('planDetail.noProgress')}
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {goalProgress.map((entry) => (
                                  <div key={entry.id} className="flex gap-3">
                                    <div className="flex flex-col items-center">
                                      <div className="mt-2 h-2 w-2 rounded-full bg-primary-500" />
                                      <div className="w-px flex-1 bg-border" />
                                    </div>
                                    <div className="pb-4 min-w-0">
                                      <p className="text-xs text-text-tertiary">
                                        {formatDate(entry.created_at)}
                                        {entry.recorded_by_name && (
                                          <span className="ms-2">{entry.recorded_by_name}</span>
                                        )}
                                      </p>
                                      <p className="text-sm text-text-primary">{entry.note}</p>
                                      {entry.current_level && (
                                        <p className="mt-1 text-xs text-text-secondary">
                                          {t('planDetail.level')}: {entry.current_level}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Text sections — Parent Input, Student Voice, Staff Notes */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-text-primary">
            {t('planDetail.parentInput')}
          </Label>
          <Textarea
            value={parentInput}
            onChange={(e) => setParentInput(e.target.value)}
            onBlur={() => handleSaveTextField('parent_input', parentInput)}
            rows={5}
            placeholder={t('planDetail.parentInputPlaceholder')}
            className="resize-y"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-text-primary">
            {t('planDetail.studentVoice')}
          </Label>
          <Textarea
            value={studentVoice}
            onChange={(e) => setStudentVoice(e.target.value)}
            onBlur={() => handleSaveTextField('student_voice', studentVoice)}
            rows={5}
            placeholder={t('planDetail.studentVoicePlaceholder')}
            className="resize-y"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-text-primary">
            {t('planDetail.staffNotes')}
          </Label>
          <Textarea
            value={staffNotes}
            onChange={(e) => setStaffNotes(e.target.value)}
            onBlur={() => handleSaveTextField('staff_notes', staffNotes)}
            rows={5}
            placeholder={t('planDetail.staffNotesPlaceholder')}
            className="resize-y"
          />
        </div>
      </section>

      {/* Clone dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('planDetail.cloneTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('planDetail.cloneAcademicYear')}</Label>
              <Select value={cloneYearId} onValueChange={setCloneYearId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('planDetail.selectYear')} />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)} disabled={cloning}>
              {t('planDetail.cancel')}
            </Button>
            <Button onClick={handleClone} disabled={!cloneYearId || cloning}>
              {cloning && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
              {t('planDetail.cloneConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add strategy dialog */}
      <Dialog
        open={strategyDialogGoalId !== null}
        onOpenChange={(open) => {
          if (!open) setStrategyDialogGoalId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('planDetail.addStrategyTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('planDetail.strategyDescription')}</Label>
              <Textarea
                value={strategyDescription}
                onChange={(e) => setStrategyDescription(e.target.value)}
                rows={3}
                placeholder={t('planDetail.strategyDescriptionPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('planDetail.strategyFrequency')}</Label>
              <Input
                value={strategyFrequency}
                onChange={(e) => setStrategyFrequency(e.target.value)}
                placeholder={t('planDetail.strategyFrequencyPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStrategyDialogGoalId(null)}
              disabled={savingStrategy}
            >
              {t('planDetail.cancel')}
            </Button>
            <Button
              onClick={handleAddStrategy}
              disabled={!strategyDescription.trim() || savingStrategy}
            >
              {savingStrategy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
              {t('planDetail.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record progress dialog */}
      <Dialog
        open={progressDialogGoalId !== null}
        onOpenChange={(open) => {
          if (!open) setProgressDialogGoalId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('planDetail.recordProgressTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('planDetail.progressNote')}</Label>
              <Textarea
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
                rows={3}
                placeholder={t('planDetail.progressNotePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('planDetail.progressCurrentLevel')}</Label>
              <Input
                value={progressLevel}
                onChange={(e) => setProgressLevel(e.target.value)}
                placeholder={t('planDetail.progressLevelPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProgressDialogGoalId(null)}
              disabled={savingProgress}
            >
              {t('planDetail.cancel')}
            </Button>
            <Button
              onClick={handleRecordProgress}
              disabled={!progressNote.trim() || savingProgress}
            >
              {savingProgress && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
              {t('planDetail.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change goal status dialog */}
      <Dialog
        open={statusDialogGoalId !== null}
        onOpenChange={(open) => {
          if (!open) setStatusDialogGoalId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('planDetail.changeGoalStatusTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('planDetail.newStatus')}</Label>
              <Select value={goalNewStatus} onValueChange={setGoalNewStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('planDetail.selectStatus')} />
                </SelectTrigger>
                <SelectContent>
                  {statusDialogGoalId &&
                    goals.find((g) => g.id === statusDialogGoalId) &&
                    getValidGoalStatusTransitions(
                      goals.find((g) => g.id === statusDialogGoalId)!.status,
                    ).map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`goalStatus.${status}`)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('planDetail.statusNote')}</Label>
              <Textarea
                value={goalStatusNote}
                onChange={(e) => setGoalStatusNote(e.target.value)}
                rows={3}
                placeholder={t('planDetail.statusNotePlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusDialogGoalId(null)}
              disabled={savingGoalStatus}
            >
              {t('planDetail.cancel')}
            </Button>
            <Button onClick={handleGoalStatusChange} disabled={!goalNewStatus || savingGoalStatus}>
              {savingGoalStatus && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
              {t('planDetail.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
