'use client';

import { Info, Save, Target } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Skeleton, StatusBadge, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SenPlanDetail {
  id: string;
  plan_number: string;
  status: string;
  academic_year: string;
  start_date: string;
  review_date: string | null;
  parent_input: string | null;
  student_name: string;
}

interface SenGoal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  target: string | null;
  baseline: string | null;
  current_level: string | null;
}

interface GoalProgress {
  id: string;
  note: string;
  recorded_at: string;
  recorded_by_name: string | null;
}

// ─── Status variant map ──────────────────────────────────────────────────────

const STATUS_VARIANT_MAP: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'success',
  draft: 'info',
  under_review: 'warning',
  closed: 'neutral',
  archived: 'neutral',
};

const GOAL_STATUS_VARIANT_MAP: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  on_track: 'success',
  not_started: 'info',
  at_risk: 'warning',
  achieved: 'success',
  discontinued: 'neutral',
};

// ─── Goal card with progress ─────────────────────────────────────────────────

function GoalCard({ goal, t }: { goal: SenGoal; t: ReturnType<typeof useTranslations<'sen'>> }) {
  const [progress, setProgress] = React.useState<GoalProgress[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<{ data: GoalProgress[] }>(`/api/v1/sen/goals/${goal.id}/progress`)
      .then((res) => {
        if (!cancelled) setProgress(res.data ?? []);
      })
      .catch((err) => {
        console.error('[GoalCard] Failed to load progress for goal', goal.id, err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [goal.id]);

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-text-primary">{goal.title}</h4>
          {goal.description && <p className="text-xs text-text-secondary">{goal.description}</p>}
        </div>
        <StatusBadge status={GOAL_STATUS_VARIANT_MAP[goal.status] ?? 'neutral'}>
          {t(`goalStatus.${goal.status}`)}
        </StatusBadge>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {goal.baseline && (
          <div>
            <p className="text-xs text-text-tertiary">{t('goals.baseline')}</p>
            <p className="text-sm font-medium text-text-primary">{goal.baseline}</p>
          </div>
        )}
        {goal.target && (
          <div>
            <p className="text-xs text-text-tertiary">{t('goals.target')}</p>
            <p className="text-sm font-medium text-text-primary">{goal.target}</p>
          </div>
        )}
        {goal.current_level && (
          <div>
            <p className="text-xs text-text-tertiary">{t('goals.currentLevel')}</p>
            <p className="text-sm font-medium text-text-primary">{goal.current_level}</p>
          </div>
        )}
      </div>

      {/* Progress timeline */}
      {loading ? (
        <Skeleton className="h-12 rounded-lg" />
      ) : progress.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            className="text-xs font-medium text-primary-700 hover:underline"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded
              ? t('goals.hideProgress')
              : t('goals.showProgress', { count: progress.length })}
          </button>
          {expanded && (
            <ul className="space-y-2 border-s-2 border-border ps-4">
              {progress.map((entry) => (
                <li key={entry.id} className="space-y-0.5">
                  <p className="text-xs text-text-tertiary">
                    {formatDate(entry.recorded_at)}
                    {entry.recorded_by_name && ` — ${entry.recorded_by_name}`}
                  </p>
                  <p className="text-sm text-text-primary">{entry.note}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">{t('goals.noProgress')}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentPlanViewPage() {
  const t = useTranslations('sen');
  const params = useParams<{ planId: string }>();
  const planId = params?.planId ?? '';

  const [plan, setPlan] = React.useState<SenPlanDetail | null>(null);
  const [goals, setGoals] = React.useState<SenGoal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [parentInput, setParentInput] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [inputDirty, setInputDirty] = React.useState(false);

  // ─── Fetch plan + goals ─────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!planId) return;
    let cancelled = false;

    async function fetchData() {
      try {
        const [planRes, goalsRes] = await Promise.all([
          apiClient<{ data: SenPlanDetail }>(`/api/v1/sen/plans/${planId}`),
          apiClient<{ data: SenGoal[] }>(`/api/v1/sen/plans/${planId}/goals`),
        ]);

        if (!cancelled) {
          setPlan(planRes.data);
          setGoals(goalsRes.data ?? []);
          setParentInput(planRes.data.parent_input ?? '');
        }
      } catch (err) {
        console.error('[ParentPlanView] Failed to load plan', planId, err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // ─── Save parent input ──────────────────────────────────────────────────────

  const handleSaveInput = React.useCallback(async () => {
    if (!planId || isSaving) return;
    setIsSaving(true);
    try {
      await apiClient(`/api/v1/sen/plans/${planId}`, {
        method: 'PATCH',
        body: JSON.stringify({ parent_input: parentInput }),
      });
      setInputDirty(false);
      toast.success(t('parent.inputSaved'));
    } catch (err) {
      console.error('[ParentSenPage]', err);
      toast.error(t('parent.inputSaveFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [planId, parentInput, isSaving, t]);

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">
        {t('parent.planNotFound')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.student_name}
        description={`${plan.plan_number} — ${plan.academic_year}`}
      />

      {/* Read-only info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-info-border bg-info-surface p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-info-text" />
        <p className="text-sm text-info-text">{t('parent.readOnlyNotice')}</p>
      </div>

      {/* Plan metadata */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-text-tertiary">{t('plans.planNumber')}</p>
            <p className="text-sm font-semibold text-text-primary font-mono">{plan.plan_number}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('plans.status')}</p>
            <StatusBadge status={STATUS_VARIANT_MAP[plan.status] ?? 'neutral'}>
              {t(`planStatus.${plan.status}`)}
            </StatusBadge>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('plans.startDate')}</p>
            <p className="text-sm font-medium text-text-primary">{formatDate(plan.start_date)}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('plans.reviewDate')}</p>
            <p className="text-sm font-medium text-text-primary">
              {plan.review_date ? formatDate(plan.review_date) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Goals */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-text-secondary" />
          <h2 className="text-base font-semibold text-text-primary">{t('goals.title')}</h2>
        </div>

        {goals.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t('goals.noGoals')}</p>
        ) : (
          <div className="space-y-3">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} t={t} />
            ))}
          </div>
        )}
      </section>

      {/* Parent input — editable */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">{t('parent.inputTitle')}</h2>
        <p className="text-sm text-text-secondary">{t('parent.inputDescription')}</p>
        <Textarea
          value={parentInput}
          onChange={(e) => {
            setParentInput(e.target.value);
            setInputDirty(true);
          }}
          placeholder={t('parent.inputPlaceholder')}
          rows={4}
          className="resize-y"
        />
        <div className="flex justify-end">
          <Button
            variant="default"
            size="sm"
            disabled={!inputDirty || isSaving}
            onClick={() => void handleSaveInput()}
          >
            <Save className="me-2 h-4 w-4" />
            {isSaving ? t('parent.saving') : t('parent.saveInput')}
          </Button>
        </div>
      </section>
    </div>
  );
}
