'use client';

import { AlertTriangle, Calendar, ClipboardCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState, Input, Label, Skeleton, toast } from '@school/ui';

import { formatDateShort, humanise } from './shared';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanCompliancePlan {
  plan_id: string;
  plan_number: string;
  sen_profile_id: string;
  next_review_date: string | null;
  status: string;
  student: {
    id: string;
    name: string;
    year_group: { id: string; name: string } | null;
  };
}

interface StaleGoal {
  goal_id: string;
  title: string;
  status: string;
  last_progress_at: string | null;
  support_plan: {
    id: string;
    plan_number: string;
    next_review_date: string | null;
  };
  student: {
    id: string;
    name: string;
    year_group: { id: string; name: string } | null;
  };
}

interface PlanComplianceData {
  due_within_days: number;
  stale_goal_weeks: number;
  due_for_review: PlanCompliancePlan[];
  overdue_plans: PlanCompliancePlan[];
  stale_goals: StaleGoal[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlanComplianceTab() {
  const t = useTranslations('sen');
  const router = useRouter();
  const [dueWithinDays, setDueWithinDays] = React.useState(14);
  const [staleGoalWeeks, setStaleGoalWeeks] = React.useState(4);
  const [data, setData] = React.useState<PlanComplianceData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchCompliance = React.useCallback(() => {
    setLoading(true);
    apiClient<{ data: PlanComplianceData }>(
      `/api/v1/sen/reports/plan-compliance?due_within_days=${dueWithinDays}&stale_goal_weeks=${staleGoalWeeks}`,
    )
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        console.error('[PlanComplianceTab] load compliance', err);
        toast.error(t('reports.loadError'));
      })
      .finally(() => setLoading(false));
  }, [dueWithinDays, staleGoalWeeks, t]);

  React.useEffect(() => {
    fetchCompliance();
  }, [fetchCompliance]);

  const navigateToPlan = React.useCallback(
    (planId: string) => {
      router.push(`/sen/plans/${planId}`);
    },
    [router],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-xl sm:w-96" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="due-days">{t('reports.compliance.dueWithinDays')}</Label>
          <Input
            id="due-days"
            type="number"
            min={1}
            max={365}
            value={dueWithinDays}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > 0) setDueWithinDays(v);
            }}
            className="w-full text-base"
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="stale-weeks">{t('reports.compliance.staleGoalWeeks')}</Label>
          <Input
            id="stale-weeks"
            type="number"
            min={1}
            max={52}
            value={staleGoalWeeks}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > 0) setStaleGoalWeeks(v);
            }}
            className="w-full text-base"
          />
        </div>
      </div>

      {!data ? (
        <EmptyState icon={ClipboardCheck} title={t('reports.compliance.noData')} />
      ) : (
        <>
          {/* Plans due for review */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-1 text-sm font-semibold text-text-primary">
              <Calendar className="me-2 inline-block h-4 w-4" />
              {t('reports.compliance.dueForReview')} ({data.due_for_review.length})
            </h3>
            <p className="mb-4 text-xs text-text-tertiary">
              {t('reports.compliance.dueForReviewDesc', { days: dueWithinDays })}
            </p>
            {data.due_for_review.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">
                {t('reports.compliance.noPlansDue')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.planNumber')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.student')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.nextReview')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.due_for_review.map((plan) => (
                      <tr
                        key={plan.plan_id}
                        className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-secondary"
                        onClick={() => navigateToPlan(plan.plan_id)}
                      >
                        <td className="px-4 py-2 font-medium text-primary">{plan.plan_number}</td>
                        <td className="px-4 py-2 text-text-primary">{plan.student.name}</td>
                        <td className="px-4 py-2 text-text-primary">
                          {formatDateShort(plan.next_review_date)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex rounded-full bg-surface-secondary px-2 py-0.5 text-xs font-medium text-text-secondary">
                            {humanise(plan.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Overdue plans */}
          <div className="rounded-2xl border border-destructive/30 bg-surface p-6">
            <h3 className="mb-1 text-sm font-semibold text-destructive">
              <AlertTriangle className="me-2 inline-block h-4 w-4" />
              {t('reports.compliance.overduePlans')} ({data.overdue_plans.length})
            </h3>
            <p className="mb-4 text-xs text-text-tertiary">{t('reports.compliance.overdueDesc')}</p>
            {data.overdue_plans.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">
                {t('reports.compliance.noOverdue')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.planNumber')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.student')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.nextReview')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.overdue_plans.map((plan) => (
                      <tr
                        key={plan.plan_id}
                        className="cursor-pointer border-b border-border last:border-b-0 hover:bg-destructive/5"
                        onClick={() => navigateToPlan(plan.plan_id)}
                      >
                        <td className="px-4 py-2 font-medium text-destructive">
                          {plan.plan_number}
                        </td>
                        <td className="px-4 py-2 text-text-primary">{plan.student.name}</td>
                        <td className="px-4 py-2 text-destructive">
                          {formatDateShort(plan.next_review_date)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                            {humanise(plan.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Stale goals */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-1 text-sm font-semibold text-text-primary">
              <ClipboardCheck className="me-2 inline-block h-4 w-4" />
              {t('reports.compliance.staleGoals')} ({data.stale_goals.length})
            </h3>
            <p className="mb-4 text-xs text-text-tertiary">
              {t('reports.compliance.staleGoalsDesc', { weeks: staleGoalWeeks })}
            </p>
            {data.stale_goals.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">
                {t('reports.compliance.noStaleGoals')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.goalTitle')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.planNumber')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.student')}
                      </th>
                      <th className="px-4 py-2 text-start font-medium text-text-secondary">
                        {t('reports.compliance.lastUpdated')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stale_goals.map((goal) => (
                      <tr
                        key={goal.goal_id}
                        className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-secondary"
                        onClick={() => navigateToPlan(goal.support_plan.id)}
                      >
                        <td className="px-4 py-2 text-text-primary">{goal.title}</td>
                        <td className="px-4 py-2 font-medium text-primary">
                          {goal.support_plan.plan_number}
                        </td>
                        <td className="px-4 py-2 text-text-primary">{goal.student.name}</td>
                        <td className="px-4 py-2 text-text-tertiary">
                          {formatDateShort(goal.last_progress_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
