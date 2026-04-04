'use client';

import { AlertTriangle, ArrowLeft, User } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { AddReviewDialog } from './_components/add-review-dialog';
import { HistoryTab } from './_components/history-tab';
import { IncidentsTab } from './_components/incidents-tab';
import type {
  DetailTab,
  HistoryEntry,
  InterventionDetail,
  LinkedIncident,
  ReviewAutoPopulate,
  ReviewEntry,
  TaskEntry,
} from './_components/intervention-types';
import {
  daysUntil,
  DETAIL_TABS,
  STATUS_COLORS,
  TYPE_COLORS,
  TYPE_LABELS,
} from './_components/intervention-types';
import { InterventionOverviewTab } from './_components/overview-tab';
import { ReviewsTab } from './_components/reviews-tab';
import { StatusTransitionDialog } from './_components/status-transition-dialog';
import { TasksTab } from './_components/tasks-tab';


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InterventionDetailPage() {
  const t = useTranslations('behaviour.interventionDetail');
  const params = useParams();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const interventionId = params?.id as string;

  const [intervention, setIntervention] = React.useState<InterventionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<DetailTab>('overview');

  // Reviews
  const [reviews, setReviews] = React.useState<ReviewEntry[]>([]);
  const [reviewsLoading, setReviewsLoading] = React.useState(false);

  // Tasks
  const [tasks, setTasks] = React.useState<TaskEntry[]>([]);
  const [tasksLoading, setTasksLoading] = React.useState(false);

  // Linked incidents
  const [linkedIncidents, setLinkedIncidents] = React.useState<LinkedIncident[]>([]);
  const [incidentsLoading, setIncidentsLoading] = React.useState(false);

  // History
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  // Status transition
  const [transitionOpen, setTransitionOpen] = React.useState(false);
  const [transitionInitialStatus, setTransitionInitialStatus] = React.useState('');

  // Add Review dialog
  const [reviewDialogOpen, setReviewDialogOpen] = React.useState(false);
  const [autoPopData, setAutoPopData] = React.useState<ReviewAutoPopulate | null>(null);
  const [reviewForm, setReviewForm] = React.useState({
    progress: 'on_track',
    notes: '',
    next_review_date: '',
    goal_updates: [] as Array<{ goal_id: string; status: string; notes: string }>,
  });
  const [reviewSubmitting, setReviewSubmitting] = React.useState(false);
  const [reviewError, setReviewError] = React.useState('');

  // ─── Fetch intervention ─────────────────────────────────────────────────

  const fetchIntervention = React.useCallback(async () => {
    if (!interventionId) return;
    setLoading(true);
    try {
      const res = await apiClient<{ data: InterventionDetail }>(
        `/api/v1/behaviour/interventions/${interventionId}`,
      );
      setIntervention(res.data);
    } catch (err) {
      console.error('[BehaviourInterventionsPage]', err);
      setIntervention(null);
    } finally {
      setLoading(false);
    }
  }, [interventionId]);

  React.useEffect(() => {
    void fetchIntervention();
  }, [fetchIntervention]);

  // ─── Tab data fetching ──────────────────────────────────────────────────

  React.useEffect(() => {
    if (!interventionId) return;

    if (activeTab === 'reviews' && reviews.length === 0) {
      setReviewsLoading(true);
      apiClient<{ data: ReviewEntry[] }>(
        `/api/v1/behaviour/interventions/${interventionId}/reviews`,
      )
        .then((res) => setReviews(res.data ?? []))
        .catch((err) => { console.error('[BehaviourInterventionsPage]', err); return setReviews([]); })
        .finally(() => setReviewsLoading(false));
    }

    if (activeTab === 'tasks' && tasks.length === 0) {
      setTasksLoading(true);
      apiClient<{ data: TaskEntry[] }>(
        `/api/v1/behaviour/tasks?entity_type=intervention&entity_id=${interventionId}`,
      )
        .then((res) => setTasks(res.data ?? []))
        .catch((err) => { console.error('[BehaviourInterventionsPage]', err); return setTasks([]); })
        .finally(() => setTasksLoading(false));
    }

    if (activeTab === 'incidents' && linkedIncidents.length === 0) {
      setIncidentsLoading(true);
      apiClient<{ data: LinkedIncident[] }>(
        `/api/v1/behaviour/interventions/${interventionId}/incidents`,
      )
        .then((res) => setLinkedIncidents(res.data ?? []))
        .catch((err) => { console.error('[BehaviourInterventionsPage]', err); return setLinkedIncidents([]); })
        .finally(() => setIncidentsLoading(false));
    }

    if (activeTab === 'history' && history.length === 0) {
      setHistoryLoading(true);
      apiClient<{ data: HistoryEntry[] }>(
        `/api/v1/behaviour/interventions/${interventionId}/history`,
      )
        .then((res) => setHistory(res.data ?? []))
        .catch((err) => { console.error('[BehaviourInterventionsPage]', err); return setHistory([]); })
        .finally(() => setHistoryLoading(false));
    }
  }, [
    activeTab,
    interventionId,
    reviews.length,
    tasks.length,
    linkedIncidents.length,
    history.length,
  ]);

  // ─── Add Review ─────────────────────────────────────────────────────────

  const openAddReview = async () => {
    setReviewDialogOpen(true);
    setAutoPopData(null);
    setReviewError('');
    try {
      const res = await apiClient<{ data: ReviewAutoPopulate }>(
        `/api/v1/behaviour/interventions/${interventionId}/reviews/auto-populate`,
      );
      setAutoPopData(res.data);
      setReviewForm({
        progress: 'on_track',
        notes: '',
        next_review_date: '',
        goal_updates: (res.data.goal_statuses ?? []).map((g) => ({
          goal_id: g.goal_id,
          status: g.current_status,
          notes: '',
        })),
      });
    } catch (err) {
      console.error('[BehaviourInterventionsPage]', err);
      setReviewForm({
        progress: 'on_track',
        notes: '',
        next_review_date: '',
        goal_updates: (intervention?.goals ?? []).map((g) => ({
          goal_id: g.id,
          status: g.status,
          notes: '',
        })),
      });
    }
  };

  const handleReviewSubmit = async () => {
    setReviewSubmitting(true);
    setReviewError('');
    try {
      await apiClient(`/api/v1/behaviour/interventions/${interventionId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          progress: reviewForm.progress,
          notes: reviewForm.notes.trim() || undefined,
          next_review_date: reviewForm.next_review_date || undefined,
          goal_updates: reviewForm.goal_updates
            .filter((gu) => gu.status || gu.notes.trim())
            .map((gu) => ({
              goal_id: gu.goal_id,
              status: gu.status,
              notes: gu.notes.trim() || undefined,
            })),
        }),
      });
      setReviewDialogOpen(false);
      const [revRes] = await Promise.all([
        apiClient<{ data: ReviewEntry[] }>(
          `/api/v1/behaviour/interventions/${interventionId}/reviews`,
        ),
        fetchIntervention(),
      ]);
      setReviews(revRes.data ?? []);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setReviewError(ex?.error?.message ?? 'Failed to add review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ─── Loading / Not Found ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (!intervention) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('notFound')} />
        <p className="text-sm text-text-tertiary">{t('notFoundDescription')}</p>
      </div>
    );
  }

  const reviewDaysLeft = daysUntil(intervention.next_review_date);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={intervention.title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setTransitionInitialStatus('');
                setTransitionOpen(true);
              }}
            >
              {t('changeStatus')}
            </Button>
            <Link href={`/${locale}/behaviour/interventions`}>
              <Button variant="ghost">
                <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
                {t('back')}
              </Button>
            </Link>
          </div>
        }
      />

      {/* Header banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <Badge
          variant="secondary"
          className={`capitalize ${STATUS_COLORS[intervention.status] ?? ''}`}
        >
          {intervention.status.replace(/_/g, ' ')}
        </Badge>
        <Badge variant="secondary" className={TYPE_COLORS[intervention.intervention_type] ?? ''}>
          {TYPE_LABELS[intervention.intervention_type] ?? intervention.intervention_type}
        </Badge>
        {intervention.student && (
          <span className="flex items-center gap-1 text-sm text-text-secondary">
            <User className="h-3.5 w-3.5" />
            {intervention.student.first_name} {intervention.student.last_name}
          </span>
        )}
        {intervention.next_review_date && reviewDaysLeft != null && reviewDaysLeft < 0 && (
          <Badge variant="danger" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {t('reviewOverdue')}
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <InterventionOverviewTab
          intervention={intervention}
          onOpenTransition={(status) => {
            setTransitionInitialStatus(status);
            setTransitionOpen(true);
          }}
        />
      )}
      {activeTab === 'reviews' && (
        <ReviewsTab
          reviews={reviews}
          reviewsLoading={reviewsLoading}
          goals={intervention.goals}
          onAddReview={() => void openAddReview()}
        />
      )}
      {activeTab === 'tasks' && <TasksTab tasks={tasks} tasksLoading={tasksLoading} />}
      {activeTab === 'incidents' && (
        <IncidentsTab
          linkedIncidents={linkedIncidents}
          incidentsLoading={incidentsLoading}
          locale={locale}
        />
      )}
      {activeTab === 'history' && <HistoryTab history={history} historyLoading={historyLoading} />}

      {/* Status Transition Dialog */}
      <StatusTransitionDialog
        open={transitionOpen}
        onOpenChange={setTransitionOpen}
        interventionId={intervention.id}
        currentStatus={intervention.status}
        initialNewStatus={transitionInitialStatus}
        onTransitionComplete={() => void fetchIntervention()}
      />

      {/* Add Review Dialog */}
      <AddReviewDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        autoPopData={autoPopData}
        reviewForm={reviewForm}
        onFormChange={setReviewForm}
        goals={intervention.goals}
        reviewSubmitting={reviewSubmitting}
        reviewError={reviewError}
        onSubmit={() => void handleReviewSubmit()}
      />
    </div>
  );
}
