'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  ListChecks,
  Plus,
  Shield,
  Target,
  TrendingUp,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams, usePathname } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InterventionGoal {
  id: string;
  goal_text: string;
  measurable_target: string | null;
  deadline: string | null;
  status: string;
  progress_pct: number | null;
}

interface InterventionStrategy {
  id: string;
  strategy_text: string;
  frequency: string | null;
  responsible_staff_id: string | null;
  responsible_staff_user?: { first_name: string; last_name: string } | null;
}

interface InterventionDetail {
  id: string;
  title: string;
  intervention_type: string;
  status: string;
  trigger_description: string | null;
  send_awareness: boolean;
  send_notes: string | null;
  start_date: string;
  target_end_date: string | null;
  next_review_date: string | null;
  review_frequency_days: number;
  created_at: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    year_group?: { name: string } | null;
  } | null;
  assigned_to_user: {
    first_name: string;
    last_name: string;
  } | null;
  goals: InterventionGoal[];
  strategies: InterventionStrategy[];
}

interface ReviewEntry {
  id: string;
  review_date: string;
  progress: string;
  notes: string | null;
  next_review_date: string | null;
  points_since_last: number | null;
  attendance_rate: number | null;
  reviewer_user?: { first_name: string; last_name: string } | null;
  goal_updates: Array<{
    goal_id: string;
    status: string;
    notes: string | null;
  }>;
}

interface ReviewAutoPopulate {
  points_since_last: number;
  attendance_rate: number;
  goal_statuses: Array<{
    goal_id: string;
    goal_text: string;
    current_status: string;
  }>;
}

interface TaskEntry {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  assigned_to_user?: { first_name: string; last_name: string } | null;
  created_at: string;
}

interface LinkedIncident {
  id: string;
  incident_number: string;
  description: string;
  status: string;
  occurred_at: string;
  category?: { name: string; color: string | null } | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  changes: Record<string, unknown>;
  performed_by_user?: { first_name: string; last_name: string } | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'history', label: 'History' },
] as const;

type DetailTab = (typeof DETAIL_TABS)[number]['key'];

const TYPE_LABELS: Record<string, string> = {
  behaviour_plan: 'Behaviour Plan',
  mentoring: 'Mentoring',
  counselling_referral: 'Counselling',
  restorative: 'Restorative',
  academic_support: 'Academic Support',
  parent_engagement: 'Parent Engagement',
  external_agency: 'External Agency',
  other: 'Other',
};

const TYPE_COLORS: Record<string, string> = {
  behaviour_plan: 'bg-blue-100 text-blue-700',
  mentoring: 'bg-purple-100 text-purple-700',
  counselling_referral: 'bg-pink-100 text-pink-700',
  restorative: 'bg-green-100 text-green-700',
  academic_support: 'bg-amber-100 text-amber-700',
  parent_engagement: 'bg-teal-100 text-teal-700',
  external_agency: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  overdue: 'bg-red-100 text-red-700',
  monitoring: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  closed_unsuccessful: 'bg-gray-100 text-gray-700',
  draft: 'bg-gray-100 text-gray-500',
};

const PROGRESS_COLORS: Record<string, string> = {
  on_track: 'bg-green-100 text-green-700',
  some_progress: 'bg-amber-100 text-amber-700',
  no_progress: 'bg-red-100 text-red-700',
  regression: 'bg-red-200 text-red-800',
};

const STATUS_TRANSITIONS: Record<string, Array<{ value: string; label: string }>> = {
  active: [
    { value: 'monitoring', label: 'Move to Monitoring' },
    { value: 'completed', label: 'Mark Completed' },
    { value: 'closed_unsuccessful', label: 'Close (Unsuccessful)' },
  ],
  monitoring: [
    { value: 'active', label: 'Reactivate' },
    { value: 'completed', label: 'Mark Completed' },
    { value: 'closed_unsuccessful', label: 'Close (Unsuccessful)' },
  ],
  completed: [
    { value: 'active', label: 'Reactivate' },
  ],
  closed_unsuccessful: [
    { value: 'active', label: 'Reactivate' },
  ],
  draft: [
    { value: 'active', label: 'Activate' },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

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
  const [newStatus, setNewStatus] = React.useState('');
  const [transitionReason, setTransitionReason] = React.useState('');
  const [transitioning, setTransitioning] = React.useState(false);
  const [transitionError, setTransitionError] = React.useState('');

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
    } catch {
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
        .catch(() => setReviews([]))
        .finally(() => setReviewsLoading(false));
    }

    if (activeTab === 'tasks' && tasks.length === 0) {
      setTasksLoading(true);
      apiClient<{ data: TaskEntry[] }>(
        `/api/v1/behaviour/tasks?entity_type=intervention&entity_id=${interventionId}`,
      )
        .then((res) => setTasks(res.data ?? []))
        .catch(() => setTasks([]))
        .finally(() => setTasksLoading(false));
    }

    if (activeTab === 'incidents' && linkedIncidents.length === 0) {
      setIncidentsLoading(true);
      apiClient<{ data: LinkedIncident[] }>(
        `/api/v1/behaviour/interventions/${interventionId}/incidents`,
      )
        .then((res) => setLinkedIncidents(res.data ?? []))
        .catch(() => setLinkedIncidents([]))
        .finally(() => setIncidentsLoading(false));
    }

    if (activeTab === 'history' && history.length === 0) {
      setHistoryLoading(true);
      apiClient<{ data: HistoryEntry[] }>(
        `/api/v1/behaviour/interventions/${interventionId}/history`,
      )
        .then((res) => setHistory(res.data ?? []))
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false));
    }
  }, [activeTab, interventionId, reviews.length, tasks.length, linkedIncidents.length, history.length]);

  // ─── Status transition ──────────────────────────────────────────────────

  const handleStatusTransition = async () => {
    if (!newStatus || !intervention) return;
    setTransitioning(true);
    setTransitionError('');
    try {
      await apiClient(
        `/api/v1/behaviour/interventions/${intervention.id}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({
            status: newStatus,
            reason: transitionReason.trim() || undefined,
          }),
        },
      );
      await fetchIntervention();
      setTransitionOpen(false);
      setNewStatus('');
      setTransitionReason('');
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setTransitionError(ex?.error?.message ?? 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

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
    } catch {
      // If auto-populate fails, show form with empty defaults
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
      await apiClient(
        `/api/v1/behaviour/interventions/${interventionId}/reviews`,
        {
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
        },
      );
      // Refresh reviews and intervention
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
        <p className="text-sm text-text-tertiary">
          {t('notFoundDescription')}
        </p>
      </div>
    );
  }

  const availableTransitions = STATUS_TRANSITIONS[intervention.status] ?? [];
  const reviewDaysLeft = daysUntil(intervention.next_review_date);

  // ─── Tab: Overview ──────────────────────────────────────────────────────

  const renderOverview = () => (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Main content — 2 cols */}
      <div className="space-y-6 md:col-span-2">
        {/* Trigger description */}
        {intervention.trigger_description && (
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-2 text-sm font-semibold text-text-primary">
              {t('sections.triggerReason')}
            </h3>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">
              {intervention.trigger_description}
            </p>
          </div>
        )}

        {/* SEND Notes */}
        {intervention.send_awareness && intervention.send_notes && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">
                {t('sections.sendNotes')}
              </h3>
            </div>
            <p className="whitespace-pre-wrap text-sm text-amber-900">
              {intervention.send_notes}
            </p>
          </div>
        )}

        {/* Goals */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('sections.goals')}</h3>
          {intervention.goals.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t('noGoals')}</p>
          ) : (
            <div className="space-y-3">
              {intervention.goals.map((goal) => (
                <div
                  key={goal.id}
                  className="rounded-lg border border-border bg-surface-secondary p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 shrink-0 text-primary-500" />
                        <p className="text-sm font-medium text-text-primary">
                          {goal.goal_text}
                        </p>
                      </div>
                      {goal.measurable_target && (
                        <p className="mt-1 ps-6 text-xs text-text-tertiary">
                          Target: {goal.measurable_target}
                        </p>
                      )}
                      {goal.deadline && (
                        <p className="mt-0.5 ps-6 text-xs text-text-tertiary">
                          Deadline: {formatDate(goal.deadline)}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={`shrink-0 text-xs capitalize ${
                        goal.status === 'achieved'
                          ? 'bg-green-100 text-green-700'
                          : goal.status === 'not_started'
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {goal.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  {goal.progress_pct != null && (
                    <div className="mt-3 ps-6">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-primary-500 transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, goal.progress_pct))}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-text-secondary">
                          {goal.progress_pct}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Strategies */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('sections.strategies')}</h3>
          {intervention.strategies.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t('noStrategies')}</p>
          ) : (
            <div className="space-y-3">
              {intervention.strategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className="rounded-lg border border-border bg-surface-secondary p-4"
                >
                  <div className="flex items-start gap-2">
                    <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary">
                        {strategy.strategy_text}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                        {strategy.responsible_staff_user && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {strategy.responsible_staff_user.first_name}{' '}
                            {strategy.responsible_staff_user.last_name}
                          </span>
                        )}
                        {strategy.frequency && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {strategy.frequency}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar — 1 col */}
      <div className="space-y-4">
        {/* Next Review countdown */}
        {intervention.next_review_date && (
          <div
            className={`rounded-xl border p-5 ${
              reviewDaysLeft != null && reviewDaysLeft < 0
                ? 'border-red-200 bg-red-50'
                : reviewDaysLeft != null && reviewDaysLeft <= 3
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-border bg-surface'
            }`}
          >
            <h3 className="mb-1 text-sm font-semibold text-text-primary">
              {t('sections.nextReview')}
            </h3>
            <p className="font-mono text-lg font-bold text-text-primary">
              {formatDate(intervention.next_review_date)}
            </p>
            {reviewDaysLeft != null && (
              <p
                className={`mt-1 text-sm font-medium ${
                  reviewDaysLeft < 0
                    ? 'text-red-600'
                    : reviewDaysLeft <= 3
                      ? 'text-amber-600'
                      : 'text-text-secondary'
                }`}
              >
                {reviewDaysLeft < 0
                  ? `${Math.abs(reviewDaysLeft)} days overdue`
                  : reviewDaysLeft === 0
                    ? 'Due today'
                    : `${reviewDaysLeft} days remaining`}
              </p>
            )}
          </div>
        )}

        {/* Details */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('sections.details')}</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Student</dt>
                <dd className="text-text-primary">
                  {intervention.student
                    ? `${intervention.student.first_name} ${intervention.student.last_name}`
                    : '—'}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Assigned To</dt>
                <dd className="text-text-primary">
                  {intervention.assigned_to_user
                    ? `${intervention.assigned_to_user.first_name} ${intervention.assigned_to_user.last_name}`
                    : '—'}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Start Date</dt>
                <dd className="text-text-primary">{formatDate(intervention.start_date)}</dd>
              </div>
            </div>
            {intervention.target_end_date && (
              <div className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                <div>
                  <dt className="text-xs text-text-tertiary">Target End</dt>
                  <dd className="text-text-primary">
                    {formatDate(intervention.target_end_date)}
                  </dd>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Review Frequency</dt>
                <dd className="text-text-primary">
                  Every {intervention.review_frequency_days} days
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Created</dt>
                <dd className="text-text-primary">
                  {formatDateTime(intervention.created_at)}
                </dd>
              </div>
            </div>
          </dl>
        </div>

        {/* Status actions */}
        {availableTransitions.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('sections.actions')}</h3>
            <div className="flex flex-col gap-2">
              {availableTransitions.map((t) => (
                <Button
                  key={t.value}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setNewStatus(t.value);
                    setTransitionOpen(true);
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* SEND badge */}
        {intervention.send_awareness && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">SEND Awareness</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Tab: Reviews ───────────────────────────────────────────────────────

  const renderReviews = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          Reviews ({reviews.length})
        </h3>
        <Button size="sm" onClick={openAddReview}>
          <Plus className="me-1.5 h-3.5 w-3.5" />
          {t('addReview')}
        </Button>
      </div>

      {reviewsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">
          {t('noReviews')}
        </p>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="rounded-xl border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-medium text-text-primary">
                    {formatDate(review.review_date)}
                  </p>
                  {review.reviewer_user && (
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      by {review.reviewer_user.first_name} {review.reviewer_user.last_name}
                    </p>
                  )}
                </div>
                <Badge
                  variant="secondary"
                  className={`text-xs capitalize ${PROGRESS_COLORS[review.progress] ?? 'bg-gray-100 text-gray-700'}`}
                >
                  {review.progress.replace(/_/g, ' ')}
                </Badge>
              </div>

              {/* Stats */}
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-secondary">
                {review.points_since_last != null && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {review.points_since_last} pts since last
                  </span>
                )}
                {review.attendance_rate != null && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {review.attendance_rate}% attendance
                  </span>
                )}
                {review.next_review_date && (
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Next: {formatDate(review.next_review_date)}
                  </span>
                )}
              </div>

              {/* Goal updates */}
              {review.goal_updates.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-1.5 text-xs font-medium text-text-tertiary">
                    Goal Updates
                  </p>
                  <div className="space-y-1">
                    {review.goal_updates.map((gu) => {
                      const goalMatch = intervention.goals.find(
                        (g) => g.id === gu.goal_id,
                      );
                      return (
                        <div
                          key={gu.goal_id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Badge
                            variant="secondary"
                            className="shrink-0 capitalize"
                          >
                            {gu.status.replace(/_/g, ' ')}
                          </Badge>
                          <span className="truncate text-text-secondary">
                            {goalMatch?.goal_text ?? gu.goal_id}
                          </span>
                          {gu.notes && (
                            <span className="truncate text-text-tertiary">
                              - {gu.notes}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              {review.notes && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="whitespace-pre-wrap text-sm text-text-secondary">
                    {review.notes}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Tab: Tasks ─────────────────────────────────────────────────────────

  const renderTasks = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">
        Related Tasks ({tasks.length})
      </h3>

      {tasksLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">
          {t('noTasks')}
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {task.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                  {task.assigned_to_user && (
                    <span>
                      {task.assigned_to_user.first_name}{' '}
                      {task.assigned_to_user.last_name}
                    </span>
                  )}
                  {task.due_date && <span>Due: {formatDate(task.due_date)}</span>}
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`shrink-0 text-xs capitalize ${
                  task.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : task.status === 'overdue'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-700'
                }`}
              >
                {task.status.replace(/_/g, ' ')}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Tab: Incidents ─────────────────────────────────────────────────────

  const renderIncidents = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">
        Linked Incidents ({linkedIncidents.length})
      </h3>

      {incidentsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : linkedIncidents.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">
          {t('noLinkedIncidents')}
        </p>
      ) : (
        <div className="space-y-2">
          {linkedIncidents.map((inc) => (
            <Link
              key={inc.id}
              href={`/${locale}/behaviour/incidents/${inc.id}`}
              className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-text-tertiary">
                      {inc.incident_number}
                    </span>
                    {inc.category && (
                      <Badge
                        variant="secondary"
                        className="text-xs"
                        style={
                          inc.category.color
                            ? {
                                borderColor: inc.category.color,
                                color: inc.category.color,
                              }
                            : undefined
                        }
                      >
                        {inc.category.name}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-text-secondary">
                    {inc.description}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <Badge
                    variant="secondary"
                    className={`text-xs capitalize ${STATUS_COLORS[inc.status] ?? ''}`}
                  >
                    {inc.status.replace(/_/g, ' ')}
                  </Badge>
                  <p className="mt-1 font-mono text-xs text-text-tertiary">
                    {formatDate(inc.occurred_at)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Tab: History ───────────────────────────────────────────────────────

  const renderHistory = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">{t('sections.history')}</h3>

      {historyLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-surface-secondary" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">{t('noHistory')}</p>
      ) : (
        <div className="relative space-y-4 ps-6">
          {/* Timeline line */}
          <div className="absolute start-2 top-1 h-full w-px bg-border" />
          {history.map((entry) => (
            <div key={entry.id} className="relative">
              <div className="absolute -start-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary-500 bg-surface" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium capitalize text-text-primary">
                    {entry.action.replace(/_/g, ' ')}
                  </span>
                  {entry.performed_by_user && (
                    <span className="text-xs text-text-tertiary">
                      by {entry.performed_by_user.first_name}{' '}
                      {entry.performed_by_user.last_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-tertiary">
                  {formatDateTime(entry.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={intervention.title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setTransitionOpen(true)}>
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
        <Badge
          variant="secondary"
          className={TYPE_COLORS[intervention.intervention_type] ?? ''}
        >
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
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'reviews' && renderReviews()}
      {activeTab === 'tasks' && renderTasks()}
      {activeTab === 'incidents' && renderIncidents()}
      {activeTab === 'history' && renderHistory()}

      {/* Status Transition Dialog */}
      <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.changeStatus')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="mb-1 text-xs text-text-tertiary">
                Current:{' '}
                <Badge
                  variant="secondary"
                  className={`capitalize ${STATUS_COLORS[intervention.status] ?? ''}`}
                >
                  {intervention.status.replace(/_/g, ' ')}
                </Badge>
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">
                New Status
              </label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTransitions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">
                Reason (optional)
              </label>
              <Textarea
                value={transitionReason}
                onChange={(e) => setTransitionReason(e.target.value)}
                placeholder="Why is this changing?"
                rows={2}
              />
            </div>
            {transitionError && (
              <p className="text-sm text-danger-text">{transitionError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTransitionOpen(false)}
              disabled={transitioning}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleStatusTransition}
              disabled={transitioning || !newStatus}
            >
              {transitioning ? t('updating') : t('updateStatus')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('dialog.addReview')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Auto-populated stats (read only) */}
            {autoPopData && (
              <div className="rounded-lg border border-border bg-surface-secondary p-3">
                <p className="mb-2 text-xs font-medium text-text-tertiary">
                  Auto-populated Stats
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>
                    <span className="text-text-tertiary">Points since last: </span>
                    <span className="font-medium text-text-primary">
                      {autoPopData.points_since_last}
                    </span>
                  </span>
                  <span>
                    <span className="text-text-tertiary">Attendance: </span>
                    <span className="font-medium text-text-primary">
                      {autoPopData.attendance_rate}%
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Progress */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Overall Progress *</Label>
              <Select
                value={reviewForm.progress}
                onValueChange={(v) =>
                  setReviewForm((prev) => ({ ...prev, progress: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_track">On Track</SelectItem>
                  <SelectItem value="some_progress">Some Progress</SelectItem>
                  <SelectItem value="no_progress">No Progress</SelectItem>
                  <SelectItem value="regression">Regression</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Goal updates */}
            {reviewForm.goal_updates.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Goal Updates</Label>
                {reviewForm.goal_updates.map((gu, idx) => {
                  const goalMatch = intervention.goals.find(
                    (g) => g.id === gu.goal_id,
                  );
                  const autoGoal = autoPopData?.goal_statuses?.find(
                    (gs) => gs.goal_id === gu.goal_id,
                  );
                  return (
                    <div
                      key={gu.goal_id}
                      className="rounded-lg border border-border bg-surface-secondary p-3"
                    >
                      <p className="mb-2 text-xs font-medium text-text-primary">
                        {autoGoal?.goal_text ?? goalMatch?.goal_text ?? `Goal ${idx + 1}`}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select
                          value={gu.status}
                          onValueChange={(v) => {
                            const updated = [...reviewForm.goal_updates];
                            const current = updated[idx] ?? { goal_id: '', status: '', notes: '' };
                            updated[idx] = { ...current, status: v };
                            setReviewForm((prev) => ({
                              ...prev,
                              goal_updates: updated,
                            }));
                          }}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not_started">Not Started</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="achieved">Achieved</SelectItem>
                            <SelectItem value="not_achieved">Not Achieved</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={gu.notes}
                          onChange={(e) => {
                            const updated = [...reviewForm.goal_updates];
                            const current = updated[idx] ?? { goal_id: '', status: '', notes: '' };
                            updated[idx] = {
                              ...current,
                              notes: e.target.value,
                            };
                            setReviewForm((prev) => ({
                              ...prev,
                              goal_updates: updated,
                            }));
                          }}
                          placeholder="Notes..."
                          className="text-sm"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
                value={reviewForm.notes}
                onChange={(e) =>
                  setReviewForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Review observations, recommendations..."
                rows={3}
              />
            </div>

            {/* Next review date */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Next Review Date</Label>
              <Input
                type="date"
                value={reviewForm.next_review_date}
                onChange={(e) =>
                  setReviewForm((prev) => ({
                    ...prev,
                    next_review_date: e.target.value,
                  }))
                }
                className="text-base"
              />
            </div>

            {reviewError && (
              <p className="text-sm text-danger-text">{reviewError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
              disabled={reviewSubmitting}
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleReviewSubmit} disabled={reviewSubmitting}>
              {reviewSubmitting ? t('saving') : t('saveReview')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
